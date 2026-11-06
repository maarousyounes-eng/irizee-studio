import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Btn, Empty, PageHeader } from "@/components/ui";
// (pas d'import depuis lib/client : ce module est réservé au navigateur)
const imgUrl = (path: string) => `/api/img?p=${encodeURIComponent(path)}`;

export const dynamic = "force-dynamic";

export default async function AdsPage({ searchParams }: { searchParams: { code?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  // Lien depuis Irizée Brand : /ads?code=IZ-XXXXXX → la campagne de cette pub
  const hex = String(searchParams.code ?? "").replace(/^IZ-/i, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(hex)) {
    const { data: v } = await sb.from("ad_variants").select("id, campaign_id").gte("id", `${hex}00-0000-0000-0000-000000000000`).lte("id", `${hex}ff-ffff-ffff-ffff-ffffffffffff`).limit(1);
    if (v?.[0]) redirect(`/ads/c/${v[0].campaign_id}#${v[0].id}`);
    const { data: ds } = await sb.from("ad_designs").select("id").gte("id", `${hex}00-0000-0000-0000-000000000000`).lte("id", `${hex}ff-ffff-ffff-ffff-ffffffffffff`).limit(1);
    if (ds?.[0]) redirect(`/ads/d/${ds[0].id}`);
  }
  const { data: designs } = await sb.from("ad_designs").select("id, name, fmt, items, updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(200);
  const { data: camps } = await sb.from("ad_campaigns").select("id, name, origin, created_at, ad_variants(id, thumb_path, path, starred, state, review_status, deleted_at)").is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  const list = (camps ?? []).map((c: any) => {
    const vs = (c.ad_variants ?? []).filter((v: any) => !v.deleted_at);
    return { ...c, vs, thumbs: vs.filter((v: any) => v.path).slice(0, 3), kept: vs.filter((v: any) => v.starred).length, approved: vs.filter((v: any) => v.review_status === "approved").length };
  });
  return (
    <div className="space-y-8">
      <PageHeader title="Ads" subtitle="Prenez des visuels créés dans Shooting et posez vos textes par-dessus : titre, bouton, pastille, logo. Vos images ne sont jamais modifiées." actions={<div className="flex gap-2"><Link href="/ads/brand"><Btn variant="ghost">Charte de marque</Btn></Link><Link href="/ads/new"><Btn>+ Nouvelle pub</Btn></Link></div>} />
      {!(designs ?? []).length ? <Empty>Aucune pub pour l&apos;instant. Cliquez sur « Nouvelle pub » pour choisir vos visuels.</Empty> : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          {(designs ?? []).map((d: any) => {
            const its = (d.items ?? []) as { path: string; els: { kind: string; text: string }[] }[];
            const title = its[0]?.els?.find((e) => e.kind === "title")?.text ?? "";
            return (
              <Link key={d.id} href={`/ads/d/${d.id}`} className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden hover:border-[#2B6EE8] transition">
                <div className="relative aspect-[4/5] bg-[#F4F4F5]">
                  {its.find((x) => x.path)?.path ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl(its.find((x) => x.path)!.path)} alt="" loading="lazy" className="w-full h-full object-cover" /> : null}
                  {its.length > 1 && <span className="absolute top-2 right-2 text-[11px] font-bold bg-white rounded-md px-1.5 py-0.5">{its.length} images</span>}
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-semibold truncate">{d.name || "Pub"}</p>
                  <p className="text-[11px] text-[#52525B] truncate">{title || "Sans titre"} · IZ-{String(d.id).replace(/-/g, "").slice(0, 6).toUpperCase()}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {list.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-[#52525B]">Anciennes campagnes (images générées par l&apos;IA)</h2>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((c: any) => (
              <Link key={c.id} href={`/ads/c/${c.id}`} className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden hover:border-[#2B6EE8] transition">
                <div className="grid grid-cols-3 gap-0.5 h-28 bg-[#F4F4F5]">
                  {[0, 1, 2].map((i) => c.thumbs[i] ? /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={imgUrl(c.thumbs[i].thumb_path || c.thumbs[i].path)} alt="" className="w-full h-full object-cover" /> : <div key={i} />)}
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm">{c.name || "Campagne"}</p>
                  <p className="text-xs text-[#52525B]">{c.vs.length} pubs · {new Date(c.created_at).toLocaleDateString("fr-FR")}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
