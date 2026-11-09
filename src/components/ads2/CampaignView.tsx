"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { toPng } from "html-to-image";
import { Archive, Check, Plus, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { Badge, Btn, Card, INPUT, Label, Spinner } from "@/components/ui";
import { api, imgUrl, useSupabase } from "@/lib/client";
import AdText, { type Kit, type Zone } from "./AdText";

export type V = {
  id: string; idx: number; direction: string; text_zone: Zone; text_mode: "ai" | "exact"; hook: string; cta: string; badge: string;
  state: string; error: string | null; path: string | null; thumb_path: string | null; formats: Record<string, string>; history: string[];
  qc: { texts: { expected: string; read: string; ok: boolean }[]; unwanted_text: boolean; product_ok: boolean; duplicate_products: boolean; issues: string[]; comment: string } | null;
  starred: boolean; review_status: string;
};
const CTAS = ["Découvrir", "Acheter", "J'en profite", "Je teste", "Voir la gamme", "En savoir plus"];
const OUT = [
  { key: "4:5", label: "Portrait 4:5 — fil Meta", w: 1080, h: 1350, files: ["meta/fil-4x5"] },
  { key: "1:1", label: "Carré 1:1 — fil Meta, Google", w: 1080, h: 1080, files: ["meta/fil-1x1", "google/carre-1x1"] },
  { key: "9:16", label: "Vertical 9:16 — Stories, Reels, TikTok", w: 1080, h: 1920, files: ["meta/stories-reels-9x16", "tiktok/9x16"] },
  { key: "16:9", label: "Paysage 1.91:1 — Google", w: 1200, h: 628, files: ["google/paysage-1.91x1"] },
];
/** Aperçu à la largeur de la carte : l'image et, en texte exact, le texte posé à l'échelle. */
function Preview({ v, kit }: { v: V; kit: Kit }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="absolute inset-0">
      {w > 0 && <AdText src={v.thumb_path || v.path} w={w} h={Math.round(w * 1.25)} zone={v.text_zone} exact={v.text_mode === "exact"} hook={v.hook} cta={v.cta} badge={v.badge} kit={kit} />}
    </div>
  );
}

