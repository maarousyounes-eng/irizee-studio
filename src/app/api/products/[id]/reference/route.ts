import sharp from "sharp";
import { requireUser, handle, HttpError, withJob } from "@/lib/api";
import { MODELS, gemini, imgPart, firstImage, firstText, parseJson, withAiCtx, type Part } from "@/lib/gemini";
import { download, loadProduct, IMAGE_MODEL } from "@/lib/generation";
import { NO_MIRROR, LOCATE_PRODUCT_PROMPT } from "@/lib/prompts";

export const maxDuration = 300;

/** Du plus lisse au plus marqué : le client choisit celle qui « fait vrai » pour lui, sans avoir à l'expliquer. */
const LEVELS: { label: string; en: string }[] = [
  { label: "Très lisse", en: "The product is brand new and perfectly formed: its surface is regular and taut. It looks real only through the light: a long soft highlight, the fine grain of the material, small natural variations of sheen." },
  { label: "Presque lisse", en: "The product is brand new: its surface is almost perfectly regular, with only one or two very faint, broad undulations that show in the highlights." },
  { label: "Légèrement marqué", en: "The product is new but has been handled once: its surface shows a few soft, shallow irregularities typical of its material (for a metal tube: gentle shallow dimples), still neat." },
  { label: "Marqué", en: "Its surface clearly shows the natural irregularities of its material (for a soft metal tube: visible gentle creases and dimples along its body), like a product photographed exactly as it is, still clean and new." },
];

type Img = { buf: Buffer; mime: string };

