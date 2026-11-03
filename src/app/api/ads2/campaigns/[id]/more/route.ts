import { requireUser, handle, HttpError } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { planCampaign, type Campaign } from "@/lib/ads2";

export const maxDuration = 120;

/** Ajoute des pubs à une campagne, avec des directions différentes de celles qui existent déjà. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const b = await req.json().catch(() => ({}));
    const n = Math.min(8, Math.max(1, Number(b.count) || 4));
    const { data: c } = await sb.from("ad_campaigns").select("*").eq("id", params.id).single();
    if (!c) throw new HttpError(404, "Campagne introuvable");
    const { data: existing } = await sb.from("ad_variants").select("idx, direction").eq("campaign_id", c.id);
    const avoid = (existing ?? []).map((x: any) => x.direction).filter(Boolean);
    const start = Math.max(-1, ...(existing ?? []).map((x: any) => x.idx)) + 1;
    const plan = await withAiCtx({ sb, userId: user.id }, () => planCampaign(sb, c as Campaign, n, avoid));
    const { error } = await sb.from("ad_variants").insert(plan.concepts.map((x, i) => ({ campaign_id: c.id, idx: start + i, text_mode: c.text_mode, ...x })));
    if (error) throw new HttpError(400, error.message);
    return { ok: true };
  });
}
