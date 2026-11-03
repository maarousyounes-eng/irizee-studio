"use client";

import "@fontsource/playfair-display/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/archivo-black/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import { forwardRef, useEffect, useState, type CSSProperties } from "react";
import { FONT_PAIRS } from "@/lib/ads";
import { imgUrl } from "@/lib/client";

export type Zone = "top" | "bottom" | "left" | "right" | "center";
export interface Kit { fonts: string; colors: string[]; logo_path: string | null }

const fit = (text: string, base: number, chars: number) => Math.round(base * Math.min(1, Math.sqrt(chars / Math.max(1, text.length))));

/** Luminosité moyenne de la zone de texte (0 sombre → 255 clair), pour choisir un texte noir ou blanc. */
function useZoneLight(src: string | null, zone: Zone) {
  const [light, setLight] = useState<number | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 60; c.height = 75;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, 60, 75);
        const box = zone === "top" ? [0, 0, 60, 26] : zone === "bottom" ? [0, 49, 60, 26] : zone === "left" ? [0, 15, 30, 45] : zone === "right" ? [30, 15, 30, 45] : [10, 28, 40, 20];
        const d = ctx.getImageData(box[0], box[1], box[2], box[3]).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (alive) setLight(sum / (d.length / 4));
      } catch { if (alive) setLight(200); }
    };
    img.onerror = () => alive && setLight(200);
    img.src = imgUrl(src);
    return () => { alive = false; };
  }, [src, zone]);
  return light;
}

/** Une pub à sa taille réelle : l'image, et en mode « texte exact » le titre, le bouton et la pastille posés avec la police de la charte. */
const AdText = forwardRef<HTMLDivElement, {
  src: string | null; w: number; h: number; zone: Zone; exact: boolean; hook: string; cta: string; badge: string; kit: Kit;
}>(function AdText({ src, w, h, zone, exact, hook, cta, badge, kit }, ref) {
  const light = useZoneLight(exact ? src : null, zone);
  const F = FONT_PAIRS[kit.fonts] ?? FONT_PAIRS.elegant;
  const dark = kit.colors[0] || "#0A0A0B", white = kit.colors[1] || "#FFFFFF", accent = kit.colors[2] || "#2B6EE8";
  const textColor = light == null || light > 140 ? dark : white;
  const u = Math.min(w, h) / 100;
  const pad = 7 * u;
  const pos: CSSProperties =
    zone === "top" ? { top: pad, left: pad, right: pad } :
    zone === "bottom" ? { bottom: pad, left: pad, right: pad } :
    zone === "left" ? { top: h * 0.3, left: pad, width: w * 0.46 } :
    zone === "right" ? { top: h * 0.3, right: pad, width: w * 0.46, alignItems: "flex-end", textAlign: "right" } :
    { top: h * 0.4, left: w * 0.12, right: w * 0.12, alignItems: "center", textAlign: "center" };
  return (
    <div ref={ref} style={{ width: w, height: h, position: "relative", overflow: "hidden", background: "#F4F4F5" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={imgUrl(src)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      {exact && (
        <>
          <div style={{ position: "absolute", display: "flex", flexDirection: "column", gap: 2.6 * u, color: textColor, ...pos }}>
            <p style={{ margin: 0, fontFamily: F.title, fontWeight: F.titleWeight, fontSize: fit(hook, 9 * u, 22), lineHeight: 1.06, letterSpacing: "-0.01em" }}>{hook}</p>
            {cta ? <span style={{ alignSelf: zone === "center" ? "center" : zone === "right" ? "flex-end" : "flex-start", fontFamily: F.body, fontWeight: 700, fontSize: 3.4 * u, background: textColor === dark ? dark : white, color: textColor === dark ? white : dark, borderRadius: 999, padding: `${1.6 * u}px ${4 * u}px` }}>{cta}</span> : null}
          </div>
          {badge ? (
            <div style={{ position: "absolute", [zone === "bottom" ? "top" : "bottom"]: pad, right: pad, width: 20 * u, height: 20 * u, borderRadius: "50%", background: accent, color: white, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: F.title, fontWeight: F.titleWeight, fontSize: fit(badge, 6 * u, 5), transform: "rotate(-8deg)" }}>{badge}</div>
          ) : null}
        </>
      )}
    </div>
  );
});

export default AdText;
