import sharp from "sharp";

export interface Box { x: number; y: number; w: number; h: number } // normalisé 0..1

/**
 * Fenêtre de recadrage (en pixels) d'un format donné dans une image W×H.
 * Elle est centrée sur le sujet repéré (produits, visage, mains) ; avec une zone de texte réservée,
 * elle garde cette zone le plus possible. `fits` dit si tout le sujet tient dans la fenêtre.
 */
export function cropWindow(W: number, H: number, aspect: string, subject: Box | null, opts: { textZone?: string; center?: { x: number; y: number } } = {}) {
  const [aw, ah] = aspect.split(":").map(Number);
  const r = aw && ah ? aw / ah : W / H;
  let cw = W, ch = Math.round(W / r);
  if (ch > H) { ch = H; cw = Math.round(H * r); }
  const s = subject ?? { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  const m = 0.03; // marge autour du sujet
  const sx0 = (s.x - m) * W, sx1 = (s.x + s.w + m) * W, sy0 = (s.y - m) * H, sy1 = (s.y + s.h + m) * H;
  let left = (sx0 + sx1) / 2 - cw / 2, top = (sy0 + sy1) / 2 - ch / 2;
  if (opts.center) { left = opts.center.x * W - cw / 2; top = opts.center.y * H - ch / 2; }
  else {
    // zone de texte : on garde l'espace vide de ce côté, tant que le sujet reste entier
    if (opts.textZone === "top") top = sy1 - ch;
    if (opts.textZone === "bottom") top = sy0;
    if (opts.textZone === "left") left = sx1 - cw;
    if (opts.textZone === "right") left = sx0;
  }
  left = Math.round(Math.max(0, Math.min(W - cw, left)));
  top = Math.round(Math.max(0, Math.min(H - ch, top)));
  const fits = !subject || (s.x * W >= left - 1 && (s.x + s.w) * W <= left + cw + 1 && s.y * H >= top - 1 && (s.y + s.h) * H <= top + ch + 1);
  return { left, top, width: cw, height: ch, fits };
}

export async function cropTo(buf: Buffer, win: { left: number; top: number; width: number; height: number }) {
  return sharp(buf).extract({ left: win.left, top: win.top, width: win.width, height: win.height }).toBuffer();
}
