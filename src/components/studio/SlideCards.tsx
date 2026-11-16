"use client";

import { INPUT } from "@/components/ui";
import { SLIDE_LAYOUTS, SLIDE_ZONES, type Slide } from "@/lib/visualTypes";

/** Les slides d'un carrousel, modifiables : mise en page, place du texte, photo à créer, titre et petit texte. */
export default function SlideCards({ slides, onChange }: { slides: Slide[]; onChange: (slides: Slide[]) => void }) {
  const set = (i: number, p: Partial<Slide>) => onChange(slides.map((x, k) => (k === i ? { ...x, ...p } : x)));
  return (
    <div className="space-y-2">
      {slides.map((x, i) => (
        <div key={i} className="rounded-2xl border border-[#E4E4E7] bg-white p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold w-14 shrink-0">Slide {i + 1}</span>
            <select aria-label={`Mise en page de la slide ${i + 1}`} className={INPUT + " !w-auto !py-1.5 text-xs"} value={x.layout} onChange={(e) => set(i, { layout: e.target.value as Slide["layout"] })}>
              {SLIDE_LAYOUTS.filter((l) => i > 0 || l.id !== "text").map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <select aria-label={`Place du texte, slide ${i + 1}`} className={INPUT + " !w-auto !py-1.5 text-xs"} value={x.zone} onChange={(e) => set(i, { zone: e.target.value as Slide["zone"] })}>
              {SLIDE_ZONES.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
            </select>
          </div>
          {x.layout !== "text" && (
            <input className={INPUT} value={x.photo} onChange={(e) => set(i, { photo: e.target.value })} aria-label={`Photo de la slide ${i + 1}`}
              placeholder={i === 0 ? "Photo : ex. le tube posé sur une pierre claire, lumière douce" : "Photo à créer (vide : l'IA décide)"} />
          )}
          <div className="grid sm:grid-cols-[1fr_1.4fr] gap-2">
            <input className={INPUT} value={x.title} maxLength={80} onChange={(e) => set(i, { title: e.target.value })} aria-label={`Titre de la slide ${i + 1}`} placeholder="Titre" />
            <input className={INPUT} value={x.body} maxLength={220} onChange={(e) => set(i, { body: e.target.value })} aria-label={`Texte de la slide ${i + 1}`} placeholder="Petit texte (facultatif)" />
          </div>
        </div>
      ))}
    </div>
  );
}
