import { requireUser, handle, HttpError } from "@/lib/api";
import { analyzeInspirations, checkQuota } from "@/lib/generation";
import { withAiCtx } from "@/lib/gemini";
import { ANALYZE_PROMPT } from "@/lib/prompts";
import { FORMATS } from "@/types";
import { isVisualType, BA_CHANGES, SOCIAL_STYLES, TEXT_ZONES, type TypeParams } from "@/lib/visualTypes";
import { planSlides } from "@/lib/slides";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    const b = await req.json();
    const productIds: string[] = Array.from(new Set([b.productId, ...(Array.isArray(b.productIds) ? b.productIds : [])].filter((x: unknown): x is string => typeof x === "string" && !!x))).slice(0, 4);
    if (!productIds.length) throw new HttpError(400, "Choisis un produit");
    const vtype = isVisualType(b.visualType) ? b.visualType : "photo";
    const tpIn = (b.typeParams ?? {}) as TypeParams;
    const s = (x: unknown, max = 400) => String(x ?? "").trim().slice(0, max);
    const tp: TypeParams = {};
    if (vtype === "social") tp.socialStyle = SOCIAL_STYLES.some((x) => x.id === tpIn.socialStyle) ? tpIn.socialStyle : "feed";
    if (vtype === "ad") tp.textZone = TEXT_ZONES.some((x) => x.id === tpIn.textZone) ? tpIn.textZone : "top";
    if (vtype === "ba") { tp.baChange = BA_CHANGES.some((x) => x.id === tpIn.baChange) ? tpIn.baChange : "terne"; tp.baBefore = s(tpIn.baBefore); tp.baAfter = s(tpIn.baAfter); if (tp.baChange === "autre" && (!tp.baBefore || !tp.baAfter)) throw new HttpError(400, "Décris l'avant et l'après"); }
    if (vtype === "carousel") tp.slides = (Array.isArray(tpIn.slides) ? tpIn.slides : []).map((x) => s(x, 240)).slice(0, 10);
    let prompt = s(b.prompt, 4000);
    if (!prompt && (vtype === "carousel" || vtype === "ba")) prompt = vtype === "ba" ? "Natural beauty portrait." : "Showcase the product.";
    if (!prompt) throw new HttpError(400, "Écris une consigne");
    if (!FORMATS[b.aspect]) throw new HttpError(400, "Format invalide");
    let n = Math.min(12, Math.max(1, Number(b.variants) || 4));
    if (vtype === "carousel") n = Math.min(10, Math.max(3, Number(b.slideCount) || tp.slides!.length || 5));
    if (vtype === "ba") n = 2 * Math.min(3, Math.max(1, Number(b.pairs) || 1));
    if (profile.role === "creator" && !b.projectId) throw new HttpError(400, "Choisis un projet");
    await checkQuota(sb, user.id, n);

    // Analyse de l'inspiration : réutilise celle du concept s'il y en a une
    let analysis: string | null = null;
    if (b.conceptId) {
      const { data: c } = await sb.from("concepts").select("analysis").eq("id", b.conceptId).single();
      analysis = c?.analysis ?? null;
    }
    const modelIds: string[] = Array.isArray(b.modelIds) ? b.modelIds.filter((x: unknown) => typeof x === "string").slice(0, 12) : [];
    const paths: string[] = Array.isArray(b.inspirationPaths) ? b.inspirationPaths : [];
    // Carrousel sans plan : l'IA propose le contenu de chaque slide
    if (vtype === "carousel" && tp.slides!.filter(Boolean).length < n) {
      const missing = tp.slides!.filter(Boolean).length === 0;
      if (missing) {
        try { tp.slides = await withAiCtx({ sb, userId: user.id }, () => planSlides(sb, { idea: prompt, n, productIds, noProduct: !!b.noProduct, people: !b.noPeople })); } catch { tp.slides = []; }
      }
      tp.slides = Array.from({ length: n }, (_, i) => tp.slides![i] ?? "");
    }
    if (!analysis && paths.length) {
      try { analysis = await withAiCtx({ sb, userId: user.id }, () => analyzeInspirations(sb, paths, ANALYZE_PROMPT)); } catch { analysis = null; }
    }

    const { data: shoot, error } = await sb.from("shoots").insert({
      project_id: b.projectId || null, product_id: productIds[0], product_ids: productIds.length > 1 ? productIds : null, product_mode: productIds.length > 1 ? (["together", "split", "mix"].includes(b.productMode) ? b.productMode : "mix") : null, model_id: modelIds[0] ?? null, model_ids: modelIds, concept_id: b.conceptId || null,
      prompt, visual_type: vtype, type_params: tp, model_mode: b.modelMode === "together" && modelIds.length > 1 ? "together" : "split", aspect: b.aspect, size: ["1K", "2K", "4K"].includes(b.size) ? b.size : "2K",
      engine: ["flash", "pro", "mix", "openai"].includes(b.engine) ? b.engine : "pro", no_people: !!b.noPeople, no_product: !!b.noProduct,
      inspiration_paths: paths, analysis, created_by: user.id,
    }).select("id").single();
    if (error || !shoot) throw new HttpError(400, error?.message ?? "Création impossible");

    const rows = Array.from({ length: n }, (_, i) => ({
      shoot_id: shoot.id, kind: "generated", variant_index: i, aspect: b.aspect, created_by: user.id,
      // Carrousel : le même mannequin sur toutes les slides ; avant/après : le même dans la paire ; ensemble : tous (lus sur le shooting)
      model_id: b.noPeople || !modelIds.length || (b.modelMode === "together" && modelIds.length > 1) ? null
        : modelIds[(vtype === "carousel" ? 0 : vtype === "ba" ? Math.floor(i / 2) : i) % modelIds.length],
    }));
    const { data: imgs, error: e2 } = await sb.from("images").insert(rows).select("id");
    if (e2) throw new HttpError(400, e2.message);
    return { shootId: shoot.id, imageIds: (imgs ?? []).map((i: any) => i.id) };
  });
}
