import { requireAdmin } from "@/components/admin/guard";
import { PageHeader } from "@/components/ui";
import BenchmarkRunner from "@/components/admin/BenchmarkRunner";

export const dynamic = "force-dynamic";

export default async function BenchmarkPage() {
  const sb = await requireAdmin();
  const { data } = await sb.from("shoots").select("id, prompt, created_at, products(name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(20);
  const shoots = (data ?? []).map((s: any) => ({ id: s.id as string, label: `${s.products?.name ?? "Produit"} · ${new Date(s.created_at).toLocaleDateString("fr-FR")} · ${String(s.prompt).slice(0, 50)}` }));
  return (
    <div>
      <PageHeader title="Comparatif de modèles" subtitle="Même demande, mêmes références (packshot, mannequin, inspiration), plusieurs modèles d'image. Les résultats sont mélangés : tu choisis les meilleurs sans savoir qui les a faits." />
      <BenchmarkRunner shoots={shoots} />
    </div>
  );
}
