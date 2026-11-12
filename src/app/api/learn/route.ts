import { requireUser, handle, HttpError, withJob } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { learnTaste } from "@/lib/learn";

export const maxDuration = 120;

/** Met à jour ce que la plateforme a appris de vos choix. Automatique au plus une fois toutes les 30 minutes ; `force` pour le bouton. */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const b = await req.json().catch(() => ({}));
    return withJob(sb, b.jobId, async () => {
      const { data: kit } = await sb.from("brand_kit").select("learned_love, learned_hate, learned_at").eq("id", 1).single();
      if (!b.force && kit?.learned_at && Date.now() - +new Date(kit.learned_at) < 30 * 60_000) return { love: kit.learned_love ?? [], hate: kit.learned_hate ?? [], skipped: true };
      const r = await withAiCtx({ sb, userId: user.id }, () => learnTaste(sb));
      if (r.signals < 4) return { love: kit?.learned_love ?? [], hate: kit?.learned_hate ?? [], tooFew: true };
      await sb.from("brand_kit").update({ learned_love: r.love, learned_hate: r.hate, learned_at: new Date().toISOString() }).eq("id", 1);
      return { love: r.love, hate: r.hate };
    });
  });
}
