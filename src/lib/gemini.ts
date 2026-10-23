// Appels Gemini — à n'importer que depuis du code serveur (routes API).
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

interface Opts { image?: boolean; json?: boolean; aspect?: string; size?: string; timeoutMs?: number }

export async function gemini(model: string, parts: Part[], { image, json, aspect, size, timeoutMs }: Opts = {}) {
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
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body,
      signal: AbortSignal.timeout(timeoutMs ?? 270_000),
    });
    if (res.ok) return res.json();
    const txt = await res.text();
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
