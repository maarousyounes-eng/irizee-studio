import sharp from "sharp";
import { requireUser, handle, HttpError } from "@/lib/api";
import { MODELS, gemini, imgPart, firstText, withAiCtx } from "@/lib/gemini";
import { download } from "@/lib/generation";

export const maxDuration = 60;

/** L'IA regarde le visuel et propose des accroches (le texte final reste celui que l'on tape). */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    const path = String(b.path ?? "");
    if (!/^(generated|corrections|ads)\//.test(path)) throw new HttpError(400, "Image invalide");
    const img = await download(sb, path);
    const small = await sharp(img.buf).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const prompt = [
      "You write French copy for static social ads of the French cosmetics brand Irizée.",
      "Look at the attached ad visual and propose 5 different French headlines (max 45 characters each), punchy, elegant, matching what the image shows.",
      b.context ? `Context from the team: "${String(b.context).slice(0, 300)}".` : "",
      b.kind === "sub" ? "These are SUB-HEADLINES (max 70 characters), completing a headline." : "",
      "COMPLIANCE: no medical or therapeutic claim, no guaranteed result, never invent a price, discount, percentage, number, ingredient or customer review.",
      'Return JSON only: {"ideas": [str]}',
    ].filter(Boolean).join("\n");
    const r = await withAiCtx({ sb, userId: user.id }, () => gemini(MODELS.text, [{ text: prompt }, imgPart(small, "image/jpeg")], { purpose: "ads idées de texte", json: true, timeoutMs: 45_000 }));
    const raw = JSON.parse(firstText(r).trim().replace(/^```json\s*|```$/g, "")) as { ideas?: unknown[] };
    return { ideas: (raw.ideas ?? []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 6) };
  });
}
