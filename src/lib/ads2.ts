// Module Ads v2 (serveur) : plan créatif d'une campagne, génération / contrôle / correction / déclinaison de chaque pub.
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, imgPart, firstImage, firstText, type Part } from "./gemini";
import { brandRules, download, loadProduct } from "./generation";
import type { Product } from "@/types";

export type TextZone = "top" | "bottom" | "left" | "right" | "center";
export const ZONES: TextZone[] = ["top", "bottom", "left", "right", "center"];
export const AD_CTAS = ["Découvrir", "Acheter", "J'en profite", "Je teste", "Voir la gamme", "En savoir plus"];
const ZONE_EN: Record<TextZone, string> = { top: "top third", bottom: "bottom third", left: "left half", right: "right half", center: "center" };

export interface Campaign {
  id: string; name: string; origin: "inspi" | "idea"; idea: string; keep_change: string; inspiration_paths: string[];
  product_ids: string[]; photo_paths: string[]; message: string; offer: string; text_mode: "ai" | "exact"; engine: string; count: number;
}
export interface Variant {
  id: string; campaign_id: string; idx: number; direction: string; scene: string; text_zone: TextZone; text_mode: "ai" | "exact";
  hook: string; cta: string; badge: string; state: string; path: string | null; thumb_path: string | null;
  formats: Record<string, string>; history: string[]; qc: AdQC | null;
}
export interface AdQC { texts: { expected: string; read: string; ok: boolean }[]; unwanted_text: boolean; product_ok: boolean; duplicate_products: boolean; issues: string[]; comment: string }

const cut = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const imageModel = (_engine: string) => "openai:auto";
const productBlock = (p: Product) => [`"${p.name}"${p.look ? `: ${p.look}` : ""}`, p.real_size ? `Real size: ${p.real_size.replace(/\n/g, ", ")}.` : "", p.texts?.length ? `Printed on it (exactly): ${p.texts.join(" | ")}` : ""].filter(Boolean).join("\n");

