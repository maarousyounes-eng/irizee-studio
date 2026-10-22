import { requireUser, handle, HttpError } from "@/lib/api";
import { download } from "@/lib/generation";
import { MODELS, gemini, imgPart, firstText, parseJson } from "@/lib/gemini";
import { EXTRACT_PROMPT } from "@/lib/prompts";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const { sb, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const { path } = await req.json();
    if (!path) throw new HttpError(400, "Photo manquante");
    const f = await download(sb, path);
    const r = await gemini(MODELS.text, [{ text: EXTRACT_PROMPT }, imgPart(f.buf, f.mime)], { json: true });
    return parseJson(firstText(r));
  });
}
