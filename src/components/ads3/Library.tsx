"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Empty, Spinner } from "@/components/ui";
import { imgUrl, useSupabase } from "@/lib/client";
import { VISUAL_TYPES, imageLabel, typeName } from "@/lib/visualTypes";
import type { AdItem } from "./AdCanvas";
import { defaultEls } from "./defaults";

export interface LibImage { id: string; path: string; thumb: string | null; aspect: string; vi: number; shootId: string; type: string; prompt: string; createdAt: string }
interface Entry { key: string; type: string; label: string; cover: LibImage; images: LibImage[] }

export default function Library({ images }: { images: LibImage[] }) {
  const sb = useSupabase();
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Un carrousel = une seule entrée (la dernière version de chaque slide, dans l'ordre) ; le reste = une entrée par image
  const entries = useMemo(() => {
    const out: Entry[] = [];
    const carousels = new Map<string, Map<number, LibImage>>();
    for (const i of images) {
      if (i.type === "carousel") {
        const m = carousels.get(i.shootId) ?? new Map<number, LibImage>();
        if (!m.has(i.vi)) m.set(i.vi, i); // les images arrivent de la plus récente à la plus ancienne
        if (!carousels.has(i.shootId)) { carousels.set(i.shootId, m); out.push({ key: `c:${i.shootId}`, type: "carousel", label: "", cover: i, images: [] }); }
      } else {
        const lab = imageLabel(i.type, i.vi);
        out.push({ key: i.id, type: i.type, label: `${typeName(i.type)}${lab ? ` · ${lab}` : ""} · ${i.prompt.slice(0, 60)}`, cover: i, images: [i] });
      }
    }
    for (const e of out) {
      if (e.type !== "carousel") continue;
      const m = carousels.get(e.cover.shootId)!;
      e.images = Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
      e.cover = e.images[0];
      e.label = `Carrousel · ${e.images.length} slides · ${e.cover.prompt.slice(0, 60)}`;
    }
    return out;
  }, [images]);

  const shown = entries.filter((e) => filter === "all" || e.type === filter);
  const chosen = picked.map((k) => entries.find((e) => e.key === k)).filter(Boolean) as Entry[];
  const nImages = chosen.reduce((s, e) => s + e.images.length, 0);

  async function open() {
    setBusy(true); setErr(null);
    const items: AdItem[] = chosen.flatMap((e) => e.images.map((i, k) => ({
      key: `${i.id}-${k}`, image_id: i.id, path: i.path, aspect: i.aspect,
      label: e.type === "carousel" ? `Slide ${k + 1}` : (imageLabel(i.type, i.vi) ?? typeName(i.type)),
      els: defaultEls(`${i.id}-${k}`),
    })));
    const { data, error } = await sb.from("ad_designs").insert({ name: `Pub du ${new Date().toLocaleDateString("fr-FR")}`, items, fmt: items[0]?.aspect && ["4:5", "1:1", "9:16", "16:9"].includes(items[0].aspect) ? items[0].aspect : "4:5" }).select("id").single();
    if (error || !data) { setErr(error?.message ?? "Création impossible"); setBusy(false); return; }
    router.push(`/ads/d/${data.id}`);
  }

  const chip = (on: boolean) => `px-3 py-2 rounded-full text-xs font-semibold border transition ${on ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#1F55BC]" : "border-[#E4E4E7] bg-white text-[#3F3F46] hover:bg-[#F4F4F5]"}`;

  if (!entries.length) return <Empty>Aucun visuel pour l&apos;instant : créez-en d&apos;abord dans Shooting.</Empty>;
  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={chip(filter === "all")} onClick={() => setFilter("all")}>Tout</button>
        {VISUAL_TYPES.map((t) => <button key={t.id} type="button" className={chip(filter === t.id)} onClick={() => setFilter(t.id)}>{t.name}</button>)}
      </div>
      {!shown.length ? <Empty>Aucun visuel de ce type.</Empty> : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((e) => {
            const idx = picked.indexOf(e.key);
            const on = idx >= 0;
            return (
              <button key={e.key} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((k) => k !== e.key) : [...picked, e.key])}
                className={`text-left bg-white rounded-2xl p-1.5 border-2 transition ${on ? "border-[#2B6EE8]" : "border-transparent hover:border-[#E4E4E7]"}`}>
                <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-[#F4F4F5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgUrl(e.cover.thumb || e.cover.path)} alt="" loading="lazy" className="w-full h-full object-cover" />
                  {e.type === "carousel" && (
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex gap-0.5">
                      {e.images.slice(1, 6).map((i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i.id} src={imgUrl(i.thumb || i.path)} alt="" className="w-7 h-9 rounded object-cover border border-white" />)}
                    </div>
                  )}
                  {on && <span className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-[#2B6EE8] text-white text-xs font-bold flex items-center justify-center">{idx + 1}</span>}
                </div>
                <p className="text-[11px] text-[#3F3F46] mt-1.5 px-0.5 line-clamp-2">{e.label}</p>
              </button>
            );
          })}
        </div>
      )}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur border-t border-[#E4E4E7] px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#52525B]">{picked.length ? `${picked.length} visuel${picked.length > 1 ? "s" : ""} choisi${picked.length > 1 ? "s" : ""} · ${nImages} image${nImages > 1 ? "s" : ""} à habiller` : "Cliquez sur les visuels à utiliser (dans l'ordre voulu)"}</p>
          <div className="flex items-center gap-2">
            {err && <span className="text-xs text-red-700">{err}</span>}
            <Btn onClick={open} disabled={!picked.length || busy}>{busy ? <Spinner className="border-white/40 border-t-white" /> : null} Ouvrir dans l&apos;éditeur →</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
