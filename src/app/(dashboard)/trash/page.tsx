import { createClient } from "@/lib/supabase/server";
import TrashManager from "@/components/studio/TrashManager";
import { PageHeader } from "@/components/ui";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  return (
    <div>
      <PageHeader title="Corbeille" subtitle="Les shootings et les images supprimés restent ici 30 jours : tu peux les restaurer en un clic. Passé ce délai, ils sont effacés définitivement." />
      <TrashManager role={(profile?.role ?? "creator") as Role} />
    </div>
  );
}
