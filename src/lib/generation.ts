import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, imgPart, firstImage, firstText, noImageReason, parseJson, withAiCtx, type Part } from "./gemini";
import sharp from "sharp";
import { buildPrompt, correctionPrompt, sizeLine, formatPrompt, interpretPrompt, localEditPrompt, LOCATE_PRODUCT_PROMPT, READ_LABEL_PROMPT, qcPrompt, variationHint } from "./prompts";
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

export const ANALYSIS_SEP = "\n\n---\n\n";

export async function analyzeInspirations(sb: SupabaseClient, paths: string[], prompt: string) {
  const out = await Promise.all(paths.map(async (p) => {
    const f = await download(sb, p);
    return firstText(await gemini(MODELS.text, [{ text: prompt }, imgPart(f.buf, f.mime)], { purpose: "analyse inspiration" })).trim();
  }));
  return out.join(ANALYSIS_SEP);
}



type Img = { buf: Buffer; mime: string };

/** Retouche d'un recadrage autour d'une zone : renvoie l'image retouchée et le cadre utilisé. */
async function localEditCrop(a: {
  prev: Buffer; W: number; H: number; region: Zone; instruction: string; mode: "edit" | "label"; product: Product; rules: string[];
  refs: Img[]; packshots: Img[]; original: Img | null; model: string; signal?: AbortSignal; timeoutMs?: number;
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
    try { edited = firstImage(await gemini(a.model, lp, { purpose: a.mode === "label" ? "réparation étiquette" : "retouche locale", image: true, aspect: box.ratio, size: t === 0 ? (a.mode === "label" || Math.max(box.width, box.height) > 1100 ? "2K" : "1K") : undefined, signal: a.signal, timeoutMs: a.timeoutMs })); } catch { /* nouvelle tentative */ }
  }
  return edited ? { edited, box } : null;
}

/** Netteté globale (variance du Laplacien sur une version normalisée) : sert à détecter une retouche qui « lisse » l'image. */
async function sharpness(b: Buffer): Promise<number> {
  const { data, info } = await sharp(b).resize(1024, null, { withoutEnlargement: false }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const i = y * w + x;
    const l = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
    sum += l; sum2 += l * l; n++;
  }
  return n ? sum2 / n - (sum / n) ** 2 : 0;
}

/** Vrai si l'image a réellement changé (comparaison de pixels, sans IA, gratuite). */
async function hasChanged(a: Buffer, b: Buffer): Promise<boolean> {
  const raw = (x: Buffer) => sharp(x).resize(512, 512, { fit: "fill" }).greyscale().raw().toBuffer();
  const [ra, rb] = await Promise.all([raw(a), raw(b)]);
  let diff = 0;
  for (let i = 0; i < ra.length; i++) if (Math.abs(ra[i] - rb[i]) > 18) diff++;
  return diff / ra.length > 0.001;
}

const UNCHANGED_QC = {
  texts: [], color_ok: true, shape_ok: true, foreign_logo: false, anatomy_ok: true, instruction_followed: false, unchanged: true,
  edit_quality_0_10: 0, edit_defects: "Le modèle a renvoyé la photo sans la modifier, même après une 2e tentative renforcée. Entoure la zone concernée pour une retouche locale, ou reformule.",
  product_height_pct: 0, hero_foreground: true, proportion_ok: true, angle_ok: true, realism_0_10: 0,
  comment: "Aucun changement visible : contrôle qualité non lancé (pas de dépense inutile).",
} as unknown as QC;

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9% ]+/g, " ").split(/\s+/).filter(Boolean);

/** Compare les textes lus sur l'étiquette à ceux attendus : mots attendus manquants + mots lus qui n'existent pas (fautes). */
function labelErrors(expected: string[], read: string[]) {
  const exp = new Set(expected.flatMap(norm));
  const got = new Set(read.flatMap(norm));
  const missing = Array.from(exp).filter((w) => w.length >= 4 && !got.has(w));
  const invented = Array.from(got).filter((w) => w.length >= 4 && !exp.has(w) && !/^\d/.test(w));
  // Les mots manquants peuvent venir d'une main ou d'une courbure qui cache le texte : seules les fautes visibles comptent
  return { missing, invented, n: invented.length };
}

