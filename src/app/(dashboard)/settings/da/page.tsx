import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import DAForm from "@/components/admin/DAForm";

export const dynamic = "force-dynamic";

export default async function DAPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const [{ data: kit }, { data: lib }] = await Promise.all([
    sb.from("brand_kit").select("da_love, da_hate, learned_love, learned_hate, learned_at").eq("id", 1).single(),
    sb.from("inspiration_library").select("id, path, summary").order("created_at", { ascending: false }).limit(100),
  ]);
  return (
    <div>
      <PageHeader title="DA de marque et inspirations" subtitle="Écrit une fois, appliqué à toutes les idées et à toutes les images." />
      <DAForm love={kit?.da_love ?? ""} hate={kit?.da_hate ?? ""} library={lib ?? []} learned={{ love: kit?.learned_love ?? [], hate: kit?.learned_hate ?? [], at: kit?.learned_at ?? null }} />
    </div>
  );
}
