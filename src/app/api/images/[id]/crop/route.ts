import sharp from "sharp";
import { requireUser, handle, HttpError } from "@/lib/api";
import { download } from "@/lib/generation";
import { cropTo, cropWindow } from "@/lib/framing";
import { FORMATS } from "@/types";

export const maxDuration = 60;
const BUCKET = "studio";

/**
 * Recadrage à la main (gratuit, aucune IA) : on découpe l'image entière d'origine au format voulu, à l'endroit choisi.
 * Même format que l'image : elle est remplacée. Autre format : une déclinaison est créée à côté.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    const aspect = String(b.aspect ?? "");
    if (!FORMATS[aspect]) throw new HttpError(400, "Format invalide");
    const cx = Math.max(0, Math.min(1, Number(b.cx))), cy = Math.max(0, Math.min(1, Number(b.cy)));
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) throw new HttpError(400, "Cadrage invalide");
    const { data: img } = await sb.from("images").select("*").eq("id", params.id).single();
    if (!img?.path) throw new HttpError(404, "Image introuvable");
    const prm = (img.params ?? {}) as Record<string, any>;
    const srcPath = (prm.master_path as string | undefined) ?? img.path;
    const src = await download(sb, srcPath);
    const m = await sharp(src.buf).metadata();
    const W = m.width ?? 0, H = m.height ?? 0;
    if (!W || !H) throw new HttpError(400, "Image illisible");
    const win = cropWindow(W, H, aspect, null, { center: { x: cx, y: cy } });
    const out = await cropTo(src.buf, win);
    const full = await sharp(out).jpeg({ quality: 94, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
    const thumb = await sharp(out).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    const crop = { x: win.left / W, y: win.top / H, w: win.width / W, h: win.height / H };
    const same = aspect === img.aspect && !!prm.master_path;
    const key = same ? `${img.id}-c${Date.now()}` : crypto.randomUUID();
    const path = `generated/${img.shoot_id}/${key}.jpg`, thumbPath = `generated/${img.shoot_id}/${key}_t.webp`;
    const [up, upT] = await Promise.all([
      sb.storage.from(BUCKET).upload(path, full, { contentType: "image/jpeg", upsert: true }),
      sb.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: "image/webp", upsert: true }),
    ]);
    if (up.error) throw new HttpError(500, "Enregistrement impossible : " + up.error.message);
    if (same) {
      const { subject_cut: _cut, ...rest } = prm;
      await sb.from("images").update({ path, thumb_path: upT.error ? null : thumbPath, params: { ...rest, crop, cropped_by_hand: true } }).eq("id", img.id);
      return { id: img.id, replaced: true };
    }
    const { data: row, error } = await sb.from("images").insert({
      shoot_id: img.shoot_id, parent_id: img.id, kind: "format", version: (img.version ?? 1) + 1, variant_index: img.variant_index, aspect, model_id: img.model_id,
      state: "done", path, thumb_path: upT.error ? null : thumbPath, qc: img.qc, verdict: img.verdict, score: img.score, model_used: "recadrage",
      feedback: `Recadrage ${FORMATS[aspect].short}`, params: { crop, cropped_by_hand: true, ...(prm.master_path ? { master_path: prm.master_path } : {}) }, created_by: user.id,
    }).select("id").single();
    if (error || !row) throw new HttpError(400, error?.message ?? "Création impossible");
    return { id: row.id, replaced: false };
  });
}
