import sharp from "sharp";
import { MODELS, gemini, imgPart, firstText, parseJson } from "./gemini";

type Img = { buf: Buffer; mime: string };

/**
 * Contrôle par les faits : on MESURE au lieu de juger.
 * - Taille du produit : sa longueur comparée à la largeur de la main qui le tient (ou à la hauteur du visage à côté).
 * - Visage : un examen séparé, sur un gros plan du visage, des proportions (déformation, traits exagérés).
 */
export interface Facts {
  scale: "ok" | "big" | "small" | null; scale_rel?: number; scale_ruler?: "main" | "visage" | "main (estimation)";
  face: "ok" | "deformed" | null; face_reason?: string; face_ratios?: Record<string, number>;
  issues: string[];
}

/** Longueur réelle du produit en cm, lue dans la fiche (le plus grand nombre suivi de « cm ») ; 15 cm par défaut. */
export function realLengthCm(realSize?: string | null): number {
  const nums = Array.from(String(realSize ?? "").matchAll(/(\d+(?:[.,]\d+)?)\s*cm/gi)).map((m) => parseFloat(m[1].replace(",", ".")));
  const max = nums.length ? Math.max(...nums) : 0;
  return max >= 3 && max <= 40 ? max : 15;
}

const PALM_CM = 8; // largeur d'une main de femme au niveau des jointures (index → auriculaire)
const FACE_CM = 18.5; // menton → racine des cheveux

const MEASURE_PROMPT = [
  "Look at this advertising photo and return measurements. Coordinates are integers from 0 to 1000 relative to the image, written [y, x].",
  '- "product_ends": the two ends of the main cosmetic product along its length (for a tube: the middle of its flat crimped end, and the middle of the far end of its cap). null if there is no product, or if one of its ends is hidden or outside the frame.',
  '- "knuckles": for the hand that HOLDS or touches the product, the knuckle at the base of the index finger and the knuckle at the base of the little finger (the line across the widest part of the hand). null if no hand holds the product or if these two knuckles are not both visible.',
  '- "hand_facing": "flat" if that line across the knuckles is seen roughly square-on, "angled" if the hand is strongly turned so that this line is foreshortened; null without knuckles.',
  '- "face": box [ymin, xmin, ymax, xmax] of the main face from the chin to the hairline (not the top of the hair). null if no face is entirely visible.',
  '- "product_near_face": true if the product is at about the same distance from the camera as that face (held against the cheek or right next to the face), false if it is clearly closer to or farther from the camera; null without a face or a product.',
  '- "apparent_length_cm": if a hand holds or touches the product, the length in centimetres that the product has in this photo when you use that hand as the ruler (an adult woman\'s hand is 18 cm long from the wrist to the tip of the middle finger and 8 cm wide across the knuckles). Compare carefully: a product as long as the whole hand is 18 cm, one and a half hands is 27 cm, half a hand is 9 cm. null if no hand touches the product.',
  'Return JSON only: {"product_ends": [[y,x],[y,x]] | null, "knuckles": [[y,x],[y,x]] | null, "hand_facing": "flat" | "angled" | null, "face": [ymin,xmin,ymax,xmax] | null, "product_near_face": bool | null, "apparent_length_cm": number | null}',
].join("\n");

const LANDMARK_PROMPT = [
  "This is a crop of a face. Return the position of these landmarks as integers from 0 to 1000 relative to this crop, written [y, x]:",
  '"hairline": middle of the hairline at the top of the forehead; "chin": lowest point of the chin; "cheek_left" and "cheek_right": the left and right edges of the face at the level of the cheekbones; "pupil_left" and "pupil_right": the centres of the two pupils; "mouth_left" and "mouth_right": the two corners of the mouth; "lip_top": top of the upper lip at its centre; "lip_bottom": bottom of the lower lip at its centre; "nose_left" and "nose_right": the outer edges of the nostrils.',
  "Use null for a landmark that is hidden or outside the crop.",
  'Return JSON only: {"hairline":[y,x],"chin":[y,x],"cheek_left":[y,x],"cheek_right":[y,x],"pupil_left":[y,x],"pupil_right":[y,x],"mouth_left":[y,x],"mouth_right":[y,x],"lip_top":[y,x],"lip_bottom":[y,x],"nose_left":[y,x],"nose_right":[y,x]}',
].join("\n");

const FACE_PROMPT = [
  "This is a crop of a face taken from an AI-generated advertising photo. Judge ONLY whether it looks like a real, normally proportioned human face photographed with a portrait lens.",
  "It is DEFORMED if you see: a wide-angle close-up distortion (forehead or nose bulging, the face stretched too long or too wide), lips inflated or far too large for the face, eyes clearly too far apart, too large or misaligned, a jaw or chin out of proportion, asymmetric or melted features, or an uncanny, caricatural look.",
  "These are NOT defects: striking beauty, strong features, makeup, freckles, moles, blemishes, uneven skin tone, visible pores.",
  'Return JSON only: {"deformed": bool, "confidence": int from 0 to 10, "reason": str (one short French sentence saying what is deformed; empty string if not deformed)}',
].join("\n");

