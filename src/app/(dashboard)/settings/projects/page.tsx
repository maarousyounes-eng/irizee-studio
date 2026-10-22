import { requireAdmin } from "@/components/admin/guard";
import ProjectsManager from "@/components/admin/ProjectsManager";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const sb = await requireAdmin();
  const [projects, members, links, products, profiles] = await Promise.all([
    sb.from("projects").select("*").order("created_at"),
    sb.from("project_members").select("project_id, user_id"),
    sb.from("project_products").select("project_id, product_id"),
    sb.from("products").select("id, name").order("name"),
    sb.from("profiles").select("id, email, display_name, role").order("created_at"),
  ]);
  return (
    <div>
      <PageHeader title="Projets" subtitle="Un projet donne accès à des produits précis à des créateurs ou des agences : ils ne voient que ce qui leur est assigné et soumettent leurs images à ta validation." />
      <ProjectsManager
        projects={projects.data ?? []} members={members.data ?? []} links={links.data ?? []}
        products={products.data ?? []} profiles={(profiles.data ?? []) as any}
      />
    </div>
  );
}
