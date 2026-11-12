import { requireUser, handle, HttpError } from "@/lib/api";
import { checkQuota, loadProduct, productPlan } from "@/lib/generation";
import { MODELS, gemini, firstText, parseJson, withAiCtx } from "@/lib/gemini";
import { anotherIdeaPrompt } from "@/lib/prompts";
import { normalizeSlides, type TypeParams } from "@/lib/visualTypes";

export const maxDuration = 60;

/**
 * « Autre idée » pour une image :
 * - action "propose" : l'IA écrit une nouvelle idée (texte seul, quasi gratuit), le client la lit et peut la modifier ;
 * - action "create" : une nouvelle image est créée avec cette idée (même place dans le shooting).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    const { data: img } = await sb.from("images").select("id, shoot_id, variant_index, aspect, model_id, params").eq("id", params.id).single();
    if (!img) throw new HttpError(404, "Image introuvable");
    const { data: shoot } = await sb.from("shoots").select("*").eq("id", img.shoot_id).single();
    if (!shoot) throw new HttpError(404, "Shooting introuvable");
    const tp = (shoot.type_params ?? {}) as TypeParams;
    const vi = img.variant_index ?? 0;
    const slide = shoot.visual_type === "carousel" ? normalizeSlides(tp.slides)[vi] ?? null : null;

    if (b.action === "create") {
      const idea = String(b.idea ?? "").trim().slice(0, 600);
      if (!idea) throw new HttpError(400, "Écris l'idée");
      await checkQuota(sb, user.id, 1);
      const { data: row, error } = await sb.from("images").insert({
        shoot_id: img.shoot_id, kind: "generated", variant_index: vi, aspect: img.aspect, model_id: img.model_id, created_by: user.id,
        params: { idea, from: img.id },
      }).select("id").single();
      if (error || !row) throw new HttpError(400, error?.message ?? "Création impossible");
      return { imageId: row.id };
    }

    const current = String((img.params as any)?.idea ?? slide?.photo ?? (tp.shots ?? [])[vi] ?? "");
    const pl = productPlan(shoot, { variant_index: vi });
    const prods = shoot.no_product ? [] : (await Promise.all([pl.mainId, ...pl.otherIds].filter(Boolean).map((id: string) => loadProduct(sb, id).catch(() => null)))).filter(Boolean);
    const products = Array.from(new Map(prods.map((x) => [x!.product.id, x!.product])).values())
      .map((p) => [`"${p.name}"${p.look ? `: ${p.look}` : ""}`, p.real_size ? `Real size: ${p.real_size}.` : "", p.applied_look ? `Formula: ${p.applied_look}.` : ""].filter(Boolean).join(" ")).join("\n");
    const r = await withAiCtx({ sb, userId: user.id, shootId: img.shoot_id, imageId: img.id }, () => gemini(MODELS.vision, [{ text: anotherIdeaPrompt({
      brief: shoot.prompt, type: shoot.visual_type, slide: slide ? { title: slide.title, body: slide.body } : null, current, hint: String(b.hint ?? "").slice(0, 400), products, people: !shoot.no_people,
    }) }], { purpose: "autre idée", json: true, timeoutMs: 40_000 }));
    const idea = String(parseJson<{ idea?: string }>(firstText(r)).idea ?? "").trim();
    if (!idea) throw new HttpError(502, "Pas d'idée reçue, réessayez");
    return { idea };
  });
}
