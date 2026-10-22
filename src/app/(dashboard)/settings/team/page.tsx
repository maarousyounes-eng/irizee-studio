import { requireAdmin } from "@/components/admin/guard";
import TeamManager from "@/components/admin/TeamManager";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const sb = await requireAdmin();
  const since = new Date(); since.setUTCDate(1); since.setUTCHours(0, 0, 0, 0);
  const [{ data: profiles }, { data: usage }] = await Promise.all([
    sb.from("profiles").select("id, email, display_name, role, monthly_quota, created_at").order("created_at"),
    sb.from("usage_events").select("user_id, units").gte("created_at", since.toISOString()),
  ]);
  const used: Record<string, number> = {};
  (usage ?? []).forEach((u: any) => { used[u.user_id] = (used[u.user_id] ?? 0) + u.units; });
  return (
    <div>
      <PageHeader title="Équipe & quotas" subtitle="Attribue les rôles et le nombre d'images par mois. Les nouveaux comptes arrivent en « Créateur / agence » sans aucun accès, jusqu'à ce que tu les ajoutes à un projet." />
      <TeamManager initial={(profiles ?? []) as any} used={used} />
    </div>
  );
}
