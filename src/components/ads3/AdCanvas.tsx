"use client";

import "@fontsource/playfair-display/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/archivo-black/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import { forwardRef, type CSSProperties, type PointerEvent } from "react";
import { FONT_PAIRS } from "@/lib/ads";
import { imgUrl } from "@/lib/client";

export type ElKind = "title" | "sub" | "cta" | "badge" | "logo";
export interface AdEl { id: string; kind: ElKind; text: string; x: number; y: number; size: number; font: "title" | "body" | "impact"; color: string; align?: "left" | "center" | "right"; lh?: number; ls?: number; w?: number }
export interface Band { zone: "top" | "bottom" | "center"; color: string; h: number; opacity?: number; fade?: boolean }

const rgba = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
/** Fond du bandeau : couleur pleine, transparente (opacité) ou en dégradé vers la photo. */
export function bandBackground(b: Band) {
  const a = (b.opacity ?? 100) / 100;
  if (!b.fade) return rgba(b.color, a);
  const dir = b.zone === "top" ? "to bottom" : b.zone === "bottom" ? "to top" : null;
  return dir ? `linear-gradient(${dir}, ${rgba(b.color, a)} 0%, ${rgba(b.color, a * 0.6)} 55%, ${rgba(b.color, 0)} 100%)`
    : `linear-gradient(to bottom, ${rgba(b.color, 0)} 0%, ${rgba(b.color, a)} 30%, ${rgba(b.color, a)} 70%, ${rgba(b.color, 0)} 100%)`;
}
/** Une image de la pub. Sans `path` : slide texte seule sur le fond `bg`. `band` : bandeau de couleur derrière le texte. */
export interface AdItem { key: string; image_id: string; path: string; aspect: string; label: string; els: AdEl[]; bg?: string; band?: Band | null }
export interface Kit { fonts: string; colors: string[]; logo_path: string | null }

/** Taille d'affichage dans l'éditeur et taille réelle à l'export, par format. */
export const AD_FMTS: { key: string; label: string; view: [number, number]; out: [number, number] }[] = [
  { key: "4:5", label: "4:5 · fil", view: [480, 600], out: [1080, 1350] },
  { key: "1:1", label: "1:1 · carré", view: [540, 540], out: [1080, 1080] },
  { key: "9:16", label: "9:16 · story", view: [360, 640], out: [1080, 1920] },
  { key: "16:9", label: "16:9 · paysage", view: [640, 360], out: [1920, 1080] },
];

const lum = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
export const onColor = (hex: string) => (lum(hex) > 150 ? "#0A0A0B" : "#FFFFFF");

export function elStyle(e: AdEl, k: number, kit: Kit, selected: boolean): CSSProperties {
  const F = FONT_PAIRS[kit.fonts] ?? FONT_PAIRS.elegant;
  const family = e.font === "impact" ? "'Archivo Black', sans-serif" : e.font === "body" ? F.body : F.title;
  const weight = e.font === "impact" ? 400 : e.font === "body" ? (e.kind === "sub" ? 400 : 700) : F.titleWeight;
  const s: CSSProperties = {
    position: "absolute", left: `${e.x}%`, top: `${e.y}%`, fontSize: Math.round(e.size * k), lineHeight: e.lh ?? 1.1, fontFamily: family, fontWeight: weight,
    color: e.color, whiteSpace: "pre-line", maxWidth: `${Math.max(20, 98 - e.x)}%`, ...(e.w ? { width: `${Math.min(e.w, 100 - e.x)}%` } : {}), textAlign: e.align ?? "left", boxSizing: "border-box",
    outline: selected ? `${Math.max(2, Math.round(2 * k))}px solid #2B6EE8` : "none", outlineOffset: Math.round(5 * k), cursor: "move", touchAction: "none", userSelect: "none",
  };
  s.letterSpacing = e.ls != null ? `${e.ls / 100}em` : e.kind === "title" ? "-0.01em" : "normal";
  if (e.kind === "cta") Object.assign(s, { fontFamily: F.body, fontWeight: 700, background: e.color, color: onColor(e.color), borderRadius: 999, padding: `${0.6 * e.size * k}px ${1.4 * e.size * k}px`, whiteSpace: "nowrap" });
  if (e.kind === "badge") Object.assign(s, { background: e.color, color: onColor(e.color), borderRadius: "50%", width: `${4.8 * e.size * k}px`, height: `${4.8 * e.size * k}px`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 4 * k, transform: "rotate(-8deg)" });
  return s;
}

/** Une pub : l'image d'origine (jamais modifiée, recadrée au format) et les textes posés par-dessus. */
const AdCanvas = forwardRef<HTMLDivElement, {
  src: string | null; w: number; h: number; els: AdEl[]; kit: Kit; sel?: string | null; bg?: string; band?: Band | null;
  onElDown?: (id: string, e: PointerEvent<HTMLDivElement>) => void; onElMove?: (e: PointerEvent<HTMLDivElement>) => void; onElUp?: () => void; onBg?: () => void;
}>(function AdCanvas({ src, w, h, els, kit, sel, bg, band, onElDown, onElMove, onElUp, onBg }, ref) {
  const k = Math.min(w, h) / 480;
  return (
    <div ref={ref} onPointerDown={onBg} style={{ width: w, height: h, position: "relative", overflow: "hidden", background: src ? "#E4E4E7" : bg || "#F3EDE4", flex: "none" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={imgUrl(src)} alt="" crossOrigin="anonymous" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /> : null}
      {band ? <div style={{ position: "absolute", left: 0, right: 0, height: `${band.h}%`, background: bandBackground(band), pointerEvents: "none", ...(band.zone === "top" ? { top: 0 } : band.zone === "bottom" ? { bottom: 0 } : { top: `${50 - band.h / 2}%` }) }} /> : null}
      {els.map((e) => (
        <div key={e.id} style={elStyle(e, k, kit, sel === e.id)}
          onPointerDown={onElDown ? (ev) => { ev.stopPropagation(); onElDown(e.id, ev); } : undefined}
          onPointerMove={onElMove} onPointerUp={onElUp} onPointerCancel={onElUp}>
          {e.kind === "logo" && kit.logo_path
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={imgUrl(kit.logo_path)} alt="Logo" crossOrigin="anonymous" draggable={false} style={{ height: Math.round(e.size * k * 1.3), width: "auto", display: "block", pointerEvents: "none" }} />
            : e.kind === "logo" ? <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, letterSpacing: "-0.02em" }}>{e.text || "irizée"}</span>
            : e.text}
        </div>
      ))}
    </div>
  );
});

export default AdCanvas;
