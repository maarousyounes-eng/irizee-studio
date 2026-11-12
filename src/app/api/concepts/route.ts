import { requireUser, handle, withJob } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { proposeConcepts } from "@/lib/ideas";

export const maxDuration = 120;

/** Générateur de concepts de campagne : texte seul, quelques centimes. */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    return withJob(sb, b.jobId, async () => {
      const s = (x: unknown, n: number) => String(x ?? "").trim().slice(0, n);
      const concepts = await withAiCtx({ sb, userId: user.id }, () => proposeConcepts(sb, {
        productIds: (Array.isArray(b.productIds) ? b.productIds : []).filter((x: unknown) => typeof x === "string").slice(0, 4),
        goal: s(b.goal, 80) || "Notoriété", channel: s(b.channel, 80) || "Pub Meta", moment: s(b.moment, 80), words: s(b.words, 600),
        avoid: (Array.isArray(b.avoid) ? b.avoid : []).map((x: unknown) => s(x, 80)).slice(0, 20), like: b.like ? s(b.like, 600) : undefined,
      }));
      if (!concepts.length) throw new Error("Pas de concept reçu, réessayez");
      return { concepts };
    });
  });
}
