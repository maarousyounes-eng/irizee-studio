import { requireUser, handle, HttpError } from "@/lib/api";
import { checkQuota } from "@/lib/generation";
import { normalizeSlides, type TypeParams } from "@/lib/visualTypes";

export const maxDuration = 30;

/** L'image pilote est validée : on crée les autres images de la campagne (elles reprendront le pilote). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const { data: shoot } = await sb.from("shoots").select("*").eq("id", params.id).single();
    if (!shoot) throw new HttpError(404, "Shooting introuvable");
    const tp = (shoot.type_params ?? {}) as TypeParams;
    if (tp.pilot !== "pending") throw new HttpError(400, "La campagne est déjà lancée");
    const vtype = String(shoot.visual_type ?? "photo");
    // Les images attendues : toutes les photos de la campagne, les slides avec photo du carrousel, ou les paires avant/après
    const wanted = vtype === "carousel"
      ? normalizeSlides(tp.slides).map((x, i) => (x.layout === "text" ? -1 : i)).filter((i) => i >= 0)
      : Array.from({ length: Math.min(12, Math.max(1, Number(tp.count) || 1)) }, (_, i) => i);
    const first = wanted[0] ?? 0;
    const { data: have } = await sb.from("images").select("variant_index, state, path").eq("shoot_id", shoot.id).neq("kind", "format").is("deleted_at", null);
    if (!(have ?? []).some((x: any) => x.variant_index === first && x.state === "done" && x.path)) throw new HttpError(400, "L'image pilote n'est pas encore prête");
    const existing = new Set((have ?? []).map((x: any) => x.variant_index as number));
    const todo = wanted.filter((i) => !existing.has(i));
    await checkQuota(sb, user.id, todo.length);
    const modelIds: string[] = shoot.no_people ? [] : ((shoot.model_ids as string[] | null) ?? []);
    const together = shoot.model_mode === "together" && modelIds.length > 1;
    const rows = todo.map((i) => ({
      shoot_id: shoot.id, kind: "generated", variant_index: i, aspect: shoot.aspect, created_by: user.id,
      // Carrousel : le même mannequin partout ; avant/après : le même dans la paire ; campagne : en alternance
      model_id: !modelIds.length || together ? null : modelIds[(vtype === "carousel" ? 0 : vtype === "ba" ? Math.floor(i / 2) : i) % modelIds.length],
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
