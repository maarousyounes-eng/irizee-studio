import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, imgPart, firstText, type Part } from "./gemini";
import { adCopyPrompt } from "./prompts";
import { brandRules, download, loadProduct } from "./generation";
import { CTAS, EMPTY_TEXTS, type AdTexts } from "./ads";

const cut = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

/** Génère des angles de pub (textes) pour un produit et une idée ; l'image source aide l'IA à coller au visuel. */
export async function generateAdCopy(sb: SupabaseClient, a: { productId: string; idea: string; sourcePath: string | null; n?: number }): Promise<AdTexts[]> {
  const { product } = await loadProduct(sb, a.productId);
  const rules = await brandRules(sb);
  let image: Part | null = null;
  if (a.sourcePath) {
    try { const f = await download(sb, a.sourcePath); image = imgPart(await sharp(f.buf).resize(768, 768, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer(), "image/jpeg"); } catch { image = null; }
  }
  const parts: Part[] = [{ text: adCopyPrompt({ product, rules, idea: a.idea, n: a.n ?? 4, hasImage: !!image }) }, ...(image ? [image] : [])];
  const r = await gemini(MODELS.text, parts, { purpose: "ads textes", json: true, timeoutMs: 60_000 });
  const raw = JSON.parse(firstText(r).trim().replace(/^```json\s*|```$/g, "")) as { angles?: any[] } | any[];
  const list = (Array.isArray(raw) ? raw : raw.angles ?? []) as any[];
  return list.slice(0, 6).map((x) => ({
    ...EMPTY_TEXTS,
    name: cut(x.name, 40),
    hook: cut(x.hook, 60),
    headline: cut(x.headline, 50),
    primary_text: cut(x.primary_text, 400),
    cta: CTAS.includes(x.cta) ? x.cta : "Découvrir",
    badge: cut(x.badge, 14),
    bullets: (Array.isArray(x.bullets) ? x.bullets : []).slice(0, 3).map((b: unknown) => cut(b, 40)).filter(Boolean),
    quote: cut(x.quote, 220),
    quote_author: cut(x.quote_author, 40),
    tiktok_caption: cut(x.tiktok_caption, 150),
    google: {
      headlines: (Array.isArray(x.google?.headlines) ? x.google.headlines : []).slice(0, 5).map((h: unknown) => cut(h, 30)),
      long_headline: cut(x.google?.long_headline, 90),
      descriptions: (Array.isArray(x.google?.descriptions) ? x.google.descriptions : []).slice(0, 2).map((d: unknown) => cut(d, 90)),
    },
  }));
}
