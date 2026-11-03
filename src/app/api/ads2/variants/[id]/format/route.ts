import { requireUser, handle, HttpError } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { formatVariant, type Variant } from "@/lib/ads2";

export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const { aspect } = await req.json().catch(() => ({}));
    if (!["1:1", "9:16", "16:9"].includes(aspect)) throw new HttpError(400, "Format inconnu");
    const { data: v } = await sb.from("ad_variants").select("*").eq("id", params.id).single();
    if (!v) throw new HttpError(404, "Pub introuvable");
    return withAiCtx({ sb, userId: user.id }, () => formatVariant(sb, v as Variant, aspect));
  });
}
