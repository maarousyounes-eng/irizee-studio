"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, ImagePlus, X } from "lucide-react";
import { Btn, INPUT, Label, Modal, Spinner } from "@/components/ui";
import { uploadImage, useSupabase } from "@/lib/client";

export interface Zone { x: number; y: number; w: number; h: number }

// Corrections fréquentes : un clic pré-remplit une consigne claire, à compléter si besoin.
const PRESETS: { label: string; text: string }[] = [
  { label: "Elle tient le produit", text: "Elle doit tenir le produit dans sa main : les doigts entourent le produit, l'étiquette bien visible face à l'objectif, à sa taille réelle. Il ne doit plus flotter." },
  { label: "Main / doigts", text: "Corrige la main : cinq doigts naturels, bonne anatomie et bonnes proportions." },
  { label: "Texte du produit", text: "Le texte sur le produit est faux ou illisible : corrige-le exactement comme sur le packshot." },
  { label: "Produit trop grand", text: "Réduis la taille du produit : il doit être à l'échelle réelle par rapport à la main et au corps." },
  { label: "Produit trop petit", text: "Agrandis le produit et rapproche-le de l'objectif, en gardant une échelle réaliste." },
  { label: "Peau trop lisse", text: "Redonne de la texture à la peau : pores fins visibles, sans lissage, et des sourcils dessinés poil par poil." },
  { label: "Lumière", text: "Change la lumière : plus " },
  { label: "Couleur de la tenue", text: "Change la couleur de la tenue en " },
  { label: "Fond / décor", text: "Change le fond : " },
  { label: "Pose / regard", text: "Change la pose : " },
  { label: "Enlever un élément", text: "Supprime de l'image : " },
];

export interface BaseVersion { id: string; label: string; url: string }

interface Props {
  bases: BaseVersion[];
  currentId: string;
  aspect: string;
  isStaff: boolean;
  onClose: () => void;
  onSubmit: (v: { feedback: string; zone: Zone | null; remember: boolean; refs: string[]; baseId: string }) => Promise<void> | void;
}