/** Réparation d'étiquette avec vérification : retouche (2K), lecture bon marché du résultat, une 2e tentative ciblée sur les mots faux. */
async function repairLabel(a: Parameters<typeof localEditCrop>[0]): Promise<{ edited: Buffer; box: CropBox; errors: string[] } | null> {
  const expected = a.product.texts ?? [];
  const attempt = async (instruction: string) => {
    const r = await localEditCrop({ ...a, mode: "label", instruction });
    if (!r) return null;
    let errs = { missing: [] as string[], invented: [] as string[], n: 0 };
    try {
      const png = await sharp(r.edited).png().toBuffer();
      const rd = parseJson<{ lines?: string[] }>(firstText(await gemini(MODELS.text, [{ text: READ_LABEL_PROMPT }, imgPart(png, "image/png")], { purpose: "lecture étiquette", json: true, timeoutMs: 40_000, signal: a.signal })));
      errs = labelErrors(expected, rd.lines ?? []);
    } catch { /* lecture indisponible : on garde le résultat sans vérifier */ }
    return { ...r, errs };
  };
  const first = await attempt("");
  if (!first) return null;
  if (first.errs.n === 0 || !expected.length) return { edited: first.edited, box: first.box, errors: [] };
  const fb = [
    first.errs.invented.length ? `The previous attempt contained misspelled or invented words: ${first.errs.invented.join(", ")}.` : "",
    first.errs.missing.length ? `These required words were missing or wrong: ${first.errs.missing.join(", ")}.` : "",
    "Write every word exactly as in the required list, letter by letter, from the packshot.",
  ].filter(Boolean).join(" ");
  const second = await attempt(fb);
  const best = second && second.errs.n < first.errs.n ? second : first;
  return { edited: best.edited, box: best.box, errors: [...best.errs.invented, ...best.errs.missing].slice(0, 6) };
}

/** Boîte du produit principal (pour réparer son étiquette sans toucher au reste). */
async function locateProduct(img: { buf: Buffer; mime: string }): Promise<Zone | null> {
  try {
    const r = await gemini(MODELS.text, [{ text: LOCATE_PRODUCT_PROMPT }, imgPart(img.buf, img.mime)], { purpose: "localisation produit", json: true, timeoutMs: 40_000 });
    const z = zoneFromBox(parseJson<{ box?: unknown }>(firstText(r)).box, 0.01);
    return z && z.w * z.h < 0.85 ? z : null;
  } catch { return null; }
}

/** Découpe une demande en plusieurs tâches : une par ligne ou par puce. */
function splitTasks(text: string): string[] {
  return text.split(/\n+/).map((l) => l.replace(/^\s*(?:[-–•*]|\d+[.)])\s*/, "").trim()).filter((l) => l.length > 2).slice(0, 5);
}

export interface Interpretation { instruction: string; understood: string; region: Zone | null; intent: "edit" | "label"; useOriginal: boolean }

/** Comprend la demande : instruction précise, phrase « Compris », zone à retoucher (zone entourée + éléments concernés). */
export async function interpretCorrection(prev: { buf: Buffer; mime: string }, feedback: string, userZone: Zone | null, avoid?: string, refs: { buf: Buffer; mime: string }[] = [], original: { buf: Buffer; mime: string } | null = null, realSize?: string): Promise<Interpretation> {
  const meta = await sharp(prev.buf).metadata();
  const W = meta.width ?? 0, H = meta.height ?? 0;
  let instruction = feedback, understood = "", region: Zone | null = userZone, intent: "edit" | "label" = "edit", useOriginal = false;
  try {
    const zoneCrop = userZone && W && H ? await sharp(prev.buf).extract({
      left: Math.round(Math.max(0, userZone.x * W)), top: Math.round(Math.max(0, userZone.y * H)),
      width: Math.max(1, Math.min(W - Math.round(userZone.x * W), Math.round(userZone.w * W))), height: Math.max(1, Math.min(H - Math.round(userZone.y * H), Math.round(userZone.h * H))),
    }).png().toBuffer() : null;
    const r = await gemini(MODELS.text, [{ text: interpretPrompt({ realSize, feedback, hasZone: !!zoneCrop, avoid, refCount: refs.length, hasOriginal: !!original }) }, imgPart(prev.buf, prev.mime), ...(original ? [imgPart(original.buf, original.mime)] : []), ...(zoneCrop ? [imgPart(zoneCrop, "image/png")] : []), ...refs.map((r) => imgPart(r.buf, r.mime))], { purpose: "localisation produit", json: true, timeoutMs: 40_000 });
    const it = parseJson<{ instruction?: string; understood?: string; scope?: string; intent?: string; boxes?: unknown; box?: unknown }>(firstText(r));
    if (it.intent === "label") intent = "label";
    useOriginal = (it as { use_original?: unknown }).use_original === true;
    if (it.instruction) instruction = it.instruction;
    if (it.understood) understood = it.understood;
    if (it.scope === "local") {
      const found = zonesFromBoxes(it.boxes ?? (it.box ? [it.box] : []));
      const u = unionZones([...(userZone ? [userZone] : []), ...found]);
      // Petit ou moyen élément : retouche locale (reste identique au pixel près). Grand changement : image complète.
      region = u && u.w * u.h <= 0.45 ? u : null;
    } else region = null;
  } catch { /* on garde la demande telle quelle */ }
  return { instruction, understood, region, intent, useOriginal };
}

