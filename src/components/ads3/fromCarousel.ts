// Construit une pub (éditeur Ads) à partir d'un carrousel : chaque slide avec sa photo, ses textes et sa mise en page.
import { imgUrl } from "@/lib/client";
import { normalizeSlides, type Slide } from "@/lib/visualTypes";
import { onColor, type AdEl, type AdItem, type Kit } from "./AdCanvas";

interface Img { id: string; kind: string; variant_index: number; state: string; path: string | null; thumb_path?: string | null; aspect: string | null; review_status?: string; verdict?: string | null; params?: any; created_at: string; deleted_at?: string | null }

/** Luminosité moyenne (0-255) d'une bande horizontale de l'image, pour choisir un texte noir ou blanc. */
async function zoneLight(path: string, y0: number, y1: number) {
  return new Promise<number>((resolve) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = 40; c.height = 50;
        const ctx = c.getContext("2d")!; ctx.drawImage(im, 0, 0, 40, 50);
        const d = ctx.getImageData(0, Math.floor(50 * y0), 40, Math.max(1, Math.floor(50 * (y1 - y0)))).data;
        let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        resolve(s / (d.length / 4));
      } catch { resolve(200); }
    };
    im.onerror = () => resolve(200);
    im.src = imgUrl(path);
  });
}

/** Hauteur approximative d'un texte, en % de la hauteur d'une image 4:5 (unités de l'éditeur). */
const textH = (text: string, size: number) => Math.ceil(Math.max(1, text.length) / Math.max(8, Math.floor(400 / (size * 0.52)))) * size * 1.12 / 6;

function placeText(s: Slide, key: string, color: string, cover: boolean): AdEl[] {
  const tSize = cover ? 44 : 32, bSize = 17;
  const tH = s.title ? textH(s.title, tSize) : 0, bH = s.body ? textH(s.body, bSize) : 0;
  const gap = s.title && s.body ? 2.5 : 0;
  const total = tH + gap + bH;
  const y0 = s.zone === "bottom" ? Math.max(4, 92 - total) : s.zone === "center" ? Math.max(4, 50 - total / 2) : 7;
  const out: AdEl[] = [];
  if (s.title) out.push({ id: `${key}-t`, kind: "title", text: s.title, x: 8, y: Math.round(y0 * 10) / 10, size: tSize, font: "title", color });
  if (s.body) out.push({ id: `${key}-b`, kind: "sub", text: s.body, x: 8, y: Math.round((y0 + tH + gap) * 10) / 10, size: bSize, font: "body", color });
  return out;
}

export async function carouselToItems(a: { slides: unknown; images: Img[]; kit: Kit; aspect: string }) {
  const slides = normalizeSlides(a.slides);
  const dark = a.kit.colors?.[0] || "#0A0A0B";
  const soft = a.kit.colors?.[3] || "#F3EDE4";
  const items: AdItem[] = [];
  const missing: number[] = [];
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const key = `s${i}-${Date.now().toString(36)}`;
    if (s.layout === "text") {
      items.push({ key, image_id: "", path: "", aspect: a.aspect, label: `Slide ${i + 1} · texte`, bg: soft, els: placeText({ ...s, zone: s.zone === "top" ? "center" : s.zone }, key, onColor(soft), false) });
      continue;
    }
    // La photo de cette slide : approuvée d'abord, puis non refusée, puis la plus récente
    const cands = a.images.filter((im) => im.variant_index === i && im.kind !== "format" && im.state === "done" && im.path && !im.deleted_at && !im.params?.archived);
    const rank = (im: Img) => (im.review_status === "approved" ? 2 : im.verdict && im.verdict !== "rejected" ? 1 : 0);
    const best = cands.sort((x, y) => rank(y) - rank(x) || +new Date(y.created_at) - +new Date(x.created_at))[0];
    if (!best) { missing.push(i + 1); continue; }
    const band = s.layout === "band" && (s.title || s.body) ? { zone: s.zone, color: dark, h: s.zone === "center" ? 34 : 30 } : null;
    let color = onColor(dark);
    if (!band) {
      const [y0, y1] = s.zone === "top" ? [0, 0.35] : s.zone === "bottom" ? [0.65, 1] : [0.35, 0.65];
      const light = await zoneLight(best.thumb_path || best.path!, y0, y1);
      color = light > 140 ? dark : "#FFFFFF";
    }
    items.push({ key, image_id: best.id, path: best.path!, aspect: best.aspect || a.aspect, label: `Slide ${i + 1}`, band, els: placeText(s, key, color, i === 0) });
  }
  return { items, missing };
}
