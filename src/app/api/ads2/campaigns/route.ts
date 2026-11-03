import { requireUser, handle, HttpError } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { planCampaign, type Campaign } from "@/lib/ads2";

export const maxDuration = 120;

/** Crée une campagne : l'IA invente N pubs toutes différentes (direction, scène, accroche), puis elles sont générées une par une. */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const b = await req.json();
    const strs = (x: unknown, n: number) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && !!v).slice(0, n) : []);
    const row = {
      origin: b.origin === "inspi" ? "inspi" : "idea", idea: String(b.idea ?? "").slice(0, 1500), keep_change: String(b.keepChange ?? "").slice(0, 800),
      inspiration_paths: strs(b.inspirationPaths, 4), product_ids: strs(b.productIds, 4), photo_paths: strs(b.photoPaths, 3),
      message: String(b.message ?? "").slice(0, 800), offer: String(b.offer ?? "").slice(0, 200),
      text_mode: b.textMode === "exact" ? "exact" : "ai", engine: b.engine === "pro" ? "pro" : "openai",
      count: Math.min(12, Math.max(1, Number(b.count) || 6)), created_by: user.id,
    };
    if (!row.product_ids.length) throw new HttpError(400, "Choisis au moins un produit");
    if (row.origin === "inspi" && !row.inspiration_paths.length) throw new HttpError(400, "Ajoute au moins une pub d'inspiration");
    if (row.origin === "idea" && !row.idea.trim() && !row.message.trim()) throw new HttpError(400, "Décris ton idée");
    const { data: c, error } = await sb.from("ad_campaigns").insert(row).select("*").single();
    if (error || !c) throw new HttpError(400, error?.message ?? "Création impossible");
    try {
      const plan = await withAiCtx({ sb, userId: user.id }, () => planCampaign(sb, c as Campaign, row.count));
      if (plan.name) await sb.from("ad_campaigns").update({ name: plan.name }).eq("id", c.id);
      const { error: e2 } = await sb.from("ad_variants").insert(plan.concepts.map((x, i) => ({ campaign_id: c.id, idx: i, text_mode: row.text_mode, ...x })));
      if (e2) throw new Error(e2.message);
    } catch (e) {
      await sb.from("ad_campaigns").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
      throw new HttpError(502, e instanceof Error ? e.message : "Plan impossible");
    }
    return { id: c.id };
  });
}
