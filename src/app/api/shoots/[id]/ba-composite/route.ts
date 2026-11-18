import { requireUser, handle, HttpError } from "@/lib/api";
import { makeBAComposite } from "@/lib/baComposite";

export const maxDuration = 60;

/** Refait le montage avant / après d'une paire (sans IA, gratuit) : autre disposition, avec ou sans étiquettes, mention « Illustration ». */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json().catch(() => ({}));
    const { data: shoot } = await sb.from("shoots").select("id, aspect, type_params, visual_type").eq("id", params.id).single();
    if (!shoot || shoot.visual_type !== "ba") throw new HttpError(404, "Avant / après introuvable");
    const id = await makeBAComposite(sb, shoot, Math.max(0, Number(b.pair) || 0), user.id, {
      layout: b.layout === "haut" || b.layout === "cote" ? b.layout : undefined,
      labels: typeof b.labels === "boolean" ? b.labels : undefined,
      mention: typeof b.mention === "boolean" ? b.mention : undefined,
    });
    if (!id) throw new HttpError(400, "Il faut la photo « avant » et la photo « après » pour faire le montage");
    return { imageId: id };
  });
}
