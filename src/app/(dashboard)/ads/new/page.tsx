import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import Library, { type LibImage } from "@/components/ads3/Library";

export const dynamic = "force-dynamic";

/** Nouvelle pub : on choisit des visuels déjà créés dans Shooting, puis on pose les textes. */
export default async function NewAdPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const { data: imgs } = await sb.from("images")
    .select("id, path, thumb_path, kind, aspect, variant_index, verdict, params, created_at, shoot_id, shoots!inner(visual_type, prompt, aspect, deleted_at)")
    .eq("state", "done").is("deleted_at", null).not("path", "is", null).neq("kind", "format")
    .order("created_at", { ascending: false }).limit(500);
  const list: LibImage[] = (imgs ?? [])
    .filter((i: any) => !i.shoots?.deleted_at && i.verdict !== "rejected" && !i.params?.archived)
    .map((i: any) => ({
      id: i.id, path: i.path, thumb: i.thumb_path ?? null, aspect: i.aspect || i.shoots?.aspect || "4:5", vi: i.variant_index ?? 0,
      shootId: i.shoot_id, type: i.shoots?.visual_type ?? "photo", prompt: String(i.shoots?.prompt ?? ""), createdAt: i.created_at,
    }));
  return (
    <div>
      <PageHeader title="Nouvelle pub" subtitle="Choisissez un ou plusieurs visuels de vos shootings. Ils ne seront jamais modifiés : vous posez seulement vos textes par-dessus." />
      <Library images={list} />
    </div>
  );
}
