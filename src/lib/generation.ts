import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, imgPart, firstImage, firstText, parseJson, type Part } from "./gemini";
import sharp from "sharp";
import { buildPrompt, correctionPrompt, formatPrompt, interpretPrompt, localEditPrompt, LOCATE_PRODUCT_PROMPT, qcPrompt, variationHint } from "./prompts";
import { cropBoxFor, cropImage, pasteBack, unionZones, zoneFromBox, zonesFromBoxes, type CropBox, type Zone } from "./localedit";
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



type Img = { buf: Buffer; mime: string };

/** Retouche d'un recadrage autour d'une zone : renvoie l'image retouchée et le cadre utilisé. */
async function localEditCrop(a: {
  prev: Buffer; W: number; H: number; region: Zone; instruction: string; mode: "edit" | "label"; product: Product; rules: string[];
  refs: Img[]; packshots: Img[]; original: Img | null; model: string; signal?: AbortSignal;
}): Promise<{ edited: Buffer; box: CropBox } | null> {
  const box = cropBoxFor(a.region, a.W, a.H);
  if (!box) return null;
  const crop = await cropImage(a.prev, box);
  let originalCrop: Buffer | null = null;
  if (a.original) {
    try { const om = await sharp(a.original.buf).metadata(); if (om.width === a.W && om.height === a.H) originalCrop = await cropImage(a.original.buf, box); } catch { originalCrop = null; }
  }
  const lp = [{ text: localEditPrompt({ product: a.product, rules: a.rules, instruction: a.instruction, mode: a.mode, hasOriginal: !!originalCrop }) }, imgPart(crop, "image/png"), ...(originalCrop ? [imgPart(originalCrop, "image/png")] : []), ...a.packshots.map((p) => imgPart(p.buf, p.mime))] as Part[];
  let edited: Buffer | null = null;
  for (let t = 0; t < 2 && !edited; t++) {
    try { edited = firstImage(await gemini(a.model, lp, { image: true, aspect: box.ratio, size: t === 0 ? "2K" : undefined, signal: a.signal })); } catch { /* nouvelle tentative */ }
  }
  return edited ? { edited, box } : null;
}

export interface Interpretation { instruction: string; understood: string; region: Zone | null }

/** Comprend la demande : instruction précise, phrase « Compris », zone à retoucher (zone entourée + éléments concernés). */
export async function interpretCorrection(prev: { buf: Buffer; mime: string }, feedback: string, userZone: Zone | null, avoid?: string, refs: { buf: Buffer; mime: string }[] = [], original: { buf: Buffer; mime: string } | null = null): Promise<Interpretation> {
  const meta = await sharp(prev.buf).metadata();
  const W = meta.width ?? 0, H = meta.height ?? 0;
  let instruction = feedback, understood = "", region: Zone | null = userZone;
  try {
    const zoneCrop = userZone && W && H ? await sharp(prev.buf).extract({
      left: Math.round(Math.max(0, userZone.x * W)), top: Math.round(Math.max(0, userZone.y * H)),
      width: Math.max(1, Math.min(W - Math.round(userZone.x * W), Math.round(userZone.w * W))), height: Math.max(1, Math.min(H - Math.round(userZone.y * H), Math.round(userZone.h * H))),
    }).png().toBuffer() : null;
    const r = await gemini(MODELS.text, [{ text: interpretPrompt({ feedback, hasZone: !!zoneCrop, avoid, refCount: refs.length, hasOriginal: !!original }) }, imgPart(prev.buf, prev.mime), ...(original ? [imgPart(original.buf, original.mime)] : []), ...(zoneCrop ? [imgPart(zoneCrop, "image/png")] : []), ...refs.map((r) => imgPart(r.buf, r.mime))], { json: true, timeoutMs: 40_000 });
    const it = parseJson<{ instruction?: string; understood?: string; scope?: string; boxes?: unknown; box?: unknown }>(firstText(r));
    if (it.instruction) instruction = it.instruction;
    if (it.understood) understood = it.understood;
    if (it.scope === "local") {
      const found = zonesFromBoxes(it.boxes ?? (it.box ? [it.box] : []));
      const u = unionZones([...(userZone ? [userZone] : []), ...found]);
      // Petit ou moyen élément : retouche locale (reste identique au pixel près). Grand changement : image complète.
      region = u && u.w * u.h <= 0.45 ? u : null;
    } else region = null;
  } catch { /* on garde la demande telle quelle */ }
  return { instruction, understood, region };
}

