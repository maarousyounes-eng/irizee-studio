import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Empty } from "@/components/ui";
import type { AdItem } from "@/components/ads3/AdCanvas";
import { adCode, codeRange, currentTexts, parseContext } from "@/lib/decline";
import DeclineForm from "./DeclineForm";

export const dynamic = "force-dynamic";

// Arrivée depuis Irizée Brand (bouton « Décliner ») : /ads/decliner?code=IZ-XXXXXX&focus=…&ctr=…
export default async function DeclinePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");

  const code = String(searchParams.code ?? "").toUpperCase();
  const range = codeRange(code);
  const header = <PageHeader title="Décliner une pub" subtitle="Mêmes visuels, nouveaux textes : l'IA propose des variantes à tester, à partir des résultats de la pub dans Irizée Brand." />;
  if (!range) return <div className="space-y-6">{header}<Empty>Code de pub manquant ou invalide. Ouvre cette page depuis le bouton « Décliner » de l&apos;onglet Pubs d&apos;Irizée Brand.</Empty></div>;

  const { data: found } = await sb.from("ad_designs").select("id, name, fmt, items, parent_id").gte("id", range[0]).lte("id", range[1]).is("deleted_at", null).limit(1);
  const d = found?.[0];
  if (!d) {
    const { data: old } = await sb.from("ad_variants").select("campaign_id").gte("id", range[0]).lte("id", range[1]).limit(1);
    return (
      <div className="space-y-6">{header}
        <Empty>
          {old?.[0]
            ? <>La pub {code} vient d&apos;une ancienne campagne : elle ne peut pas être déclinée automatiquement. <Link className="text-[#2B6EE8] font-semibold" href={`/ads/c/${old[0].campaign_id}`}>Ouvrir la campagne</Link>, ou recrée-la dans l&apos;éditeur Ads.</>
            : <>Aucune pub ne porte le code {code} dans Studio.</>}
        </Empty>
      </div>
    );
  }

  const items = (d.items ?? []) as AdItem[];
  const { data: children } = await sb.from("ad_designs").select("id, name, created_at").eq("parent_id", d.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(20);
  return (
    <div className="space-y-6">
      {header}
      <DeclineForm
        design={{ id: d.id, name: d.name || "Pub", code: adCode(d.id), thumb: items.find((i) => i.path)?.path ?? null, aspect: d.fmt }}
        texts={currentTexts(items)}
        context={parseContext(searchParams)}
        existing={(children ?? []).map((c) => ({ id: c.id, name: c.name, code: adCode(c.id) }))}
      />
    </div>
  );
}
