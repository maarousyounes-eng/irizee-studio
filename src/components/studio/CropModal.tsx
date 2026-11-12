"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Btn, Modal, Spinner } from "@/components/ui";
import { api, imgUrl } from "@/lib/client";
import { FORMATS } from "@/types";

const CHOICES = ["4:5", "1:1", "9:16", "3:4", "16:9"].filter((k) => FORMATS[k]);

/** Recadrage à la souris : on voit l'image entière, on glisse le cadre du format voulu. Gratuit, rien n'est redessiné. */
export default function CropModal({ image, onClose, onDone }: {
  image: { id: string; path: string; aspect: string | null; params?: Record<string, any> | null };
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const src = (image.params?.master_path as string | undefined) ?? image.path;
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [fmt, setFmt] = useState(image.aspect && CHOICES.includes(image.aspect) ? image.aspect : "4:5");
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 }); // centre du cadre, normalisé
  const [safe, setSafe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const im = new Image();
    im.onload = () => setNat({ w: im.naturalWidth, h: im.naturalHeight });
    im.src = imgUrl(src);
  }, [src]);

  // Le cadre repart de l'ancien cadrage quand on revient sur le format de l'image
  useEffect(() => {
    const c = image.params?.crop as { x: number; y: number; w: number; h: number } | undefined;
    setPos(c && fmt === image.aspect ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : { x: 0.5, y: 0.5 });
  }, [fmt, image.aspect, image.params]);

  const DW = 340; // largeur d'affichage
  const DH = nat ? Math.round((DW * nat.h) / nat.w) : 425;
  const [aw, ah] = fmt.split(":").map(Number);
  const r = aw / ah;
  let fw = DW, fh = DW / r;
  if (fh > DH) { fh = DH; fw = DH * r; }
  const left = Math.max(0, Math.min(DW - fw, pos.x * DW - fw / 2)), top = Math.max(0, Math.min(DH - fh, pos.y * DH - fh / 2));
  const whole = Math.abs(fw - DW) < 1 && Math.abs(fh - DH) < 1;

  const down = (e: PointerEvent<HTMLDivElement>) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ } drag.current = { sx: e.clientX, sy: e.clientY, ox: left, oy: top }; };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const nl = Math.max(0, Math.min(DW - fw, d.ox + e.clientX - d.sx)), nt = Math.max(0, Math.min(DH - fh, d.oy + e.clientY - d.sy));
    setPos({ x: (nl + fw / 2) / DW, y: (nt + fh / 2) / DH });
  };

  async function save() {
    setBusy(true); setErr(null);
    try {
      const r2 = await api<{ replaced: boolean }>(`/api/images/${image.id}/crop`, { aspect: fmt, cx: (left + fw / 2) / DW, cy: (top + fh / 2) / DH });
      onDone(r2.replaced ? "Cadrage enregistré." : `Format ${FORMATS[fmt]?.short ?? fmt} créé à côté de l'image.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); setBusy(false); }
  }

  const chip = (on: boolean) => `px-3 py-2 rounded-full text-xs font-semibold border transition ${on ? "bg-[#EBF2FF] border-[#2B6EE8] text-[#2B6EE8]" : "bg-white border-[#E4E4E7] text-[#0A0A0B] hover:bg-[#F4F4F5]"}`;
  return (
    <Modal title="Formats et recadrage" onClose={onClose} wide>
      <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start">
        <div className="bg-[#E4E4E7] rounded-2xl p-4 flex justify-center">
          {!nat ? <div className="w-[340px] h-[425px] flex items-center justify-center"><Spinner /></div> : (
            <div className="relative overflow-hidden rounded-md select-none" style={{ width: DW, height: DH }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgUrl(src)} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />
              <div onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
                className="absolute box-border border-2 border-white touch-none" style={{ left, top, width: fw, height: fh, boxShadow: "0 0 0 2000px rgba(0,0,0,0.55)", cursor: whole ? "default" : "move" }}>
                {safe && fmt === "9:16" && <>
                  <div className="absolute inset-x-0 top-0 h-[14%] bg-[#E8444A]/35 pointer-events-none" />
                  <div className="absolute inset-x-0 bottom-0 h-[20%] bg-[#E8444A]/35 pointer-events-none" />
                </>}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <p className="text-sm text-[#52525B]">L&apos;image entière créée par l&apos;IA est gardée. Choisissez un format et glissez le cadre : vous voyez exactement ce qui est conservé. C&apos;est gratuit et rien n&apos;est redessiné.</p>
          <div className="flex flex-wrap gap-1.5">
            {CHOICES.map((k) => <button key={k} type="button" className={chip(fmt === k)} onClick={() => setFmt(k)}>{FORMATS[k].short}{k === image.aspect ? " (actuel)" : ""}</button>)}
          </div>
          {fmt === "9:16" && <label className="flex items-center gap-2 text-xs text-[#52525B]"><input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> Afficher les zones couvertes par l&apos;interface Instagram / TikTok (en rouge)</label>}
          <p className="text-xs text-[#6B6B72]">{fmt === image.aspect && image.params?.master_path ? "Même format que l'image : elle sera remplacée par ce nouveau cadrage." : "Un autre format : il sera ajouté à côté de l'image, comme une déclinaison."}</p>
          {err && <p className="text-xs text-[#E8444A]">{err}</p>}
          <div className="flex gap-2">
            <Btn onClick={save} disabled={busy || !nat}>{busy ? <Spinner className="border-white/40 border-t-white" /> : null} Enregistrer ce cadrage</Btn>
            <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}
