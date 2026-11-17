import sharp from "sharp";
import { requireUser, handle, HttpError, withJob } from "@/lib/api";
import { gemini, imgPart, firstImage, withAiCtx, type Part } from "@/lib/gemini";
import { download, loadProduct, IMAGE_MODEL } from "@/lib/generation";
import { REAL_LOOK } from "@/lib/prompts";

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
    // Pour chaque produit : son packshot (le design) puis, si la fiche en a une, sa photo de référence réaliste (l'aspect réel)
    const packs = (await Promise.all(prods.flatMap((p) => [p!.imagePaths[0], p!.product.real_photo_path].filter(Boolean).map((path) => download(sb, path as string).catch(() => null))))).filter(Boolean) as { buf: Buffer; mime: string }[];
    const anyReal = prods.some((p) => !!p!.product.real_photo_path);
    // Mannequin choisi : l'esquisse montre déjà cette personne (le premier mannequin, celui de l'image pilote)
    const modelId = !b.noPeople && Array.isArray(b.modelIds) && typeof b.modelIds[0] === "string" ? (b.modelIds[0] as string) : null;
    let modelRef: { buf: Buffer; mime: string } | null = null, modelDesc = "";
    if (modelId) {
      const { data: m } = await sb.from("models").select("path, description").eq("id", modelId).single();
      if (m?.path) { modelRef = await download(sb, m.path).catch(() => null); modelDesc = String(m.description ?? ""); }
    }
    const prompt = [
      "Concept photo for an art direction board of the cosmetics brand Irizée: ONE real photograph, as shot on a real set with a real camera, showing this direction.",
      `ART DIRECTION: ${direction}`,
      prods.length
        ? `The first ${packs.length > 1 ? `${packs.length} images are` : "image is"} the reference${packs.length > 1 ? "s" : ""} of the product${prods.length > 1 ? "s" : ""} (${prods.map((p) => `"${p!.product.name}"`).join(", ")}): for each product its packshot render${anyReal ? ", followed by a REAL PHOTO that shows exactly what it looks like in real life (take its material and sheen from it)" : ""}. Show ${prods.length > 1 ? "exactly one of each" : "exactly one"}, at its real size, entirely visible. Its DESIGN comes from the packshot (shape, material, colours, logo, label layout; never another packaging, never recoloured), but it is PHOTOGRAPHED in the scene as a real physical object: lit by the light of the scene, with real reflections of the set on its surface, natural perspective and tilt, contact shadows; when a hand holds it, the fingers really wrap around it and hide part of it. Never a flat cut-out pasted on the photo.`
        : "No product in the image: no bottle, tube, jar or packaging at all, even if the art direction mentions one.",
      b.noPeople ? "No person in the image."
        : modelRef ? `The last image is the MODEL REFERENCE: the person in the photo is exactly this person (same face, skin tone, hair colour and hairstyle)${modelDesc ? `: ${modelDesc}` : ""}. Real skin with visible texture.`
        : "The person is a fictional model invented for this campaign, with real skin (visible pores and texture), never a plastic or artificial face.",
      REAL_LOOK,
      "No added text, logo, frame or collage. No flowers, towels or spa props unless the direction asks for them.",
    ].filter(Boolean).join("\n");
    const parts: Part[] = [{ text: prompt }, ...packs.map((p) => imgPart(p.buf, p.mime)), ...(modelRef ? [imgPart(modelRef.buf, modelRef.mime)] : [])];
    const quality = b.quality === "medium" ? "medium" : "low";
    const buf = firstImage(await withAiCtx({ sb, userId: user.id }, () => gemini(IMAGE_MODEL, parts, { purpose: "esquisse direction", image: true, aspect: "2:3", quality, noFit: true, timeoutMs: 100_000 })));
    if (!buf) throw new HttpError(502, "Esquisse impossible, réessayez");
    const path = `sketches/${user.id}/${crypto.randomUUID()}.jpg`;
    const jpg = await sharp(buf).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
    const up = await sb.storage.from("studio").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw new HttpError(500, "Enregistrement impossible : " + up.error.message);
    return { path };
    });
  });
}
