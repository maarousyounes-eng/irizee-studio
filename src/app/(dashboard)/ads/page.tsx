import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Btn, PageHeader } from "@/components/ui";
import AdsList from "@/components/ads/AdsList";

export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const { data } = await sb.from("ads").select("id, created_at, idea, texts, source_path, review_status, products(name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  const items = (data ?? []).map((a: any) => ({ id: a.id, created_at: a.created_at, idea: a.idea, hook: a.texts?.hook ?? "", source_path: a.source_path, product: a.products?.name ?? "", review_status: a.review_status }));
  return (
    <div>
      <PageHeader title="Ads" subtitle="Visuels publicitaires pour Meta, TikTok et Google : une photo de tes shootings, des textes proposés par l'IA, posés avec une vraie police (toujours exacts), dans tous les formats." actions={<Link href="/ads/new"><Btn>Nouvelle pub</Btn></Link>} />
      <AdsList initial={items} />
    </div>
  );
}
