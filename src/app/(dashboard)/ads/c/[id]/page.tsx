import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CampaignView, { type V } from "@/components/ads2/CampaignView";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const [{ data: c }, { data: vs }, { data: kit }] = await Promise.all([
    sb.from("ad_campaigns").select("id, name, engine").eq("id", params.id).is("deleted_at", null).single(),
    sb.from("ad_variants").select("*").eq("campaign_id", params.id).is("deleted_at", null).order("idx"),
    sb.from("brand_kit").select("fonts, colors, logo_path").eq("id", 1).single(),
  ]);
  if (!c) notFound();
  return <CampaignView campaign={c} initial={(vs ?? []) as V[]} kit={(kit as any) ?? { fonts: "elegant", colors: ["#0A0A0B", "#FFFFFF", "#2B6EE8", "#F3EDE4"], logo_path: null }} isAdmin={profile?.role === "admin"} />;
}