const pt = (p: unknown, W: number, H: number): [number, number] | null => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number") ? [(p[0] as number) / 1000 * H, (p[1] as number) / 1000 * W] : null;
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export async function factCheck(img: Img, a: { hasProduct: boolean; realSize?: string | null; people: boolean }): Promise<Facts> {
  const out: Facts = { scale: null, face: null, issues: [] };
  try {
    const meta = await sharp(img.buf).metadata();
    const W = meta.width ?? 0, H = meta.height ?? 0;
    if (!W || !H) return out;
    const small = await sharp(img.buf).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const r = await gemini(MODELS.vision, [{ text: MEASURE_PROMPT }, imgPart(small, "image/jpeg")], { purpose: "mesures (contrôle)", json: true, timeoutMs: 45_000 });
    const m = parseJson<{ product_ends?: unknown[] | null; knuckles?: unknown[] | null; hand_facing?: string | null; face?: number[] | null; product_near_face?: boolean | null; apparent_length_cm?: number | null }>(firstText(r));

    // 1. Taille du produit
    const e0 = pt(m.product_ends?.[0], W, H), e1 = pt(m.product_ends?.[1], W, H);
    const est = typeof m.apparent_length_cm === "number" && m.apparent_length_cm > 1 ? m.apparent_length_cm : 0;
    if (a.hasProduct && ((e0 && e1) || est)) {
      const len = e0 && e1 ? dist(e0, e1) : 0, real = realLengthCm(a.realSize);
      const k0 = pt(m.knuckles?.[0], W, H), k1 = pt(m.knuckles?.[1], W, H);
      const faceH = Array.isArray(m.face) && m.face.length === 4 ? ((m.face[2] - m.face[0]) / 1000) * H : 0;
      let rel = 0;
      if (len && k0 && k1 && m.hand_facing !== "angled" && dist(k0, k1) > 0.02 * Math.min(W, H)) { rel = len / dist(k0, k1) / (real / PALM_CM); out.scale_ruler = "main"; }
      else if (est) { rel = est / real; out.scale_ruler = "main (estimation)"; }
      else if (len && faceH > 0.05 * H && m.product_near_face === true) { rel = len / faceH / (real / FACE_CM); out.scale_ruler = "visage"; }
      if (rel > 0) {
        out.scale_rel = Math.round(rel * 100) / 100;
        out.scale = rel > 1.35 ? "big" : rel < 0.6 ? "small" : "ok";
        const ref = out.scale_ruler === "visage" ? "au visage" : "à la main";
        if (out.scale === "big") out.issues.push(`Produit trop grand par rapport ${ref} (environ ${Math.round((rel - 1) * 100)} % de trop).`);
        if (out.scale === "small") out.issues.push(`Produit trop petit par rapport ${ref} (environ ${Math.round((1 - rel) * 100)} % de moins).`);
      }
    }

    // 2. Visage : examen séparé, sur un gros plan
    if (a.people && Array.isArray(m.face) && m.face.length === 4) {
      const [y0, x0, y1, x1] = m.face.map((n) => Math.max(0, Math.min(1000, Number(n))) / 1000);
      const pad = 0.3;
      const fw = (x1 - x0) * W, fh = (y1 - y0) * H;
      if (fw > 0.08 * W && fh > 0.08 * H) {
        const left = Math.max(0, Math.round(x0 * W - pad * fw)), top = Math.max(0, Math.round(y0 * H - pad * fh));
        const width = Math.min(W - left, Math.round(fw * (1 + 2 * pad))), height = Math.min(H - top, Math.round(fh * (1 + 2 * pad)));
        const crop = await sharp(img.buf).extract({ left, top, width, height }).resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
        const fr = await gemini(MODELS.vision, [{ text: FACE_PROMPT }, imgPart(crop, "image/jpeg")], { purpose: "visage (contrôle)", json: true, timeoutMs: 45_000 });
        const f = parseJson<{ deformed?: boolean; confidence?: number; reason?: string }>(firstText(fr));
        // Repères du visage : proportions mesurées (pour étalonner le contrôle)
        try {
          const cm = await sharp(crop).metadata();
          const cw = cm.width ?? 1, ch = cm.height ?? 1;
          const lr = await gemini(MODELS.vision, [{ text: LANDMARK_PROMPT }, imgPart(crop, "image/jpeg")], { purpose: "repères du visage (contrôle)", json: true, timeoutMs: 45_000 });
          const L = parseJson<Record<string, unknown>>(firstText(lr));
          const P = (k: string) => pt(L[k], cw, ch);
          const d = (a2: string, b2: string) => { const A = P(a2), B = P(b2); return A && B ? dist(A, B) : 0; };
          const faceH2 = d("hairline", "chin"), faceW = d("cheek_left", "cheek_right");
          const round = (x: number) => Math.round(x * 100) / 100;
          if (faceH2 && faceW) out.face_ratios = { long_sur_large: round(faceH2 / faceW), levres_sur_hauteur: round(d("lip_top", "lip_bottom") / faceH2), bouche_sur_largeur: round(d("mouth_left", "mouth_right") / faceW), yeux_sur_largeur: round(d("pupil_left", "pupil_right") / faceW), nez_sur_largeur: round(d("nose_left", "nose_right") / faceW), visage_sur_image: round(fh / H) };
        } catch { /* repères facultatifs */ }
        const bad = f.deformed === true && (f.confidence ?? 0) >= 6;
        out.face = bad ? "deformed" : "ok";
        if (bad) { out.face_reason = String(f.reason ?? "").trim().slice(0, 200); out.issues.push(`Visage déformé${out.face_reason ? ` : ${out.face_reason}` : "."}`); }
      }
    }
  } catch { /* mesures facultatives : sans elles, le contrôle habituel décide seul */ }
  return out;
}