export const generateImage = (sb: SupabaseClient, image: ImageRow, userId: string, signal?: AbortSignal) =>
  withAiCtx({ sb, userId, shootId: image.shoot_id, imageId: image.id }, () => generateImageInner(sb, image, userId, signal));

async function generateImageInner(sb: SupabaseClient, image: ImageRow, userId: string, signal?: AbortSignal) {
  const t0 = Date.now();
  const left = () => Math.max(25_000, Math.min(200_000, 240_000 - (Date.now() - t0))); // Vercel coupe à 300 s : budget de 240 s
  const { data: shoot } = await sb.from("shoots").select("*").eq("id", image.shoot_id).single();
  if (!shoot) throw new Error("Shooting introuvable");
  const { product, imagePaths } = await loadProduct(sb, shoot.product_id);
  const rules = await brandRules(sb);
  const packshots = await Promise.all(imagePaths.map((p) => download(sb, p)));
  const aspect = image.aspect || shoot.aspect;
  let parts: Part[] = [];
  let model: string;
  let buf: Buffer | null = null;
  let prevImg: { buf: Buffer; mime: string } | null = null;
  let origImg: { buf: Buffer; mime: string } | null = null;
  let nInsp = 0;
  let skipChangeCheck = false; // réparation d'étiquette : le texte ne change que quelques pixels, c'est normal

  if (image.kind === "generated") {
    model = shoot.engine === "pro" ? MODELS.pro : shoot.engine === "flash" ? MODELS.flash : (image.variant_index % 2 === 0 ? MODELS.flash : MODELS.pro);
    // Une inspiration par variante : l'image i suit SON inspiration (pose, cadrage, lumière, style) ; elles tournent s'il y a plus de variantes que d'inspirations.
    const allInsp = shoot.inspiration_paths as string[];
    const pick = allInsp.length > 1 ? image.variant_index % allInsp.length : 0;
    const inspirations = await Promise.all((allInsp.length > 1 ? [allInsp[pick]] : allInsp).map((p) => download(sb, p)));
    const perAnalysis = String(shoot.analysis ?? "").split(ANALYSIS_SEP);
    const analysisFor = allInsp.length > 1 && perAnalysis.length === allInsp.length ? perAnalysis[pick] : (shoot.analysis ?? "");
    let modelRef: { buf: Buffer; mime: string } | null = null;
    let modelDescription = "";
    const modelId = (image as any).model_id ?? shoot.model_id;
    if (modelId && !shoot.no_people) {
      const { data: m } = await sb.from("models").select("path, description").eq("id", modelId).single();
      if (m?.path) { modelRef = await download(sb, m.path); modelDescription = m.description; }
    }
    const prompt = buildPrompt({
      product, rules, userPrompt: shoot.prompt, aspect, analysis: analysisFor,
      variation: variationHint(image.variant_index, shoot.no_people), nProductImages: packshots.length,
      hasModelRef: !!modelRef, modelDescription, noPeople: shoot.no_people,
    });
    nInsp = inspirations.length;
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
    prevImg = prev; origImg = original;
    let instruction: string = prm.instruction ?? image.feedback ?? "";
    let region: Zone | null = prm.region ?? null;
    let editMode: "edit" | "label" = image.kind === "label" ? "label" : "edit";
    const zonesIn = ((prm.zones as (Zone & { note?: string })[] | undefined) ?? (prm.zone ? [prm.zone as Zone] : [])) as (Zone & { note?: string })[];

    // Plusieurs zones : chacune est comprise et retouchée séparément (en parallèle), puis recollée sur l'image d'origine
    // Plusieurs demandes (une par ligne) : chacune est traitée à sa manière, puis recollées sur la même image
    const tasks = image.kind === "correction" && zonesIn.length === 0 ? splitTasks(image.feedback ?? "") : [];
    if (tasks.length >= 2 && W && H) {
      const its = await Promise.all(tasks.map((t) => interpretCorrection(prev, t, null, prm.avoid, refs, original, product.real_size)));
      const items = its.map((it, k) => ({ it, k }));
      const labelTasks = items.filter(({ it }) => it.intent === "label");
      const localTasks = items.filter(({ it }) => it.intent !== "label" && it.region);
      const globalTasks = items.filter(({ it }) => it.intent !== "label" && !it.region);
      // 1) retouches locales ET réparation d'étiquette en parallèle (le total dépend de la plus lente, pas de la somme)
      if (labelTasks.length) skipChangeCheck = true;
      const labelJob = labelTasks.length ? (async () => {
        const z = await locateProduct(prev);
        if (!z) return null;
        const r = await repairLabel({ prev: prev.buf, W, H, region: z, instruction: "", mode: "label", product, rules, refs: [], packshots, original: null, model, signal, timeoutMs: left() });
        return r ? { ...r, region: z } : null;
      })() : Promise.resolve(null);
      const [edits, labelRes] = await Promise.all([
        Promise.all(localTasks.map(async ({ it, k }) => {
          const r = await localEditCrop({ prev: prev.buf, W, H, region: it.region!, instruction: it.instruction, mode: "edit", product, rules, refs: [], packshots, original: it.useOriginal ? original : null, model, signal, timeoutMs: left() });
          return r ? { ...r, region: it.region!, k } : null;
        })),
        labelJob,
      ]);
      let acc: Buffer = prev.buf;
      for (const e of edits) if (e) acc = await pasteBack(acc, e.edited, e.box, e.region, W, H);
      if (labelRes) acc = await pasteBack(acc, labelRes.edited, labelRes.box, labelRes.region, W, H); // l'étiquette en dernier
      // 2) changements globaux (lumière, fond entier…) : seulement s'il reste du temps
      if (globalTasks.length && left() > 120_000) {
        const gOrig = globalTasks.some(({ it }) => it.useOriginal) ? original : null;
        const gp: Part[] = [{ text: correctionPrompt({ product, rules, feedback: globalTasks.map(({ it }) => it.instruction).join(" Also: "), mode: "edit", hasOriginal: !!gOrig }) }, imgPart(acc, "image/png"), ...(gOrig ? [imgPart(gOrig.buf, gOrig.mime)] : []), ...packshots.map((p) => imgPart(p.buf, p.mime))];
        try { const gb = firstImage(await gemini(model, gp, { purpose: "retouche globale", image: true, aspect, size: shoot.size, signal, timeoutMs: left() })); if (gb) acc = gb; } catch { /* on garde les retouches locales */ }
      }
      // Tâches qui n'ont pas pu être appliquées : on le dit
      const notDone = [
        ...localTasks.filter(({ k }, n) => !edits[n]).map(({ k }) => tasks[k]),
        ...(labelTasks.length && !labelRes ? [tasks[labelTasks[0].k]] : []),
        ...(labelRes?.errors.length ? [`Étiquette : mots encore douteux (${labelRes.errors.join(", ")})`] : []),
        ...(globalTasks.length && left() <= 120_000 ? globalTasks.map(({ k }) => tasks[k]) : []),
      ];
      if (acc !== prev.buf) {
        buf = acc;
        await sb.from("images").update({ params: { ...prm,
          instruction: its.map((it, k) => `${k + 1}. ${it.instruction}`).join(" "),
          understood: its.map((it, k) => `${k + 1}. ${it.understood}`).join(" · "),
          ...(notDone.length ? { not_applied: notDone } : {}),
        } }).eq("id", image.id);
      }
    }

    if (image.kind === "correction" && zonesIn.length >= 2 && W && H && !buf) {
      const outs = await Promise.all(zonesIn.slice(0, 5).map(async (z) => {
        const it = await interpretCorrection(prev, (z.note ?? "").trim() || image.feedback || "", z, prm.avoid, refs, original, product.real_size);
        const reg: Zone = it.region ?? z;
        const r = await localEditCrop({ prev: prev.buf, W, H, region: reg, instruction: it.instruction, mode: "edit", product, rules, refs, packshots, original: it.useOriginal ? original : null, model, signal });
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
      const it = await interpretCorrection(prev, image.feedback ?? "", zonesIn[0] ?? null, prm.avoid, refs, original, product.real_size);
      instruction = it.instruction; region = it.region;
      if (!it.useOriginal) { original = null; origImg = null; } // on ne remet la version d'origine que si le client le demande
      if (it.intent === "label") { editMode = "label"; skipChangeCheck = true; const z = await locateProduct(prev); region = z; }
      await sb.from("images").update({ params: { ...prm, instruction, understood: it.understood, region } }).eq("id", image.id);
    } else if (image.kind === "label") {
      // Réparation d'étiquette : on repère le produit et on ne retouche que lui
      try {
        const r = await gemini(MODELS.text, [{ text: LOCATE_PRODUCT_PROMPT }, imgPart(prev.buf, prev.mime)], { purpose: "localisation produit", json: true, timeoutMs: 40_000 });
        const z = zoneFromBox(parseJson<{ box?: unknown }>(firstText(r)).box, 0.01);
        if (z && z.w * z.h < 0.85) region = z;
      } catch { region = null; }
    }

    // Retouche LOCALE : seule la zone est modifiée, le reste de l'image est strictement conservé.
    if (!buf && region && W && H && image.kind !== "format") {
      const lr = { prev: prev.buf, W, H, region, instruction, mode: editMode, product, rules, refs: [], packshots, original, model, signal } as Parameters<typeof localEditCrop>[0];
      const r = editMode === "label" ? await repairLabel(lr) : await localEditCrop(lr);
      if (r) {
        buf = await pasteBack(prev.buf, r.edited, r.box, region, W, H);
        if ((r as { errors?: string[] }).errors?.length) await sb.from("images").update({ params: { ...prm, not_applied: [`Étiquette : mots encore douteux (${(r as unknown as { errors: string[] }).errors.join(", ")})`] } }).eq("id", image.id);
      }
    }
    if (!buf) {
      // Modification globale (lumière, fond entier…) ou repli : régénération complète de l'image
      const prompt = image.kind === "format"
        ? formatPrompt({ product, rules, aspect })
        : correctionPrompt({ product, rules, feedback: instruction, mode: editMode, hasOriginal: !!original });
      parts = [{ text: prompt }, imgPart(prev.buf, prev.mime), ...(original ? [imgPart(original.buf, original.mime)] : []), ...packshots.map((p) => imgPart(p.buf, p.mime))];
    }
  }

  let lastErr: unknown;
  let noImage = "";
  const purposeOf = (suffix = "") => (image.kind === "generated" ? "génération" : image.kind === "format" ? "déclinaison format" : "retouche globale") + suffix;
  const base = nInsp > 0 ? parts.slice(0, parts.length - nInsp) : parts;
  const insps = nInsp > 0 ? parts.slice(parts.length - nInsp) : [];
  // Essai normal ; si Google bloque (filtre de sécurité), on retire UNE photo d'inspiration à la fois pour trouver celle qui bloque
  // (un appel bloqué coûte ~0,01 €), en gardant toutes les autres et la même résolution. En dernier recours, sans aucune inspiration.
  const run = async (p: Part[], label: string) => {
    try {
      const resp = await gemini(model, p, { purpose: purposeOf(label), image: true, aspect, size: shoot.size, signal });
      buf = firstImage(resp);
      if (!buf) noImage = noImageReason(resp);
    } catch (e) { lastErr = e; }
  };
  if (!buf) await run(parts, "");
  if (!buf && image.kind !== "generated") await run(parts, "");
  if (!buf && noImage && image.kind === "generated" && nInsp > 0) {
    for (let k = 0; k < nInsp && !buf; k++) {
      if (nInsp < 2) break;
      await run([...base, ...insps.filter((_, j) => j !== k)], ` (sans inspiration ${k + 1})`);
    }
    if (!buf) await run(base, " (sans inspirations)");
  }
  if (!buf) throw lastErr instanceof Error ? lastErr : new Error(`Google n'a renvoyé aucune image (${noImage || "raison inconnue"})`);

  // Annulée entre-temps : on ne l'enregistre pas et on ne la compte pas
  const { data: cur } = await sb.from("images").select("state, params").eq("id", image.id).single();
  if (!cur || cur.state !== "generating" || (cur.params as any)?.cancelled) return;

  // Retouche sans effet ? (comparaison de pixels gratuite) → 2e tentative renforcée, avec la taille réelle du produit
  let unchanged = false;
  if (image.kind === "correction" && !skipChangeCheck && !/étiquette|etiquette|texte|orthograph|faute|écriture|ecriture|typo/i.test(image.feedback ?? "") && prevImg && buf && !(await hasChanged(prevImg.buf, buf))) {
    const instr = String((cur.params as any)?.instruction ?? image.feedback ?? "");
    const strong = correctionPrompt({
      product, rules, mode: "edit", hasOriginal: !!origImg,
      feedback: `${instr}\nCRITICAL: a previous attempt returned the photo practically unchanged, which is a failure. This time the change MUST be obvious at first glance. ${sizeLine(product)} Redraw the affected elements from scratch if needed, keeping everything else (person, face, hair, background, light, product design and printed texts) the same.`,
    });
    const sp: Part[] = [{ text: strong }, imgPart(prevImg.buf, prevImg.mime), ...(origImg ? [imgPart(origImg.buf, origImg.mime)] : []), ...packshots.map((p) => imgPart(p.buf, p.mime))];
    try {
      const nb = firstImage(await gemini(MODELS.pro, sp, { purpose: "retouche renforcée", image: true, aspect, size: shoot.size, signal, timeoutMs: left() }));
      if (nb && (await hasChanged(prevImg.buf, nb))) buf = nb; else unchanged = true;
    } catch { unchanged = true; }
  }

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
  await sb.from("images").update({ path, thumb_path: upT.error ? null : thumbPath, state: "done", model_used: model, error: null, aspect, ...(unchanged ? { qc: UNCHANGED_QC, verdict: "rejected", score: 0 } : {}) }).eq("id", image.id);
  await sb.from("usage_events").insert({ user_id: userId, kind: image.kind, units: 1, model });
}

function verdict(qc: QC, correction = false) {
  const wrong = qc.texts.filter((t) => t.status === "wrong").length;
  const unread = qc.texts.filter((t) => t.status === "unreadable").length;
  const h = qc.human;
  const humanBad = !!h && h.present !== false && [h.hands_ok, h.fingers_count_ok, h.grip_ok, h.face_ok, h.limbs_ok, h.body_ok, h.accessories_ok].some((x) => x === false);
  const anatomyBad = !qc.anatomy_ok || humanBad;
  const deviant = qc.artifacts_ok === false || qc.face_matches_model === false;
  const unwanted = !!qc.unwanted_changes && !/^(none|aucun|n\/a|-)?$/i.test(qc.unwanted_changes.trim());
  // Une correction est jugée sur sa demande et sur les dégâts qu'elle cause, pas sur les défauts déjà présents avant :
  // texte du produit faux, main déformée ailleurs, etc. passent en « à vérifier » (le bouton Étiquette sert à les réparer).
  const hard = correction
    ? qc.instruction_followed === false || qc.ghost_or_duplicate === true || qc.foreign_logo || qc.matches_reference === false || (qc.edit_quality_0_10 ?? 10) < 5
    : deviant || wrong > 0 || qc.instruction_followed === false || qc.ghost_or_duplicate === true || qc.all_copies_exact === false || qc.label_orientation_ok === false || !qc.color_ok || !qc.shape_ok || qc.foreign_logo || anatomyBad;
  const soft = unwanted || (correction && (qc.sharpness_ratio ?? 1) < 0.8) || (correction && (deviant || (qc.edit_quality_0_10 ?? 10) < 8 || wrong > 0 || qc.all_copies_exact === false || anatomyBad || !qc.color_ok || !qc.shape_ok || qc.label_orientation_ok === false))
    || qc.skin_natural === false || unread > 1 || !qc.proportion_ok || !qc.angle_ok || (qc.product_height_pct ?? 100) < 8 || qc.realism_0_10 < 6;
  const w = correction ? 0.25 : 1; // poids des défauts hérités dans le score d'une correction
  const score = Math.max(0, Math.min(100, Math.round(
    qc.realism_0_10 * 6 - wrong * 12 * w - unread * 3 * w - (qc.color_ok ? 0 : 20 * w) - (qc.shape_ok ? 0 : 15 * w) - (qc.foreign_logo ? 20 : 0)
    - (anatomyBad ? 15 * w : 0) - (qc.artifacts_ok === false ? 10 * w : 0) - (qc.face_matches_model === false ? 25 : 0) - (correction ? Math.max(0, 8 - (qc.edit_quality_0_10 ?? 8)) * 6 : 0) - (qc.matches_reference === false ? 30 : 0) - (qc.instruction_followed === false ? 40 : 0) - (qc.ghost_or_duplicate ? 20 : 0) - (unwanted ? 10 : 0) - (qc.skin_natural === false ? 15 : 0)
    - (qc.all_copies_exact === false ? 20 * w : 0) - (qc.label_orientation_ok === false ? 15 * w : 0) - (qc.proportion_ok ? 0 : 8) - (qc.angle_ok ? 0 : 5) + 40)));
  return { verdict: (hard ? "rejected" : soft ? "review" : "valid") as ImageRow["verdict"], score };
}
export const qualityCheck = async (sb: SupabaseClient, image: ImageRow) => {
  const { data: { user } } = await sb.auth.getUser();
  return withAiCtx({ sb, userId: user?.id ?? "", shootId: image.shoot_id, imageId: image.id }, () => qualityCheckInner(sb, image));
};

async function qualityCheckInner(sb: SupabaseClient, image: ImageRow) {
  if (!image.path) throw new Error("Pas d'image à contrôler");
  const { data: shoot } = await sb.from("shoots").select("product_id, no_people").eq("id", image.shoot_id).single();
  const { product, imagePaths } = await loadProduct(sb, shoot!.product_id);
  const pack = await download(sb, imagePaths[0]);
  let modelRef: { buf: Buffer; mime: string } | null = null;
  const mid = (image as any).model_id as string | null;
  if (mid && !shoot!.no_people) {
    const { data: m } = await sb.from("models").select("path").eq("id", mid).single();
    if (m?.path) modelRef = await download(sb, m.path).catch(() => null);
  }
  const gen = await download(sb, image.path);
  let before: { buf: Buffer; mime: string } | null = null;
  const instr = (image.params as any)?.instruction as string | undefined;
  if (image.kind === "correction" && image.parent_id && instr) {
    const { data: par } = await sb.from("images").select("path").eq("id", image.parent_id).single();
    if (par?.path) before = await download(sb, par.path);
  }
  const qcRefs = before ? (await Promise.all((((image.params as any)?.refs as string[] | undefined) ?? []).slice(0, 3).map((p) => download(sb, p).catch(() => null)))).filter(Boolean) as { buf: Buffer; mime: string }[] : [];
  const qcParts = [{ text: qcPrompt(product, before ? { instruction: instr!, refCount: qcRefs.length } : undefined, { modelRef: !!modelRef }) }, imgPart(pack.buf, pack.mime), imgPart(gen.buf, gen.mime), ...(before ? [imgPart(before.buf, before.mime)] : []), ...qcRefs.map((r) => imgPart(r.buf, r.mime)), ...(modelRef ? [imgPart(modelRef.buf, modelRef.mime)] : [])];
  let r: any;
  try { r = await gemini(MODELS.vision, qcParts, { purpose: "contrôle qualité", json: true, timeoutMs: 70_000 }); }
  catch { r = await gemini(MODELS.text, qcParts, { purpose: "contrôle qualité (secours)", json: true, timeoutMs: 35_000 }); } // modèle plus rapide si le premier est trop lent
  const qc = parseJson<QC>(firstText(r));
  qc.texts = qc.texts ?? [];
  if (before) {
    try { const [a, b] = await Promise.all([sharpness(before.buf), sharpness(gen.buf)]); if (a > 0) qc.sharpness_ratio = Math.round((b / a) * 100) / 100; } catch { /* mesure facultative */ }
  }
  const v = verdict(qc, !!before);
  await sb.from("images").update({ qc, verdict: v.verdict, score: v.score }).eq("id", image.id);
  return v;
}
