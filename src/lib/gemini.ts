// Appels Gemini — à n'importer que depuis du code serveur (routes API).
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
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
async function logCall(row: { purpose: string; model: string; status: string; http?: number; ms: number; usage?: any; imagesOut?: number; size?: string; note?: string; cost?: number }) {
  const c = als.getStore();
  if (!c) return;
  try {
    await c.sb.from("ai_calls").insert({
      user_id: c.userId, shoot_id: c.shootId ?? null, image_id: c.imageId ?? null,
      purpose: row.purpose, model: row.model, status: row.status, http_status: row.http ?? null, duration_ms: row.ms,
      input_tokens: row.usage?.promptTokenCount ?? null, output_tokens: row.usage?.candidatesTokenCount ?? null,
      images_out: row.imagesOut ?? 0, size: row.size ?? null,
      cost_eur: row.status === "ok" ? (row.cost ?? estimateEur(row.model, row.size, row.usage, row.imagesOut ?? 0)) : 0,
      note: row.note?.slice(0, 200) ?? null,
    });
  } catch { /* le journal ne doit jamais bloquer une génération */ }
}

// ---------- OpenAI (moteur d'image au choix) ----------
const OPENAI_EUR_PER_IMAGE = 0.2; // estimation : à comparer avec la facture OpenAI
let openaiModel: { name: string; at: number } | null = null;

/** Modèle d'image OpenAI le plus récent disponible sur le compte (sauf OPENAI_IMAGE_MODEL). */
export async function resolveOpenAIModel(key: string): Promise<string> {
  if (process.env.OPENAI_IMAGE_MODEL) return process.env.OPENAI_IMAGE_MODEL;
  if (openaiModel && Date.now() - openaiModel.at < 3600_000) return openaiModel.name;
  const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  const j = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const ids: string[] = (j.data ?? []).map((m: { id: string }) => m.id);
  const ver = (id: string) => (id.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "0").split(".").map(Number).reduce((a, n, i) => a + n / 10 ** (i * 2), 0);
  const cands = ids.filter((id) => /^gpt-image/i.test(id) && !/mini/i.test(id) && !/\d{4}-\d{2}-\d{2}/.test(id)).sort((a, b) => ver(b) - ver(a));
  if (!cands.length) throw new Error("Aucun modèle d'image OpenAI disponible sur ce compte");
  openaiModel = { name: cands[0], at: Date.now() };
  return cands[0];
}

async function fitAspect(buf: Buffer, aspect?: string) {
  if (!aspect) return buf;
  const [aw, ah] = aspect.split(":").map(Number);
  if (!aw || !ah) return buf;
  const m = await sharp(buf).metadata();
  const w = m.width ?? 0, h = m.height ?? 0;
  if (!w || !h) return buf;
  const target = aw / ah;
  let cw = w, ch = h;
  if (w / h > target) cw = Math.round(h * target); else ch = Math.round(w / target);
  return sharp(buf).extract({ left: Math.floor((w - cw) / 2), top: Math.floor((h - ch) / 2), width: cw, height: ch }).png().toBuffer();
}

/** Appel OpenAI (édition d'image avec références) ; renvoie une réponse au format Gemini pour que le reste du code ne change pas. */
async function callOpenAI(model: string, parts: Part[], o: { purpose?: string; aspect?: string; timeoutMs?: number; signal?: AbortSignal }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY manquante côté serveur");
  const name = model === "openai:auto" ? await resolveOpenAIModel(key) : model.slice(7);
  const prompt = parts.filter((p): p is { text: string } => "text" in p).map((p) => p.text).join("\n\n");
  const imgs = parts.filter((p): p is { inline_data: { mime_type: string; data: string } } => "inline_data" in p).slice(0, 16);
  const [aw, ah] = (o.aspect ?? "1:1").split(":").map(Number);
  const r = aw && ah ? aw / ah : 1;
  const size = r > 1.2 ? "1536x1024" : r < 0.83 ? "1024x1536" : "1024x1024";
  let lastErr: Error = new Error("Erreur OpenAI");
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    const fd = new FormData();
    fd.append("model", name); fd.append("prompt", prompt); fd.append("size", size); fd.append("quality", "high"); fd.append("n", "1");
    imgs.forEach((p, k) => fd.append("image[]", new Blob([new Uint8Array(Buffer.from(p.inline_data.data, "base64"))], { type: p.inline_data.mime_type }), `ref${k}.${p.inline_data.mime_type.includes("png") ? "png" : "jpg"}`));
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(o.timeoutMs ?? 240_000)]) : AbortSignal.timeout(o.timeoutMs ?? 240_000) });
    } catch (e) {
      await logCall({ purpose: o.purpose ?? "autre", model: name, status: "timeout", ms: Date.now() - t0, note: e instanceof Error ? e.message : "" });
      throw e;
    }
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      const b64: string | undefined = j.data?.[0]?.b64_json;
      if (!b64) { await logCall({ purpose: o.purpose ?? "autre", model: name, status: "ok", ms: Date.now() - t0, imagesOut: 0, note: "réponse sans image" }); return { candidates: [{ content: { parts: [] } }] }; }
      const out = await fitAspect(Buffer.from(b64, "base64"), o.aspect);
      await logCall({ purpose: o.purpose ?? "autre", model: name, status: "ok", ms: Date.now() - t0, imagesOut: 1, size, cost: OPENAI_EUR_PER_IMAGE });
      return { candidates: [{ content: { parts: [{ inlineData: { mime_type: "image/png", data: out.toString("base64") } }] } }] };
    }
    await logCall({ purpose: o.purpose ?? "autre", model: name, status: "error", http: res.status, ms: Date.now() - t0, note: JSON.stringify(j).slice(0, 150) });
    lastErr = new Error(`OpenAI ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
    if (![429, 500, 502, 503, 504].includes(res.status)) throw lastErr;
    await new Promise((r2) => setTimeout(r2, 2000 * (attempt + 1)));
  }
  throw lastErr;
}

interface Opts { purpose?: string; image?: boolean; json?: boolean; aspect?: string; size?: string; timeoutMs?: number; signal?: AbortSignal }

export async function gemini(model: string, parts: Part[], { purpose, image, json, aspect, size, timeoutMs, signal }: Opts = {}) {
  if (model.startsWith("openai:")) return callOpenAI(model, parts, { purpose, aspect, timeoutMs, signal });
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
      await logCall({ purpose: why, model, status: "ok", ms: Date.now() - t0, usage: j.usageMetadata, imagesOut: n, size: image ? size ?? "1K" : undefined, note: image && n === 0 ? noImageReason(j) : undefined });
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

/** Pourquoi Gemini n'a rendu aucune image (filtre de sécurité, contenu bloqué, texte seul…). */
export function noImageReason(r: any): string {
  const block = r?.promptFeedback?.blockReason;
  const fin = r?.candidates?.[0]?.finishReason;
  const txt = firstText(r).trim().slice(0, 120);
  return [block && `bloqué (${block})`, fin && fin !== "STOP" && `fin : ${fin}`, txt && `message : ${txt}`].filter(Boolean).join(" · ") || "réponse vide";
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
