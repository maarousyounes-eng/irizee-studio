import { requireUser, handle, HttpError } from "@/lib/api";
import { download, interpretCorrection, loadProduct } from "@/lib/generation";
import { withAiCtx } from "@/lib/gemini";

export const maxDuration = 60;

/**
 * Comprend une demande de correction AVANT de générer quoi que ce soit (appel texte, quasi gratuit).
 * Le client voit « Compris : … » (ou une question si la demande est trop vague) et décide de lancer ou non.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    const feedback = String(b.feedback ?? "").trim().slice(0, 2000);
    const valid = (z: any) => z && [z.x, z.y, z.w, z.h].every((n: unknown) => typeof n === "number" && n >= 0 && n <= 1) && z.w > 0.02 && z.h > 0.02;
    const zones = (Array.isArray(b.zones) ? b.zones : []).filter(valid).slice(0, 5).map((z: any) => ({ x: z.x, y: z.y, w: z.w, h: z.h, note: String(z.note ?? "").trim().slice(0, 300) }));
    const text: string = feedback || zones.map((z: any, k: number) => `Zone ${k + 1} : ${z.note}`).join(" · ");
    if (!text.trim()) throw new HttpError(400, "Décris la correction");
    const refPaths: string[] = (Array.isArray(b.refs) ? b.refs : []).filter((r: unknown) => typeof r === "string" && r.startsWith("corrections/")).slice(0, 3);
    const { data: img } = await sb.from("images").select("path, parent_id, shoot_id, shoots(product_id)").eq("id", params.id).single();
    if (!img?.path) throw new HttpError(404, "Image introuvable");
    const prev = await download(sb, img.path);
    // La version d'origine (avant toute correction), pour comprendre « remets comme avant »
    let rootPath: string | null = null, pid: string | null = img.parent_id;
    for (let k = 0; k < 6 && pid; k++) {
      const res: { data: { path: string | null; parent_id: string | null } | null } = await sb.from("images").select("path, parent_id").eq("id", pid).single();
      if (!res.data) break;
      rootPath = res.data.path; pid = res.data.parent_id;
    }
    const original = rootPath ? await download(sb, rootPath).catch(() => null) : null;
    const refs = (await Promise.all(refPaths.map((p) => download(sb, p).catch(() => null)))).filter(Boolean) as { buf: Buffer; mime: string }[];
    const product = await loadProduct(sb, (img as any).shoots.product_id).then((x) => x.product).catch(() => null);
    const it = await withAiCtx({ sb, userId: user.id, shootId: img.shoot_id, imageId: params.id }, () =>
      interpretCorrection(prev, text, zones.length === 1 ? zones[0] : null, undefined, refs, original, product?.real_size));
    // Une seule demande (une ligne, une zone au plus) : l'interprétation validée est réutilisée telle quelle à la génération
    const single = zones.length <= 1 && text.split(/\n+/).filter((l) => l.trim().length > 2).length <= 1;
    return {
      understood: it.understood || "Je vais appliquer votre demande telle quelle.",
      clarify: it.clarify,
      redo: it.redo,
      pre: single || it.redo ? it : null,
    };
  });
}
