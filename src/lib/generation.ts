import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, imgPart, firstImage, firstText, parseJson, type Part } from "./gemini";
import sharp from "sharp";
import { buildPrompt, correctionPrompt, formatPrompt, interpretPrompt, localEditPrompt, LOCATE_PRODUCT_PROMPT, qcPrompt, variationHint } from "./prompts";
import { cropBoxFor, cropImage, pasteBack, unionZones, zoneFromBox, zonesFromBoxes, type Zone } from "./localedit";
import type { ImageRow, Product, QC } from "@/types";

const BUCKET = "studio";
const mimeOf = (path: string) => (path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg");

export async function download(sb: SupabaseClient, path: string) {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Fichier introuvable : ${path}`);
  return { buf: Buffer.from(await data.arrayBuffer()), mime: mimeOf(path) };
}

export async function loadProduct(sb: SupabaseClient, id: string): Promise<{ product: Product; imagePaths: string[] }> {
  const { data, error } = await sb.from("products").select("*, product_images(path, position)").eq("id", id).single();
  if (error || !data) throw new Error("Produit introuvable");
  const paths = [...(data.product_images ?? [])].sort((a: any, b: any) => a.position - b.position).map((i: any) => i.path);
  if (!paths.length) throw new Error("Ce produit n'a pas de photo");
  return { product: data as Product, imagePaths: paths };
}

export async function brandRules(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb.rpc("get_brand_rules");
  return (data as string[]) ?? [];
}

/** Quota mensuel d'images (l'admin est illimité). */
export async function checkQuota(sb: SupabaseClient, userId: string, needed = 1) {
  const { data: profile } = await sb.from("profiles").select("role, monthly_quota").eq("id", userId).single();
  if (!profile) throw new Error("Profil introuvable");
  if (profile.role === "admin") return;
  const since = new Date(); since.setUTCDate(1); since.setUTCHours(0, 0, 0, 0);
  const { data } = await sb.from("usage_events").select("units").eq("user_id", userId).gte("created_at", since.toISOString());
  const used = (data ?? []).reduce((n: number, r: any) => n + r.units, 0);
  if (used + needed > profile.monthly_quota) throw new Error(`Quota mensuel atteint (${used}/${profile.monthly_quota} images). Demande à un administrateur de l'augmenter.`);
}

export async function analyzeInspirations(sb: SupabaseClient, paths: string[], prompt: string) {
  const out = await Promise.all(paths.map(async (p) => {
    const f = await download(sb, p);
    return firstText(await gemini(MODELS.text, [{ text: prompt }, imgPart(f.buf, f.mime)])).trim();
  }));
  return out.join("\n\n");
}

export async function generateImage(sb: SupabaseClient, image: ImageRow, userId: string) {
  const { data: shoot } = await sb.from("shoots").select("*").eq("id", image.shoot_id).single();
  if (!shoot) throw new Error("Shooting introuvable");
  const { product, imagePaths } = await loadProduct(sb, shoot.product_id);
  const rules = await brandRules(sb);
  const packshots = await Promise.all(imagePaths.map((p) => download(sb, p)));
  const aspect = image.aspect || shoot.aspect;
  let parts: Part[] = [];
  let model: string;
  let buf: Buffer | null = null;

  if (image.kind === "generated") {
    model = shoot.engine === "pro" ? MODELS.pro : shoot.engine === "flash" ? MODELS.flash : (image.variant_index % 2 === 0 ? MODELS.flash : MODELS.pro);
    const inspirations = await Promise.all((shoot.inspiration_paths as string[]).map((p) => download(sb, p)));
    let modelRef: { buf: Buffer; mime: string } | null = null;
    let modelDescription = "";
    const modelId = (image as any).model_id ?? shoot.model_id;
    if (modelId && !shoot.no_people) {
      const { data: m } = await sb.from("models").select("path, description").eq("id", modelId).single();
      if (m?.path) { modelRef = await download(sb, m.path); modelDescription = m.description; }
    }
    const prompt = buildPrompt({
      product, rules, userPrompt: shoot.prompt, aspect, analysis: shoot.analysis ?? "",
      variation: variationHint(image.variant_index, shoot.no_people), nProductImages: packshots.length,
      hasModelRef: !!modelRef, modelDescription, noPeople: shoot.no_people,
    });
    parts = [{ text: prompt }, ...packshots.map((p) => imgPart(p.buf, p.mime)), ...(modelRef ? [imgPart(modelRef.buf, modelRef.mime)] : []), ...inspirations.map((p) => imgPart(p.buf, p.mime))];
  } else {
    if (!image.parent_id) throw new Error("Image parente manquante");
    const { data: parent } = await sb.from("images").select("path").eq("id", image.parent_id).single();
    if (!parent?.path) throw new Error("Image parente introuvable");
    const prev = await download(sb, parent.path);
    model = MODELS.pro;
    const meta = await sharp(prev.buf).metadata();
    const W = meta.width ?? 0, H = meta.height ?? 0;
    let instruction = image.feedback ?? "";
    const userZone = (image.params as any)?.zone as Zone | undefined;
    let region: Zone | null = userZone ?? null;

    if (image.kind === "correction") {
      // Compréhension de la demande : instruction précise, « Compris : … » pour l'utilisateur, et repérage de la zone à modifier
      try {
        const zoneCrop = userZone && W && H ? await sharp(prev.buf).extract({
          left: Math.round(Math.max(0, userZone.x * W)), top: Math.round(Math.max(0, userZone.y * H)),
          width: Math.max(1, Math.min(W - Math.round(userZone.x * W), Math.round(userZone.w * W))), height: Math.max(1, Math.min(H - Math.round(userZone.y * H), Math.round(userZone.h * H))),
        }).png().toBuffer() : null;
        const r = await gemini(MODELS.text, [{ text: interpretPrompt({ feedback: image.feedback ?? "", hasZone: !!zoneCrop }) }, imgPart(prev.buf, prev.mime), ...(zoneCrop ? [imgPart(zoneCrop, "image/png")] : [])], { json: true });
        const it = parseJson<{ instruction?: string; understood?: string; scope?: string; boxes?: unknown; box?: unknown }>(firstText(r));
        if (it.instruction) instruction = it.instruction;
        if (it.scope === "local") {
          // La zone retouchée englobe la zone entourée ET chaque élément concerné en entier (ex. l'ancien produit à effacer)
          const found = zonesFromBoxes(it.boxes ?? (it.box ? [it.box] : []));
          const u = unionZones([...(userZone ? [userZone] : []), ...found]);
          // Petit ou moyen élément : retouche locale (reste identique au pixel près). Grand changement (pose, produit tenu en main) : image complète.
          region = u && u.w * u.h <= 0.45 ? u : null;
        }
        const understood = it.understood ? { understood: it.understood } : {};
        await sb.from("images").update({ params: { ...(image.params ?? {}), ...understood, localised: !!region } }).eq("id", image.id);
      } catch { /* on garde la demande telle quelle */ }
    } else if (image.kind === "label") {
      // Réparation d'étiquette : on repère le produit et on ne retouche que lui
      try {
        const r = await gemini(MODELS.text, [{ text: LOCATE_PRODUCT_PROMPT }, imgPart(prev.buf, prev.mime)], { json: true });
        const z = zoneFromBox(parseJson<{ box?: unknown }>(firstText(r)).box, 0.01);
        if (z && z.w * z.h < 0.85) region = z;
      } catch { region = null; }
    }

    // Retouche LOCALE : seule la zone est modifiée, le reste de l'image est strictement conservé.
    const box = region && W && H && image.kind !== "format" ? cropBoxFor(region, W, H) : null;
    if (region && box) {
      const crop = await cropImage(prev.buf, box);
      const lp = [{ text: localEditPrompt({ product, rules, instruction, mode: image.kind === "label" ? "label" : "edit" }) }, imgPart(crop, "image/png"), ...packshots.map((p) => imgPart(p.buf, p.mime))] as Part[];
      let edited: Buffer | null = null;
      for (let a = 0; a < 2 && !edited; a++) {
        try { edited = firstImage(await gemini(model, lp, { image: true, aspect: box.ratio, size: a === 0 ? "2K" : undefined })); } catch { /* nouvelle tentative */ }
      }
      if (edited) buf = await pasteBack(prev.buf, edited, box, region, W, H);
    }
    if (!buf) {
      // Modification globale (lumière, fond entier…) ou repli : régénération complète de l'image
      const prompt = image.kind === "format"
        ? formatPrompt({ product, rules, aspect })
        : correctionPrompt({ product, rules, feedback: instruction, mode: image.kind === "label" ? "label" : "edit" });
      parts = [{ text: prompt }, imgPart(prev.buf, prev.mime), ...packshots.map((p) => imgPart(p.buf, p.mime))];
    }
  }

  let lastErr: unknown;
  for (let a = 0; a < 2 && !buf; a++) {
    try { buf = firstImage(await gemini(model, parts, { image: true, aspect, size: a === 0 ? shoot.size : undefined })); }
    catch (e) { lastErr = e; }
  }
  if (!buf) throw lastErr instanceof Error ? lastErr : new Error("Aucune image renvoyée par le modèle");

  const path = `generated/${shoot.id}/${image.id}.png`;
  const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: "image/png", upsert: true });
  if (up.error) throw new Error("Enregistrement de l'image impossible : " + up.error.message);
  await sb.from("images").update({ path, state: "done", model_used: model, error: null, aspect }).eq("id", image.id);
  await sb.from("usage_events").insert({ user_id: userId, kind: image.kind, units: 1, model });
}

