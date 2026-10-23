// Appels Gemini — à n'importer que depuis du code serveur (routes API).
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
export const MODELS = {
  flash: "gemini-3.1-flash-image",
  pro: "gemini-3-pro-image",
  vision: "gemini-3.1-pro-preview",
  text: "gemini-3-flash-preview",
};

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

export const imgPart = (buf: Buffer | Uint8Array, mime: string): Part => ({
  inline_data: { mime_type: mime, data: Buffer.from(buf).toString("base64") },
});

// Contexte du journal : qui appelle, pour quelle image. Posé par les routes / la génération.
export interface AiCtx { sb: SupabaseClient; userId: string; shootId?: string | null; imageId?: string | null }
const als = new AsyncLocalStorage<AiCtx>();
export const withAiCtx = <T>(ctx: AiCtx, fn: () => Promise<T>) => als.run(ctx, fn);

// Tarifs estimés (USD) — À VÉRIFIER sur la facture Google AI Studio ; les jetons réels sont aussi enregistrés.
const USD_EUR = 0.92;
const IMAGE_USD: Record<string, Record<string, number>> = {
  [MODELS.pro]: { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
  [MODELS.flash]: { "1K": 0.067, "2K": 0.101, "4K": 0.151 },
};
const TOKEN_USD_PER_M: Record<string, [number, number]> = {
  [MODELS.vision]: [2, 12], [MODELS.text]: [0.5, 3], [MODELS.pro]: [2, 12], [MODELS.flash]: [0.5, 3],
};
function estimateEur(model: string, size: string | undefined, usage: any, imagesOut: number) {
  const [pin, pout] = TOKEN_USD_PER_M[model] ?? [1, 6];
  let usd = ((usage?.promptTokenCount ?? 0) * pin) / 1e6;
  if (imagesOut > 0) usd += imagesOut * (IMAGE_USD[model]?.[size ?? "1K"] ?? 0.134);
  else usd += (((usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0)) * pout) / 1e6;
  return Math.round(usd * USD_EUR * 10000) / 10000;
}
async function logCall(row: { purpose: string; model: string; status: string; http?: number; ms: number; usage?: any; imagesOut?: number; size?: string; note?: string }) {
  const c = als.getStore();
  if (!c) return;
  try {
    await c.sb.from("ai_calls").insert({
      user_id: c.userId, shoot_id: c.shootId ?? null, image_id: c.imageId ?? null,
      purpose: row.purpose, model: row.model, status: row.status, http_status: row.http ?? null, duration_ms: row.ms,
      input_tokens: row.usage?.promptTokenCount ?? null, output_tokens: row.usage?.candidatesTokenCount ?? null,
      images_out: row.imagesOut ?? 0, size: row.size ?? null,
      cost_eur: row.status === "ok" ? estimateEur(row.model, row.size, row.usage, row.imagesOut ?? 0) : 0,
      note: row.note?.slice(0, 200) ?? null,
    });
  } catch { /* le journal ne doit jamais bloquer une génération */ }
}

interface Opts { purpose?: string; image?: boolean; json?: boolean; aspect?: string; size?: string; timeoutMs?: number; signal?: AbortSignal }

export async function gemini(model: string, parts: Part[], { purpose, image, json, aspect, size, timeoutMs, signal }: Opts = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY manquante côté serveur");
  const generationConfig: Record<string, unknown> = image
    ? {
        responseModalities: ["IMAGE", "TEXT"],
        ...(aspect || size ? { imageConfig: { ...(aspect ? { aspectRatio: aspect } : {}), ...(size ? { imageSize: size } : {}) } } : {}),
      }
    : json ? { responseMimeType: "application/json" } : {};
  const body = JSON.stringify({ contents: [{ parts }], generationConfig });
  let lastErr: Error = new Error("Erreur Gemini");
  const why = purpose ?? "autre";
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs ?? 270_000)]) : AbortSignal.timeout(timeoutMs ?? 270_000),
      });
    } catch (e) {
      // coupé (délai ou annulation) : Google a pu facturer l'appel, on le trace
      await logCall({ purpose: why, model, status: "timeout", ms: Date.now() - t0, size, note: e instanceof Error ? e.message : "" });
      throw e;
    }
    if (res.ok) {
      const j = await res.json();
      const n = ((j.candidates?.[0]?.content?.parts ?? []) as any[]).filter((x) => x.inlineData || x.inline_data).length;
      await logCall({ purpose: why, model, status: "ok", ms: Date.now() - t0, usage: j.usageMetadata, imagesOut: n, size: image ? size ?? "1K" : undefined });
      return j;
    }
    const txt = await res.text();
    await logCall({ purpose: why, model, status: "error", http: res.status, ms: Date.now() - t0, size, note: txt.slice(0, 150) });
    lastErr = new Error(`Gemini ${res.status}: ${txt.slice(0, 300)}`);
    if (![429, 500, 502, 503, 504].includes(res.status)) throw lastErr;
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
  }
  throw lastErr;
}

export function firstText(r: any): string {
  return ((r.candidates?.[0]?.content?.parts ?? []) as any[]).filter((p) => p.text).map((p) => p.text).join("");
}
export function firstImage(r: any): Buffer | null {
  const p = ((r.candidates?.[0]?.content?.parts ?? []) as any[]).find((x) => x.inlineData || x.inline_data);
  const d = p && (p.inlineData || p.inline_data);
  return d ? Buffer.from(d.data, "base64") : null;
}
export function parseJson<T = any>(text: string): T {
  const v = JSON.parse(text.trim().replace(/^```json\s*|```$/g, ""));
  return Array.isArray(v) ? v[0] : v;
}
