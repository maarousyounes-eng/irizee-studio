import { requireUser, handle, HttpError } from "@/lib/api";
import { withAiCtx } from "@/lib/gemini";
import { proposeIdeas } from "@/lib/ideas";

export const maxDuration = 90;

/** Propose une idée par image (avant de générer), à partir de la consigne, des produits et des inspirations. */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    const brief = String(b.brief ?? "").trim().slice(0, 4000);
    if (!brief) throw new HttpError(400, "Écris d'abord la consigne");
    const productIds: string[] = (Array.isArray(b.productIds) ? b.productIds : []).filter((x: unknown) => typeof x === "string").slice(0, 4);
    const paths: string[] = (Array.isArray(b.inspirationPaths) ? b.inspirationPaths : []).filter((x: unknown) => typeof x === "string" && /^inspirations\//.test(x as string)).slice(0, 4);
    const analysis = (Array.isArray(b.inspirationAnalyses) ? b.inspirationAnalyses : []).map((x: any) => `${String(x?.analysis ?? "")}${x?.note ? `\nClient note: ${String(x.note)}` : ""}`).join("\n---\n").slice(0, 6000);
    const ideas = await withAiCtx({ sb, userId: user.id }, () => proposeIdeas(sb, {
      brief, n: Number(b.n) || 4, type: String(b.visualType ?? "photo"), productIds, productMode: productIds.length > 1 ? (["together", "split", "mix"].includes(b.productMode) ? b.productMode : "mix") : null,
      noProduct: !!b.noProduct, people: !b.noPeople, inspMode: b.inspMode === "copy" ? "copy" : "loose", inspirationPaths: paths, analysis,
      avoid: (Array.isArray(b.avoid) ? b.avoid : []).map((x: unknown) => String(x).slice(0, 200)).slice(0, 12),
      theme: b.theme ? String(b.theme).slice(0, 800) : undefined,
      textZone: b.visualType === "ad" ? String(b.textZone ?? "") : undefined,
    }));
    if (!ideas.length) throw new HttpError(502, "Pas d'idée reçue, réessayez");
    return { ideas };
  });
}
