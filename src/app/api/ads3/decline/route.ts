import sharp from "sharp";
import { requireUser, handle, HttpError } from "@/lib/api";
import { MODELS, gemini, imgPart, firstText, parseJson, withAiCtx } from "@/lib/gemini";
import { download } from "@/lib/generation";
import type { AdItem } from "@/components/ads3/AdCanvas";
import { adCode, applyVariant, buildPrompt, currentTexts, parseContext, parseFocus, parseVariants, FOCUS_LABELS } from "@/lib/decline";

export const maxDuration = 60;

/**
 * Crée des déclinaisons d'une pub : mêmes visuels, nouveaux textes proposés par l'IA à partir des
 * résultats envoyés par Irizée Brand. Chaque déclinaison est une nouvelle pub (donc un nouveau code IZ)
 * reliée à la pub d'origine.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const b = await req.json();
    const count = Math.min(5, Math.max(1, Number(b.count) || 3));
    const focus = parseFocus(Array.isArray(b.focus) ? b.focus.join(",") : b.focus);
    const note = String(b.note ?? "").trim().slice(0, 300);
    const ctx = parseContext(b.context ?? {});

    const { data: parent } = await sb.from("ad_designs").select("id, name, fmt, items, deleted_at").eq("id", String(b.designId ?? "")).single();
    if (!parent || parent.deleted_at) throw new HttpError(404, "Pub introuvable");
    const items = (parent.items ?? []) as AdItem[];
    const first = items.find((i) => i.path);
    if (!first) throw new HttpError(400, "Cette pub ne contient aucune image");

    const img = await download(sb, first.path);
    const small = await sharp(img.buf).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const prompt = buildPrompt(ctx, currentTexts(items), count, focus, note);
    const r = await withAiCtx({ sb, userId: user.id }, () =>
      gemini(MODELS.text, [{ text: prompt }, imgPart(small, "image/jpeg")], { purpose: "ads déclinaisons", json: true, timeoutMs: 50_000 })
    );
    let raw: unknown;
    try { raw = parseJson(firstText(r)); } catch { throw new HttpError(502, "L'IA a répondu dans un format inattendu, réessaie."); }
    const variants = parseVariants(raw, focus, count);
    if (!variants.length) throw new HttpError(502, "L'IA n'a proposé aucune variante, réessaie.");

    const base = (parent.name || "Pub").replace(/\s·\sdécl\..*$/, "");
    const rows = variants.map((v, i) => ({
      name: `${base} · décl. ${String.fromCharCode(65 + i)}${v.angle ? ` (${v.angle})` : ""}`,
      fmt: parent.fmt,
      items: applyVariant(items, v, focus),
      parent_id: parent.id,
      decline_context: { ...ctx, focus, note, angle: v.angle, parent_code: adCode(parent.id), changed: focus.map((f) => FOCUS_LABELS[f]) },
    }));
    const { data, error } = await sb.from("ad_designs").insert(rows).select("id, name");
    if (error) throw new HttpError(500, error.message);
    return {
      created: (data ?? []).map((d, i) => ({ id: d.id, name: d.name, code: adCode(d.id), texts: variants[i] })),
    };
  });
}
