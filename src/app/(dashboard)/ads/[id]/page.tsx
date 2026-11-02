import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdEditor from "@/components/ads/AdEditor";
import type { AdRow } from "@/lib/ads";

export const dynamic = "force-dynamic";

export default async function AdPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const { data: ad } = await sb.from("ads").select("*, products(name)").eq("id", params.id).is("deleted_at", null).single();
  if (!ad) notFound();
  return <AdEditor initial={ad as unknown as AdRow} productName={(ad as any).products?.name ?? "Produit"} isAdmin={profile?.role === "admin"} />;
}