export const adCode = (id: string) => `IZ-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

function qcSummary(v: V): { label: string; tone: "green" | "amber" | "red" | "gray" } {
  if (v.state !== "done") return { label: "", tone: "gray" };
  if (!v.qc) return { label: "Contrôle…", tone: "gray" };
  const wrong = v.qc.texts.filter((t) => !t.ok).length;
  if (wrong) return { label: `${wrong} texte${wrong > 1 ? "s" : ""} à corriger`, tone: "red" };
  if (v.qc.duplicate_products || v.qc.product_ok === false) return { label: "Produit à vérifier", tone: "red" };
  if (v.qc.unwanted_text) return { label: "Texte en trop", tone: "amber" };
  return { label: v.text_mode === "ai" ? "Textes vérifiés ✓" : "OK ✓", tone: "green" };
}

export default function CampaignView({ campaign, initial, kit, isAdmin }: { campaign: { id: string; name: string; engine: string }; initial: V[]; kit: Kit; isAdmin: boolean }) {
  const sb = useSupabase();
  const [variants, setVariants] = useState<V[]>(initial);
  const [tab, setTab] = useState<"ads" | "export">("ads");
  const [onlyKept, setOnlyKept] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ hook: "", cta: "", badge: "", instruction: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [formats, setFormats] = useState<string[]>(OUT.map((o) => o.key));
  const running = useRef<Set<string>>(new Set());
  const tried = useRef<Set<string>>(new Set());
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const unit = campaign.engine === "pro" ? 0.13 : 0.2;

  const reload = useCallback(async () => {
    const { data } = await sb.from("ad_variants").select("*").eq("campaign_id", campaign.id).is("deleted_at", null).order("idx");
    if (data) setVariants(data as V[]);
  }, [sb, campaign.id]);

  // File de génération : 2 pubs à la fois
  useEffect(() => {
    const todo = variants.filter((v) => v.state === "generating" && !running.current.has(v.id) && !tried.current.has(v.id));
    for (const v of todo) {
      if (running.current.size >= 2) break;
      running.current.add(v.id); tried.current.add(v.id);
      api(`/api/ads2/variants/${v.id}/generate`).catch(() => null).finally(() => { running.current.delete(v.id); reload(); });
    }
  }, [variants, reload]);
  useEffect(() => {
    if (!variants.some((v) => v.state === "generating" || (v.state === "done" && !v.qc))) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [variants, reload]);

  const kept = variants.filter((v) => v.starred && v.state === "done");
  const shown = onlyKept ? kept : variants;
  const generating = variants.filter((v) => v.state === "generating").length;

  async function patch(v: V, p: Partial<V>) {
    setVariants((list) => list.map((x) => (x.id === v.id ? { ...x, ...p } : x)));
    await sb.from("ad_variants").update(p).eq("id", v.id);
  }
  async function edit(v: V, body: Record<string, unknown>, label: string) {
    setBusy(v.id); setMsg(null);
    try {
      const r = await api<{ regenerated: boolean }>(`/api/ads2/variants/${v.id}/edit`, body);
      setMsg(r.regenerated ? `${label} : nouvelle version prête.` : "Texte mis à jour.");
      setEditing(null);
      await reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erreur"); }
    setBusy(null);
  }
  async function undo(v: V) {
    const prev = v.history[v.history.length - 1];
    if (!prev) return;
    await patch(v, { path: prev, thumb_path: null, history: v.history.slice(0, -1), formats: {}, qc: null });
  }
  async function more() {
    setBusy("more"); setMsg(null);
    try { await api(`/api/ads2/campaigns/${campaign.id}/more`, { count: 4 }); await reload(); setMsg("4 nouvelles pubs en cours de création."); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Erreur"); }
    setBusy(null);
  }
  function openEdit(v: V) { setEditing(editing === v.id ? null : v.id); setForm({ hook: v.hook, cta: v.cta, badge: v.badge, instruction: "" }); }

  // ---------- Export ----------
  const missing = useMemo(() => kept.flatMap((v) => formats.filter((f) => f !== "4:5" && !v.formats?.[f]).map((f) => ({ v, f }))), [kept, formats]);
  async function recompose() {
    setBusy("formats"); setMsg(null);
    let done = 0;
    for (const { v, f } of missing) {
      try { await api(`/api/ads2/variants/${v.id}/format`, { aspect: f }); done++; setMsg(`Recomposition : ${done}/${missing.length}…`); }
      catch (e) { setMsg(e instanceof Error ? e.message : "Erreur"); break; }
    }
    await reload(); setBusy(null);
    if (done === missing.length) setMsg("Tous les formats sont prêts.");
  }
  async function downloadZip() {
    setBusy("zip"); setMsg(null);
    try {
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 400));
      const zip = new JSZip();
      const lines: string[] = [`Campagne Irizée — ${campaign.name}`, ""];
      for (const v of kept) {
        const code = adCode(v.id);
        lines.push(`${code} — ${v.direction}`, `  Titre : ${v.hook}`, `  Bouton : ${v.cta}`, v.badge ? `  Pastille : ${v.badge}` : "", `  Nom à donner à la pub sur Meta / TikTok / Google : ${code} – ${v.hook}`, "");
        for (const o of OUT) {
          if (!formats.includes(o.key)) continue;
          const node = exportRefs.current[`${v.id}:${o.key}`];
          const src = o.key === "4:5" ? v.path : v.formats?.[o.key];
          if (!node || !src) continue;
          const png = await toPng(node, { width: o.w, height: o.h, pixelRatio: 1, includeQueryParams: true });
          for (const f of o.files) zip.file(`${f.replace(/([^/]+)$/, `${code}-$1`)}.png`, png.split(",")[1], { base64: true });
        }
      }
      zip.file("textes.txt", lines.filter((l) => l !== "").join("\n"));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `irizee-ads-${campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || campaign.id}.zip`; a.click();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Export impossible"); }
    setBusy(null);
  }

  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#1F55BC]" : "border-[#E4E4E7] text-[#3F3F46] hover:bg-[#F4F4F5]"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/ads" className="text-xs text-[#52525B] hover:text-[#0A0A0B]">← Mes campagnes</Link>
          <h1 className="text-2xl font-semibold mt-1">{campaign.name || "Campagne"}</h1>
          <p className="text-sm text-[#52525B]">{variants.length} pubs · {kept.length} gardées{generating ? ` · ${generating} en création` : ""}</p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setTab("ads")} className={chip(tab === "ads")}>3 Pubs</button>
          <button type="button" onClick={() => setTab("export")} className={chip(tab === "export")}>4 Export ({kept.length})</button>
        </div>
      </div>
      {msg && <p className="text-sm text-[#1F55BC] bg-[#EBF2FF] rounded-xl px-3 py-2">{msg}</p>}

      {tab === "ads" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-[#52525B]"><input type="checkbox" checked={onlyKept} onChange={(e) => setOnlyKept(e.target.checked)} /> Seulement les pubs gardées</label>
            <Btn size="sm" variant="ghost" onClick={more} disabled={!!busy}>{busy === "more" ? <Spinner /> : <Plus size={12} />} En créer 4 autres (≈ {(4 * unit).toFixed(2).replace(".", ",")} €)</Btn>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((v) => {
              const q = qcSummary(v);
              const exact = v.text_mode === "exact";
              return (
                <Card key={v.id} id={v.id} className={`overflow-hidden flex flex-col ${v.starred ? "ring-2 ring-[#D97706]" : ""}`}>
                  <div className="relative bg-[#F4F4F5] aspect-[4/5] overflow-hidden">
                    {v.state === "done" && v.path ? (
                      <Preview v={v} kit={kit} />
                    ) : v.state === "error" ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <p className="text-sm font-semibold text-[#E8444A]">Échec</p>
                        <p className="text-[11px] text-[#52525B]">{(v.error ?? "").slice(0, 160)}</p>
                        <Btn size="sm" variant="ghost" onClick={async () => { tried.current.delete(v.id); await patch(v, { state: "generating", error: null }); }}><RotateCcw size={12} /> Relancer</Btn>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-[#52525B]"><Spinner />Création de la pub…<span className="text-[10px] text-[#A0A0A8]">{v.direction}</span></div>
                    )}
                    {v.state === "done" && <span className={`absolute top-2 left-2 text-[10px] font-bold rounded-full px-2 py-0.5 ${exact ? "bg-green-50 text-[#12733A]" : "bg-amber-50 text-[#92400E]"}`}>{exact ? "Texte exact" : "Texte IA"}</span>}
                    {busy === v.id && <div className="absolute inset-0 bg-white/70 flex items-center justify-center gap-2 text-xs"><Spinner /> Nouvelle version…</div>}
                  </div>
                  <div className="p-3 space-y-2 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#52525B] truncate">{v.direction}</span>
                      {q.label && <Badge tone={q.tone}>{q.label}</Badge>}
                    </div>
                    {v.qc && (v.qc.texts.some((t) => !t.ok) || v.qc.issues.length > 0) && (
                      <ul className="text-[11px] text-[#B42318] list-disc pl-4 space-y-0.5">
                        {v.qc.texts.filter((t) => !t.ok).map((t, i) => <li key={`t${i}`}>« {t.expected} » lu « {t.read} »</li>)}
                        {v.qc.issues.slice(0, 3).map((t, i) => <li key={`i${i}`}>{t}</li>)}
                      </ul>
                    )}
                    {v.state === "done" && (
                      <div className="flex flex-wrap gap-1.5">
                        <Btn size="sm" variant={v.starred ? "soft" : "ghost"} onClick={() => patch(v, { starred: !v.starred })}>{v.starred ? "★ Gardée" : "☆ Garder"}</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => openEdit(v)} disabled={!!busy}><Wand2 size={12} /> Corriger</Btn>
                        <Btn size="sm" variant="ghost" disabled={!!busy} onClick={() => { if (confirm(`Passer en ${exact ? "texte dessiné par l'IA" : "texte exact"} ? Une nouvelle image est créée (≈ ${unit.toFixed(2).replace(".", ",")} €).`)) edit(v, { switchTo: exact ? "ai" : "exact" }, "Changement de mode"); }}>{exact ? "Passer en texte IA" : "Passer en texte exact"}</Btn>
                        {v.history.length > 0 && <Btn size="sm" variant="ghost" onClick={() => undo(v)} title="Revenir à la version précédente"><RotateCcw size={12} /></Btn>}
                        <Btn size="sm" variant="danger" onClick={() => { if (confirm("Supprimer cette pub ?")) patch(v, { deleted_at: new Date().toISOString() } as Partial<V>).then(reload); }} aria-label="Supprimer"><Trash2 size={12} /></Btn>
                      </div>
                    )}
                    {editing === v.id && (
                      <div className="space-y-2 pt-2 border-t border-[#F0F0F1]">
                        <div><Label>Titre</Label><input className={INPUT} value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })} /></div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><Label>Bouton</Label><select className={INPUT} value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })}><option value="">— Aucun —</option>{CTAS.map((c) => <option key={c}>{c}</option>)}</select></div>
                          <div><Label>Pastille</Label><input className={INPUT} value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="-20 %" /></div>
                        </div>
                        <div><Label>À changer sur l&apos;image (facultatif)</Label><textarea className={INPUT} rows={2} value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} placeholder="Ex : fond plus clair, produit un peu plus grand" /></div>
                        <p className="text-[11px] text-[#52525B]">{exact && !form.instruction ? "Texte exact : le changement de texte est immédiat et gratuit." : `Une nouvelle version de l'image est créée (≈ ${unit.toFixed(2).replace(".", ",")} €). La précédente reste récupérable.`}</p>
                        <div className="flex gap-2">
                          <Btn size="sm" onClick={() => edit(v, form, "Correction")} disabled={!!busy}>{busy === v.id ? <Spinner /> : <Check size={12} />} Appliquer</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setEditing(null)}>Annuler</Btn>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px] items-start">
          <Card className="overflow-hidden">
            {kept.length ? kept.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#F0F0F1]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl(v.thumb_path || v.path!)} alt="" className="w-11 h-14 rounded-lg object-cover bg-[#F4F4F5]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{v.hook}</p>
                  <p className="text-[11px] text-[#52525B]">{v.direction} · {v.text_mode === "exact" ? "texte exact" : "texte IA"} · formats : 4:5 ✓ {["1:1", "9:16", "16:9"].map((f) => `${f === "16:9" ? "paysage" : f} ${v.formats?.[f] ? "✓" : "—"}`).join(" ")}</p>
                </div>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(adCode(v.id)); setMsg(`Code ${adCode(v.id)} copié : mets-le dans le nom de la pub.`); }} className="text-[11px] font-bold rounded-full bg-[#EBF2FF] text-[#1F55BC] px-2 py-1">{adCode(v.id)}</button>
              </div>
            )) : <p className="p-4 text-sm text-[#52525B]">Aucune pub gardée : retourne sur « 3 Pubs » et clique sur « ☆ Garder ».</p>}
          </Card>
          <Card className="p-4 space-y-3">
            <p className="text-sm font-semibold">Formats</p>
            {OUT.map((o) => (
              <label key={o.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formats.includes(o.key)} disabled={o.key === "4:5"} onChange={(e) => setFormats((f) => (e.target.checked ? [...f, o.key] : f.filter((x) => x !== o.key)))} /> {o.label}
              </label>
            ))}
            {missing.length > 0 ? (
              <>
                <p className="text-[11px] text-[#52525B]">{missing.length} format{missing.length > 1 ? "s" : ""} à recomposer par l&apos;IA (même design, pas un simple recadrage).</p>
                <Btn variant="soft" onClick={recompose} disabled={!!busy}>{busy === "formats" ? <Spinner /> : <Wand2 size={13} />} Recomposer ({`≈ ${(missing.length * unit).toFixed(2).replace(".", ",")} €`})</Btn>
              </>
            ) : kept.length > 0 && <p className="text-[11px] text-[#12733A]">Tous les formats cochés sont prêts.</p>}
            <Btn onClick={downloadZip} disabled={!!busy || !kept.length}>{busy === "zip" ? <Spinner /> : <Archive size={13} />} Télécharger le ZIP</Btn>
            {isAdmin && kept.length > 0 && <Btn variant="ghost" onClick={async () => { for (const v of kept) await patch(v, { review_status: "approved" }); setMsg("Pubs gardées approuvées."); }}>Approuver les pubs gardées</Btn>}
            <p className="text-[11px] text-[#52525B]">Le ZIP contient un dossier par plateforme et un fichier texte avec le nom à donner à chaque pub (code IZ-…) pour suivre ses résultats dans Irizée Brand.</p>
          </Card>
        </div>
      )}

      {/* Rendus pleine taille pour l'export (hors écran) */}
      {tab === "export" && (
        <div aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
          {kept.flatMap((v) => OUT.filter((o) => formats.includes(o.key)).map((o) => {
            const src = o.key === "4:5" ? v.path : v.formats?.[o.key];
            if (!src) return null;
            return <AdText key={`${v.id}:${o.key}`} ref={(el) => { exportRefs.current[`${v.id}:${o.key}`] = el; }} src={src} w={o.w} h={o.h} zone={v.text_zone} exact={v.text_mode === "exact"} hook={v.hook} cta={v.cta} badge={v.badge} kit={kit} />;
          }))}
        </div>
      )}
    </div>
  );
}
