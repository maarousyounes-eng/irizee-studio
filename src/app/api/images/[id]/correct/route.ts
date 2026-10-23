import { requireUser, handle, HttpError } from "@/lib/api";
import { checkQuota } from "@/lib/generation";

export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    const b = await req.json();
    const mode = b.mode === "label" ? "label" : "edit";
    let feedback = String(b.feedback ?? "").trim();
    const avoid = String(b.avoid ?? "").trim().slice(0, 600);
    const refs: string[] = (Array.isArray(b.refs) ? b.refs : []).filter((r: unknown) => typeof r === "string" && r.startsWith("corrections/")).slice(0, 3);
    const valid = (z: any) => z && [z.x, z.y, z.w, z.h].every((n: unknown) => typeof n === "number" && n >= 0 && n <= 1) && z.w > 0.02 && z.h > 0.02;
    const zones: { x: number; y: number; w: number; h: number; note: string }[] = (Array.isArray(b.zones) ? b.zones : b.zone ? [b.zone] : [])
      .filter(valid).slice(0, 5).map((z: any) => ({ x: z.x, y: z.y, w: z.w, h: z.h, note: String(z.note ?? "").trim().slice(0, 300) }));
    const zone = zones[0] ?? null;
    // Sans consigne générale, la demande est la liste des notes de chaque zone
    if (mode === "edit" && !feedback && zones.length && zones.every((z) => z.note)) feedback = zones.map((z, k) => `Zone ${k + 1} : ${z.note}`).join(" · ");
    if (mode === "edit" && !feedback) throw new HttpError(400, "Décris la correction");
    const { data: parent } = await sb.from("images").select("*, shoots(product_id)").eq("id", params.id).single();
    if (!parent?.path) throw new HttpError(404, "Image introuvable");

    // Plusieurs propositions par correction : le vérificateur les classe, tu gardes la meilleure
    const n = mode === "label" ? 1 : Math.min(4, Math.max(1, Number(b.candidates) || 1));
    await checkQuota(sb, user.id, n);

    // « Retenir cette consigne » : règle permanente du produit (équipe uniquement)
    if (b.remember && feedback && profile.role !== "creator") {
      const pid = (parent as any).shoots.product_id;
      const { data: p } = await sb.from("products").select("rules").eq("id", pid).single();
      if (p && !p.rules.includes(feedback)) await sb.from("products").update({ rules: [...p.rules, feedback] }).eq("id", pid);
    }

    const group = crypto.randomUUID();
    const rows = Array.from({ length: n }, (_, i) => ({
      shoot_id: parent.shoot_id, parent_id: parent.id, kind: mode === "label" ? "label" : "correction",
      version: (parent.version ?? 1) + 1, variant_index: parent.variant_index, aspect: parent.aspect, model_id: parent.model_id,
      feedback: mode === "label" ? "Réparation de l'étiquette" : feedback,
      params: { ...(zone ? { zone } : {}), ...(zones.length ? { zones } : {}), group, n, i: i + 1, original: feedback, ...(refs.length ? { refs } : {}), round: Math.min(2, Math.max(0, Number(b.round) || 0)), ...(avoid ? { avoid } : {}) },
      created_by: user.id,
    }));
    const { data: imgs, error } = await sb.from("images").insert(rows).select("id");
    if (error || !imgs) throw new HttpError(400, error?.message ?? "Création impossible");
    return { imageIds: imgs.map((i: any) => i.id) };
  });
}
