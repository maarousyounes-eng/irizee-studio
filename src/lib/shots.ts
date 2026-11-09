import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, firstText } from "./gemini";
import { shotListPrompt } from "./prompts";
import { loadProduct } from "./generation";

/** Le photographe prépare une prise de vue précise par image (cadrage, objectif, lumière, pose). Texte seul : quelques centimes. */
export async function planShots(sb: SupabaseClient, a: { brief: string; analysis: string; n: number; type: string; productIds: string[]; noProduct: boolean; people: number }): Promise<string[]> {
  const prods = a.noProduct ? [] : (await Promise.all(a.productIds.slice(0, 4).map((id) => loadProduct(sb, id).catch(() => null)))).filter(Boolean);
  const products = prods.map((x) => {
    const p = x!.product;
    return [`"${p.name}"${p.look ? `: ${p.look}` : ""}`, p.real_size ? `Real size: ${p.real_size.replace(/\n/g, ", ")}.` : "", p.applied_look ? `Formula: ${p.applied_look}.` : ""].filter(Boolean).join(" ");
  }).join("\n");
  const r = await gemini(MODELS.text, [{ text: shotListPrompt({ brief: a.brief, analysis: a.analysis, n: a.n, type: a.type, products, people: a.people, noProduct: a.noProduct }) }], { purpose: "plan photographe", json: true, timeoutMs: 35_000 });
  const raw = JSON.parse(firstText(r).trim().replace(/^```json\s*|```$/g, "")) as { shots?: unknown[] };
  return (raw.shots ?? []).map((x) => String(x ?? "").trim().slice(0, 1200)).filter(Boolean).slice(0, a.n);
}
