import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, imgPart, firstText, parseJson, type Part } from "./gemini";
import { briefPrompt, conceptsPrompt, directionsPrompt, ideasPrompt } from "./prompts";
import { brandRules, brandTaste, download, loadProduct, productPlan } from "./generation";

const tasteText = (t: { love: string; hate: string }) => [t.love ? `loves: ${t.love.replace(/\n+/g, "; ")}` : "", t.hate ? `refuses: ${t.hate.replace(/\n+/g, "; ")}` : ""].filter(Boolean).join(" · ");

/**
 * Le directeur artistique : une idée forte et différente pour chaque image, AVANT de générer.
 * Il voit les inspirations (images jointes) et connaît les produits de chaque image. Texte seul : quelques centimes.
 */
export async function proposeIdeas(sb: SupabaseClient, a: {
  brief: string; n: number; type: string; productIds: string[]; productMode: string | null; noProduct: boolean; people: boolean;
  inspMode: "copy" | "loose"; inspirationPaths: string[]; analysis: string; avoid?: string[]; theme?: string; textZone?: string; oneCampaign?: boolean;
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
  const parts: Part[] = [{ text: ideasPrompt({ brief: a.brief, n, type: a.type, perImage, products, rules, people: a.people, inspMode: a.inspMode, nInsp: insp.length, analysis: a.analysis, avoid: a.avoid ?? [], theme: a.theme, textZone: a.textZone, oneCampaign: a.oneCampaign, taste: tasteText(await brandTaste(sb)) }) }, ...insp.map((i) => imgPart(i.buf, i.mime))];
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

export interface Direction { title: string; concept: string; set: string; palette: string; light: string; attitude: string }
export const directionText = (d: Direction) => `${d.title}. ${d.concept} Décor et matières : ${d.set}. Couleurs : ${d.palette}. Lumière : ${d.light}. Attitude : ${d.attitude}.`;

/** Plusieurs directions artistiques de campagne (texte seul), le client en choisit une. */
export async function proposeDirections(sb: SupabaseClient, a: { brief: string; n: number; type: string; productIds: string[]; noProduct: boolean; people: boolean; inspirationPaths: string[]; analysis: string; avoid?: string[]; textZone?: string; feedback?: string; previous?: string[] }): Promise<Direction[]> {
  const prods = a.noProduct ? [] : (await Promise.all(a.productIds.slice(0, 4).map((id) => loadProduct(sb, id).catch(() => null)))).filter(Boolean);
  const products = prods.map((x) => `"${x!.product.name}"${x!.product.look ? `: ${x!.product.look}` : ""}`).join("\n");
  const rules = [...(await brandRules(sb)), ...prods.flatMap((x) => x!.product.rules ?? [])];
  const insp = (await Promise.all(a.inspirationPaths.slice(0, 4).map((p) => download(sb, p).catch(() => null)))).filter(Boolean) as { buf: Buffer; mime: string }[];
  const parts: Part[] = [{ text: directionsPrompt({ brief: a.brief, n: Math.min(5, Math.max(1, a.n)), type: a.type, products, rules, people: a.people, nInsp: insp.length, analysis: a.analysis, avoid: a.feedback ? [] : a.avoid ?? [], textZone: a.textZone, feedback: a.feedback, previous: a.previous, taste: tasteText(await brandTaste(sb)) }) }, ...insp.map((i) => imgPart(i.buf, i.mime))];
  const r = await gemini(MODELS.vision, parts, { purpose: "directions artistiques", json: true, timeoutMs: 75_000 });
  const raw = parseJson<{ directions?: Partial<Direction>[] }>(firstText(r));
  const c = (x: unknown, n: number) => String(x ?? "").trim().slice(0, n);
  return (raw.directions ?? []).map((d) => ({ title: c(d.title, 60), concept: c(d.concept, 400), set: c(d.set, 300), palette: c(d.palette, 200), light: c(d.light, 200), attitude: c(d.attitude, 300) })).filter((d) => d.title && d.concept);
}

export interface Concept { name: string; idea: string; why: string; set: string; palette: string; light: string; attitude: string; shots: string[]; hook: string; keywords: string[] }

/** Générateur de concepts de campagne (texte seul). */
export async function proposeConcepts(sb: SupabaseClient, a: { productIds: string[]; goal: string; channel: string; moment: string; words: string; avoid: string[]; like?: string; n?: number }): Promise<Concept[]> {
  const prods = (await Promise.all(a.productIds.slice(0, 4).map((id) => loadProduct(sb, id).catch(() => null)))).filter(Boolean);
  const products = prods.map((x) => `"${x!.product.name}"${x!.product.look ? `: ${x!.product.look}` : ""}${x!.product.applied_look ? ` Formula: ${x!.product.applied_look}.` : ""}`).join("\n");
  // on évite aussi les directions des campagnes déjà faites
  const { data: past } = await sb.from("shoots").select("type_params").not("type_params->>direction", "is", null).order("created_at", { ascending: false }).limit(12);
  const done = (past ?? []).map((p: any) => String(p.type_params?.direction ?? "").split(".")[0].slice(0, 60)).filter(Boolean);
  const rules = (await brandRules(sb)).filter((r) => !/^The brand never wants/.test(r));
  const r = await gemini(MODELS.vision, [{ text: conceptsPrompt({ products, goal: a.goal, channel: a.channel, moment: a.moment, words: a.words, taste: tasteText(await brandTaste(sb)), rules, avoid: [...a.avoid, ...done].slice(0, 20), like: a.like, n: a.n ?? 5 }) }], { purpose: "concepts de campagne", json: true, timeoutMs: 100_000 });
  const raw = parseJson<{ concepts?: any[] }>(firstText(r));
  const c = (x: unknown, n: number) => String(x ?? "").trim().slice(0, n);
  return (raw.concepts ?? []).map((x) => ({
    name: c(x.name, 60), idea: c(x.idea, 400), why: c(x.why, 240), set: c(x.set, 300), palette: c(x.palette, 200), light: c(x.light, 200), attitude: c(x.attitude, 300),
    shots: (Array.isArray(x.shots) ? x.shots : []).map((y: unknown) => c(y, 220)).filter(Boolean).slice(0, 4), hook: c(x.hook, 60),
    keywords: (Array.isArray(x.keywords) ? x.keywords : []).map((y: unknown) => c(y, 40)).filter(Boolean).slice(0, 5),
  })).filter((x) => x.name && x.idea);
}
