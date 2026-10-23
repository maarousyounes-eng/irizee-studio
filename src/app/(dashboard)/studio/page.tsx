import { createClient } from "@/lib/supabase/server";
import NewShootForm from "@/components/studio/NewShootForm";
import { PageHeader } from "@/components/ui";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function StudioPage({ searchParams }: { searchParams: { concept?: string; from?: string; product?: string; again?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role, monthly_quota").eq("id", user!.id).single();
  const since = new Date(); since.setUTCDate(1); since.setUTCHours(0, 0, 0, 0);

  const [products, models, concepts, projects, links, usage] = await Promise.all([
    sb.from("products").select("id, name").order("name"),
    sb.from("models").select("id, name, is_brand_model, path").eq("state", "ready").order("is_brand_model", { ascending: false }).order("name"),
    sb.from("concepts").select("id, name, prompt, aspect, inspiration_paths").order("created_at", { ascending: false }),
    sb.from("projects").select("id, name").order("name"),
    sb.from("project_products").select("project_id, product_id"),
    sb.from("usage_events").select("units").eq("user_id", user!.id).gte("created_at", since.toISOString()),
  ]);

  const projectProducts: Record<string, string[]> = {};
  (links.data ?? []).forEach((l: any) => { (projectProducts[l.project_id] ??= []).push(l.product_id); });
  const used = (usage.data ?? []).reduce((n: number, r: any) => n + r.units, 0);

  // « Décliner » depuis une image existante : elle devient l'inspiration du nouveau shooting
  let initial: { inspirationPaths: string[]; productId?: string; aspect?: string } = { inspirationPaths: [] };
  if (searchParams.from) {
    const { data: img } = await sb.from("images").select("path, aspect, shoots(product_id)").eq("id", searchParams.from).single();
    if (img?.path) initial = { inspirationPaths: [img.path], productId: (img as any).shoots?.product_id, aspect: img.aspect ?? undefined };
  }

  // « Recommencer » : mêmes réglages qu'un shooting existant (produit, mannequins, inspirations, consigne, format…)
  let again: { productId: string; projectId: string | null; modelIds: string[]; noPeople: boolean; prompt: string; aspect: string; size: string; engine: string; variants: number; inspirationPaths: string[] } | undefined;
  if (searchParams.again) {
    const { data: sh } = await sb.from("shoots").select("id, project_id, product_id, model_ids, no_people, prompt, aspect, size, engine, inspiration_paths").eq("id", searchParams.again).single();
    if (sh) {
      const { count } = await sb.from("images").select("id", { count: "exact", head: true }).eq("shoot_id", sh.id).eq("kind", "generated");
      again = { productId: sh.product_id, projectId: sh.project_id, modelIds: sh.model_ids ?? [], noPeople: !!sh.no_people, prompt: sh.prompt, aspect: sh.aspect, size: sh.size, engine: sh.engine, variants: Math.min(12, Math.max(1, count ?? 6)), inspirationPaths: sh.inspiration_paths ?? [] };
    }
  }

  return (
    <div>
      <PageHeader
        title="Nouveau shooting"
        subtitle="Choisis un produit, ajoute des images d'inspiration et décris ce que tu veux : chaque image est contrôlée automatiquement avant de t'être proposée."
      />
      <NewShootForm
        role={(profile?.role ?? "creator") as Role}
        products={products.data ?? []}
        models={models.data ?? []}
        concepts={concepts.data ?? []}
        projects={projects.data ?? []}
        projectProducts={projectProducts}
        quota={{ used, limit: profile?.role === "admin" ? null : profile?.monthly_quota ?? 0 }}
        initialConceptId={searchParams.concept}
        initialProductId={searchParams.product}
        initial={initial}
        again={again}
      />
    </div>
  );
}