/** Élancement du produit (hauteur / largeur de son contour) : sert à vérifier qu'une proposition garde la forme du packshot. */
async function slenderness(img: Img): Promise<number | null> {
  try {
    const meta = await sharp(img.buf).metadata();
    const W = meta.width ?? 0, H = meta.height ?? 0;
    const small = await sharp(img.buf).flatten({ background: "#ffffff" }).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const r = await gemini(MODELS.text, [{ text: LOCATE_PRODUCT_PROMPT }, imgPart(small, "image/jpeg")], { purpose: "forme du produit", json: true, timeoutMs: 30_000 });
    const b = parseJson<{ box?: number[] }>(firstText(r)).box;
    if (!Array.isArray(b) || b.length !== 4 || !W || !H) return null;
    const h = ((b[2] - b[0]) / 1000) * H, w = ((b[3] - b[1]) / 1000) * W;
    return w > 4 && h > 4 ? Math.max(h, w) / Math.min(h, w) : null;
  } catch { return null; }
}

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
      const packRatio = await withAiCtx({ sb, userId: user.id }, () => slenderness(packs[0]));
      const shapeLine = packRatio ? `PROPORTIONS: in the packshot the product is about ${packRatio.toFixed(1)} times longer than wide. Keep exactly this slenderness: never make it wider, shorter or stockier.` : "";
      /** Écart de forme avec le packshot (0 = identique) ; null si la mesure est impossible */
      const shapeGap = async (buf: Buffer) => { if (!packRatio) return null; const r = await withAiCtx({ sb, userId: user.id }, () => slenderness({ buf, mime: "image/png" })); return r ? Math.abs(r / packRatio - 1) : null; };
      const save = async (buf: Buffer) => {
        const path = `products/ref_${params.id}_${crypto.randomUUID()}.jpg`;
        const jpg = await sharp(buf).jpeg({ quality: 93, chromaSubsampling: "4:4:4" }).toBuffer();
        const up = await sb.storage.from("studio").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
        if (up.error) throw new Error(up.error.message);
        return path;
      };
      const shoot1 = async (parts: Part[]) => firstImage(await withAiCtx({ sb, userId: user.id }, () => gemini(IMAGE_MODEL, parts, { purpose: "photo de référence produit", image: true, aspect: "2:3", noFit: true, timeoutMs: 240_000 })));

      // « Même aspect, forme du packshot » : on garde la matière d'une proposition choisie, on reprend la forme exacte du packshot
      const like = typeof b?.like === "string" && /^products\/[\w\-./]+$/.test(b.like) ? (b.like as string) : null;
      if (like) {
        const look = await download(sb, like);
        const text = (extra: string) => [
          "Studio product photograph for the cosmetics brand Irizée: ONE real photo of the real product, alone, that will serve as the reference of what this product looks like in real life.",
          `Product: "${product.name}"${product.look ? `: ${product.look}` : ""}`,
          product.texts?.length ? `Printed texts, spelled exactly:\n${product.texts.map((t) => `- ${t}`).join("\n")}` : "",
          "The first image(s) = the packshot render: it gives the exact DESIGN and PROPORTIONS (silhouette, slenderness, cap, logo, label layout, every printed word).",
          "The LAST image = the LOOK reference, a photo the client chose: reproduce exactly its material, its sheen, the way it catches the light, its lighting and its background. Its shape is slightly wrong: do not copy its shape, take the silhouette and proportions of the packshot.",
          shapeLine, extra,
          "Same position and angle as the packshot, whole in the frame with some margin. No hand, no prop, no added text, no frame.",
          NO_MIRROR,
        ].filter(Boolean).join("\n");
        const mk = (extra: string): Part[] => [{ text: text(extra) }, ...packs.map((p) => imgPart(p.buf, p.mime)), imgPart(look.buf, look.mime)];
        let buf = await shoot1(mk(""));
        if (!buf) throw new HttpError(502, "La photo n'a pas pu être créée, réessayez");
        let gap = await shapeGap(buf);
        if (gap !== null && gap > 0.12) {
          // une seule nouvelle tentative, en disant ce qui n'allait pas
          const again = await shoot1(mk("A PREVIOUS ATTEMPT WAS REJECTED: its silhouette did not have the slenderness of the packshot. Match the packshot's proportions precisely.")).catch(() => null);
          if (again) { const g2 = await shapeGap(again); if (g2 !== null && g2 < gap) { buf = again; gap = g2; } }
        }
        const cand = { path: await save(buf), label: "Aspect choisi, forme du packshot", ...(gap !== null && gap > 0.12 ? { shape_off: true } : {}) };
        const { data: cur } = await sb.from("products").select("ref_candidates").eq("id", params.id).single();
        const candidates = [...(((cur?.ref_candidates as unknown[]) ?? []) as { path: string; label: string }[]), cand];
        await sb.from("products").update({ ref_candidates: candidates }).eq("id", params.id);
        return { candidates, added: cand };
      }
      const prompt = (level: string) => [
        "Studio product photograph for the cosmetics brand Irizée: ONE real photo of the real product, alone, that will serve as the reference of what this product looks like in real life.",
        `Product: "${product.name}"${product.look ? `: ${product.look}` : ""}`,
        product.real_size ? `Real size: ${product.real_size.replace(/\n/g, ", ")}.` : "",
        product.texts?.length ? `Printed texts, spelled exactly:\n${product.texts.map((t) => `- ${t}`).join("\n")}` : "",
        "The attached packshot is a clean computer render: it gives the exact DESIGN (silhouette, proportions, cap, colours, logo, label layout, text direction and every printed word). Keep this design exactly.",
        "Photograph the real object in the same position and angle as the packshot, whole in the frame with some margin, on a plain light grey seamless background, lit by one large soft light from the upper left with a gentle fill, with a soft contact shadow. Real camera, 100 mm macro lens, everything sharp.",
        shapeLine,
        `MATERIAL: its surface is the real material described above, photographed, never a computer render. ${level}`,
        "No hand, no prop, no added text, no frame.",
        NO_MIRROR,
      ].filter(Boolean).join("\n");
      const results = await Promise.allSettled(LEVELS.map(async (lv) => {
        const buf = await shoot1([{ text: prompt(lv.en) }, ...packs.map((p) => imgPart(p.buf, p.mime))]);
        if (!buf) throw new Error("image vide");
        // forme comparée au packshot : une proposition trop large ou trop trapue est signalée au client
        const gap = await shapeGap(buf);
        return { path: await save(buf), label: lv.label, ...(gap !== null && gap > 0.12 ? { shape_off: true } : {}) };
      }));
      const candidates = results.filter((r): r is PromiseFulfilledResult<{ path: string; label: string; shape_off?: boolean }> => r.status === "fulfilled").map((r) => r.value);
      if (!candidates.length) throw new HttpError(502, "Aucune proposition n'a pu être créée, réessayez");
      await sb.from("products").update({ ref_candidates: candidates }).eq("id", params.id);
      return { candidates };
    });
  });
}
