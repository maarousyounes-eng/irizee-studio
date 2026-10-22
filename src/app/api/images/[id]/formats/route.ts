import { requireUser, handle, HttpError } from "@/lib/api";
import { FORMATS } from "@/types";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const { aspects } = await req.json();
    const wanted = (Array.isArray(aspects) ? aspects : []).filter((a: string) => FORMATS[a]);
    if (!wanted.length) throw new HttpError(400, "Choisis au moins un format");
    const { data: parent } = await sb.from("images").select("*").eq("id", params.id).single();
    if (!parent?.path) throw new HttpError(404, "Image introuvable");
    const rows = wanted.filter((a: string) => a !== parent.aspect).map((a: string) => ({
      shoot_id: parent.shoot_id, parent_id: parent.id, kind: "format", version: 1, variant_index: parent.variant_index,
      aspect: a, feedback: `Déclinaison ${FORMATS[a].short}`, created_by: user.id,
    }));
    if (!rows.length) throw new HttpError(400, "Cette image est déjà dans ce format");
    const { data, error } = await sb.from("images").insert(rows).select("id");
    if (error) throw new HttpError(400, error.message);
    return { imageIds: (data ?? []).map((i: any) => i.id) };
  });
}
