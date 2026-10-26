import { requireUser, handle, HttpError } from "@/lib/api";
import { analyzeInspirations, checkQuota } from "@/lib/generation";
import { withAiCtx } from "@/lib/gemini";
import { ANALYZE_PROMPT } from "@/lib/prompts";
import { FORMATS } from "@/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    const b = await req.json();
    const productIds: string[] = Array.from(new Set([b.productId, ...(Array.isArray(b.productIds) ? b.productIds : [])].filter((x: unknown): x is string => typeof x === "string" && !!x))).slice(0, 4);
    if (!productIds.length) throw new HttpError(400, "Choisis un produit");
    if (!String(b.prompt ?? "").trim()) throw new HttpError(400, "Écris une consigne");
    if (!FORMATS[b.aspect]) throw new HttpError(400, "Format invalide");
    const n = Math.min(12, Math.max(1, Number(b.variants) || 4));
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
    if (!analysis && paths.length) {
      try { analysis = await withAiCtx({ sb, userId: user.id }, () => analyzeInspirations(sb, paths, ANALYZE_PROMPT)); } catch { analysis = null; }
    }

    const { data: shoot, error } = await sb.from("shoots").insert({
      project_id: b.projectId || null, product_id: productIds[0], product_ids: productIds.length > 1 ? productIds : null, model_id: modelIds[0] ?? null, model_ids: modelIds, concept_id: b.conceptId || null,
      prompt: String(b.prompt).trim(), aspect: b.aspect, size: ["1K", "2K", "4K"].includes(b.size) ? b.size : "2K",
      engine: ["flash", "pro", "mix"].includes(b.engine) ? b.engine : "mix", no_people: !!b.noPeople,
      inspiration_paths: paths, analysis, created_by: user.id,
    }).select("id").single();
    if (error || !shoot) throw new HttpError(400, error?.message ?? "Création impossible");

    const rows = Array.from({ length: n }, (_, i) => ({
      shoot_id: shoot.id, kind: "generated", variant_index: i, aspect: b.aspect, created_by: user.id,
      model_id: b.noPeople || !modelIds.length ? null : modelIds[i % modelIds.length],
    }));
    const { data: imgs, error: e2 } = await sb.from("images").insert(rows).select("id");
    if (e2) throw new HttpError(400, e2.message);
    return { shootId: shoot.id, imageIds: (imgs ?? []).map((i: any) => i.id) };
  });
}
