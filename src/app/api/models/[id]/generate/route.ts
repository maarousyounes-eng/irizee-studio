import { requireUser, handle, HttpError } from "@/lib/api";
import { MODELS, gemini, firstImage } from "@/lib/gemini";
import { modelSheetPrompt } from "@/lib/prompts";

export const maxDuration = 120;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const { data: m } = await sb.from("models").select("*").eq("id", params.id).single();
    if (!m) throw new HttpError(404, "Mannequin introuvable");
    await sb.from("models").update({ state: "generating", error: null }).eq("id", m.id);
    try {
      const r = await gemini(MODELS.pro, [{ text: modelSheetPrompt({ name: m.name, description: m.description }) }], { image: true, aspect: "3:4", size: "1K" });
      const buf = firstImage(r);
      if (!buf) throw new Error("Aucune image renvoyée");
      const path = `models/${m.id}-${Date.now()}.png`;
      const up = await sb.storage.from("studio").upload(path, buf, { contentType: "image/png", upsert: true });
      if (up.error) throw new Error(up.error.message);
      await sb.from("models").update({ state: "ready", path }).eq("id", m.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      await sb.from("models").update({ state: "error", error: msg.slice(0, 300) }).eq("id", m.id);
      throw new HttpError(502, msg);
    }
    return { ok: true };
  });
}
