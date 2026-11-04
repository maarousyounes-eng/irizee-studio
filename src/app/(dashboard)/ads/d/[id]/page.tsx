import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Editor from "@/components/ads3/Editor";
import type { AdItem } from "@/components/ads3/AdCanvas";

export const dynamic = "force-dynamic";

export default async function AdDesignPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (profile?.role === "creator") redirect("/studio");
  const [{ data: d }, { data: kit }] = await Promise.all([
    sb.from("ad_designs").select("id, name, fmt, items, deleted_at").eq("id", params.id).single(),
    sb.from("brand_kit").select("fonts, colors, logo_path").eq("id", 1).single(),
  ]);
  if (!d || d.deleted_at) notFound();
  const items = (d.items ?? []) as AdItem[];
  // Déclinaisons de format déjà faites dans Shooting (l'image refaite par l'IA au bon format)
  const ids = Array.from(new Set(items.map((i) => i.image_id)));
  const formats: Record<string, Record<string, string>> = {};
  if (ids.length) {
    const { data: fs } = await sb.from("images").select("parent_id, aspect, path, created_at").in("parent_id", ids).eq("kind", "format").eq("state", "done").is("deleted_at", null).not("path", "is", null).order("created_at", { ascending: true });
    for (const f of fs ?? []) { if (f.parent_id && f.aspect) (formats[f.parent_id] ??= {})[f.aspect] = f.path as string; }
  }
  return <Editor design={{ id: d.id, name: d.name, fmt: d.fmt, items }} kit={{ fonts: kit?.fonts ?? "elegant", colors: kit?.colors ?? [], logo_path: kit?.logo_path ?? null }} formats={formats} />;
}