async function loadProducts(sb: SupabaseClient, ids: string[]) {
  const out: { product: Product; packshot: { buf: Buffer; mime: string } }[] = [];
  for (const id of ids.slice(0, 4)) {
    try { const { product, imagePaths } = await loadProduct(sb, id); out.push({ product, packshot: await download(sb, imagePaths[0]) }); } catch { /* produit supprimé */ }
  }
  return out;
}
async function small(buf: Buffer, max = 1024) {
  return sharp(buf).resize(max, max, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
}

// ---------------------------------------------------------------- Plan créatif

/** L'IA invente N directions artistiques différentes (scène, place du texte, accroche) pour la campagne. */
export async function planCampaign(sb: SupabaseClient, c: Campaign, n: number, avoid: string[] = []) {
  const prods = await loadProducts(sb, c.product_ids);
  if (!prods.length) throw new Error("Choisis au moins un produit");
  const rules = await brandRules(sb);
  const insp = c.origin === "inspi" ? await Promise.all(c.inspiration_paths.slice(0, 4).map((p) => download(sb, p).catch(() => null))) : [];
  const inspImgs = insp.filter(Boolean) as { buf: Buffer; mime: string }[];
  const prompt = [
    "You are the creative director of a top beauty advertising agency, creating static social ads (Instagram, Facebook, TikTok, Google) for the French cosmetics brand Irizée.",
    `Products to feature (each appears exactly once in an ad, never duplicated): \n${prods.map((p) => productBlock(p.product)).join("\n\n")}`,
    rules.length ? `Brand rules (mandatory):\n${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}` : "",
    c.origin === "inspi"
      ? `The ${inspImgs.length} attached image(s) are ADS THE CLIENT LIKES. Reuse their concept, composition, graphic style and the way text is laid out, adapted to Irizée's products and message. NEVER reuse their brand, logo, texts, product designs or the faces of their people.${c.keep_change ? ` Client's note on what to keep or change: "${c.keep_change}".` : ""}`
      : `Client's idea: "${c.idea}".`,
    c.message ? `Message the ads must convey: "${c.message}".` : "",
    c.offer ? `Real offer (use it as given, word for word): "${c.offer}".` : "No offer: never mention a price, discount or promotion.",
    "COMPLIANCE: no medical or therapeutic claim, no guaranteed result, no before/after, never invent a price, discount, rating, number, ingredient or customer review.",
    `Create ${n} ad concepts that are CLEARLY DIFFERENT from each other (different setting, composition, colour mood and graphic style; e.g. bold typographic, editorial luxe, bathroom spa mood, spontaneous TikTok style, product in mid-air, macro texture, colour block, minimal white…).${avoid.length ? ` Do NOT repeat these existing directions: ${avoid.join(", ")}.` : ""}`,
    "For each concept give: direction (2–5 French words naming the art direction), scene (60–110 English words describing the WHOLE ad image precisely: setting, background, composition, camera angle, lighting, colour palette, where each product is and how, any person (always a fictional person) and graphic shapes; leave a clean uncluttered area for the text), text_zone (where the headline goes: top | bottom | left | right | center), hook (French headline, max 45 characters, punchy, no hashtags), cta (one of: " + AD_CTAS.join(", ") + "), badge (very short sticker text, max 12 characters, ONLY if a real offer is given, else empty string).",
    'Return JSON only: {"name": str (2-5 French words naming the campaign), "concepts": [{"direction": str, "scene": str, "text_zone": str, "hook": str, "cta": str, "badge": str}]}',
  ].filter(Boolean).join("\n\n");
  const parts: Part[] = [{ text: prompt }, ...inspImgs.map((i) => imgPart(i.buf, i.mime))];
  const r = await gemini(MODELS.text, parts, { purpose: "ads plan", json: true, timeoutMs: 80_000 });
  const raw = JSON.parse(firstText(r).trim().replace(/^```json\s*|```$/g, "")) as { name?: string; concepts?: any[] };
  const concepts = (raw.concepts ?? []).slice(0, n).map((x) => ({
    direction: cut(x.direction, 60), scene: cut(x.scene, 1200),
    text_zone: (ZONES.includes(x.text_zone) ? x.text_zone : "top") as TextZone,
    hook: cut(x.hook, 60), cta: AD_CTAS.includes(x.cta) ? x.cta : "Découvrir", badge: c.offer ? cut(x.badge, 14) : "",
  }));
  if (!concepts.length) throw new Error("L'IA n'a proposé aucun concept, réessaie");
  return { name: cut(raw.name, 60), concepts };
}

// ---------------------------------------------------------------- Prompt image

function imagePrompt(a: { v: Pick<Variant, "scene" | "text_zone" | "text_mode" | "hook" | "cta" | "badge">; products: Product[]; rules: string[]; nPhotos: number; nInsp: number; aspect: string }) {
  const names = a.products.map((p) => `"${p.name}"`).join(", ");
  const roles = [
    `The first ${a.products.length} image(s) are the REAL product packshots (${names}), in this order.`,
    a.nPhotos ? `The next ${a.nPhotos} image(s) are the brand's own photos: you may reuse them (the person, the setting, the product shot) as the base of the ad.` : "",
    a.nInsp ? `The last ${a.nInsp} image(s) are ADS THE CLIENT LIKES: use them only for concept, composition and graphic style; never copy their brand, logo, texts, product designs or people's faces.` : "",
  ].filter(Boolean).join(" ");
  const text = a.v.text_mode === "ai"
    ? [
      "TYPOGRAPHY: typeset these texts in the design, in French, spelled EXACTLY (every accent and letter), in premium, highly legible typography with strong contrast:",
      `- HEADLINE (in the ${ZONE_EN[a.v.text_zone]}): "${a.v.hook}"`,
      a.v.cta ? `- BUTTON (a rounded pill button): "${a.v.cta}"` : "",
      a.v.badge ? `- BADGE (a round sticker): "${a.v.badge}"` : "",
      "No other text anywhere, except what is printed on the real products.",
    ].filter(Boolean).join("\n")
    : `TEXT AREA: keep the ${ZONE_EN[a.v.text_zone]} clean, plain and uncluttered (no object, no person) for a headline that will be added later. Do NOT write any text, letters or logo anywhere, except what is printed on the real products.`;
  return [
    "Create a high-end, scroll-stopping static advertisement image for the cosmetics brand Irizée, photorealistic, art-directed like a top beauty campaign.",
    roles,
    a.rules.length ? `Brand rules:\n${a.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}` : "",
    `PRODUCTS: ${a.products.length > 1 ? `exactly ONE of each of these ${a.products.length} products, never two of the same, no other product` : "exactly this product, once"}. Each is an exact copy of its packshot: same shape, proportions, cap, colours, label layout and printed texts. Never redesign a product. Realistic scale.`,
    `CONCEPT: ${a.v.scene}`,
    "Any person is a fictional person with real skin texture (no plastic AI look), anatomically correct hands (five fingers).",
    text,
    `Format: aspect ratio ${a.aspect}, full-bleed, one single image (no collage, no borders, no mockup frame).`,
  ].filter(Boolean).join("\n\n");
}

async function save(sb: SupabaseClient, campaignId: string, name: string, buf: Buffer) {
  const full = await sharp(buf).jpeg({ quality: 93, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
  const thumb = await sharp(buf).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const path = `ads/${campaignId}/${name}.jpg`, thumbPath = `ads/${campaignId}/${name}_t.webp`;
  const [a, b] = await Promise.all([
    sb.storage.from("studio").upload(path, full, { contentType: "image/jpeg", upsert: true }),
    sb.storage.from("studio").upload(thumbPath, thumb, { contentType: "image/webp", upsert: true }),
  ]);
  if (a.error) throw new Error("Enregistrement impossible : " + a.error.message);
  return { path, thumbPath: b.error ? null : thumbPath };
}

async function context(sb: SupabaseClient, v: Variant) {
  const { data: c } = await sb.from("ad_campaigns").select("*").eq("id", v.campaign_id).single();
  if (!c) throw new Error("Campagne introuvable");
  const camp = c as Campaign;
  const prods = await loadProducts(sb, camp.product_ids);
  const rules = await brandRules(sb);
  return { camp, prods, rules };
}

// ---------------------------------------------------------------- Génération + contrôle

export async function generateVariant(sb: SupabaseClient, v: Variant) {
  const { camp, prods, rules } = await context(sb, v);
  const photos = (await Promise.all(camp.photo_paths.slice(0, 3).map((p) => download(sb, p).catch(() => null)))).filter(Boolean) as { buf: Buffer; mime: string }[];
  const insp = camp.origin === "inspi" ? (await Promise.all(camp.inspiration_paths.slice(0, 2).map((p) => download(sb, p).catch(() => null)))).filter(Boolean) as { buf: Buffer; mime: string }[] : [];
  const prompt = imagePrompt({ v, products: prods.map((p) => p.product), rules, nPhotos: photos.length, nInsp: insp.length, aspect: "4:5" });
  const parts: Part[] = [{ text: prompt }, ...prods.map((p) => imgPart(p.packshot.buf, p.packshot.mime)), ...photos.map((p) => imgPart(p.buf, p.mime)), ...insp.map((p) => imgPart(p.buf, p.mime))];
  const buf = firstImage(await gemini(imageModel(camp.engine), parts, { purpose: "ads image", image: true, aspect: "4:5", size: "2K" }));
  if (!buf) throw new Error("Aucune image renvoyée par le modèle");
  const saved = await save(sb, camp.id, `${v.id}-${Date.now()}`, buf);
  await sb.from("ad_variants").update({ state: "done", error: null, path: saved.path, thumb_path: saved.thumbPath, formats: {}, qc: null }).eq("id", v.id);
  const qc = await checkVariant(buf, v, prods).catch(() => null);
  if (qc) await sb.from("ad_variants").update({ qc }).eq("id", v.id);
}

/** Contrôle : textes de la pub (mode IA) mot pour mot, texte ajouté indésirable, fidélité et nombre de produits. */
async function checkVariant(buf: Buffer, v: Pick<Variant, "text_mode" | "hook" | "cta" | "badge">, prods: { product: Product; packshot: { buf: Buffer; mime: string } }[]): Promise<AdQC> {
  const expected = v.text_mode === "ai" ? [v.hook, v.cta, v.badge].filter(Boolean) : [];
  const prompt = [
    `Image 1 to ${prods.length} = real product packshots. The LAST image = a generated advertisement.`,
    expected.length
      ? `The ad must display these texts spelled exactly (ignore capitalization): ${JSON.stringify(expected)}. For each, read what is actually written and say if it is exactly right.`
      : "The ad must NOT contain any text except what is printed on the products.",
    "unwanted_text = true if there is any other text, letters or logo than the expected texts and the product labels.",
    `product_ok = false if a product's shape, colours, cap or label layout clearly differ from its packshot. duplicate_products = true if a product appears more than once or a product that is not in the packshots appears (expected: ${prods.length} product(s), one of each).`,
    "Ignore small print on the product labels.",
    'Return JSON only: {"texts":[{"expected":str,"read":str,"ok":bool}],"unwanted_text":bool,"product_ok":bool,"duplicate_products":bool,"issues":[str] (short French sentences, max 4, empty if none),"comment":str (one short French sentence)}',
  ].join("\n");
  const parts: Part[] = [{ text: prompt }, ...prods.map((p) => imgPart(p.packshot.buf, p.packshot.mime)), imgPart(await small(buf, 1400), "image/jpeg")];
  const r = await gemini(MODELS.text, parts, { purpose: "ads contrôle", json: true, timeoutMs: 60_000 });
  const j = JSON.parse(firstText(r).trim().replace(/^```json\s*|```$/g, ""));
  const q = Array.isArray(j) ? j[0] : j;
  return { texts: Array.isArray(q.texts) ? q.texts : [], unwanted_text: !!q.unwanted_text, product_ok: q.product_ok !== false, duplicate_products: !!q.duplicate_products, issues: Array.isArray(q.issues) ? q.issues.slice(0, 4) : [], comment: cut(q.comment, 200) };
}

// ---------------------------------------------------------------- Correction / changement de mode / déclinaison

export async function editVariant(sb: SupabaseClient, v: Variant, a: { instruction?: string; switchTo?: "ai" | "exact"; hook?: string; cta?: string; badge?: string }) {
  if (!v.path) throw new Error("Pas encore d'image à corriger");
  const { camp, prods } = await context(sb, v);
  const next = { ...v, hook: a.hook ?? v.hook, cta: a.cta ?? v.cta, badge: a.badge ?? v.badge, text_mode: a.switchTo ?? v.text_mode };
  const textsChanged = next.hook !== v.hook || next.cta !== v.cta || next.badge !== v.badge;
  // Texte exact : changer les mots ne demande aucune image (ils sont posés par la plateforme)
  if (next.text_mode === "exact" && !a.instruction && !a.switchTo) {
    await sb.from("ad_variants").update({ hook: next.hook, cta: next.cta, badge: next.badge }).eq("id", v.id);
    return { regenerated: false };
  }
  const tasks: string[] = [];
  if (a.instruction) tasks.push(`Apply this change requested by the client: "${a.instruction}".`);
  if (a.switchTo === "exact") tasks.push(`Remove ALL text, letters, buttons and badges from the design (keep the product labels), rebuild the background behind them, and keep the ${ZONE_EN[v.text_zone]} clean and empty for a headline added later.`);
  if (next.text_mode === "ai" && (a.switchTo === "ai" || textsChanged || a.instruction)) {
    tasks.push(`The ad must display exactly these texts in French, spelled exactly, premium legible typography: HEADLINE "${next.hook}"${next.cta ? `, BUTTON "${next.cta}"` : ""}${next.badge ? `, BADGE "${next.badge}"` : ""}. Replace any previous text; no other text.`);
  }
  const cur = await download(sb, v.path);
  const prompt = [
    "Edit this advertisement image (Image 1). The following images are the real product packshots.",
    ...tasks,
    "Keep everything else identical: composition, products (exact copies of the packshots, one of each), person, colours, lighting. One single full-bleed image, aspect ratio 4:5.",
  ].join("\n");
  const parts: Part[] = [{ text: prompt }, imgPart(cur.buf, cur.mime), ...prods.map((p) => imgPart(p.packshot.buf, p.packshot.mime))];
  const buf = firstImage(await gemini(imageModel(camp.engine), parts, { purpose: "ads correction", image: true, aspect: "4:5", size: "2K" }));
  if (!buf) throw new Error("Aucune image renvoyée par le modèle");
  const saved = await save(sb, camp.id, `${v.id}-${Date.now()}`, buf);
  await sb.from("ad_variants").update({
    path: saved.path, thumb_path: saved.thumbPath, formats: {}, history: [...(v.history ?? []), v.path].slice(-10),
    hook: next.hook, cta: next.cta, badge: next.badge, text_mode: next.text_mode, qc: null,
  }).eq("id", v.id);
  const qc = await checkVariant(buf, next, prods).catch(() => null);
  if (qc) await sb.from("ad_variants").update({ qc }).eq("id", v.id);
  return { regenerated: true };
}

/** Recompose la pub dans un autre format (1:1, 9:16, 16:9) : même design, pas un simple recadrage. */
export async function formatVariant(sb: SupabaseClient, v: Variant, aspect: string) {
  if (!v.path) throw new Error("Pas encore d'image");
  const { camp, prods } = await context(sb, v);
  const cur = await download(sb, v.path);
  const prompt = [
    `Recompose this exact advertisement (Image 1) for aspect ratio ${aspect}. The following images are the real product packshots.`,
    "Same design, same products (exact copies, one of each), same person, colours and lighting. Extend or rearrange the background naturally so everything fits; never crop a product; one single full-bleed image, no collage, no borders.",
    v.text_mode === "ai"
      ? `Keep exactly these texts, spelled exactly, re-laid out for the new shape: HEADLINE "${v.hook}"${v.cta ? `, BUTTON "${v.cta}"` : ""}${v.badge ? `, BADGE "${v.badge}"` : ""}. No other text.`
      : `No text at all except product labels; keep a clean empty area in the ${ZONE_EN[v.text_zone]} for a headline added later.`,
  ].join("\n");
  const parts: Part[] = [{ text: prompt }, imgPart(cur.buf, cur.mime), ...prods.map((p) => imgPart(p.packshot.buf, p.packshot.mime))];
  const buf = firstImage(await gemini(imageModel(camp.engine), parts, { purpose: "ads format", image: true, aspect, size: "2K" }));
  if (!buf) throw new Error("Aucune image renvoyée par le modèle");
  const saved = await save(sb, camp.id, `${v.id}-${aspect.replace(":", "x")}-${Date.now()}`, buf);
  const { data: fresh } = await sb.from("ad_variants").select("formats").eq("id", v.id).single();
  await sb.from("ad_variants").update({ formats: { ...((fresh?.formats as Record<string, string>) ?? {}), [aspect]: saved.path } }).eq("id", v.id);
  return { path: saved.path };
}
