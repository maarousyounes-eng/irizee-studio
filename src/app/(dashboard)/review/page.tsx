import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReviewBoard from "@/components/studio/ReviewBoard";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role, display_name, email").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/shoots");
  return (
    <div>
      <PageHeader title="Validation" subtitle="Les images soumises par l'équipe et les créateurs. Seules les images approuvées sont prêtes à être publiées." />
      <ReviewBoard me={{ id: user!.id, name: profile?.display_name || profile?.email || "Moi", role: profile!.role }} />
    </div>
  );
}
