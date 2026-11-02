"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { Download, RefreshCw, Archive, Check, Send, X } from "lucide-react";
import { Badge, Btn, Card, INPUT, Label, Spinner } from "@/components/ui";
import { api, useSupabase } from "@/lib/client";
import { AD_FORMATS, CTAS, EMPTY_TEXTS, EXPORTS, FONT_PAIRS, PALETTES, TEMPLATES, type AdFormat, type AdRow, type AdTexts } from "@/lib/ads";
import AdCanvas from "./AdCanvas";

const PREVIEW_W = 260;
const STATUS: Record<AdRow["review_status"], { label: string; tone: "gray" | "amber" | "green" | "red" }> = {
  draft: { label: "Brouillon", tone: "gray" }, pending: { label: "En validation", tone: "amber" }, approved: { label: "Approuvée", tone: "green" }, rejected: { label: "Refusée", tone: "red" },
};

export default function AdEditor({ initial, productName, isAdmin }: { initial: AdRow; productName: string; isAdmin: boolean }) {
  const sb = useSupabase();
  const [ad, setAd] = useState<AdRow>({ ...initial, texts: { ...EMPTY_TEXTS, ...initial.texts, google: { ...EMPTY_TEXTS.google, ...(initial.texts?.google ?? {}) } } });
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showSafe, setShowSafe] = useState(true);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const first = useRef(true);

  // Enregistrement automatique (0,7 s après la dernière modification)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved(false);
    const tm = setTimeout(async () => {
      const { error } = await sb.from("ads").update({ idea: ad.idea, angles: ad.angles, angle: ad.angle, texts: ad.texts, template: ad.template, fonts: ad.fonts, palette: ad.palette, focus: ad.focus, review_status: ad.review_status, updated_at: new Date().toISOString() }).eq("id", ad.id);
      if (error) setMsg("Enregistrement impossible : " + error.message); else setSaved(true);
    }, 700);
    return () => clearTimeout(tm);
  }, [ad, sb]);

  const t = ad.texts;
  const setT = (patch: Partial<AdTexts>) => setAd((a) => ({ ...a, texts: { ...a.texts, ...patch } }));
  const setG = (patch: Partial<AdTexts["google"]>) => setAd((a) => ({ ...a, texts: { ...a.texts, google: { ...a.texts.google, ...patch } } }));
  const look = useMemo(() => ({ texts: t, template: ad.template, fonts: ad.fonts, palette: ad.palette, focus: ad.focus, src: ad.source_path }), [t, ad.template, ad.fonts, ad.palette, ad.focus, ad.source_path]);

  async function regenerate() {
    setBusy("copy"); setMsg(null);
    try {
      const r = await api<{ angles: AdTexts[] }>(`/api/ads/${ad.id}/copy`, { idea: ad.idea });
      setAd((a) => ({ ...a, angles: r.angles }));
      setMsg("Nouvelles propositions prêtes : clique sur l'une d'elles pour l'appliquer.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erreur"); }
    setBusy(null);
  }

  function applyAngle(i: number) {
    const x = ad.angles[i];
    if (!x) return;
    // garde un avis déjà saisi à la main
    setAd((a) => ({ ...a, angle: i, texts: { ...EMPTY_TEXTS, ...x, google: { ...EMPTY_TEXTS.google, ...x.google }, quote: x.quote || a.texts.quote, quote_author: x.quote_author || a.texts.quote_author } }));
  }

  async function renderPng(f: AdFormat) {
    const node = refs.current[f.key];
    if (!node) throw new Error("Aperçu introuvable");
    await document.fonts.ready;
    return toPng(node, { width: f.w, height: f.h, pixelRatio: 1, cacheBust: false });
  }

  function textFile() {
    const g = t.google;
    return [
      `Pub Irizée — ${productName}`, `Idée : ${ad.idea}`, "",
      "=== META (Instagram / Facebook) ===", `Texte principal : ${t.primary_text}`, `Titre : ${t.headline}`, `Bouton : ${t.cta}`, "",
      "=== TIKTOK ===", `Légende : ${t.tiktok_caption}`, "",
      "=== GOOGLE ===", ...g.headlines.map((h, i) => `Titre ${i + 1} : ${h}`), `Titre long : ${g.long_headline}`, ...g.descriptions.map((d, i) => `Description ${i + 1} : ${d}`),
    ].join("\n");
  }

  async function downloadOne(f: AdFormat) {
    setBusy(f.key);
    try {
      const url = await renderPng(f);
      const a = document.createElement("a"); a.href = url; a.download = `irizee-ad-${f.key}.png`; a.click();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Export impossible"); }
    setBusy(null);
  }

  async function downloadZip() {
    setBusy("zip"); setMsg(null);
    try {
      const zip = new JSZip();
      const cache: Record<string, string> = {};
      for (const ex of EXPORTS) {
        const f = AD_FORMATS.find((x) => x.key === ex.format)!;
        cache[f.key] ??= await renderPng(f);
        zip.file(ex.file, cache[f.key].split(",")[1], { base64: true });
      }
      zip.file("textes.txt", textFile());
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `irizee-ads-${productName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.zip`; a.click();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Export impossible"); }
    setBusy(null);
  }

  const field = (label: string, value: string, onChange: (v: string) => void, max?: number, area = false) => (
    <div>
      <div className="flex justify-between items-baseline"><Label>{label}</Label>{max ? <span className={`text-[10px] ${value.length > max ? "text-[#E8444A] font-semibold" : "text-[#A0A0A8]"}`}>{value.length}/{max}</span> : null}</div>
      {area ? <textarea className={INPUT} rows={3} value={value} onChange={(e) => onChange(e.target.value)} /> : <input className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/ads" className="text-xs text-[#6B6B72] hover:text-[#0A0A0B]">← Toutes les pubs</Link>
          <Badge tone={STATUS[ad.review_status].tone}>{STATUS[ad.review_status].label}</Badge>
          <span className="text-[11px] text-[#A0A0A8]">{saved ? "Enregistré" : "Enregistrement…"}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {ad.review_status === "draft" && <Btn size="sm" variant="soft" onClick={() => setAd((a) => ({ ...a, review_status: "pending" }))}><Send size={12} /> Soumettre à validation</Btn>}
          {isAdmin && ad.review_status !== "approved" && <Btn size="sm" onClick={() => setAd((a) => ({ ...a, review_status: "approved" }))}><Check size={12} /> Approuver</Btn>}
          {isAdmin && ad.review_status !== "rejected" && ad.review_status !== "draft" && <Btn size="sm" variant="danger" onClick={() => setAd((a) => ({ ...a, review_status: "rejected" }))}><X size={12} /> Refuser</Btn>}
          <Btn size="sm" onClick={downloadZip} disabled={!!busy}>{busy === "zip" ? <Spinner /> : <Archive size={13} />} Tout télécharger (ZIP)</Btn>
        </div>
      </div>
      {msg && <p className="text-sm text-[#2B6EE8] bg-[#EBF2FF] rounded-xl px-3 py-2">{msg}</p>}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Réglages */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <Label>Idée de la pub</Label>
            <textarea className={INPUT} rows={2} value={ad.idea} onChange={(e) => setAd((a) => ({ ...a, idea: e.target.value }))} />
            <Btn size="sm" variant="soft" onClick={regenerate} disabled={!!busy}>{busy === "copy" ? <Spinner /> : <RefreshCw size={12} />} Nouvelles propositions de textes</Btn>
            {ad.angles.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-[#6B6B72]">Propositions de l&apos;IA (clique pour appliquer) :</p>
                {ad.angles.map((x, i) => (
                  <button key={i} type="button" onClick={() => applyAngle(i)} className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition ${ad.angle === i ? "border-[#2B6EE8] bg-[#EBF2FF]" : "border-[#E4E4E7] hover:bg-[#F4F4F5]"}`}>
                    <span className="font-semibold">{x.name || `Angle ${i + 1}`}</span> · {x.hook}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <p className="text-sm font-semibold">Textes sur l&apos;image</p>
            {field("Accroche (gros texte)", t.hook, (v) => setT({ hook: v }), 45)}
            {field("Titre", t.headline, (v) => setT({ headline: v }), 40)}
            <div>
              <Label>Bouton</Label>
              <select className={INPUT} value={t.cta} onChange={(e) => setT({ cta: e.target.value })}>
                <option value="">— Pas de bouton —</option>
                {CTAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {field("Pastille (ex. -20 %, Nouveau) — seulement si c'est vrai", t.badge, (v) => setT({ badge: v }), 12)}
            {[0, 1, 2].map((i) => <div key={i}>{field(`Bénéfice ${i + 1}`, t.bullets[i] ?? "", (v) => { const b = [...t.bullets]; b[i] = v; setT({ bullets: b }); }, 32)}</div>)}
            {field("Avis client (un vrai avis, mot pour mot)", t.quote, (v) => setT({ quote: v }), 160, true)}
            {field("Auteur de l'avis", t.quote_author, (v) => setT({ quote_author: v }), 40)}
          </Card>

          <Card className="p-4 space-y-3">
            <p className="text-sm font-semibold">Mise en page</p>
            <div>
              <Label>Modèle</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(TEMPLATES).map(([k, v]) => (
                  <button key={k} type="button" title={v.desc} onClick={() => setAd((a) => ({ ...a, template: k }))} className={`rounded-xl border px-2 py-2 text-xs font-semibold ${ad.template === k ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#2B6EE8]" : "border-[#E4E4E7] hover:bg-[#F4F4F5]"}`}>{v.label}</button>
                ))}
              </div>
              {ad.template === "review" && !t.quote && <p className="text-[11px] text-[#B45309] mt-1">Ajoute un vrai avis client ci-dessus : la plateforme n&apos;en invente jamais.</p>}
            </div>
            <div>
              <Label>Polices</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(FONT_PAIRS).map(([k, v]) => (
                  <button key={k} type="button" title={v.desc} onClick={() => setAd((a) => ({ ...a, fonts: k }))} className={`rounded-xl border px-2 py-2 text-center ${ad.fonts === k ? "border-[#2B6EE8] bg-[#EBF2FF]" : "border-[#E4E4E7] hover:bg-[#F4F4F5]"}`}>
                    <span style={{ fontFamily: v.title, fontWeight: v.titleWeight }} className="block text-lg leading-none">Aa</span>
                    <span style={{ fontFamily: v.body }} className="block text-[10px] mt-1">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Couleurs</Label>
              <div className="flex gap-2">
                {Object.entries(PALETTES).map(([k, v]) => (
                  <button key={k} type="button" title={v.label} onClick={() => setAd((a) => ({ ...a, palette: k }))} className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] ${ad.palette === k ? "border-[#2B6EE8]" : "border-[#E4E4E7]"}`}>
                    <span className="w-4 h-4 rounded-full border border-[#E4E4E7]" style={{ background: v.panel }} />{v.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Cadrage de la photo</Label>
              <div className="grid grid-cols-2 gap-3 text-[11px] text-[#6B6B72]">
                <label>Gauche ↔ droite<input type="range" min={0} max={100} value={ad.focus.x} onChange={(e) => setAd((a) => ({ ...a, focus: { ...a.focus, x: Number(e.target.value) } }))} className="w-full" /></label>
                <label>Haut ↕ bas<input type="range" min={0} max={100} value={ad.focus.y} onChange={(e) => setAd((a) => ({ ...a, focus: { ...a.focus, y: Number(e.target.value) } }))} className="w-full" /></label>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <p className="text-sm font-semibold">Textes des plateformes (hors image)</p>
            {field("Meta — texte principal (125 premiers caractères visibles)", t.primary_text, (v) => setT({ primary_text: v }), 300, true)}
            {field("TikTok — légende", t.tiktok_caption, (v) => setT({ tiktok_caption: v }), 100, true)}
            {[0, 1, 2, 3, 4].map((i) => <div key={i}>{field(`Google — titre ${i + 1}`, t.google.headlines[i] ?? "", (v) => { const h = [...t.google.headlines]; h[i] = v; setG({ headlines: h }); }, 30)}</div>)}
            {field("Google — titre long", t.google.long_headline, (v) => setG({ long_headline: v }), 90)}
            {[0, 1].map((i) => <div key={i}>{field(`Google — description ${i + 1}`, t.google.descriptions[i] ?? "", (v) => { const d = [...t.google.descriptions]; d[i] = v; setG({ descriptions: d }); }, 90)}</div>)}
          </Card>
        </div>

        {/* Aperçus */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-[#6B6B72]"><input type="checkbox" checked={showSafe} onChange={(e) => setShowSafe(e.target.checked)} /> Montrer les zones cachées par Instagram / TikTok (9:16, en rouge, non exportées)</label>
          <div className="flex flex-wrap gap-4 items-start">
            {AD_FORMATS.map((f) => {
              const k = PREVIEW_W / f.w;
              return (
                <div key={f.key} className="space-y-1.5">
                  <div className="rounded-xl overflow-hidden border border-[#E4E4E7] bg-white" style={{ width: PREVIEW_W, height: f.h * k }}>
                    <div style={{ transform: `scale(${k})`, transformOrigin: "top left" }}>
                      <AdCanvas {...look} format={f} showSafe={showSafe} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between" style={{ width: PREVIEW_W }}>
                    <div><p className="text-xs font-semibold">{f.label}</p><p className="text-[10px] text-[#A0A0A8]">{f.use}</p></div>
                    <Btn size="sm" variant="ghost" onClick={() => downloadOne(f)} disabled={!!busy}>{busy === f.key ? <Spinner /> : <Download size={12} />}</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Rendus pleine taille pour l'export (hors écran) */}
      <div aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
        {AD_FORMATS.map((f) => <AdCanvas key={f.key} ref={(el) => { refs.current[f.key] = el; }} {...look} format={f} />)}
      </div>
    </div>
  );
}