export default function CorrectionModal({ bases, currentId, aspect, isStaff, onClose, onSubmit }: Props) {
  const [baseId, setBaseId] = useState(currentId);
  const base = bases.find((b) => b.id === baseId) ?? bases[bases.length - 1];
  const imageUrl = base.url;
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [text, setText] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const sb = useSupabase();
  const fileRef = useRef<HTMLInputElement>(null);
  const [refs, setRefs] = useState<{ path: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [refError, setRefError] = useState<string | null>(null);

  async function addRefs(files: File[]) {
    const list = files.filter((f) => f.type.startsWith("image/")).slice(0, 3 - refs.length);
    if (!list.length) return;
    setRefError(null); setUploading((n) => n + list.length);
    try {
      const { data: { user } } = await sb.auth.getUser();
      for (const f of list) {
        const path = await uploadImage(sb, `corrections/${user!.id}`, f, 1400);
        setRefs((r) => [...r, { path, preview: URL.createObjectURL(f) }]);
        setUploading((n) => n - 1);
      }
    } catch (e) { setRefError(e instanceof Error ? e.message : "Envoi impossible"); setUploading(0); }
  }

  // Ctrl+V : coller directement une capture d'écran
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const fs = Array.from(e.clipboardData?.files ?? []); if (fs.length) { e.preventDefault(); addRefs(fs); } };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs.length]);

  const pt = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e: React.PointerEvent) => { box.current!.setPointerCapture(e.pointerId); start.current = pt(e); setZone(null); };
  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const p = pt(e), s = start.current;
    setZone({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const up = () => { start.current = null; setZone((z) => (z && z.w > 0.03 && z.h > 0.03 ? z : null)); };

  async function apply() {
    setBusy(true);
    try { await onSubmit({ feedback: text.trim(), zone, remember, refs: refs.map((r) => r.path), baseId }); } finally { setBusy(false); }
  }

  return (
    <Modal title="Corriger cette image" onClose={onClose} wide>
      <div className="grid md:grid-cols-[minmax(0,320px)_1fr] gap-6">
        <div>
          {bases.length > 1 && (
            <div className="mb-4">
              <Label>Partir de quelle version ?</Label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {bases.map((b) => (
                  <button key={b.id} onClick={() => { setBaseId(b.id); setZone(null); }} className={`flex-shrink-0 w-16 text-left rounded-lg border-2 overflow-hidden ${b.id === baseId ? "border-[#2B6EE8]" : "border-[#E4E4E7] opacity-70 hover:opacity-100"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.url} alt={b.label} className="w-full aspect-[4/5] object-cover" />
                    <span className="block text-[9px] font-semibold px-1 py-0.5 truncate">{b.label}</span>
                  </button>
                ))}
              </div>
              {bases.length >= 4 && <p className="text-[11px] text-[#B45309] mt-1">Cette image a déjà {bases.length - 1} corrections successives : à chaque régénération la qualité peut se dégrader. Repars plutôt d&apos;une version précédente.</p>}
            </div>
          )}
          <Label>1. Entoure la zone concernée <span className="normal-case tracking-normal font-normal">(facultatif)</span></Label>
          <div ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up}
            className="relative rounded-xl overflow-hidden border border-[#E4E4E7] cursor-crosshair touch-none select-none bg-[#F4F4F5]" style={{ aspectRatio: aspect.replace(":", " / ") }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
            {zone && <div className="absolute border-2 border-[#2B6EE8] bg-[#2B6EE8]/15 rounded-md pointer-events-none" style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.w * 100}%`, height: `${zone.h * 100}%` }} />}
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] text-[#6B6B72]">
            <span className="flex items-center gap-1"><Crosshair size={12} /> {zone ? "Zone sélectionnée : seule cette partie sera modifiée" : "Glisse sur l'image pour cibler une zone"}</span>
            {zone && <button onClick={() => setZone(null)} className="flex items-center gap-0.5 text-[#E8444A] font-semibold"><X size={11} /> Effacer</button>}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>2. Choisis un cas fréquent <span className="normal-case tracking-normal font-normal">(ou écris directement)</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => setText(p.text)} className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold border border-[#E4E4E7] bg-white text-[#6B6B72] hover:border-[#2B6EE8] hover:text-[#2B6EE8] transition">{p.label}</button>
              ))}
            </div>
          </div>
          <div>
            <Label>3. Dis ce que tu veux changer</Label>
            <textarea className={INPUT + " min-h-[110px]"} value={text} onChange={(e) => setText(e.target.value)} autoFocus
              placeholder="Ex : la main de gauche a six doigts / le flacon est trop grand / enlève les lunettes. Tu peux écrire plusieurs demandes à la suite, une par ligne." />
            <p className="text-[11px] text-[#A0A0A8] mt-1">Écris comme tu parles. La plateforme génère 1 version et la vérifie (ta demande est-elle faite ? rien d&apos;autre n&apos;a-t-il changé ?). Si ce n&apos;est pas le cas, elle réessaie seule, jusqu&apos;à 2 fois. Le « Compris : … » sur la carte te montre comment ta demande a été interprétée.</p>
          </div>
          <div>
            <Label>4. Montre une référence <span className="normal-case tracking-normal font-normal">(facultatif)</span></Label>
            <div onClick={() => refs.length < 3 && fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addRefs(Array.from(e.dataTransfer.files)); }}
              className="border-2 border-dashed border-[#E4E4E7] rounded-xl p-3 text-center text-[12px] text-[#6B6B72] cursor-pointer hover:border-[#2B6EE8] hover:bg-[#EBF2FF]/40 transition">
              <ImagePlus className="inline mr-1.5 text-[#A0A0A8]" size={14} />
              Colle une capture (Ctrl+V), glisse une image ou clique : la pose, la main ou l&apos;élément que tu veux
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addRefs(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            {(refs.length > 0 || uploading > 0) && (
              <div className="flex gap-2 mt-2">
                {refs.map((r, i) => (
                  <div key={r.path} className="relative w-16 h-20 rounded-lg overflow-hidden border border-[#E4E4E7] bg-[#F4F4F5]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.preview} alt="Référence" className="w-full h-full object-cover" />
                    <button onClick={() => setRefs(refs.filter((_, k) => k !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center" aria-label="Retirer"><X size={10} /></button>
                  </div>
                ))}
                {uploading > 0 && <div className="w-16 h-20 rounded-lg border border-dashed border-[#E4E4E7] flex items-center justify-center"><Spinner /></div>}
              </div>
            )}
            {refError && <p className="text-[11px] text-[#E8444A] mt-1">{refError}</p>}
            <p className="text-[11px] text-[#A0A0A8] mt-1">Elle sert d&apos;exemple de ce que tu veux (pose, geste, disposition). Le visage, la marque et le texte de la référence ne sont jamais copiés.</p>
          </div>
          {isStaff && (
            <label className="flex items-start gap-2 text-[12px] text-[#6B6B72]">
              <input type="checkbox" className="mt-0.5" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Retenir cette consigne pour ce produit <span className="text-[#A0A0A8]">(l&apos;erreur ne reviendra plus sur les prochains shootings)</span></span>
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <Btn onClick={apply} disabled={busy || uploading > 0 || !text.trim()}>{busy || uploading > 0 ? "Envoi…" : "Appliquer la correction"}</Btn>
            <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}
