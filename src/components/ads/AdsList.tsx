"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Badge, Card, Empty } from "@/components/ui";
import { imgUrl, useSupabase } from "@/lib/client";

type Item = { id: string; created_at: string; idea: string; hook: string; source_path: string | null; product: string; review_status: string };
const TONE: Record<string, { l: string; t: "gray" | "amber" | "green" | "red" }> = { draft: { l: "Brouillon", t: "gray" }, pending: { l: "En validation", t: "amber" }, approved: { l: "Approuvée", t: "green" }, rejected: { l: "Refusée", t: "red" } };

export default function AdsList({ initial }: { initial: Item[] }) {
  const sb = useSupabase();
  const [items, setItems] = useState(initial);
  async function remove(id: string) {
    if (!confirm("Supprimer cette pub ?")) return;
    await sb.from("ads").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    setItems((x) => x.filter((i) => i.id !== id));
  }
  if (!items.length) return <Empty>Aucune pub pour l&apos;instant. Clique sur « Nouvelle pub ».</Empty>;
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      {items.map((i) => (
        <Card key={i.id} className="overflow-hidden flex flex-col">
          <Link href={`/ads/${i.id}`} className="block aspect-[4/5] bg-[#F4F4F5]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {i.source_path ? <img src={imgUrl(i.source_path)} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
          </Link>
          <div className="p-3 space-y-1.5 flex-1">
            <div className="flex items-center justify-between gap-2"><Badge tone={TONE[i.review_status]?.t ?? "gray"}>{TONE[i.review_status]?.l ?? i.review_status}</Badge>
              <button type="button" onClick={() => remove(i.id)} className="text-[#A0A0A8] hover:text-[#E8444A]" title="Supprimer"><Trash2 size={13} /></button></div>
            <p className="text-sm font-semibold leading-snug line-clamp-2">{i.hook || i.idea}</p>
            <p className="text-[11px] text-[#A0A0A8]">{i.product} · {new Date(i.created_at).toLocaleDateString("fr-FR")}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
