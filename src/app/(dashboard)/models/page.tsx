import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ModelsManager from "@/components/admin/ModelsManager";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const { data } = await sb.from("models").select("*").order("is_brand_model", { ascending: false }).order("created_at");
  return (
    <div>
      <PageHeader title="Mannequins" subtitle="Des mannequins fictifs créés par l'IA. Un mannequin de la marque garde exactement le même visage d'un shooting à l'autre." />
      <ModelsManager initial={(data ?? []) as any} userId={user!.id} />
    </div>
  );
}
