"use client";

import "@fontsource/playfair-display/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/archivo-black/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import { forwardRef, type CSSProperties } from "react";
import { FONT_PAIRS, PALETTES, SAFE_9x16, type AdFormat, type AdTexts } from "@/lib/ads";
import { imgUrl } from "@/lib/client";

export interface AdLook { texts: AdTexts; template: string; fonts: string; palette: string; focus: { x: number; y: number }; src: string | null }

/** Taille de police qui diminue quand le texte s'allonge. */
const fit = (text: string, base: number, chars: number) => Math.round(base * Math.min(1, Math.sqrt(chars / Math.max(1, text.length))));

/** Rendu d'une pub à sa taille réelle (px) : sert à l'aperçu (réduit en CSS) et à l'export PNG. */
const AdCanvas = forwardRef<HTMLDivElement, AdLook & { format: AdFormat; showSafe?: boolean }>(function AdCanvas({ texts: t, template, fonts, palette, focus, src, format, showSafe }, ref) {
  const W = format.w, H = format.h;
  const u = Math.min(W, H) / 100;
  const F = FONT_PAIRS[fonts] ?? FONT_PAIRS.elegant;
  const P = PALETTES[palette] ?? PALETTES.light;
  const vertical = format.key === "9x16";
  const landscape = format.key === "191x1";
  const pad = 6 * u;
  // marges : zones d'interface à éviter en 9:16
  const top = vertical ? H * SAFE_9x16.top : pad;
  const bottom = vertical ? H * SAFE_9x16.bottom : pad;
  const left = vertical ? W * SAFE_9x16.side : pad;
  const right = vertical ? W * SAFE_9x16.right : pad;

  const title = (size: number, extra: CSSProperties = {}): CSSProperties => ({ fontFamily: F.title, fontWeight: F.titleWeight, fontSize: size, lineHeight: 1.08, letterSpacing: "-0.01em", margin: 0, ...extra });
  const body = (size: number, weight = 400, extra: CSSProperties = {}): CSSProperties => ({ fontFamily: F.body, fontWeight: weight, fontSize: size, lineHeight: 1.3, margin: 0, ...extra });
  const cta = t.cta ? <span style={{ ...body(3.4 * u, 700), display: "inline-block", background: P.accent, color: P.accentText, borderRadius: 999, padding: `${1.7 * u}px ${4.2 * u}px`, boxShadow: "0 4px 18px rgba(0,0,0,0.18)" }}>{t.cta}</span> : null;
  const badge = (size: number) => t.badge ? (
    <div style={{ width: size, height: size, borderRadius: "50%", background: P.accent, color: P.accentText, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", ...title(fit(t.badge, size * 0.3, 5)), transform: "rotate(-8deg)" }}>{t.badge}</div>
  ) : null;
  const bullets = (size: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: size * 0.45 }}>
      {t.bullets.filter(Boolean).slice(0, 3).map((b, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: size * 0.5 }}>
          <span style={{ ...body(size, 700), color: P.accent === P.panel ? P.text : P.accent }}>✓</span>
          <span style={{ ...body(size, 500), color: P.text }}>{b}</span>
        </div>
      ))}
    </div>
  );
  const photo = (style: CSSProperties = {}) => src
    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl(src)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${focus.x}% ${focus.y}%`, ...style }} />
    : <div style={{ position: "absolute", inset: 0, background: "#E4E4E7", ...style }} />;

  let content: React.ReactNode;

  if (landscape) {
    // Paysage : photo à gauche, texte à droite (tous modèles)
    content = (
      <>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: W * 0.55, overflow: "hidden" }}>{photo()}</div>
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: W * 0.45, background: P.panel, padding: `${5 * u}px ${6 * u}px`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 * u, color: P.text }}>
          {template === "promo" && t.badge ? <div style={{ ...body(3.4 * u, 700), alignSelf: "flex-start", background: P.accent, color: P.accentText, borderRadius: 999, padding: `${0.8 * u}px ${2.6 * u}px` }}>{t.badge}</div> : null}
          {template === "review" && t.quote ? (
            <>
              <div style={{ ...body(4.4 * u, 700), color: "#F5B300", letterSpacing: "0.1em" }}>★★★★★</div>
              <p style={title(fit(t.quote, 6 * u, 60))}>« {t.quote} »</p>
              {t.quote_author ? <p style={body(3 * u, 500, { opacity: 0.75 })}>— {t.quote_author}</p> : null}
            </>
          ) : (
            <p style={title(fit(t.hook || t.headline, 8.4 * u, 26))}>{t.hook || t.headline}</p>
          )}
          {template === "benefits" ? bullets(3.6 * u) : t.headline && t.hook && template !== "review" ? <p style={body(3.8 * u, 500, { opacity: 0.85 })}>{t.headline}</p> : null}
          <div>{cta}</div>
        </div>
      </>
    );
  } else if (template === "promo") {
    content = (
      <>
        {photo()}
        <div style={{ position: "absolute", top, right }}>{badge(22 * u)}</div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: vertical ? bottom : 0, padding: `${5 * u}px ${left}px ${vertical ? 5 * u : 6 * u}px`, background: P.panel, color: P.text, display: "flex", flexDirection: "column", gap: 2.6 * u }}>
          <p style={title(fit(t.hook || t.headline, 8.2 * u, 24))}>{t.hook || t.headline}</p>
          {t.hook && t.headline ? <p style={body(3.8 * u, 500, { opacity: 0.85 })}>{t.headline}</p> : null}
          <div>{cta}</div>
        </div>
      </>
    );
  } else if (template === "benefits") {
    const split = vertical ? 0 : format.key === "1x1" ? 0.52 : 0.56;
    content = vertical ? (
      <>
        {photo()}
        <div style={{ position: "absolute", left, right, bottom, background: P.panel, color: P.text, borderRadius: 4 * u, padding: 6 * u, display: "flex", flexDirection: "column", gap: 3.4 * u }}>
          <p style={title(fit(t.headline || t.hook, 7.4 * u, 26))}>{t.headline || t.hook}</p>
          {bullets(4.2 * u)}
          <div>{cta}</div>
        </div>
      </>
    ) : (
      <>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: H * split, overflow: "hidden" }}>{photo()}</div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: H * (1 - split), background: P.panel, color: P.text, padding: `${4.4 * u}px ${pad}px`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2.6 * u }}>
          <p style={title(fit(t.headline || t.hook, 6.8 * u, 28))}>{t.headline || t.hook}</p>
          {bullets(3.6 * u)}
          <div>{cta}</div>
        </div>
      </>
    );
  } else if (template === "review") {
    content = (
      <>
        {photo()}
        <div style={{ position: "absolute", left, right: vertical ? right : pad, bottom, background: P.panel, color: P.text, borderRadius: 4 * u, padding: 5.4 * u, display: "flex", flexDirection: "column", gap: 2.2 * u, boxShadow: "0 10px 40px rgba(0,0,0,0.18)" }}>
          <div style={{ ...body(5 * u, 700), color: "#F5B300", letterSpacing: "0.12em" }}>★★★★★</div>
          <p style={title(fit(t.quote || "Ajoutez un vrai avis client", 5.6 * u, 70))}>« {t.quote || "Ajoutez un vrai avis client"} »</p>
          {t.quote_author ? <p style={body(3.2 * u, 500, { opacity: 0.75 })}>— {t.quote_author}</p> : null}
          {cta ? <div style={{ marginTop: u }}>{cta}</div> : null}
        </div>
      </>
    );
  } else if (template === "tiktok") {
    const lightBox = palette === "light" || palette === "sand";
    content = (
      <>
        {photo()}
        <div style={{ position: "absolute", left: left, right: right, top: vertical ? H * 0.56 : H * 0.62, textAlign: "center" }}>
          <span style={{ ...body(fit(t.hook || t.headline, 5.6 * u, 40), 700), lineHeight: 1.55, background: lightBox ? "#FFFFFF" : "#0A0A0B", color: lightBox ? "#0A0A0B" : "#FFFFFF", padding: `${0.6 * u}px ${1.6 * u}px`, borderRadius: 1.2 * u, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{t.hook || t.headline}</span>
        </div>
      </>
    );
  } else {
    // « hook » : grande accroche en haut, bouton en bas
    content = (
      <>
        {photo()}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: H * 0.48, background: `linear-gradient(to bottom, ${P.shade} 0%, ${P.shade} 22%, rgba(0,0,0,0) 100%)` }} />
        <div style={{ position: "absolute", left, right, top, color: P.text, display: "flex", flexDirection: "column", gap: 2.2 * u }}>
          <p style={title(fit(t.hook || t.headline, 9.4 * u, 22))}>{t.hook || t.headline}</p>
          {t.hook && t.headline ? <p style={body(4 * u, 500, { opacity: 0.9 })}>{t.headline}</p> : null}
        </div>
        {cta ? <div style={{ position: "absolute", left, bottom }}>{cta}</div> : null}
      </>
    );
  }

  return (
    <div ref={ref} style={{ width: W, height: H, position: "relative", overflow: "hidden", background: P.panel }}>
      {content}
      {showSafe && vertical ? (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: H * SAFE_9x16.top, background: "rgba(232,68,74,0.28)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: H * SAFE_9x16.bottom, background: "rgba(232,68,74,0.28)" }} />
          <div style={{ position: "absolute", right: 0, top: H * SAFE_9x16.top, bottom: H * SAFE_9x16.bottom, width: W * SAFE_9x16.right, background: "rgba(232,68,74,0.18)" }} />
        </>
      ) : null}
    </div>
  );
});

export default AdCanvas;
