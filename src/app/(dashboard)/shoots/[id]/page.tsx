import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ShootView from "@/components/studio/ShootView";
import type { ImageRow, Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function ShootPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: shoot } = await sb.from("shoots").select("*").eq("id", params.id).single();
  if (!shoot) notFound();
  const [{ data: product }, { data: model }, { data: images }, { data: profile }] = await Promise.all([
    sb.from("products").select("name").eq("id", shoot.product_id).single(),
    shoot.model_id ? sb.from("models").select("name").eq("id", shoot.model_id).single() : Promise.resolve({ data: null }),
    sb.from("images").select("*").eq("shoot_id", shoot.id).order("created_at"),
    sb.from("profiles").select("role, display_name, email").eq("id", user!.id).single(),
  ]);
  return (
    <ShootView
      shoot={shoot}
      productName={product?.name ?? "Produit"}
      modelName={(model as any)?.name ?? null}
      me={{ id: user!.id, name: profile?.display_name || profile?.email || "Moi", role: (profile?.role ?? "creator") as Role }}
      initialImages={(images ?? []) as ImageRow[]}
    />
  );
}
