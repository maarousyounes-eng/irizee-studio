import { requireUser, handle, HttpError } from "@/lib/api";
import { download } from "@/lib/generation";
import { MODELS, gemini, imgPart, firstText, withAiCtx } from "@/lib/gemini";
import { ANALYZE_PROMPT } from "@/lib/prompts";

export const maxDuration = 60;

/**
 * Analyse une inspiration dès qu'elle est ajoutée (avant toute génération) :
 * la description pour l'IA d'image (anglais) et un résumé en français pour le client, qu'il peut corriger.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    const path = String(b.path ?? "");
    if (!/^inspirations\/[\w\-./]+$/.test(path)) throw new HttpError(400, "Inspiration invalide");
    const img = await download(sb, path);
    const prompt = ANALYZE_PROMPT + " Just BEFORE the final \"PHONE UI\" line, add one line starting with \"RÉSUMÉ:\" followed by 1 or 2 short French sentences for the client listing what will be reproduced from this image (cadrage, lumière, décor, tenue et accessoires, effets comme la neige, interface de téléphone s'il y en a une).";
    const text = firstText(await withAiCtx({ sb, userId: user.id }, () => gemini(MODELS.text, [{ text: prompt }, imgPart(img.buf, img.mime)], { purpose: "analyse inspiration", timeoutMs: 45_000 }))).trim();
    const m = /^\s*\**\s*R[ÉE]SUM[ÉE]\s*\**\s*:\s*(.+)$/im.exec(text);
    const summary = (m?.[1] ?? "").replace(/\*+/g, "").trim();
    const analysis = (m ? text.replace(m[0], "") : text).replace(/\n{3,}/g, "\n\n").trim();
    return { analysis, summary, phoneUi: /PHONE UI:\s*yes/i.test(analysis) };
  });
}
