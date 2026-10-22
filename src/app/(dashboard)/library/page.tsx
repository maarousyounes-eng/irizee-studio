import { createClient } from "@/lib/supabase/server";
import ConceptsLibrary from "@/components/studio/ConceptsLibrary";
import { PageHeader } from "@/components/ui";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const [{ data: concepts }, { data: profile }] = await Promise.all([
    sb.from("concepts").select("*").order("created_at", { ascending: false }),
    sb.from("profiles").select("role").eq("id", user!.id).single(),
  ]);
  return (
    <div>
      <PageHeader title="Bibliothèque de concepts" subtitle="Des directions artistiques prêtes à l'emploi : inspiration + consigne + format. Relance un concept sur n'importe quel produit en un clic." />
      <ConceptsLibrary initial={concepts ?? []} role={(profile?.role ?? "creator") as Role} userId={user!.id} />
    </div>
  );
}
