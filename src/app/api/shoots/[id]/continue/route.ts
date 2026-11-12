import { requireUser, handle, HttpError } from "@/lib/api";
import { checkQuota } from "@/lib/generation";
import type { TypeParams } from "@/lib/visualTypes";

export const maxDuration = 30;

/** L'image pilote est validée : on crée les autres images de la campagne (elles reprendront le pilote). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const { data: shoot } = await sb.from("shoots").select("*").eq("id", params.id).single();
    if (!shoot) throw new HttpError(404, "Shooting introuvable");
    const tp = (shoot.type_params ?? {}) as TypeParams;
    if (tp.pilot !== "pending") throw new HttpError(400, "La campagne est déjà lancée");
    const n = Math.min(12, Math.max(1, Number(tp.count) || 1));
    const { data: pilot } = await sb.from("images").select("id").eq("shoot_id", shoot.id).eq("variant_index", 0).eq("state", "done").is("deleted_at", null).limit(1);
    if (!pilot?.length) throw new HttpError(400, "L'image pilote n'est pas encore prête");
    await checkQuota(sb, user.id, Math.max(0, n - 1));
    const modelIds: string[] = shoot.no_people ? [] : ((shoot.model_ids as string[] | null) ?? []);
    const together = shoot.model_mode === "together" && modelIds.length > 1;
    const rows = Array.from({ length: n - 1 }, (_, k) => k + 1).map((i) => ({
      shoot_id: shoot.id, kind: "generated", variant_index: i, aspect: shoot.aspect, created_by: user.id,
      model_id: !modelIds.length || together ? null : modelIds[i % modelIds.length],
    }));
    let ids: string[] = [];
    if (rows.length) {
      const { data: imgs, error } = await sb.from("images").insert(rows).select("id");
      if (error) throw new HttpError(400, error.message);
      ids = (imgs ?? []).map((i: any) => i.id);
    }
    await sb.from("shoots").update({ type_params: { ...tp, pilot: "validated" } }).eq("id", shoot.id);
    return { imageIds: ids };
  });
}
