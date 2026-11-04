import { requireUser, handle, HttpError } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { planSlides } from "@/lib/slides";

export const maxDuration = 60;

/** Propose l'enchaînement des slides d'un carrousel, avant toute génération d'image. */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    const productIds: string[] = (Array.isArray(b.productIds) ? b.productIds : []).filter((x: unknown) => typeof x === "string").slice(0, 4);
    if (!String(b.idea ?? "").trim()) throw new HttpError(400, "Décris l'histoire du carrousel");
    const slides = await withAiCtx({ sb, userId: user.id }, () => planSlides(sb, { idea: String(b.idea), n: Number(b.n) || 5, productIds, noProduct: !!b.noProduct, people: !!b.people }));
    return { slides };
  });
}
