import sharp, { type OverlayOptions } from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BA_LABELS } from "./baLabels";
import type { TypeParams } from "./visualTypes";

const BUCKET = "studio";

/**
 * Montage avant / après en UNE image : les deux photos au même cadrage, côte à côte ou l'une au-dessus de l'autre.
 * Aucune IA : même découpe pour les deux moitiés, étiquettes « AVANT » / « APRÈS » posées par la plateforme (jamais de faute).
 */
export async function composeBA(a: { before: Buffer; after: Buffer; aspect: string; layout: string; labels: boolean; mention: boolean }): Promise<Buffer> {
  const [aw, ah] = a.aspect.split(":").map(Number);
  const W = 1600, H = Math.round((W * (ah || 5)) / (aw || 4));
  const gap = 10, stacked = a.layout === "haut";
  const pw = stacked ? W : Math.floor((W - gap) / 2), ph = stacked ? Math.floor((H - gap) / 2) : H;
  // même découpe, centrée, pour les deux photos : elles restent parfaitement superposables
  const panel = (b: Buffer) => sharp(b).resize(pw, ph, { fit: "cover", position: "centre" }).toBuffer();
  const [p1, p2] = await Promise.all([panel(a.before), panel(a.after)]);
  const x2 = stacked ? 0 : pw + gap, y2 = stacked ? ph + gap : 0;
  const layers: OverlayOptions[] = [{ input: p1, left: 0, top: 0 }, { input: p2, left: x2, top: y2 }];
  const pillH = Math.round(W * 0.042), m = Math.round(W * 0.022);
  const pill = async (b64: string, h: number) => sharp(Buffer.from(b64, "base64")).resize({ height: h }).toBuffer({ resolveWithObject: true });
  if (a.labels) {
    const [l1, l2] = await Promise.all([pill(BA_LABELS.avant, pillH), pill(BA_LABELS.apres, pillH)]);
    layers.push({ input: l1.data, left: m, top: ph - pillH - m }, { input: l2.data, left: x2 + m, top: y2 + ph - pillH - m });
  }
  if (a.mention) {
    const il = await pill(BA_LABELS.illustration, Math.round(pillH * 0.66));
    layers.push({ input: il.data, left: x2 + pw - il.info.width - m, top: y2 + ph - il.info.height - m });
  }
  return sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } }).composite(layers).jpeg({ quality: 93, chromaSubsampling: "4:4:4" }).toBuffer();
}

/** Dernière version terminée d'une photo de la paire (corrections comprises, hors montages et essais écartés). */
async function latest(sb: SupabaseClient, shootId: string, vi: number) {
  const { data } = await sb.from("images").select("id, path, params").eq("shoot_id", shootId).eq("variant_index", vi).neq("kind", "format").eq("state", "done").is("deleted_at", null).not("path", "is", null).order("created_at", { ascending: false }).limit(8);
  const rows = (data ?? []) as { id: string; path: string; params: Record<string, any> | null }[];
  return rows.find((r) => !r.params?.archived) ?? rows[0] ?? null;
}

/**
 * Assemble (ou réassemble) le montage d'une paire et l'enregistre comme une image du shooting.
 * Les anciens montages de la paire sont écartés : on ne garde que le dernier.
 */
export async function makeBAComposite(sb: SupabaseClient, shoot: { id: string; aspect: string; type_params: unknown }, pair: number, userId: string, opts?: { layout?: string; labels?: boolean; mention?: boolean }): Promise<string | null> {
  const tp = (shoot.type_params ?? {}) as TypeParams;
  const [bef, aft] = await Promise.all([latest(sb, shoot.id, pair * 2), latest(sb, shoot.id, pair * 2 + 1)]);
  if (!bef || !aft) return null;
  const dl = async (p: string) => { const { data, error } = await sb.storage.from(BUCKET).download(p); if (error || !data) throw new Error("Image introuvable"); return Buffer.from(await data.arrayBuffer()); };
  const [b1, b2] = await Promise.all([dl(bef.path), dl(aft.path)]);
  const layout = opts?.layout ?? tp.baLayout ?? (shoot.aspect === "9:16" ? "haut" : "cote");
  const labels = opts?.labels ?? tp.baLabels ?? true, mention = opts?.mention ?? tp.baMention ?? false;
  const out = await composeBA({ before: b1, after: b2, aspect: shoot.aspect, layout, labels, mention });
  const key = crypto.randomUUID();
  const path = `generated/${shoot.id}/${key}.jpg`, thumbPath = `generated/${shoot.id}/${key}_t.webp`;
  const thumb = await sharp(out).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const [up, upT] = await Promise.all([
    sb.storage.from(BUCKET).upload(path, out, { contentType: "image/jpeg", upsert: true }),
    sb.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: "image/webp", upsert: true }),
  ]);
  if (up.error) throw new Error("Enregistrement du montage impossible : " + up.error.message);
  // les anciens montages de cette paire sont écartés
  const { data: old } = await sb.from("images").select("id, params").eq("shoot_id", shoot.id).eq("kind", "format").eq("variant_index", pair * 2 + 1).is("deleted_at", null);
  for (const o of (old ?? []) as { id: string; params: Record<string, any> | null }[]) if (o.params?.composite && !o.params?.archived) await sb.from("images").update({ params: { ...o.params, archived: true } }).eq("id", o.id);
  const { data: row, error } = await sb.from("images").insert({
    shoot_id: shoot.id, parent_id: aft.id, kind: "format", version: 1, variant_index: pair * 2 + 1, aspect: shoot.aspect, state: "done",
    path, thumb_path: upT.error ? null : thumbPath, created_by: userId, feedback: "Montage avant / après",
    params: { composite: true, pair, layout, labels, mention },
    qc: { texts: [], comment: "Montage avant / après, assemblé par la plateforme (aucune IA)." }, verdict: "valid", score: null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return row?.id ?? null;
}
