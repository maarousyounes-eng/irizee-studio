import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProductsManager from "@/components/admin/ProductsManager";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const { data } = await sb.from("products").select("*, product_images(id, path, position)").order("created_at");
  return (
    <div>
      <PageHeader title="Produits" subtitle="Les packshots de référence. La plateforme lit les textes de l'emballage : ils servent ensuite à contrôler chaque image générée." />
      <ProductsManager initial={(data ?? []) as any} userId={user!.id} />
    </div>
  );
}
