import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { FORMATS } from "@/types";

export const dynamic = "force-dynamic";

export default async function ShootsPage() {
  const sb = createClient();
  const { data: shoots } = await sb
    .from("shoots")
    .select("id, prompt, aspect, created_at, products(name), images(path, thumb_path, state, verdict, review_status, score, deleted_at, params)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);

  // Miniature = meilleure image du shooting (vignette légère, servie avec cache navigateur)
  const thumbs: Record<string, string> = {};
  (shoots ?? []).forEach((s: any) => {
    const done = (s.images ?? []).filter((i: any) => i.path && i.state === "done" && !i.params?.archived && !i.deleted_at).sort((a: any, b: any) => (b.score ?? -1) - (a.score ?? -1));
    const best = done[0];
    if (best) thumbs[s.id] = `/api/img?p=${encodeURIComponent(best.thumb_path ?? best.path)}`;
  });

  return (
    <div>
      <PageHeader title="Shootings" subtitle="L'historique de tous les shootings, avec leur état de validation." />
      {!shoots?.length ? (
        <Empty>Aucun shooting pour l&apos;instant. <Link href="/studio" className="text-[#2B6EE8] font-semibold">Créer le premier</Link></Empty>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shoots.map((s: any) => {
            const imgs = (s.images ?? []).filter((i: any) => !i.deleted_at && !i.params?.archived);
            const gen = imgs.filter((i: any) => i.state === "generating").length;
            const valid = imgs.filter((i: any) => i.verdict === "valid").length;
            const pending = imgs.filter((i: any) => i.review_status === "pending").length;
            const approved = imgs.filter((i: any) => i.review_status === "approved").length;
            return (
              <Link key={s.id} href={`/shoots/${s.id}`}>
                <Card className="overflow-hidden hover:border-[#2B6EE8] transition h-full">
                  <div className="aspect-[4/5] bg-[#F4F4F5] relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {thumbs[s.id] ? <img src={thumbs[s.id]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-xs text-[#A0A0A8]">{gen ? "Génération en cours…" : "Aucune image"}</div>}
                    <div className="absolute top-2 left-2"><Badge tone="blue" className="bg-white/95">{FORMATS[s.aspect]?.short ?? s.aspect}</Badge></div>
                  </div>
                  <div className="p-3.5">
                    <p className="text-sm font-semibold truncate">{s.products?.name ?? "Produit"}</p>
                    <p className="text-xs text-[#6B6B72] line-clamp-2 mt-0.5">{s.prompt}</p>
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      <Badge>{imgs.length} images</Badge>
                      {valid > 0 && <Badge tone="green">{valid} validées</Badge>}
                      {pending > 0 && <Badge tone="blue">{pending} à valider</Badge>}
                      {approved > 0 && <Badge tone="green">{approved} approuvées</Badge>}
                      {gen > 0 && <Badge tone="amber">{gen} en cours</Badge>}
                    </div>
                    <p className="text-[11px] text-[#A0A0A8] mt-2">{new Date(s.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
