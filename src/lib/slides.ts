import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, firstText } from "./gemini";
import { slidesPlanPrompt } from "./prompts";

/** L'IA propose le contenu de chaque slide d'un carrousel (une phrase par slide). */
export async function planSlides(sb: SupabaseClient, a: { idea: string; n: number; productIds: string[]; noProduct: boolean; people: boolean }) {
  const n = Math.min(10, Math.max(3, a.n));
  const { data: prods } = a.noProduct || !a.productIds.length ? { data: [] as { name: string }[] } : await sb.from("products").select("name").in("id", a.productIds);
  const r = await gemini(MODELS.text, [{ text: slidesPlanPrompt({ idea: a.idea, n, products: (prods ?? []).map((p) => p.name), people: a.people }) }], { purpose: "plan carrousel", json: true, timeoutMs: 50_000 });
  const raw = JSON.parse(firstText(r).trim().replace(/^```json\s*|```$/g, "")) as { slides?: unknown[] };
  const slides = (raw.slides ?? []).map((x) => String(x ?? "").trim().slice(0, 240)).filter(Boolean).slice(0, n);
  while (slides.length < n) slides.push("");
  return slides;
}