export async function generateImage(sb: SupabaseClient, image: ImageRow, userId: string, signal?: AbortSignal) {
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
    const prm = (image.params ?? {}) as Record<string, any>;
    // Images de référence fournies par l'utilisateur (capture, photo d'exemple)
    const refImgs = await Promise.all(((prm.refs as string[] | undefined) ?? []).slice(0, 3).map((p) => download(sb, p).catch(() => null)));
    const refs = refImgs.filter(Boolean) as { buf: Buffer; mime: string }[];
    // Photo d'origine (avant toutes les corrections) : sert à restaurer un élément qui a disparu
    let original: { buf: Buffer; mime: string } | null = null;
    if (image.kind === "correction") {
      let pid: string | null = image.parent_id, rootPath: string | null = null;
      for (let k = 0; k < 6 && pid; k++) {
        const res: { data: { path: string | null; parent_id: string | null } | null } = await sb.from("images").select("path, parent_id").eq("id", pid).single();
        if (!res.data) break;
        rootPath = res.data.path; pid = res.data.parent_id;
      }
      if (rootPath && rootPath !== parent.path) original = await download(sb, rootPath).catch(() => null);
    }
    let instruction: string = prm.instruction ?? image.feedback ?? "";
    let region: Zone | null = prm.region ?? null;
    const zonesIn = ((prm.zones as (Zone & { note?: string })[] | undefined) ?? (prm.zone ? [prm.zone as Zone] : [])) as (Zone & { note?: string })[];

    // Plusieurs zones : chacune est comprise et retouchée séparément (en parallèle), puis recollée sur l'image d'origine
    if (image.kind === "correction" && zonesIn.length >= 2 && W && H) {
      const outs = await Promise.all(zonesIn.slice(0, 5).map(async (z) => {
        const it = await interpretCorrection(prev, (z.note ?? "").trim() || image.feedback || "", z, prm.avoid, refs, original);
        const reg: Zone = it.region ?? z;
        const r = await localEditCrop({ prev: prev.buf, W, H, region: reg, instruction: it.instruction, mode: "edit", product, rules, refs, packshots, original, model, signal });
        return r ? { ...r, region: reg, understood: it.understood, instruction: it.instruction } : null;
      }));
      const okOuts = outs.map((o, k) => ({ o, k })).filter((x) => x.o) as { o: NonNullable<(typeof outs)[number]>; k: number }[];
      if (okOuts.length) {
        let acc: Buffer = prev.buf;
        for (const { o } of okOuts) acc = await pasteBack(acc, o.edited, o.box, o.region, W, H);
        buf = acc;
        await sb.from("images").update({ params: { ...prm,
          instruction: okOuts.map(({ o, k }) => `Zone ${k + 1}: ${o.instruction}`).join(" "),
          understood: okOuts.map(({ o, k }) => `Zone ${k + 1} : ${o.understood}`).join(" · "),
        } }).eq("id", image.id);
      }
    }

    if (image.kind === "correction" && !prm.instruction && !buf) {
      // Filet de sécurité : demande non interprétée à la création
      const it = await interpretCorrection(prev, image.feedback ?? "", zonesIn[0] ?? null, prm.avoid, refs, original);
      instruction = it.instruction; region = it.region;
      await sb.from("images").update({ params: { ...prm, instruction, understood: it.understood, region } }).eq("id", image.id);
    } else if (image.kind === "label") {
      // Réparation d'étiquette : on repère le produit et on ne retouche que lui
      try {
        const r = await gemini(MODELS.text, [{ text: LOCATE_PRODUCT_PROMPT }, imgPart(prev.buf, prev.mime)], { json: true, timeoutMs: 40_000 });
        const z = zoneFromBox(parseJson<{ box?: unknown }>(firstText(r)).box, 0.01);
        if (z && z.w * z.h < 0.85) region = z;
      } catch { region = null; }
    }

    // Retouche LOCALE : seule la zone est modifiée, le reste de l'image est strictement conservé.
    if (!buf && region && W && H && image.kind !== "format") {
      const r = await localEditCrop({ prev: prev.buf, W, H, region, instruction, mode: image.kind === "label" ? "label" : "edit", product, rules, refs, packshots, original, model, signal });
      if (r) buf = await pasteBack(prev.buf, r.edited, r.box, region, W, H);
    }
    if (!buf) {
      // Modification globale (lumière, fond entier…) ou repli : régénération complète de l'image
      const prompt = image.kind === "format"
        ? formatPrompt({ product, rules, aspect })
        : correctionPrompt({ product, rules, feedback: instruction, mode: image.kind === "label" ? "label" : "edit", hasOriginal: !!original });
      parts = [{ text: prompt }, imgPart(prev.buf, prev.mime), ...(original ? [imgPart(original.buf, original.mime)] : []), ...packshots.map((p) => imgPart(p.buf, p.mime))];
    }
  }

  let lastErr: unknown;
  for (let a = 0; a < 2 && !buf; a++) {
    try { buf = firstImage(await gemini(model, parts, { image: true, aspect, size: a === 0 ? shoot.size : undefined, signal })); }
    catch (e) { lastErr = e; }
  }
  if (!buf) throw lastErr instanceof Error ? lastErr : new Error("Aucune image renvoyée par le modèle");

  // Annulée entre-temps : on ne l'enregistre pas et on ne la compte pas
  const { data: cur } = await sb.from("images").select("state, params").eq("id", image.id).single();
  if (!cur || cur.state !== "generating" || (cur.params as any)?.cancelled) return;

  // Image finale en JPEG haute qualité (≈ 1 Mo au lieu de 3-7 Mo en PNG) + miniature WebP pour les grilles
  const full = await sharp(buf).jpeg({ quality: 94, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
  const thumb = await sharp(buf).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  const path = `generated/${shoot.id}/${image.id}.jpg`;
  const thumbPath = `generated/${shoot.id}/${image.id}_t.webp`;
  const [up, upT] = await Promise.all([
    sb.storage.from(BUCKET).upload(path, full, { contentType: "image/jpeg", upsert: true }),
    sb.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: "image/webp", upsert: true }),
  ]);
  if (up.error) throw new Error("Enregistrement de l'image impossible : " + up.error.message);
  await sb.from("images").update({ path, thumb_path: upT.error ? null : thumbPath, state: "done", model_used: model, error: null, aspect }).eq("id", image.id);
  await sb.from("usage_events").insert({ user_id: userId, kind: image.kind, units: 1, model });
}

