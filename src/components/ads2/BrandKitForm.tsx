"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Btn, Card, Label, Spinner } from "@/components/ui";
import { imgUrl, uploadImage, useSupabase } from "@/lib/client";
import { FONT_PAIRS } from "@/lib/ads";
import AdText, { type Kit } from "./AdText";

const COLOR_LABELS = ["Texte foncé", "Texte clair", "Accent (pastille)", "Fond doux"];

export default function BrandKitForm({ initial }: { initial: Kit }) {
  const sb = useSupabase();
  const ref = useRef<HTMLInputElement>(null);
  const [kit, setKit] = useState<Kit>({ ...initial, colors: [...(initial.colors ?? [])] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try { const p = await uploadImage(sb, "brand", files[0], 1200); setKit((k) => ({ ...k, logo_path: p })); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Envoi impossible"); }
    setBusy(false);
  }
  async function save() {
    setBusy(true); setMsg(null);
    const { error } = await sb.from("brand_kit").update({ fonts: kit.fonts, colors: kit.colors, logo_path: kit.logo_path, updated_at: new Date().toISOString() }).eq("id", 1);
    setMsg(error ? "Enregistrement impossible : " + error.message : "Charte enregistrée.");
    setBusy(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start max-w-5xl">
      <Card className="p-4 space-y-5">
        <div>
          <Label>Logo</Label>
          <div className="flex items-center gap-3">
            <div className="w-32 h-16 rounded-xl border border-dashed border-[#A1A1AA] flex items-center justify-center overflow-hidden bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {kit.logo_path ? <img src={imgUrl(kit.logo_path)} alt="Logo" className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-[#52525B]">Aucun logo</span>}
            </div>
            <Btn size="sm" variant="ghost" onClick={() => ref.current?.click()} disabled={busy}><ImagePlus size={12} /> Importer (PNG ou SVG)</Btn>
            <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files)} />
          </div>
        </div>
        <div>
          <Label>Polices (titre + texte)</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(FONT_PAIRS).map(([k, f]) => (
              <button key={k} type="button" onClick={() => setKit({ ...kit, fonts: k })} className={`rounded-xl border-2 px-4 py-2 text-center ${kit.fonts === k ? "border-[#2B6EE8] bg-[#EBF2FF]" : "border-[#E4E4E7] bg-white"}`}>
                <span style={{ fontFamily: f.title, fontWeight: f.titleWeight }} className="block text-xl">Aa</span>
                <span style={{ fontFamily: f.body }} className="block text-[11px] mt-1">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Couleurs</Label>
          <div className="flex flex-wrap gap-4">
            {COLOR_LABELS.map((l, i) => (
              <label key={l} className="flex flex-col items-center gap-1 text-[11px] text-[#52525B]">
                <input type="color" value={kit.colors[i] ?? "#000000"} onChange={(e) => { const c = [...kit.colors]; c[i] = e.target.value; setKit({ ...kit, colors: c }); }} className="w-12 h-12 rounded-lg border border-[#E4E4E7] cursor-pointer" />
                {l}
              </label>
            ))}
          </div>
        </div>
        {msg && <p className="text-sm text-[#1F55BC]">{msg}</p>}
        <Btn onClick={save} disabled={busy}>{busy ? <Spinner /> : null} Enregistrer</Btn>
      </Card>
      <Card className="p-4 space-y-2">
        <p className="text-sm font-semibold">Aperçu (texte exact)</p>
        <div className="rounded-xl overflow-hidden border border-[#E4E4E7]">
          <AdText src={null} w={288} h={360} zone="top" exact hook="L'éclat qui se voit, sans filtre" cta="Découvrir" badge="-20 %" kit={kit} />
        </div>
      </Card>
    </div>
  );
}
