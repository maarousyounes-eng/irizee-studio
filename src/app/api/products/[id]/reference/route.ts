import sharp from "sharp";
import { requireUser, handle, HttpError, withJob } from "@/lib/api";
import { gemini, imgPart, firstImage, withAiCtx, type Part } from "@/lib/gemini";
import { download, loadProduct, IMAGE_MODEL } from "@/lib/generation";
import { NO_MIRROR } from "@/lib/prompts";

export const maxDuration = 300;

/** Du plus lisse au plus marqué : le client choisit celle qui « fait vrai » pour lui, sans avoir à l'expliquer. */
const LEVELS: { label: string; en: string }[] = [
  { label: "Très lisse", en: "The product is brand new and perfectly formed: its surface is regular and taut. It looks real only through the light: a long soft highlight, the fine grain of the material, small natural variations of sheen." },
  { label: "Presque lisse", en: "The product is brand new: its surface is almost perfectly regular, with only one or two very faint, broad undulations that show in the highlights." },
  { label: "Légèrement marqué", en: "The product is new but has been handled once: its surface shows a few soft, shallow irregularities typical of its material (for a metal tube: gentle shallow dimples), still neat." },
  { label: "Marqué", en: "Its surface clearly shows the natural irregularities of its material (for a soft metal tube: visible gentle creases and dimples along its body), like a product photographed exactly as it is, still clean and new." },
];

/**
 * Propose 4 photos réalistes du produit sur fond neutre (4 images payantes). Celle que le client choisit devient
 * la référence de l'aspect réel du produit, utilisée ensuite par les esquisses, les images et les corrections.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const b = await req.json().catch(() => ({}));
    return withJob(sb, b?.jobId, async () => {
      const { product, imagePaths } = await loadProduct(sb, params.id);
      const packs = (await Promise.all(imagePaths.slice(0, 3).map((p) => download(sb, p).catch(() => null)))).filter(Boolean) as { buf: Buffer; mime: string }[];
      if (!packs.length) throw new HttpError(400, "Ce produit n'a pas de packshot");
      const prompt = (level: string) => [
        "Studio product photograph for the cosmetics brand Irizée: ONE real photo of the real product, alone, that will serve as the reference of what this product looks like in real life.",
        `Product: "${product.name}"${product.look ? `: ${product.look}` : ""}`,
        product.real_size ? `Real size: ${product.real_size.replace(/\n/g, ", ")}.` : "",
        product.texts?.length ? `Printed texts, spelled exactly:\n${product.texts.map((t) => `- ${t}`).join("\n")}` : "",
        "The attached packshot is a clean computer render: it gives the exact DESIGN (silhouette, proportions, cap, colours, logo, label layout, text direction and every printed word). Keep this design exactly.",
        "Photograph the real object in the same position and angle as the packshot, whole in the frame with some margin, on a plain light grey seamless background, lit by one large soft light from the upper left with a gentle fill, with a soft contact shadow. Real camera, 100 mm macro lens, everything sharp.",
        `MATERIAL: its surface is the real material described above, photographed, never a computer render. ${level}`,
        "No hand, no prop, no added text, no frame.",
        NO_MIRROR,
      ].filter(Boolean).join("\n");
      const results = await Promise.allSettled(LEVELS.map(async (lv) => {
        const parts: Part[] = [{ text: prompt(lv.en) }, ...packs.map((p) => imgPart(p.buf, p.mime))];
        const buf = firstImage(await withAiCtx({ sb, userId: user.id }, () => gemini(IMAGE_MODEL, parts, { purpose: "photo de référence produit", image: true, aspect: "2:3", noFit: true, timeoutMs: 240_000 })));
        if (!buf) throw new Error("image vide");
        const path = `products/ref_${params.id}_${crypto.randomUUID()}.jpg`;
        const jpg = await sharp(buf).jpeg({ quality: 93, chromaSubsampling: "4:4:4" }).toBuffer();
        const up = await sb.storage.from("studio").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
        if (up.error) throw new Error(up.error.message);
        return { path, label: lv.label };
      }));
      const candidates = results.filter((r): r is PromiseFulfilledResult<{ path: string; label: string }> => r.status === "fulfilled").map((r) => r.value);
      if (!candidates.length) throw new HttpError(502, "Aucune proposition n'a pu être créée, réessayez");
      await sb.from("products").update({ ref_candidates: candidates }).eq("id", params.id);
      return { candidates };
    });
  });
}
