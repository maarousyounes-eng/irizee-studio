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
  }
  const { data: camps } = await sb.from("ad_campaigns").select("id, name, origin, created_at, ad_variants(id, thumb_path, path, starred, state, review_status, deleted_at)").is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  const list = (camps ?? []).map((c: any) => {
    const vs = (c.ad_variants ?? []).filter((v: any) => !v.deleted_at);
    return { ...c, vs, thumbs: vs.filter((v: any) => v.path).slice(0, 3), kept: vs.filter((v: any) => v.starred).length, approved: vs.filter((v: any) => v.review_status === "approved").length };
  });
  return (
    <div>
      <PageHeader title="Ads" subtitle="Une pub que tu aimes ou une idée → un lot de pubs toutes différentes, avec tes vrais produits. Tu gardes les meilleures, tu exportes dans tous les formats." actions={<div className="flex gap-2"><Link href="/ads/brand"><Btn variant="ghost">Charte de marque</Btn></Link><Link href="/ads/new"><Btn>+ Nouvelle campagne</Btn></Link></div>} />
      {!list.length ? <Empty>Aucune campagne pour l&apos;instant. Clique sur « Nouvelle campagne ».</Empty> : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c: any) => (
            <Link key={c.id} href={`/ads/c/${c.id}`} className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden hover:border-[#2B6EE8] transition">
              <div className="grid grid-cols-3 gap-0.5 h-36 bg-[#F4F4F5]">
                {[0, 1, 2].map((i) => c.thumbs[i] ? /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={imgUrl(c.thumbs[i].thumb_path || c.thumbs[i].path)} alt="" className="w-full h-full object-cover" /> : <div key={i} />)}
              </div>
              <div className="p-3 space-y-1">
                <p className="font-semibold">{c.name || "Campagne"}</p>
                <p className="text-xs text-[#52525B]">{c.vs.length} pubs · {c.origin === "inspi" ? "à partir d'une pub" : "à partir d'une idée"} · {new Date(c.created_at).toLocaleDateString("fr-FR")}</p>
                <p className="text-xs"><span className="text-[#92400E] font-semibold">{c.kept} gardées</span> · <span className="text-[#12733A] font-semibold">{c.approved} approuvées</span></p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
