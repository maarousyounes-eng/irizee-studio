import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, imgPart, firstImage, firstText, parseJson, type Part } from "./gemini";
import { buildPrompt, correctionPrompt, formatPrompt, qcPrompt, variationHint } from "./prompts";
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
  let parts: Part[];
  let model: string;

  if (image.kind === "generated") {
    model = shoot.engine === "pro" ? MODELS.pro : shoot.engine === "flash" ? MODELS.flash : (image.variant_index % 2 === 0 ? MODELS.flash : MODELS.pro);
    const inspirations = await Promise.all((shoot.inspiration_paths as string[]).map((p) => download(sb, p)));
    let modelRef: { buf: Buffer; mime: string } | null = null;
    let modelDescription = "";
    if (shoot.model_id && !shoot.no_people) {
      const { data: m } = await sb.from("models").select("path, description").eq("id", shoot.model_id).single();
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
    const prompt = image.kind === "format"
      ? formatPrompt({ product, rules, aspect })
      : correctionPrompt({ product, rules, feedback: image.feedback ?? "", mode: image.kind === "label" ? "label" : "edit" });
    parts = [{ text: prompt }, imgPart(prev.buf, prev.mime), ...packshots.map((p) => imgPart(p.buf, p.mime))];
  }

  let buf: Buffer | null = null;
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
  const hard = wrong > 0 || !qc.color_ok || !qc.shape_ok || qc.foreign_logo || !qc.anatomy_ok;
  const soft = unread > 1 || !qc.hero_foreground || !qc.proportion_ok || !qc.angle_ok || (qc.product_height_pct ?? 100) < 20 || qc.realism_0_10 < 6;
  const score = Math.max(0, Math.min(100, Math.round(
    qc.realism_0_10 * 6 - wrong * 12 - unread * 3 - (qc.color_ok ? 0 : 20) - (qc.shape_ok ? 0 : 15) - (qc.foreign_logo ? 20 : 0)
    - (qc.anatomy_ok ? 0 : 10) - (qc.hero_foreground ? 0 : 8) - (qc.proportion_ok ? 0 : 8) - (qc.angle_ok ? 0 : 5) + 40)));
  return { verdict: (hard ? "rejected" : soft ? "review" : "valid") as ImageRow["verdict"], score };
}

export async function qualityCheck(sb: SupabaseClient, image: ImageRow) {
  if (!image.path) throw new Error("Pas d'image à contrôler");
  const { data: shoot } = await sb.from("shoots").select("product_id").eq("id", image.shoot_id).single();
  const { product, imagePaths } = await loadProduct(sb, shoot!.product_id);
  const pack = await download(sb, imagePaths[0]);
  const gen = await download(sb, image.path);
  const r = await gemini(MODELS.vision, [{ text: qcPrompt(product) }, imgPart(pack.buf, pack.mime), imgPart(gen.buf, gen.mime)], { json: true });
  const qc = parseJson<QC>(firstText(r));
  qc.texts = qc.texts ?? [];
  const v = verdict(qc);
  await sb.from("images").update({ qc, verdict: v.verdict, score: v.score }).eq("id", image.id);
  return v;
}
