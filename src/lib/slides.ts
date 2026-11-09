import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, firstText } from "./gemini";
import { slidesPlanPrompt } from "./prompts";
import { brandRules, loadProduct } from "./generation";
import { emptySlide, normalizeSlides, type Slide } from "./visualTypes";

/** L'IA propose le plan d'un carrousel : la photo, le titre, le texte et la mise en page de chaque slide. */
export async function planSlides(sb: SupabaseClient, a: { idea: string; n: number; style: string; productIds: string[]; noProduct: boolean; people: boolean }): Promise<Slide[]> {
  const n = Math.min(10, Math.max(3, a.n));
  const prods = a.noProduct ? [] : (await Promise.all(a.productIds.slice(0, 4).map((id) => loadProduct(sb, id).catch(() => null)))).filter(Boolean);
  const products = prods.map((x) => {
    const p = x!.product;
    return [`"${p.name}"${p.look ? `: ${p.look}` : ""}`, p.real_size ? `Real size: ${p.real_size.replace(/\n/g, ", ")}.` : "", p.texts?.length ? `Printed on it: ${p.texts.join(" / ")}` : ""].filter(Boolean).join(" ");
  }).join("\n");
  const rules = [...(await brandRules(sb)), ...prods.flatMap((x) => x!.product.rules ?? [])];
  const r = await gemini(MODELS.vision, [{ text: slidesPlanPrompt({ idea: a.idea, n, style: a.style, products, rules, people: a.people }) }], { purpose: "plan carrousel", json: true, timeoutMs: 60_000 });
  const raw = JSON.parse(firstText(r).trim().replace(/^```json\s*|```$/g, "")) as { slides?: unknown[] };
  // Le plan du client peut avoir un autre nombre de slides que le formulaire : on suit le sien (10 max)
  const slides = normalizeSlides(raw.slides).slice(0, 10);
  if (slides[0]?.layout === "text") slides[0].layout = "overlay";
  while (slides.length < 3) slides.push(emptySlide());
  return slides;
}
