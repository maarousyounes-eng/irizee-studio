import { requireUser, handle, HttpError, withJob } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { improveBrief } from "@/lib/ideas";

export const maxDuration = 60;

/** « Améliorer ma consigne » : texte seul, quelques centimes, avant toute génération. */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    return withJob(sb, b.jobId, async () => {
    const brief = String(b.brief ?? "").trim().slice(0, 4000);
    if (!brief) throw new HttpError(400, "Écris d'abord quelques mots");
    const productIds: string[] = (Array.isArray(b.productIds) ? b.productIds : []).filter((x: unknown) => typeof x === "string").slice(0, 4);
    const out = await withAiCtx({ sb, userId: user.id }, () => improveBrief(sb, { brief, type: String(b.visualType ?? "photo"), productIds, noProduct: !!b.noProduct }));
    if (!out) throw new HttpError(502, "Réessayez");
    return { brief: out };
    });
  });
}
