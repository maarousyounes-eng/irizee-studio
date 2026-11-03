import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import NewCampaign from "@/components/ads2/NewCampaign";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const [{ data: products }, { data: imgs }] = await Promise.all([
    sb.from("products").select("id, name").order("name"),
    sb.from("images").select("id, path, thumb_path, verdict, review_status, shoots!inner(product_id, product_ids, deleted_at)").eq("state", "done").is("deleted_at", null).not("path", "is", null).order("created_at", { ascending: false }).limit(300),
  ]);
  const pics = (imgs ?? []).filter((i: any) => !i.shoots?.deleted_at && (i.review_status === "approved" || i.verdict === "valid")).map((i: any) => ({
    id: i.id as string, path: i.path as string, thumb: (i.thumb_path as string | null) ?? null,
    productIds: [i.shoots?.product_id, ...((i.shoots?.product_ids as string[] | null) ?? [])].filter(Boolean) as string[],
  }));
  return (
    <div>
      <PageHeader title="Nouvelle campagne" subtitle="Pas de modèle imposé : l'IA invente une mise en page différente pour chaque pub." />
      <NewCampaign products={products ?? []} pics={pics} />
    </div>
  );
}