function verdict(qc: QC) {
  const wrong = qc.texts.filter((t) => t.status === "wrong").length;
  const unread = qc.texts.filter((t) => t.status === "unreadable").length;
  const hard = wrong > 0 || qc.instruction_followed === false || qc.ghost_or_duplicate === true || qc.all_copies_exact === false || qc.label_orientation_ok === false || !qc.color_ok || !qc.shape_ok || qc.foreign_logo || !qc.anatomy_ok;
  const unwanted = !!qc.unwanted_changes && !/^(none|aucun|n\/a|-)?$/i.test(qc.unwanted_changes.trim());
  const soft = unwanted || qc.skin_natural === false || unread > 1 || !qc.hero_foreground || !qc.proportion_ok || !qc.angle_ok || (qc.product_height_pct ?? 100) < 20 || qc.realism_0_10 < 6;
  const score = Math.max(0, Math.min(100, Math.round(
    qc.realism_0_10 * 6 - wrong * 12 - unread * 3 - (qc.color_ok ? 0 : 20) - (qc.shape_ok ? 0 : 15) - (qc.foreign_logo ? 20 : 0)
    - (qc.anatomy_ok ? 0 : 10) - (qc.instruction_followed === false ? 40 : 0) - (qc.ghost_or_duplicate ? 20 : 0) - (unwanted ? 10 : 0) - (qc.skin_natural === false ? 15 : 0) - (qc.all_copies_exact === false ? 20 : 0) - (qc.label_orientation_ok === false ? 15 : 0) - (qc.hero_foreground ? 0 : 8) - (qc.proportion_ok ? 0 : 8) - (qc.angle_ok ? 0 : 5) + 40)));
  return { verdict: (hard ? "rejected" : soft ? "review" : "valid") as ImageRow["verdict"], score };
}

export async function qualityCheck(sb: SupabaseClient, image: ImageRow) {
  if (!image.path) throw new Error("Pas d'image à contrôler");
  const { data: shoot } = await sb.from("shoots").select("product_id").eq("id", image.shoot_id).single();
  const { product, imagePaths } = await loadProduct(sb, shoot!.product_id);
  const pack = await download(sb, imagePaths[0]);
  const gen = await download(sb, image.path);
  let before: { buf: Buffer; mime: string } | null = null;
  const instr = (image.params as any)?.instruction as string | undefined;
  if (image.kind === "correction" && image.parent_id && instr) {
    const { data: par } = await sb.from("images").select("path").eq("id", image.parent_id).single();
    if (par?.path) before = await download(sb, par.path);
  }
  const qcParts = [{ text: qcPrompt(product, before ? { instruction: instr! } : undefined) }, imgPart(pack.buf, pack.mime), imgPart(gen.buf, gen.mime), ...(before ? [imgPart(before.buf, before.mime)] : [])];
  let r: any;
  try { r = await gemini(MODELS.vision, qcParts, { json: true, timeoutMs: 70_000 }); }
  catch { r = await gemini(MODELS.text, qcParts, { json: true, timeoutMs: 35_000 }); } // modèle plus rapide si le premier est trop lent
  const qc = parseJson<QC>(firstText(r));
  qc.texts = qc.texts ?? [];
  const v = verdict(qc);
  await sb.from("images").update({ qc, verdict: v.verdict, score: v.score }).eq("id", image.id);
  return v;
}
