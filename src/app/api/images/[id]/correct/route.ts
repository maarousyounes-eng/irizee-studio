import { requireUser, handle, HttpError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    const b = await req.json();
    const mode = b.mode === "label" ? "label" : "edit";
    const feedback = String(b.feedback ?? "").trim();
    const z = b.zone;
    const zone = z && [z.x, z.y, z.w, z.h].every((n: unknown) => typeof n === "number" && n >= 0 && n <= 1) && z.w > 0.02 && z.h > 0.02 ? { x: z.x, y: z.y, w: z.w, h: z.h } : null;
    if (mode === "edit" && !feedback) throw new HttpError(400, "Décris la correction");
    const { data: parent } = await sb.from("images").select("*, shoots(product_id)").eq("id", params.id).single();
    if (!parent?.path) throw new HttpError(404, "Image introuvable");

    // « Retenir cette consigne » : règle permanente du produit (équipe uniquement)
    if (b.remember && feedback && profile.role !== "creator") {
      const pid = (parent as any).shoots.product_id;
      const { data: p } = await sb.from("products").select("rules").eq("id", pid).single();
      if (p && !p.rules.includes(feedback)) await sb.from("products").update({ rules: [...p.rules, feedback] }).eq("id", pid);
    }
    const { data: img, error } = await sb.from("images").insert({
      shoot_id: parent.shoot_id, parent_id: parent.id, kind: mode === "label" ? "label" : "correction",
      version: (parent.version ?? 1) + 1, variant_index: parent.variant_index, aspect: parent.aspect, model_id: parent.model_id,
      feedback: mode === "label" ? "Réparation de l'étiquette" : feedback, params: zone ? { zone } : {}, created_by: user.id,
    }).select("id").single();
    if (error || !img) throw new HttpError(400, error?.message ?? "Création impossible");
    return { imageId: img.id };
  });
}
