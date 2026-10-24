import { requireUser, handle, HttpError } from "@/lib/api";
import { qualityCheck } from "@/lib/generation";
import type { ImageRow } from "@/types";

export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb } = await requireUser();
    const { data: image } = await sb.from("images").select("*").eq("id", params.id).single();
    if (!image) throw new HttpError(404, "Image introuvable");
    if ((image.params as any)?.cancelled || !image.path) return { verdict: null, score: null, cancelled: true };
    try {
      return await qualityCheck(sb, image as ImageRow);
    } catch (e) {
      // Un contrôle indisponible ne doit jamais bloquer l'image : elle passe « à vérifier ».
      const msg = e instanceof Error ? e.message : "Contrôle indisponible";
      await sb.from("images").update({ verdict: "review", score: null, qc: { texts: [], comment: "Contrôle qualité indisponible : " + msg.slice(0, 120) } }).eq("id", params.id);
      return { verdict: "review", score: 0 };
    }
  });
}
