import { requireUser, handle, HttpError } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { generateAdCopy } from "@/lib/adcopy";

export const maxDuration = 90;

/** Crée une pub : produit + idée + image source, puis l'IA propose plusieurs angles de textes. */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const b = await req.json();
    const idea = String(b.idea ?? "").trim();
    if (!b.productId) throw new HttpError(400, "Choisis un produit");
    if (!idea) throw new HttpError(400, "Décris l'idée de la pub");
    if (!b.sourcePath) throw new HttpError(400, "Choisis une image");
    const { data: ad, error } = await sb.from("ads").insert({ product_id: b.productId, idea, source_path: b.sourcePath, source_image_id: b.sourceImageId ?? null, created_by: user.id }).select("id").single();
    if (error || !ad) throw new HttpError(400, error?.message ?? "Création impossible");
    try {
      const angles = await withAiCtx({ sb, userId: user.id }, () => generateAdCopy(sb, { productId: b.productId, idea, sourcePath: b.sourcePath }));
      if (angles.length) await sb.from("ads").update({ angles, angle: 0, texts: angles[0], updated_at: new Date().toISOString() }).eq("id", ad.id);
    } catch { /* la pub existe : les textes pourront être régénérés depuis l'éditeur */ }
    return { id: ad.id };
  });
}
