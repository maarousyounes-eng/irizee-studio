"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Btn, Card, INPUT, Label, Spinner } from "@/components/ui";
import { api, imgUrl, uploadImage, useSupabase } from "@/lib/client";

interface Item { id: string; path: string; summary: string }

export default function DAForm({ love: love0, hate: hate0, library }: { love: string; hate: string; library: Item[] }) {
  const sb = useSupabase();
  const fileRef = useRef<HTMLInputElement>(null);
  const [love, setLove] = useState(love0);
  const [hate, setHate] = useState(hate0);
  const [saved, setSaved] = useState<"" | "saving" | "ok" | "error">("");
  const [items, setItems] = useState<Item[]>(library);
  const [adding, setAdding] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaved("saving");
    const { error } = await sb.from("brand_kit").update({ da_love: love.trim(), da_hate: hate.trim(), updated_at: new Date().toISOString() }).eq("id", 1);
    setSaved(error ? "error" : "ok");
  }
  async function addFiles(files: File[]) {
    const list = files.filter((f) => f.type.startsWith("image/")).slice(0, 8);
    if (!list.length) return;
    setErr(null); setAdding((n) => n + list.length);
    const { data: { user } } = await sb.auth.getUser();
    for (const f of list) {
      try {
        const path = await uploadImage(sb, `inspirations/${user!.id}`, f, 1400);
        const a = await api<{ analysis: string; summary: string }>("/api/inspirations/analyze", { path }).catch(() => ({ analysis: "", summary: "" }));
        const { data, error } = await sb.from("inspiration_library").insert({ path, analysis: a.analysis, summary: a.summary }).select("id, path, summary").single();
        if (error) throw new Error(error.message);
        if (data) setItems((all) => [data as Item, ...all]);
      } catch (e) { setErr(e instanceof Error ? e.message : "Ajout impossible"); }
      setAdding((n) => n - 1);
    }
  }
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const fs = Array.from(e.clipboardData?.files ?? []); if (fs.length) addFiles(fs); };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function remove(id: string) {
    await sb.from("inspiration_library").delete().eq("id", id);
    setItems((all) => all.filter((x) => x.id !== id));
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start max-w-6xl">
      <Card className="p-5 space-y-4">
        <h2 className="text-base font-semibold">Ma bibliothèque d&apos;inspirations</h2>
        <p className="text-sm text-[#52525B]">Collez (Ctrl+V) ou importez les pubs et photos que vous aimez. L&apos;IA note ce qui les rend fortes, et vous les retrouvez à l&apos;étape « Brief » de chaque campagne.</p>
        <button type="button" onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-[#D4D4D8] rounded-2xl p-5 text-center text-sm text-[#52525B] hover:border-[#2B6EE8]">
          <ImagePlus className="mx-auto mb-1 text-[#6B6B72]" size={20} /> Importer des images
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        {adding > 0 && <p className="text-xs text-[#52525B] flex items-center gap-1.5"><Spinner className="w-3 h-3" /> Ajout et analyse de {adding} image(s)…</p>}
        {err && <p className="text-xs text-[#E8444A]">{err}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((x) => (
            <div key={x.id} className="border border-[#E4E4E7] rounded-2xl p-2 space-y-1.5">
              <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-[#F4F4F5]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl(x.path)} alt="" loading="lazy" className="w-full h-full object-cover" />
                <button type="button" aria-label="Retirer de la bibliothèque" onClick={() => remove(x.id)} className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"><Trash2 size={13} /></button>
              </div>
              <p className="text-[11px] text-[#52525B] leading-snug">{x.summary || "Analyse indisponible."}</p>
            </div>
          ))}
        </div>
        {!items.length && adding === 0 && <p className="text-sm text-[#6B6B72]">Aucune inspiration pour l&apos;instant.</p>}
      </Card>
      <Card className="p-5 space-y-3">
        <h2 className="text-base font-semibold">DA de marque</h2>
        <div>
          <Label>Ce que j&apos;adore</Label>
          <textarea className={INPUT + " min-h-[110px]"} value={love} onChange={(e) => { setLove(e.target.value); setSaved(""); }} placeholder="Marques, styles, ambiances, types de lumière, attitudes…" />
        </div>
        <div>
          <Label>Ce que je refuse</Label>
          <textarea className={INPUT + " min-h-[110px]"} value={hate} onChange={(e) => { setHate(e.target.value); setSaved(""); }} placeholder="Ce que vous ne voulez jamais voir dans une image." />
        </div>
        <Btn onClick={save} disabled={saved === "saving"}>{saved === "saving" ? <Spinner className="border-white/40 border-t-white" /> : null} Enregistrer</Btn>
        {saved === "ok" && <p className="text-xs text-[#14532D]">Enregistré. Appliqué dès la prochaine campagne.</p>}
        {saved === "error" && <p className="text-xs text-[#E8444A]">Enregistrement impossible.</p>}
      </Card>
    </div>
  );
}
