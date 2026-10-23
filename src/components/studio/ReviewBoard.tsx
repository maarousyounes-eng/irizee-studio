"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, Check, Download, MessageSquare, X } from "lucide-react";
import { Badge, Btn, Card, Empty, Lightbox, Spinner } from "@/components/ui";
import Comments from "./Comments";
import { signUrls, useSignedUrls, useSupabase } from "@/lib/client";
import { FORMATS } from "@/types";

type Tab = "pending" | "approved" | "rejected";
const TABS: { k: Tab; label: string }[] = [{ k: "pending", label: "À valider" }, { k: "approved", label: "Approuvées" }, { k: "rejected", label: "Refusées" }];

export default function ReviewBoard({ me }: { me: { id: string; name: string; role: string } }) {
  const sb = useSupabase();
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<any[] | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [zipping, setZipping] = useState(false);

  const load = useCallback(async () => {
    const { data } = await sb.from("images")
      .select("id, path, thumb_path, aspect, kind, version, score, verdict, review_status, created_by, created_at, qc, shoot_id, shoots(prompt, products(name))")
      .eq("review_status", tab).is("deleted_at", null).not("path", "is", null).order("created_at", { ascending: false }).limit(100);
    setRows(data ?? []);
  }, [sb, tab]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const urls = useSignedUrls((rows ?? []).flatMap((r) => [r.path, r.thumb_path]));

  async function decide(r: any, status: "approved" | "rejected" | "draft") {
    let comment: string | null = null;
    if (status === "rejected") { comment = prompt("Motif du refus (sera visible par la personne qui a soumis l'image) :"); if (comment === null) return; }
    const { error } = await sb.from("images").update({ review_status: status }).eq("id", r.id);
    if (error) return alert(error.message);
    if (comment?.trim()) await sb.from("comments").insert({ image_id: r.id, user_id: me.id, body: comment.trim(), author_name: me.name, author_role: me.role });
    load();
  }

  const name = (r: any) => `irizee_${String(r.shoots?.products?.name ?? "produit").toLowerCase().replace(/[^a-z0-9]+/g, "-")}_${String(r.aspect ?? "").replace(":", "x")}_${r.id.slice(0, 6)}.${String(r.path ?? "").split(".").pop() ?? "jpg"}`;

  async function zipAll() {
    if (!rows?.length) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const u = await signUrls(sb, rows.map((r) => r.path));
      await Promise.all(rows.map(async (r) => zip.file(name(r), await (await fetch(u[r.path])).blob())));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      a.download = `irizee_images-approuvees_${new Date().toISOString().slice(0, 10)}.zip`; a.click();
    } finally { setZipping(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${tab === t.k ? "bg-[#2B6EE8] text-white border-[#2B6EE8]" : "bg-white text-[#6B6B72] border-[#E4E4E7] hover:bg-[#F4F4F5]"}`}>{t.label}</button>
        ))}
        {tab === "approved" && !!rows?.length && <Btn size="sm" variant="soft" className="ml-auto" onClick={zipAll} disabled={zipping}>{zipping ? <Spinner /> : <Archive size={13} />} Tout télécharger (ZIP)</Btn>}
      </div>
      {rows === null ? <div className="py-10 text-center"><Spinner /></div> : rows.length === 0 ? (
        <Empty>{tab === "pending" ? "Rien à valider pour le moment." : "Aucune image ici."}</Empty>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((r) => (
            <Card key={r.id} className="overflow-hidden flex flex-col">
              <div className="bg-[#F4F4F5]" style={{ aspectRatio: String(r.aspect ?? "4:5").replace(":", " / ") }}>
                {urls[r.path] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[r.thumb_path ?? r.path] ?? urls[r.path]} alt="" loading="lazy" decoding="async" onClick={() => setZoom(urls[r.path])} className="w-full h-full object-cover cursor-zoom-in" /> : <div className="w-full h-full flex items-center justify-center"><Spinner /></div>}
              </div>
              <div className="p-3.5 space-y-2 text-[12px] flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{r.shoots?.products?.name}</p>
                  <Badge tone="blue">{FORMATS[r.aspect]?.short ?? r.aspect}</Badge>
                </div>
                <p className="text-[#6B6B72] line-clamp-2">{r.shoots?.prompt}</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.score !== null && <Badge tone={r.verdict === "valid" ? "green" : r.verdict === "review" ? "amber" : "red"}>Contrôle {r.score}/100</Badge>}
                  <Link href={`/shoots/${r.shoot_id}`} className="text-[11px] text-[#2B6EE8] font-semibold self-center">Voir le shooting →</Link>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tab !== "approved" && <Btn size="sm" onClick={() => decide(r, "approved")}><Check size={12} /> Approuver</Btn>}
                  {tab !== "rejected" && <Btn size="sm" variant="danger" onClick={() => decide(r, "rejected")}><X size={12} /> Refuser</Btn>}
                  {tab !== "pending" && <Btn size="sm" variant="ghost" onClick={() => decide(r, "draft")}>Brouillon</Btn>}
                  {urls[r.path] && <a href={urls[r.path]} download={name(r)} className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-xl border border-[#E4E4E7] hover:bg-[#F4F4F5]"><Download size={12} /></a>}
                  <Btn size="sm" variant="ghost" onClick={() => setOpen({ ...open, [r.id]: !open[r.id] })}><MessageSquare size={12} /></Btn>
                </div>
                {open[r.id] && <Comments imageId={r.id} me={me} />}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
