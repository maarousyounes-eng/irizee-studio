import { requireUser, handle, HttpError } from "@/lib/api";
import { checkQuota, generateImage } from "@/lib/generation";
import type { ImageRow } from "@/types";

export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const { data: image } = await sb.from("images").select("*").eq("id", params.id).single();
    if (!image) throw new HttpError(404, "Image introuvable");
    if (image.state === "done" && image.path) return { ok: true, skipped: true };
    if ((image.params as any)?.cancelled) return { ok: true, cancelled: true };
    try {
      await checkQuota(sb, user.id, 1);
      await generateImage(sb, image as ImageRow, user.id, req.signal);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur de génération";
      if (req.signal.aborted) return { ok: true, cancelled: true }; // le navigateur a annulé : rien à signaler
      await sb.from("images").update({ state: "error", error: msg.slice(0, 500) }).eq("id", params.id).eq("state", "generating");
      throw new HttpError(502, msg);
    }
    return { ok: true };
  });
}
