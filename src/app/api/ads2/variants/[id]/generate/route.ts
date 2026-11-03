import { requireUser, handle, HttpError } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { generateVariant, type Variant } from "@/lib/ads2";

export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const { data: v } = await sb.from("ad_variants").select("*").eq("id", params.id).single();
    if (!v) throw new HttpError(404, "Pub introuvable");
    if (v.state === "done" && v.path) return { ok: true, skipped: true };
    await sb.from("ad_variants").update({ state: "generating", error: null }).eq("id", v.id);
    try {
      await withAiCtx({ sb, userId: user.id }, () => generateVariant(sb, v as Variant));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur de génération";
      await sb.from("ad_variants").update({ state: "error", error: msg.slice(0, 400) }).eq("id", v.id);
      throw new HttpError(502, msg);
    }
    return { ok: true };
  });
}
