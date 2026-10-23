import sharp from "sharp";

export interface Zone { x: number; y: number; w: number; h: number }
export interface CropBox { left: number; top: number; width: number; height: number; ratio: string }

// Formats d'image que le modèle sait produire : le recadrage envoyé doit en suivre un, pour revenir à l'identique.
const RATIOS: [string, number][] = [["1:1", 1], ["4:5", 0.8], ["5:4", 1.25], ["3:4", 0.75], ["4:3", 4 / 3], ["2:3", 2 / 3], ["3:2", 1.5], ["9:16", 9 / 16], ["16:9", 16 / 9]];

/** Rectangle de contexte autour de la zone, au format d'image supporté le plus proche (le plus petit qui convient). */
export function cropBoxFor(zone: Zone, W: number, H: number): CropBox | null {
  const short = Math.min(W, H);
  const pad = 0.06 * short;
  const needW = zone.w * W + 2 * pad;
  const needH = zone.h * H + 2 * pad;
  const minSide = 0.4 * short; // assez de contexte pour que le modèle comprenne la scène
  let best: { w: number; h: number; ratio: string } | null = null;
  for (const [label, r] of RATIOS) {
    let w = needW, h = needH;
    if (w / h < r) w = h * r; else h = w / r;
    const k = Math.max(1, minSide / Math.min(w, h));
    w *= k; h *= k;
    if (w <= W + 0.5 && h <= H + 0.5 && (!best || w * h < best.w * best.h)) best = { w: Math.min(w, W), h: Math.min(h, H), ratio: label };
  }
  if (!best) return null;
  const width = Math.round(best.w), height = Math.round(best.h);
  const cx = (zone.x + zone.w / 2) * W, cy = (zone.y + zone.h / 2) * H;
  const left = Math.round(Math.min(Math.max(0, cx - width / 2), W - width));
  const top = Math.round(Math.min(Math.max(0, cy - height / 2), H - height));
  return { left, top, width, height, ratio: best.ratio };
}

export function cropImage(buf: Buffer, box: CropBox) {
  return sharp(buf).extract({ left: box.left, top: box.top, width: box.width, height: box.height }).png().toBuffer();
}

/**
 * Recolle la zone retouchée sur l'image d'origine avec un bord fondu :
 * tout ce qui est hors de la zone reste identique à l'original, pixel pour pixel.
 */
export async function pasteBack(original: Buffer, edited: Buffer, box: CropBox, zone: Zone, W: number, H: number): Promise<Buffer> {
  const { left, top, width, height } = box;
  const short = Math.min(W, H);
  const grow = 0.012 * short;
  const feather = Math.max(6, 0.018 * short);
  const zx = zone.x * W - left - grow, zy = zone.y * H - top - grow;
  const zw = zone.w * W + 2 * grow, zh = zone.h * H + 2 * grow;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" rx="${feather}" fill="white"/></svg>`;
  const mask = await sharp(Buffer.from(svg)).blur(feather / 2).greyscale().raw().toBuffer();
  const rgb = await sharp(edited).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const patch = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(mask, { raw: { width, height, channels: 1 } })
    .png().toBuffer();
  return sharp(original).removeAlpha().composite([{ input: patch, left, top }]).png().toBuffer();
}

/** Zone normalisée à partir d'une boîte [ymin, xmin, ymax, xmax] en 0–1000 (renvoyée par le modèle de vision). */
export function zoneFromBox(box: unknown, pad = 0.02): Zone | null {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number")) return null;
  const [y0, x0, y1, x1] = box.map((n) => Math.min(1, Math.max(0, n / 1000)));
  const x = Math.max(0, x0 - pad), y = Math.max(0, y0 - pad);
  const w = Math.min(1, x1 + pad) - x, h = Math.min(1, y1 + pad) - y;
  if (w < 0.03 || h < 0.03) return null;
  return { x, y, w, h };
}

/** Plus petite zone contenant toutes les zones données. */
export function unionZones(zones: Zone[]): Zone | null {
  if (!zones.length) return null;
  const x0 = Math.min(...zones.map((z) => z.x)), y0 = Math.min(...zones.map((z) => z.y));
  const x1 = Math.max(...zones.map((z) => z.x + z.w)), y1 = Math.max(...zones.map((z) => z.y + z.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Plusieurs boîtes [ymin, xmin, ymax, xmax] (0–1000) → zones normalisées. */
export function zonesFromBoxes(boxes: unknown, pad = 0.02): Zone[] {
  if (!Array.isArray(boxes)) return [];
  return boxes.map((b) => zoneFromBox(b, pad)).filter((z): z is Zone => !!z);
}
