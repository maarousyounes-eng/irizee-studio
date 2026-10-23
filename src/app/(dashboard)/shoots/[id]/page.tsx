import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ShootView from "@/components/studio/ShootView";
import type { ImageRow, Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function ShootPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: shoot } = await sb.from("shoots").select("*").eq("id", params.id).single();
  if (!shoot || shoot.deleted_at) notFound();
  const [{ data: product }, { data: model }, { data: images }, { data: profile }] = await Promise.all([
    sb.from("products").select("name").eq("id", shoot.product_id).single(),
    (shoot.model_ids?.length ? sb.from("models").select("name").in("id", shoot.model_ids) : Promise.resolve({ data: [] })),
    sb.from("images").select("*").eq("shoot_id", shoot.id).is("deleted_at", null).order("created_at"),
    sb.from("profiles").select("role, display_name, email").eq("id", user!.id).single(),
  ]);
  return (
    <ShootView
      shoot={shoot}
      productName={product?.name ?? "Produit"}
      modelNames={((model as any[]) ?? []).map((m) => m.name)}
      me={{ id: user!.id, name: profile?.display_name || profile?.email || "Moi", role: (profile?.role ?? "creator") as Role }}
      initialImages={(images ?? []) as ImageRow[]}
    />
  );
}
