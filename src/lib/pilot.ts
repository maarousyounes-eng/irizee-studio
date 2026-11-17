import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, imgPart, firstText, parseJson } from "./gemini";
import { download } from "./generation";
import type { TypeParams } from "./visualTypes";

const BUCKET = "studio";

/**
 * Ce que les autres images d'une campagne doivent garder de l'image pilote validée :
 * le décor, la lumière et le stylisme, décrits en texte, et le visage du mannequin créé par l'IA.
 * La photo pilote elle-même n'est plus donnée comme modèle : l'IA la recopiait (même pose, même cadrage).
 */
export async function describePilot(sb: SupabaseClient, shootId: string, pilotPath: string, wantFace: boolean): Promise<{ look: string; facePath: string | null }> {
  const img = await download(sb, pilotPath);
  const small = await sharp(img.buf).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const prompt = [
    "This is the approved PILOT IMAGE of an advertising campaign for a cosmetics brand. Other photos of the SAME campaign will be shot by a photographer who cannot see this image.",
    "Describe precisely, in English, what must stay identical in every photo of the campaign:",
    '- "set": the location and set (architecture, furniture, props, background elements, materials and their exact colours).',
    '- "light": the light (type of source, direction, hardness, contrast, how dark the background is, colour temperature), the colour grade and the grain.',
    '- "styling": if a person appears, her clothes, jewellery, accessories, makeup style, nail colour and hairstyle. NEVER describe her face, skin tone, age or hair colour. Empty string if there is no person.',
    '- "face": if a person appears, the bounding box of her whole head including all her hair, as [ymin, xmin, ymax, xmax] with integers from 0 to 1000; otherwise null.',
    "Do NOT describe the product, the pose, the gesture, the framing or the composition: the other photos have their own.",
    'Return JSON only: {"set": str, "light": str, "styling": str, "face": [int, int, int, int] | null}',
  ].join("\n");
  const r = await gemini(MODELS.vision, [{ text: prompt }, imgPart(small, "image/jpeg")], { purpose: "analyse image pilote", json: true, timeoutMs: 40_000 });
  const j = parseJson<{ set?: string; light?: string; styling?: string; face?: number[] | null }>(firstText(r));
  const c = (x: unknown, n: number) => String(x ?? "").trim().slice(0, n);
  const look = [c(j.set, 700) ? `Set: ${c(j.set, 700)}` : "", c(j.light, 500) ? `Light and colour grade: ${c(j.light, 500)}` : "", c(j.styling, 500) ? `Styling of the person: ${c(j.styling, 500)}` : ""].filter(Boolean).join(" ");
  let facePath: string | null = null;
  if (wantFace && Array.isArray(j.face) && j.face.length === 4) {
    try {
      const meta = await sharp(img.buf).metadata();
      const W = meta.width ?? 0, H = meta.height ?? 0;
      const [y0, x0, y1, x1] = j.face.map((n) => Math.max(0, Math.min(1000, Number(n))) / 1000);
      const pad = 0.06;
      const left = Math.max(0, Math.round((x0 - pad) * W)), top = Math.max(0, Math.round((y0 - pad) * H));
      const width = Math.min(W - left, Math.round((x1 - x0 + 2 * pad) * W)), height = Math.min(H - top, Math.round((y1 - y0 + 2 * pad) * H));
      if (width > 80 && height > 80) {
        const face = await sharp(img.buf).extract({ left, top, width, height }).resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
        const path = `generated/${shootId}/pilot_face_${Date.now()}.jpg`;
        const up = await sb.storage.from(BUCKET).upload(path, face, { contentType: "image/jpeg", upsert: true });
        if (!up.error) facePath = path;
      }
    } catch { /* sans visage : la description seule */ }
  }
  return { look, facePath };
}

/** Calcule (une seule fois) et enregistre le « look » de la campagne à partir de l'image pilote validée. */
export async function ensurePilotLook(sb: SupabaseClient, shoot: { id: string; type_params: unknown; no_people?: boolean | null; model_ids?: string[] | null }, pilotPath: string): Promise<TypeParams> {
  const tp = (shoot.type_params ?? {}) as TypeParams;
  if (tp.pilot_look) return tp;
  try {
    const aiFace = !shoot.no_people && !(shoot.model_ids ?? []).length;
    const d = await describePilot(sb, shoot.id, pilotPath, aiFace);
    if (!d.look) return tp;
    const next: TypeParams = { ...tp, pilot_look: d.look, ...(d.facePath ? { pilot_face_path: d.facePath } : {}) };
    // on ne touche qu'à ces deux champs : l'état du pilote peut changer en parallèle
    const { data: cur } = await sb.from("shoots").select("type_params").eq("id", shoot.id).single();
    await sb.from("shoots").update({ type_params: { ...((cur?.type_params as TypeParams | null) ?? tp), pilot_look: next.pilot_look, ...(d.facePath ? { pilot_face_path: d.facePath } : {}) } }).eq("id", shoot.id);
    return next;
  } catch { return tp; }
}
