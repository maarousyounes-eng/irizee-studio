import sharp from "sharp";
import { MODELS, gemini, imgPart, firstText, parseJson } from "./gemini";

type Img = { buf: Buffer; mime: string };

/**
 * Contrôle par les faits : on MESURE au lieu de juger.
 * - Taille du produit : sa longueur comparée à la largeur de la main qui le tient (ou à la hauteur du visage à côté).
 * - Visage : sa part dans l'image (un très gros plan donne un visage d'aspect déformé).
 */
export interface Facts {
  /** « big? » / « small? » : écart modéré, un doute à vérifier à l'œil (jamais un défaut affirmé) */
  scale: "ok" | "big" | "small" | "big?" | "small?" | null; scale_rel?: number; scale_ruler?: string;
  /** Hauteur du visage (menton → racine des cheveux) rapportée à la hauteur de l'image mesurée */
  face_frac?: number;
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

const pt = (p: unknown, W: number, H: number): [number, number] | null => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number") ? [(p[0] as number) / 1000 * H, (p[1] as number) / 1000 * W] : null;
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export async function factCheck(img: Img, a: { hasProduct: boolean; realSize?: string | null; people: boolean }): Promise<Facts> {
  const out: Facts = { scale: null, issues: [] };
  try {
    const meta = await sharp(img.buf).metadata();
    const W = meta.width ?? 0, H = meta.height ?? 0;
    if (!W || !H) return out;
    const small = await sharp(img.buf).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    type M = { product_ends?: unknown[] | null; knuckles?: unknown[] | null; hand_facing?: string | null; face?: number[] | null; product_near_face?: boolean | null; apparent_length_cm?: number | null };
    const measure = async (): Promise<M | null> => {
      try { return parseJson<M>(firstText(await gemini(MODELS.vision, [{ text: MEASURE_PROMPT }, imgPart(small, "image/jpeg")], { purpose: "mesures (contrôle)", json: true, timeoutMs: 45_000 }))); } catch { return null; }
    };
    // Deux passages indépendants : une seule estimation varie trop (jusqu'à ±30 %) pour décider seule
    const runs = (await Promise.all([measure(), measure()])).filter(Boolean) as M[];
    if (!runs.length) return out;
    const m = runs[0];

    // 1. Taille du produit : moyenne de toutes les règles disponibles (jointures de la main, main comme règle, visage voisin)
    if (a.hasProduct) {
      const real = realLengthCm(a.realSize);
      const rels: number[] = []; const rulers = new Set<string>();
      for (const r of runs) {
        const e0 = pt(r.product_ends?.[0], W, H), e1 = pt(r.product_ends?.[1], W, H);
        const len = e0 && e1 ? dist(e0, e1) : 0;
        const k0 = pt(r.knuckles?.[0], W, H), k1 = pt(r.knuckles?.[1], W, H);
        const faceH = Array.isArray(r.face) && r.face.length === 4 ? ((r.face[2] - r.face[0]) / 1000) * H : 0;
        const one: number[] = [];
        if (len && k0 && k1 && r.hand_facing !== "angled" && dist(k0, k1) > 0.02 * Math.min(W, H)) { one.push(len / dist(k0, k1) / (real / PALM_CM)); rulers.add("main"); }
        if (typeof r.apparent_length_cm === "number" && r.apparent_length_cm > 1) { one.push(r.apparent_length_cm / real); rulers.add("main"); }
        if (len && faceH > 0.05 * H && r.product_near_face === true) { one.push(len / faceH / (real / FACE_CM)); rulers.add("visage"); }
        if (one.length) rels.push(one.reduce((x, y) => x + y, 0) / one.length);
      }
      if (rels.length) {
        const rel = rels.reduce((x, y) => x + y, 0) / rels.length;
        out.scale_rel = Math.round(rel * 100) / 100;
        out.scale_ruler = rulers.has("main") && rulers.has("visage") ? "main et visage" : rulers.has("visage") ? "visage" : "main";
        // net (rouge) à partir de 50 % d'écart ; entre 30 et 50 %, simple doute à vérifier à l'œil
        out.scale = rel >= 1.5 ? "big" : rel <= 0.5 ? "small" : rel >= 1.3 ? "big?" : rel <= 0.65 ? "small?" : "ok";
        const ref = out.scale_ruler === "visage" ? "au visage" : "à la main";
        if (out.scale === "big") out.issues.push(`Produit trop grand par rapport ${ref} (environ ${Math.round((rel - 1) * 100)} % de trop).`);
        if (out.scale === "small") out.issues.push(`Produit trop petit par rapport ${ref} (environ ${Math.round((1 - rel) * 100)} % de moins).`);
        if (out.scale === "big?") out.issues.push(`Produit peut-être un peu grand par rapport ${ref} : à vérifier à l'œil.`);
        if (out.scale === "small?") out.issues.push(`Produit peut-être un peu petit par rapport ${ref} : à vérifier à l'œil.`);
      }
    }

    // 2. Visage : sa part dans l'image. À l'étalonnage, un visage jugé « déformé » avait les mêmes proportions que les autres ;
    //    ce qui changeait, c'était le très gros plan (visage > 50 % de la hauteur), qui donne cet aspect.
    if (a.people && Array.isArray(m.face) && m.face.length === 4) {
      const fh = (Math.max(0, Math.min(1000, m.face[2])) - Math.max(0, Math.min(1000, m.face[0]))) / 1000;
      if (fh > 0.05) out.face_frac = Math.round(fh * 100) / 100;
    }
  } catch { /* mesures facultatives : sans elles, le contrôle habituel décide seul */ }
  return out;
}
