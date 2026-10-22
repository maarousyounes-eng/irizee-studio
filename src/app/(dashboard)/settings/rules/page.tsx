import { requireAdmin } from "@/components/admin/guard";
import RulesEditor from "@/components/admin/RulesEditor";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const sb = await requireAdmin();
  const { data } = await sb.from("brand_rules").select("id, text, position").order("position");
  return (
    <div>
      <PageHeader title="Règles de marque" subtitle="La mémoire de la plateforme : ces règles sont envoyées à l'IA à chaque génération, correction et déclinaison, pour tous les utilisateurs." />
      <RulesEditor initial={data ?? []} />
    </div>
  );
}