function verdict(qc: QC) {
  const wrong = qc.texts.filter((t) => t.status === "wrong").length;
  const unread = qc.texts.filter((t) => t.status === "unreadable").length;
  const hard = wrong > 0 || qc.all_copies_exact === false || qc.label_orientation_ok === false || !qc.color_ok || !qc.shape_ok || qc.foreign_logo || !qc.anatomy_ok;
  const soft = qc.skin_natural === false || unread > 1 || !qc.hero_foreground || !qc.proportion_ok || !qc.angle_ok || (qc.product_height_pct ?? 100) < 20 || qc.realism_0_10 < 6;
  const score = Math.max(0, Math.min(100, Math.round(
    qc.realism_0_10 * 6 - wrong * 12 - unread * 3 - (qc.color_ok ? 0 : 20) - (qc.shape_ok ? 0 : 15) - (qc.foreign_logo ? 20 : 0)
    - (qc.anatomy_ok ? 0 : 10) - (qc.skin_natural === false ? 15 : 0) - (qc.all_copies_exact === false ? 20 : 0) - (qc.label_orientation_ok === false ? 15 : 0) - (qc.hero_foreground ? 0 : 8) - (qc.proportion_ok ? 0 : 8) - (qc.angle_ok ? 0 : 5) + 40)));
  return { verdict: (hard ? "rejected" : soft ? "review" : "valid") as ImageRow["verdict"], score };
}

export async function qualityCheck(sb: SupabaseClient, image: ImageRow) {
  if (!image.path) throw new Error("Pas d'image à contrôler");
  const { data: shoot } = await sb.from("shoots").select("product_id").eq("id", image.shoot_id).single();
  const { product, imagePaths } = await loadProduct(sb, shoot!.product_id);
  const pack = await download(sb, imagePaths[0]);
  const gen = await download(sb, image.path);
  const qcParts = [{ text: qcPrompt(product) }, imgPart(pack.buf, pack.mime), imgPart(gen.buf, gen.mime)];
  let r: any;
  try { r = await gemini(MODELS.vision, qcParts, { json: true, timeoutMs: 70_000 }); }
  catch { r = await gemini(MODELS.text, qcParts, { json: true, timeoutMs: 35_000 }); } // modèle plus rapide si le premier est trop lent
  const qc = parseJson<QC>(firstText(r));
  qc.texts = qc.texts ?? [];
  const v = verdict(qc);
  await sb.from("images").update({ qc, verdict: v.verdict, score: v.score }).eq("id", image.id);
  return v;
}
