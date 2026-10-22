import { requireUser, handle, HttpError } from "@/lib/api";
import { analyzeInspirations, checkQuota } from "@/lib/generation";
import { ANALYZE_PROMPT } from "@/lib/prompts";
import { FORMATS } from "@/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    const b = await req.json();
    if (!b.productId) throw new HttpError(400, "Choisis un produit");
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
    const paths: string[] = Array.isArray(b.inspirationPaths) ? b.inspirationPaths : [];
    if (!analysis && paths.length) {
      try { analysis = await analyzeInspirations(sb, paths, ANALYZE_PROMPT); } catch { analysis = null; }
    }

    const { data: shoot, error } = await sb.from("shoots").insert({
      project_id: b.projectId || null, product_id: b.productId, model_id: b.modelId || null, concept_id: b.conceptId || null,
      prompt: String(b.prompt).trim(), aspect: b.aspect, size: ["1K", "2K", "4K"].includes(b.size) ? b.size : "2K",
      engine: ["flash", "pro", "mix"].includes(b.engine) ? b.engine : "mix", no_people: !!b.noPeople,
      inspiration_paths: paths, analysis, created_by: user.id,
    }).select("id").single();
    if (error || !shoot) throw new HttpError(400, error?.message ?? "Création impossible");

    const rows = Array.from({ length: n }, (_, i) => ({
      shoot_id: shoot.id, kind: "generated", variant_index: i, aspect: b.aspect, created_by: user.id,
    }));
    const { data: imgs, error: e2 } = await sb.from("images").insert(rows).select("id");
    if (e2) throw new HttpError(400, e2.message);
    return { shootId: shoot.id, imageIds: (imgs ?? []).map((i: any) => i.id) };
  });
}
