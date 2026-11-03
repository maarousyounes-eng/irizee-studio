import { requireUser, handle, HttpError } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { editVariant, type Variant } from "@/lib/ads2";

export const maxDuration = 300;

/** Corriger une pub (texte et/ou image) ou passer du texte IA au texte exact et inversement. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const b = await req.json().catch(() => ({}));
    const { data: v } = await sb.from("ad_variants").select("*").eq("id", params.id).single();
    if (!v) throw new HttpError(404, "Pub introuvable");
    const t = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : undefined);
    return withAiCtx({ sb, userId: user.id }, () => editVariant(sb, v as Variant, {
      instruction: t(b.instruction, 600) || undefined,
      switchTo: b.switchTo === "ai" || b.switchTo === "exact" ? b.switchTo : undefined,
      hook: t(b.hook, 80), cta: t(b.cta, 30), badge: t(b.badge, 14),
    }));
  });
}
