import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import BrandKitForm from "@/components/ads2/BrandKitForm";

export const dynamic = "force-dynamic";

export default async function BrandKitPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const { data: kit } = await sb.from("brand_kit").select("fonts, colors, logo_path").eq("id", 1).single();
  return (
    <div>
      <PageHeader title="Charte de marque" subtitle="Réglée une seule fois : le mode « texte exact » utilise ces polices et ces couleurs dans toutes les pubs." />
      <BrandKitForm initial={(kit as any) ?? { fonts: "elegant", colors: ["#0A0A0B", "#FFFFFF", "#2B6EE8", "#F3EDE4"], logo_path: null }} />
    </div>
  );
}
