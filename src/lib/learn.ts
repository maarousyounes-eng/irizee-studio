import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, gemini, imgPart, firstText, parseJson, type Part } from "./gemini";
import { download } from "./generation";

/**
 * Apprentissage du goût du client à partir de ses choix réels :
 * images approuvées (ce qu'il aime), images refusées ou jetées (ce qu'il n'aime pas), demandes de correction (ce qui le gêne).
 * L'IA regarde les images et lit les demandes, puis écrit des règles courtes et générales.
 */
export async function learnTaste(sb: SupabaseClient): Promise<{ love: string[]; hate: string[]; signals: number }> {
  const [ok, ko, trash, fixes] = await Promise.all([
    sb.from("images").select("path, thumb_path").eq("review_status", "approved").is("deleted_at", null).not("path", "is", null).order("created_at", { ascending: false }).limit(8),
    sb.from("images").select("path, thumb_path").eq("review_status", "rejected").not("path", "is", null).order("created_at", { ascending: false }).limit(3),
    sb.from("images").select("path, thumb_path").not("deleted_at", "is", null).eq("kind", "generated").not("path", "is", null).order("deleted_at", { ascending: false }).limit(5),
    sb.from("images").select("feedback, params").eq("kind", "correction").order("created_at", { ascending: false }).limit(80),
  ]);
  const small = async (r: { path: string | null; thumb_path: string | null }) => {
    try { const f = await download(sb, (r.thumb_path || r.path)!); return await sharp(f.buf).resize({ width: 384, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer(); } catch { return null; }
  };
  const liked = (await Promise.all((ok.data ?? []).map(small))).filter(Boolean) as Buffer[];
  const disliked = (await Promise.all([...(ko.data ?? []), ...(trash.data ?? [])].map(small))).filter(Boolean) as Buffer[];
  const requests = Array.from(new Set((fixes.data ?? []).map((f: any) => String(f.params?.original ?? f.feedback ?? "").trim()).filter((t: string) => t.length > 8 && !/^Réparation/.test(t)))).slice(0, 50);
  const signals = liked.length + disliked.length + requests.length;
  if (signals < 4) return { love: [], hate: [], signals };
  const prompt = [
    "You are analysing the taste of the art director of the French cosmetics brand Irizée, from their real decisions on AI-generated campaign photos.",
    `The first ${liked.length} image(s) are photos they APPROVED. The next ${disliked.length} image(s) are photos they REJECTED or threw away.`,
    requests.length ? `Their correction requests on other photos (French, raw):\n${requests.map((r) => `- ${r.slice(0, 220)}`).join("\n")}` : "",
    "Deduce what they consistently LIKE and what they consistently REFUSE: light, colours, sets, styling, attitude, how the product is shown and rendered, people, level of realism. Only keep GENERAL, reusable taste rules that would help create future images; ignore one-off defects (a specific finger, a typo on one label).",
    'Write short French phrases (max 16 words each), concrete and actionable. Return JSON only: {"love": [str, max 7], "hate": [str, max 7]}',
  ].filter(Boolean).join("\n\n");
  const parts: Part[] = [{ text: prompt }, ...liked.map((b) => imgPart(b, "image/jpeg")), ...disliked.map((b) => imgPart(b, "image/jpeg"))];
  const r = await gemini(MODELS.vision, parts, { purpose: "apprentissage du goût", json: true, timeoutMs: 90_000 });
  const raw = parseJson<{ love?: unknown[]; hate?: unknown[] }>(firstText(r));
  const clean = (xs: unknown[] | undefined) => (xs ?? []).map((x) => String(x ?? "").trim().slice(0, 160)).filter(Boolean).slice(0, 7);
  return { love: clean(raw.love), hate: clean(raw.hate), signals };
}
