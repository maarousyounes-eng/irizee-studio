import sharp from "sharp";
import { requireUser, handle } from "@/lib/api";
import { download } from "@/lib/generation";

export const maxDuration = 60;

// Crée la miniature d'une ancienne image (générée avant les miniatures).
export async function POST(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb } = await requireUser();
    const { data: img } = await sb.from("images").select("id, path, thumb_path, shoot_id").eq("id", params.id).single();
    if (!img?.path || img.thumb_path) return { ok: true, skipped: true };
    const src = await download(sb, img.path);
    const thumb = await sharp(src.buf).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    const thumbPath = `generated/${img.shoot_id}/${img.id}_t.webp`;
    const up = await sb.storage.from("studio").upload(thumbPath, thumb, { contentType: "image/webp", upsert: true });
    if (!up.error) await sb.from("images").update({ thumb_path: thumbPath }).eq("id", img.id);
    return { ok: true };
  });
}
