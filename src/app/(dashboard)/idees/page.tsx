import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import ConceptGenerator from "@/components/studio/ConceptGenerator";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const { data: products } = await sb.from("products").select("id, name").order("name");
  return (
    <div>
      <PageHeader title="Idées de campagne" subtitle="Un objectif, un canal, un moment de l'année : l'IA propose des concepts complets, dans votre goût. Rien n'est généré en image ici." />
      <ConceptGenerator products={products ?? []} userId={user!.id} />
    </div>
  );
}
