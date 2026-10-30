import sharp from "sharp";
import { requireUser, handle, HttpError } from "@/lib/api";
import { MODELS, gemini, imgPart, firstImage, withAiCtx, type Part } from "@/lib/gemini";
import { brandRules, download, loadProduct, ANALYSIS_SEP } from "@/lib/generation";
import { buildPrompt, variationHint } from "@/lib/prompts";

export const maxDuration = 300;

/** Choisit le modèle d'image OpenAI le plus récent disponible sur ce compte (sauf si OPENAI_IMAGE_MODEL est fixé). */
async function pickOpenAIModel(key: string): Promise<string> {
  if (process.env.OPENAI_IMAGE_MODEL) return process.env.OPENAI_IMAGE_MODEL;
  const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  const j = await res.json();
  if (!res.ok) throw new HttpError(400, `OpenAI ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const ids: string[] = (j.data ?? []).map((m: { id: string }) => m.id);
  const cands = ids.filter((id) => /^gpt-image/i.test(id) && !/mini/i.test(id) && !/\d{4}-\d{2}-\d{2}/.test(id));
  const key2 = (id: string) => (id.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "0").split(".").map(Number).reduce((a, n, i) => a + n / 10 ** (i * 2), 0);
  cands.sort((a, b) => key2(b) - key2(a));
  if (!cands.length) throw new HttpError(400, `Aucun modèle d'image OpenAI disponible sur ce compte. Modèles vus : ${ids.filter((i) => /image|dall/i.test(i)).join(", ") || "aucun"}. Vérifie la vérification d'organisation sur platform.openai.com.`);
  return cands[0];
}
const OPENAI_EUR = 0.2; // estimation par image (qualité haute, portrait)

function openaiSize(aspect: string) {
  const [w, h] = aspect.split(":").map(Number);
  return w > h ? "1536x1024" : w < h ? "1024x1536" : "1024x1024";
}

/** Comparatif à l'aveugle : même demande, mêmes références, plusieurs modèles d'image. Réservé à l'admin. */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role !== "admin") throw new HttpError(403, "Réservé à l'administrateur");
    const { shootId, n: nIn } = await req.json();
    const n = Math.min(3, Math.max(1, Number(nIn) || 2));
    const { data: shoot } = await sb.from("shoots").select("*").eq("id", shootId).single();
    if (!shoot) throw new HttpError(404, "Shooting introuvable");

    const openaiKey = process.env.OPENAI_API_KEY;
    const providers: ("gemini" | "openai")[] = openaiKey ? ["gemini", "openai"] : ["gemini"];
    if (!openaiKey) throw new HttpError(400, "La clé OpenAI n'est pas configurée : ajoute la variable OPENAI_API_KEY dans Vercel (Settings > Environment Variables), puis redéploie.");

    const OPENAI_MODEL = await pickOpenAIModel(openaiKey);
    const { product, imagePaths } = await loadProduct(sb, shoot.product_id);
    const rules = await brandRules(sb);
    const packshots = await Promise.all(imagePaths.map((p) => download(sb, p)));
    const insp = (shoot.inspiration_paths as string[]).slice(0, 1);
    const inspirations = await Promise.all(insp.map((p) => download(sb, p)));
    let modelRef: { buf: Buffer; mime: string } | null = null;
    let modelDescription = "";
    const mid = (shoot.model_ids as string[] | null)?.[0] ?? shoot.model_id;
    if (mid && !shoot.no_people) {
      const { data: m } = await sb.from("models").select("path, description").eq("id", mid).single();
      if (m?.path) { modelRef = await download(sb, m.path); modelDescription = m.description; }
    }
    const analysis = String(shoot.analysis ?? "").split(ANALYSIS_SEP)[0];
    const aspect: string = shoot.aspect;
    const results: { provider: string; path: string; ms: number; error?: string }[] = [];

    const jobs: { provider: "gemini" | "openai"; i: number }[] = providers.flatMap((p) => Array.from({ length: n }, (_, i) => ({ provider: p, i })));
    await withAiCtx({ sb, userId: user.id, shootId: shoot.id }, async () => {
      await Promise.all(jobs.map(async ({ provider, i }) => {
        const t0 = Date.now();
        try {
          const prompt = buildPrompt({
            product, rules, userPrompt: shoot.prompt, aspect, analysis, variation: variationHint(i, shoot.no_people),
            nProductImages: packshots.length, hasModelRef: !!modelRef, modelDescription, noPeople: shoot.no_people,
          });
          const refs = [...packshots, ...(modelRef ? [modelRef] : []), ...inspirations];
          let out: Buffer | null = null;
          if (provider === "gemini") {
            const parts: Part[] = [{ text: prompt }, ...refs.map((r) => imgPart(r.buf, r.mime))];
            out = firstImage(await gemini(MODELS.pro, parts, { purpose: "comparatif", image: true, aspect, size: shoot.size }));
          } else {
            const fd = new FormData();
            fd.append("model", OPENAI_MODEL);
            fd.append("prompt", prompt);
            fd.append("size", openaiSize(aspect));
            fd.append("quality", "high");
            fd.append("n", "1");
            refs.forEach((r, k) => fd.append("image[]", new Blob([new Uint8Array(r.buf)], { type: r.mime }), `ref${k}.${r.mime.includes("png") ? "png" : "jpg"}`));
            const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: fd, signal: AbortSignal.timeout(250_000) });
            const j = await res.json();
            if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
            const b64 = j.data?.[0]?.b64_json;
            if (b64) out = Buffer.from(b64, "base64");
            await sb.from("ai_calls").insert({ user_id: user.id, shoot_id: shoot.id, purpose: "comparatif", model: OPENAI_MODEL, status: out ? "ok" : "error", duration_ms: Date.now() - t0, images_out: out ? 1 : 0, cost_eur: out ? OPENAI_EUR : 0 });
          }
          if (!out) throw new Error("Aucune image renvoyée");
          const jpg = await sharp(out).jpeg({ quality: 94, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
          const path = `generated/benchmark/${crypto.randomUUID()}.jpg`;
          const up = await sb.storage.from("studio").upload(path, jpg, { contentType: "image/jpeg" });
          if (up.error) throw new Error(up.error.message);
          results.push({ provider: provider === "gemini" ? MODELS.pro : OPENAI_MODEL, path, ms: Date.now() - t0 });
        } catch (e) {
          results.push({ provider: provider === "gemini" ? MODELS.pro : OPENAI_MODEL, path: "", ms: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 200) : "Erreur" });
        }
      }));
    });
    // mélange : l'ordre ne révèle pas le modèle
    const shuffled = results.sort(() => Math.random() - 0.5).map((r, k) => ({ label: String.fromCharCode(65 + k), ...r }));
    return { results: shuffled };
  });
}
