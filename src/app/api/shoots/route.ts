import { requireUser, handle, HttpError } from "@/lib/api";
import { ANALYSIS_SEP, analyzeInspirations, checkQuota } from "@/lib/generation";
import { withAiCtx } from "@/lib/gemini";
import { ANALYZE_PROMPT } from "@/lib/prompts";
import { FORMATS } from "@/types";
import { isVisualType, BA_CHANGES, SOCIAL_STYLES, TEXT_ZONES, CAROUSEL_STYLES, normalizeSlides, emptySlide, type Slide, type TypeParams } from "@/lib/visualTypes";
import { planSlides } from "@/lib/slides";
import { proposeIdeas } from "@/lib/ideas";

export const maxDuration = 120;

export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    const b = await req.json();
    const productIds: string[] = Array.from(new Set([b.productId, ...(Array.isArray(b.productIds) ? b.productIds : [])].filter((x: unknown): x is string => typeof x === "string" && !!x))).slice(0, 4);
    if (!productIds.length) throw new HttpError(400, "Choisis un produit");
    const vtype = isVisualType(b.visualType) ? b.visualType : "photo";
    const tpIn = (b.typeParams ?? {}) as TypeParams;
    const s = (x: unknown, max = 400) => String(x ?? "").trim().slice(0, max);
    const tp: TypeParams = { inspMode: tpIn.inspMode === "copy" ? "copy" : "loose" };
    if (vtype === "social") tp.socialStyle = SOCIAL_STYLES.some((x) => x.id === tpIn.socialStyle) ? tpIn.socialStyle : "feed";
    if (vtype === "ad") tp.textZone = TEXT_ZONES.some((x) => x.id === tpIn.textZone) ? tpIn.textZone : "top";
    if (vtype === "ba") { tp.baChange = BA_CHANGES.some((x) => x.id === tpIn.baChange) ? tpIn.baChange : "terne"; tp.baBefore = s(tpIn.baBefore); tp.baAfter = s(tpIn.baAfter); if (tp.baChange === "autre" && (!tp.baBefore || !tp.baAfter)) throw new HttpError(400, "Décris l'avant et l'après"); }
    let slides: Slide[] = [];
    if (vtype === "carousel") { tp.carouselStyle = CAROUSEL_STYLES.some((x) => x.id === tpIn.carouselStyle) ? tpIn.carouselStyle : "edu"; slides = normalizeSlides(tpIn.slides); }
    let prompt = s(b.prompt, 4000);
    if (!prompt && (vtype === "carousel" || vtype === "ba")) prompt = vtype === "ba" ? "Natural beauty portrait." : "Showcase the product.";
    if (!prompt) throw new HttpError(400, "Écris une consigne");
    if (!FORMATS[b.aspect]) throw new HttpError(400, "Format invalide");
    let n = Math.min(12, Math.max(1, Number(b.variants) || 4));
    if (vtype === "carousel") n = Math.min(10, Math.max(3, Number(b.slideCount) || slides.length || 5));
    if (vtype === "ba") n = 2 * Math.min(3, Math.max(1, Number(b.pairs) || 1));
    if (profile.role === "creator" && !b.projectId) throw new HttpError(400, "Choisis un projet");
    await checkQuota(sb, user.id, vtype === "carousel" ? Math.max(1, slides.filter((x) => x.layout !== "text").length || n) : n);

    // Analyse de l'inspiration : réutilise celle du concept s'il y en a une
    let analysis: string | null = null;
    if (b.conceptId) {
      const { data: c } = await sb.from("concepts").select("analysis").eq("id", b.conceptId).single();
      analysis = c?.analysis ?? null;
    }
    const modelIds: string[] = Array.isArray(b.modelIds) ? b.modelIds.filter((x: unknown) => typeof x === "string").slice(0, 12) : [];
    const paths: string[] = Array.isArray(b.inspirationPaths) ? b.inspirationPaths : [];
    // Carrousel sans plan : l'IA propose la photo, les textes et la mise en page de chaque slide
    if (vtype === "carousel") {
      const filled = (x: Slide) => !!(x.photo || x.title || x.body);
      if (!slides.some(filled)) {
        try { slides = await withAiCtx({ sb, userId: user.id }, () => planSlides(sb, { idea: prompt, n, style: tp.carouselStyle!, productIds, noProduct: !!b.noProduct, people: !b.noPeople })); } catch { slides = []; }
      }
      if (slides.length >= 3) n = Math.min(10, slides.length);
      slides = Array.from({ length: n }, (_, i) => slides[i] ?? emptySlide());
      tp.slides = slides;
      if (!slides.some((x) => x.layout !== "text")) throw new HttpError(400, "Il faut au moins une slide avec photo");
    }
    // Inspirations déjà analysées dans le formulaire (et éventuellement corrigées par le client) : on les réutilise telles quelles
    const pre = (Array.isArray(b.inspirationAnalyses) ? b.inspirationAnalyses : []) as { path?: string; analysis?: string; note?: string }[];
    if (paths.length && paths.every((p) => pre.some((x) => x.path === p && String(x.analysis ?? "").trim()))) {
      analysis = paths.map((p) => {
        const x = pre.find((y) => y.path === p)!;
        const note = String(x.note ?? "").trim().slice(0, 600);
        return String(x.analysis).slice(0, 4000) + (note ? `\nCLIENT CORRECTION of this description (it has priority): ${note}` : "");
      }).join(ANALYSIS_SEP);
    }
    if (!analysis && paths.length) {
      try { analysis = await withAiCtx({ sb, userId: user.id }, () => analyzeInspirations(sb, paths, ANALYZE_PROMPT)); } catch { analysis = null; }
    }

    // Idées d'images : celles choisies par le client dans le formulaire ; sinon, avec des inspirations en mode « s'inspirer », le directeur artistique les propose
    if (vtype !== "carousel" && vtype !== "ba" && typeof tpIn.direction === "string" && tpIn.direction.trim()) tp.direction = tpIn.direction.trim().slice(0, 1200);
    const ideasIn = (Array.isArray(tpIn.shots) ? tpIn.shots : []).map((x) => String(x ?? "").trim().slice(0, 700)).filter(Boolean).slice(0, 12);
    if (vtype !== "carousel" && vtype !== "ba") {
      if (ideasIn.length) tp.shots = Array.from({ length: n }, (_, i) => ideasIn[i % ideasIn.length]);
      else if (paths.length && tp.inspMode === "loose") {
        try {
          const ideas = await withAiCtx({ sb, userId: user.id }, () => proposeIdeas(sb, { brief: prompt, n, type: vtype, productIds, productMode: productIds.length > 1 ? (["together", "split", "mix"].includes(b.productMode) ? b.productMode : "mix") : null, noProduct: !!b.noProduct, people: !b.noPeople, inspMode: "loose", inspirationPaths: paths, analysis: analysis ?? "", textZone: vtype === "ad" ? tp.textZone : undefined }));
          if (ideas.length) tp.shots = Array.from({ length: n }, (_, i) => { const x = ideas[i % ideas.length]; return `${x.title} : ${x.idea}`; });
        } catch { /* sans idées : la consigne seule */ }
      }
    }
    const { data: shoot, error } = await sb.from("shoots").insert({
      project_id: b.projectId || null, product_id: productIds[0], product_ids: productIds.length > 1 ? productIds : null, product_mode: productIds.length > 1 ? (["together", "split", "mix"].includes(b.productMode) ? b.productMode : "mix") : null, model_id: modelIds[0] ?? null, model_ids: modelIds, concept_id: b.conceptId || null,
      prompt, visual_type: vtype, type_params: tp, model_mode: b.modelMode === "together" && modelIds.length > 1 ? "together" : "split", aspect: b.aspect, size: ["1K", "2K", "4K"].includes(b.size) ? b.size : "2K",
      engine: "openai", no_people: !!b.noPeople, no_product: !!b.noProduct,
      inspiration_paths: paths, analysis, created_by: user.id,
    }).select("id").single();
    if (error || !shoot) throw new HttpError(400, error?.message ?? "Création impossible");

    // Carrousel : pas d'image à générer pour les slides texte seules (elles sont faites dans l'éditeur Ads)
    const indexes = vtype === "carousel" ? slides.map((x, i) => (x.layout === "text" ? -1 : i)).filter((i) => i >= 0) : Array.from({ length: n }, (_, i) => i);
    const rows = indexes.map((i) => ({
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
