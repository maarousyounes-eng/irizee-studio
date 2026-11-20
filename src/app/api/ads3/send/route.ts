import { requireUser, handle, HttpError } from "@/lib/api";
import { adCode } from "@/lib/decline";

export const maxDuration = 30;

const BRAND_URL = (process.env.BRAND_URL || process.env.NEXT_PUBLIC_BRAND_URL || "https://irizee-brand.com").replace(/\/$/, "");
const CTA = ["SHOP_NOW", "LEARN_MORE", "BUY_NOW", "ORDER_NOW", "SIGN_UP", "GET_OFFER"];

/**
 * « Envoyer en pub » : transmet une pub Studio (image déjà rendue et enregistrée dans le stockage, textes, lien, bouton)
 * à la file « À valider » d'Irizée Brand. Rien n'est publié chez Meta : la création se fait dans Brand, après validation.
 * L'image est partagée par un lien temporaire (30 jours) que Brand puis Meta lisent au moment de la validation.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { sb, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    // secret partagé avec Brand : dédié s'il existe, sinon celui de la connexion unique (même valeur sur les projets)
    const secret = process.env.STUDIO_TO_BRAND_SECRET || process.env.SSO_SHARED_SECRET;
    if (!secret) throw new HttpError(500, "Secret partagé avec Brand manquant dans Vercel (STUDIO_TO_BRAND_SECRET ou SSO_SHARED_SECRET).");

    const b = await req.json();
    const designId = String(b.designId ?? "");
    const path = String(b.path ?? "");
    const text = String(b.primary_text ?? "").trim();
    const link = String(b.link_url ?? "").trim();
    if (!text) throw new HttpError(400, "Écris le texte principal de la pub");
    if (!/^https:\/\/\S+$/.test(link)) throw new HttpError(400, "Lien du site : une adresse https://… est attendue");
    // l'image doit avoir été rendue pour cette pub (dossier ads-out/<id>/)
    if (!path.startsWith(`ads-out/${designId}/`) || path.includes("..")) throw new HttpError(400, "Image invalide");

    const { data: design } = await sb.from("ad_designs").select("id, name, deleted_at").eq("id", designId).single();
    if (!design || design.deleted_at) throw new HttpError(404, "Pub introuvable");

    const { data: signed, error } = await sb.storage.from("studio").createSignedUrl(path, 60 * 60 * 24 * 30);
    if (error || !signed?.signedUrl) throw new HttpError(500, `Lien de l'image impossible : ${error?.message ?? "inconnu"}`);

    const res = await fetch(`${BRAND_URL}/api/marketing/variants/studio`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        studio_code: adCode(design.id), name: design.name, primary_text: text,
        headline: String(b.headline ?? "").trim() || null, link_url: link,
        cta_type: CTA.includes(b.cta_type) ? b.cta_type : "SHOP_NOW",
        image_urls: [{ fmt: String(b.fmt ?? ""), url: signed.signedUrl }],
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(502, `Irizée Brand a refusé la pub : ${j.error ?? res.status}`);
    return { ok: true, id: j.id, reviewUrl: `${BRAND_URL}/pubs?tab=variants` };
  });
}
