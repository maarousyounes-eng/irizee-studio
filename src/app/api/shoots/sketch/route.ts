import sharp from "sharp";
import { requireUser, handle, HttpError, withJob } from "@/lib/api";
import { gemini, imgPart, firstImage, withAiCtx, type Part } from "@/lib/gemini";
import { download, loadProduct, IMAGE_MODEL } from "@/lib/generation";

export const maxDuration = 120;

/** Esquisse rapide et bon marché d'une direction artistique, pour choisir avec les yeux avant l'image pilote. */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user } = await requireUser();
    const b = await req.json();
    return withJob(sb, b.jobId, async () => {
    const direction = String(b.direction ?? "").trim().slice(0, 1200);
    if (!direction) throw new HttpError(400, "Direction manquante");
    const productIds: string[] = b.noProduct ? [] : (Array.isArray(b.productIds) ? b.productIds : []).filter((x: unknown) => typeof x === "string").slice(0, 2);
    const prods = (await Promise.all(productIds.map((id) => loadProduct(sb, id).catch(() => null)))).filter(Boolean);
    const packs = (await Promise.all(prods.map((p) => (p!.imagePaths[0] ? download(sb, p!.imagePaths[0]).catch(() => null) : null)))).filter(Boolean) as { buf: Buffer; mime: string }[];
    const prompt = [
      "Quick concept photo for an art direction board of the cosmetics brand Irizée: one real-looking photograph showing this direction.",
      `ART DIRECTION: ${direction}`,
      prods.length ? `The attached image(s) are the real product packshot(s) (${prods.map((p) => `"${p!.product.name}"`).join(", ")}): show ${prods.length > 1 ? "exactly one of each" : "exactly one"}, same shape and colours, entirely visible, at a realistic size.` : "No product in the image.",
      b.noPeople ? "No person in the image." : "",
      "A real photograph of real objects, never a graphic, illustration or 3D render.",
      "No added text, logo, frame or collage. No flowers, towels or spa props unless the direction asks for them.",
    ].filter(Boolean).join("\n");
    const parts: Part[] = [{ text: prompt }, ...packs.map((p) => imgPart(p.buf, p.mime))];
    const buf = firstImage(await withAiCtx({ sb, userId: user.id }, () => gemini(IMAGE_MODEL, parts, { purpose: "esquisse direction", image: true, aspect: "2:3", quality: "low", noFit: true, timeoutMs: 100_000 })));
    if (!buf) throw new HttpError(502, "Esquisse impossible, réessayez");
    const path = `sketches/${user.id}/${crypto.randomUUID()}.jpg`;
    const jpg = await sharp(buf).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
    const up = await sb.storage.from("studio").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw new HttpError(500, "Enregistrement impossible : " + up.error.message);
    return { path };
    });
  });
}
