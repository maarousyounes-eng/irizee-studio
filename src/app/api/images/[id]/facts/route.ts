import { requireUser, handle, HttpError } from "@/lib/api";
import { download } from "@/lib/generation";
import { withAiCtx } from "@/lib/gemini";
import { factCheck } from "@/lib/facts";

export const maxDuration = 120;

/** Mesures d'une image (taille du produit, visage), sans rien enregistrer : sert à vérifier le contrôle lui-même. */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const { sb, user, profile } = await requireUser();
    if (profile.role === "creator") throw new HttpError(403, "Réservé à l'équipe");
    const { data: img } = await sb.from("images").select("path, shoot_id, params, shoots(no_product, no_people, product_id, products(real_size))").eq("id", params.id).single();
    if (!img?.path) throw new HttpError(404, "Image introuvable");
    const sh = (img as any).shoots;
    const full = await download(sb, String((img.params as any)?.master_path ?? img.path));
    return withAiCtx({ sb, userId: user.id, shootId: img.shoot_id, imageId: params.id }, () => factCheck(full, { hasProduct: !sh?.no_product, realSize: sh?.products?.real_size, people: !sh?.no_people }));
  });
}
