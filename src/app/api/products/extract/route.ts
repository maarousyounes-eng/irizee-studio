import { requireUser, handle, HttpError } from "@/lib/api";
import { download } from "@/lib/generation";
import { MODELS, gemini, imgPart, firstText, parseJson, withAiCtx } from "@/lib/gemini";
import { EXTRACT_PROMPT } from "@/lib/prompts";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const { path } = await req.json();
    if (!path) throw new HttpError(400, "Photo manquante");
    const f = await download(sb, path);
    const r = await withAiCtx({ sb, userId: user.id }, () => gemini(MODELS.text, [{ text: EXTRACT_PROMPT }, imgPart(f.buf, f.mime)], { purpose: "extraction produit", json: true }));
    return parseJson(firstText(r));
  });
}
