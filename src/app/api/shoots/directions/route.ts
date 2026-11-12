import { requireUser, handle, HttpError, withJob } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { proposeDirections } from "@/lib/ideas";

export const maxDuration = 90;

/** Propose plusieurs directions artistiques de campagne (avant toute génération, texte seul). */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    return withJob(sb, b.jobId, async () => {
    const brief = String(b.brief ?? "").trim().slice(0, 4000);
    if (!brief) throw new HttpError(400, "Écris d'abord la consigne");
    const productIds: string[] = (Array.isArray(b.productIds) ? b.productIds : []).filter((x: unknown) => typeof x === "string").slice(0, 4);
    const paths: string[] = (Array.isArray(b.inspirationPaths) ? b.inspirationPaths : []).filter((x: unknown) => typeof x === "string" && /^inspirations\//.test(x as string)).slice(0, 4);
    const analysis = (Array.isArray(b.inspirationAnalyses) ? b.inspirationAnalyses : []).map((x: any) => `${String(x?.analysis ?? "")}${x?.note ? `\nClient note: ${String(x.note)}` : ""}`).join("\n---\n").slice(0, 6000);
    const directions = await withAiCtx({ sb, userId: user.id }, () => proposeDirections(sb, {
      brief, n: Number(b.n) || 3, type: String(b.visualType ?? "photo"), productIds, noProduct: !!b.noProduct, people: !b.noPeople,
      inspirationPaths: paths, analysis, avoid: (Array.isArray(b.avoid) ? b.avoid : []).map((x: unknown) => String(x).slice(0, 120)).slice(0, 12),
      textZone: b.visualType === "ad" ? String(b.textZone ?? "") : undefined,
      feedback: b.feedback ? String(b.feedback).slice(0, 800) : undefined,
      previous: (Array.isArray(b.previous) ? b.previous : []).map((x: unknown) => String(x).slice(0, 300)).slice(0, 5),
    }));
    if (!directions.length) throw new HttpError(502, "Pas de direction reçue, réessayez");
    return { directions };
    });
  });
}
