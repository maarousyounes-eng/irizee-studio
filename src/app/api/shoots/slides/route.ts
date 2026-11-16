import { requireUser, handle, HttpError, withJob } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { planSlides } from "@/lib/slides";
import { normalizeSlides } from "@/lib/visualTypes";

export const maxDuration = 90;

/** Propose l'enchaînement des slides d'un carrousel, avant toute génération d'image (texte seul). */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    return withJob(sb, b.jobId, async () => {
      const productIds: string[] = (Array.isArray(b.productIds) ? b.productIds : []).filter((x: unknown) => typeof x === "string").slice(0, 4);
      if (!String(b.idea ?? "").trim()) throw new HttpError(400, "Décris l'histoire du carrousel");
      const slides = await withAiCtx({ sb, userId: user.id }, () => planSlides(sb, {
        idea: String(b.idea).slice(0, 4000), n: Number(b.n) || 5, style: String(b.style ?? "edu"), productIds, noProduct: !!b.noProduct, people: !!b.people,
        productMode: ["together", "split", "mix"].includes(b.productMode) ? b.productMode : null,
        direction: b.direction ? String(b.direction).slice(0, 1200) : undefined,
        feedback: b.feedback ? String(b.feedback).slice(0, 800) : undefined,
        previous: b.feedback ? normalizeSlides(b.previous) : undefined,
      }));
      return { slides };
    });
  });
}
