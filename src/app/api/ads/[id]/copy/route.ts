import { requireUser, handle, HttpError } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { generateAdCopy } from "@/lib/adcopy";

export const maxDuration = 90;

/** Nouvelles propositions de textes (l'idée peut avoir été modifiée). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const b = await req.json().catch(() => ({}));
    const { data: ad } = await sb.from("ads").select("id, product_id, idea, source_path").eq("id", params.id).single();
    if (!ad?.product_id) throw new HttpError(404, "Pub introuvable");
    const idea = String(b.idea ?? ad.idea).trim() || ad.idea;
    const angles = await withAiCtx({ sb, userId: user.id }, () => generateAdCopy(sb, { productId: ad.product_id!, idea, sourcePath: ad.source_path }));
    if (!angles.length) throw new HttpError(502, "L'IA n'a rien proposé, réessaie");
    await sb.from("ads").update({ idea, angles, updated_at: new Date().toISOString() }).eq("id", ad.id);
    return { angles };
  });
}
