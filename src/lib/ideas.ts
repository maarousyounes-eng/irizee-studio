import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, imgPart, firstText, parseJson, type Part } from "./gemini";
import { briefPrompt, ideasPrompt } from "./prompts";
import { brandRules, download, loadProduct, productPlan } from "./generation";

/**
 * Le directeur artistique : une idée forte et différente pour chaque image, AVANT de générer.
 * Il voit les inspirations (images jointes) et connaît les produits de chaque image. Texte seul : quelques centimes.
 */
export async function proposeIdeas(sb: SupabaseClient, a: {
  brief: string; n: number; type: string; productIds: string[]; productMode: string | null; noProduct: boolean; people: boolean;
  inspMode: "copy" | "loose"; inspirationPaths: string[]; analysis: string; avoid?: string[]; theme?: string; textZone?: string;
}): Promise<{ title: string; idea: string }[]> {
  const n = Math.min(12, Math.max(1, a.n));
  const prods = a.noProduct ? [] : (await Promise.all(a.productIds.slice(0, 4).map((id) => loadProduct(sb, id).catch(() => null)))).filter(Boolean);
  const names = new Map(prods.map((x) => [x!.product.id, x!.product.name]));
  const perImage = a.noProduct || !a.productIds.length ? [] : Array.from({ length: n }, (_, i) => {
    const pl = productPlan({ product_id: a.productIds[0], product_ids: a.productIds.length > 1 ? a.productIds : null, product_mode: a.productMode }, { variant_index: i });
    return [pl.mainId, ...pl.otherIds].map((id) => names.get(id)).filter(Boolean) as string[];
  });
  const products = prods.map((x) => {
    const p = x!.product;
    return [`"${p.name}"${p.look ? `: ${p.look}` : ""}`, p.real_size ? `Real size: ${p.real_size.replace(/\n/g, ", ")}.` : "", p.applied_look ? `Formula: ${p.applied_look}.` : ""].filter(Boolean).join(" ");
  }).join("\n");
  const rules = [...(await brandRules(sb)), ...prods.flatMap((x) => x!.product.rules ?? [])];
  const insp = (await Promise.all(a.inspirationPaths.slice(0, 4).map((p) => download(sb, p).catch(() => null)))).filter(Boolean) as { buf: Buffer; mime: string }[];
  const parts: Part[] = [{ text: ideasPrompt({ brief: a.brief, n, type: a.type, perImage, products, rules, people: a.people, inspMode: a.inspMode, nInsp: insp.length, analysis: a.analysis, avoid: a.avoid ?? [], theme: a.theme, textZone: a.textZone }) }, ...insp.map((i) => imgPart(i.buf, i.mime))];
  const r = await gemini(MODELS.vision, parts, { purpose: "idées de shooting", json: true, timeoutMs: 75_000 });
  const raw = parseJson<{ ideas?: { title?: unknown; idea?: unknown }[] }>(firstText(r));
  return (raw.ideas ?? []).map((x) => ({ title: String(x.title ?? "").trim().slice(0, 60), idea: String(x.idea ?? "").trim().slice(0, 600) })).filter((x) => x.idea).slice(0, n);
}

/** « Améliorer ma consigne » : un brief structuré à partir de la demande du client. */
export async function improveBrief(sb: SupabaseClient, a: { brief: string; type: string; productIds: string[]; noProduct: boolean }) {
  const prods = a.noProduct ? [] : (await Promise.all(a.productIds.slice(0, 4).map((id) => loadProduct(sb, id).catch(() => null)))).filter(Boolean);
  const products = prods.map((x) => `"${x!.product.name}"${x!.product.look ? `: ${x!.product.look}` : ""}`).join("\n");
  const rules = [...(await brandRules(sb)), ...prods.flatMap((x) => x!.product.rules ?? [])];
  const r = await gemini(MODELS.vision, [{ text: briefPrompt({ brief: a.brief, type: a.type, products, rules }) }], { purpose: "amélioration consigne", json: true, timeoutMs: 60_000 });
  return String(parseJson<{ brief?: string }>(firstText(r)).brief ?? "").trim();
}
