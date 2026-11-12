"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Wand2, X } from "lucide-react";
import { Btn, Card, INPUT, Label, Spinner } from "@/components/ui";
import { api, apiJob, imgUrl, uploadImage, useSupabase } from "@/lib/client";
import { FORMATS } from "@/types";
import { TEXT_ZONES } from "@/lib/visualTypes";

interface Props {
  products: { id: string; name: string; missing: string[] }[];
  models: { id: string; name: string; path: string | null }[];
  library: { id: string; path: string; analysis: string; summary: string }[];
}
type Dir = { title: string; concept: string; set: string; palette: string; light: string; attitude: string };
type Sketch = { state: "loading" | "done" | "error"; path?: string };
const TYPES = [["photo", "Shooting photo"], ["social", "Visuel réseaux"], ["ad", "Visuel pub"], ["free", "Libre"]] as const;
const dirText = (d: Dir) => `${d.title}. ${d.concept} Décor et matières : ${d.set}. Couleurs : ${d.palette}. Lumière : ${d.light}. Attitude : ${d.attitude}.`;

/** Nouveau parcours : Produits → Brief → Direction (esquisses) → Image pilote. Rien n'est payé en haute qualité avant l'image pilote. */
export default function CampaignWizard({ products, models, library }: Props) {
  const sb = useSupabase();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [vtype, setVtype] = useState<string>("ad");
  const [noProduct, setNoProduct] = useState(false);
  const [productIds, setProductIds] = useState<string[]>(products[0] ? [products[0].id] : []);
  const [productMode, setProductMode] = useState<"mix" | "split" | "together">("mix");
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [count, setCount] = useState(4);
  const [aspect, setAspect] = useState("4:5");
  const [textZone, setTextZone] = useState("none");
  const [brief, setBrief] = useState("");
  const [prevBrief, setPrevBrief] = useState<string | null>(null);
  const [inspirations, setInspirations] = useState<{ path: string; analysis: string; note: string; state: "loading" | "done" | "error" }[]>([]);
  const [inspMode, setInspMode] = useState<"loose" | "copy">("loose");
  const [dirs, setDirs] = useState<Dir[]>([]);
  const [sketches, setSketches] = useState<Record<string, Sketch>>({});
  const [chosen, setChosen] = useState<number | null>(null);
  const [chosenText, setChosenText] = useState("");
  const [rework, setRework] = useState("");
  const [busy, setBusy] = useState<"" | "brief" | "dirs" | "launch">("");
  const [error, setError] = useState<string | null>(null);

  const ids = noProduct ? [] : productIds;
  const chip = (on: boolean) => `px-3.5 py-2.5 rounded-full text-sm border transition ${on ? "bg-[#EBF2FF] border-[#2B6EE8] text-[#1F55BC] font-semibold" : "bg-white border-[#E4E4E7] text-[#0A0A0B] hover:bg-[#F4F4F5]"}`;

  async function analyze(path: string) {
    try {
      const r = await api<{ analysis: string; summary: string }>("/api/inspirations/analyze", { path });
      setInspirations((all) => all.map((x) => (x.path === path ? { ...x, analysis: r.analysis, note: r.summary, state: "done" } : x)));
    } catch { setInspirations((all) => all.map((x) => (x.path === path ? { ...x, state: "error" } : x))); }
  }
  async function addFiles(files: File[]) {
    const list = files.filter((f) => f.type.startsWith("image/")).slice(0, 4 - inspirations.length);
    if (!list.length) return;
    try {
      const { data: { user } } = await sb.auth.getUser();
      for (const f of list) {
        const path = await uploadImage(sb, `inspirations/${user!.id}`, f, 1400);
        setInspirations((all) => [...all, { path, analysis: "", note: "", state: "loading" }]);
        analyze(path);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Envoi impossible"); }
  }
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const fs = Array.from(e.clipboardData?.files ?? []); if (fs.length && step === 2) addFiles(fs); };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, inspirations.length]);

  async function improve() {
    setError(null); setBusy("brief");
    try { const r = await apiJob<{ brief: string }>(sb, "/api/shoots/brief", { brief, visualType: vtype, productIds: ids, noProduct }); setPrevBrief(brief); setBrief(r.brief); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    setBusy("");
  }

  const common = () => ({ brief, visualType: vtype, productIds: ids, noProduct, noPeople: modelIds.length === 0, textZone, inspirationPaths: inspirations.map((x) => x.path), inspirationAnalyses: inspirations.filter((x) => x.state === "done").map((x) => ({ analysis: x.analysis, note: x.note })) });

  async function proposeDirs(feedback = "") {
    setError(null); setBusy("dirs");
    try {
      const r = await apiJob<{ directions: Dir[] }>(sb, "/api/shoots/directions", { ...common(), n: 3, avoid: dirs.map((d) => d.title), feedback, previous: feedback ? dirs.map((d) => `${d.title}: ${d.concept}`) : [] });
      setDirs(r.directions); setChosen(null); setChosenText(""); setRework("");
      // Une esquisse rapide par direction, pour choisir avec les yeux
      const next: Record<string, Sketch> = {};
      r.directions.forEach((d) => { next[d.title] = { state: "loading" }; });
      setSketches(next);
      r.directions.forEach((d) => {
        apiJob<{ path: string }>(sb, "/api/shoots/sketch", { direction: dirText(d), productIds: ids, noProduct, noPeople: modelIds.length === 0 })
          .then((s) => setSketches((m) => ({ ...m, [d.title]: { state: "done", path: s.path } })))
          .catch(() => setSketches((m) => ({ ...m, [d.title]: { state: "error" } })));
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    setBusy("");
  }

  async function launch() {
    if (chosen === null || !chosenText.trim()) return setError("Choisissez d'abord une direction");
    setError(null); setBusy("launch");
    try {
      const d = dirs[chosen];
      const r = await apiJob<{ shootId: string; imageIds: string[] }>(sb, "/api/shoots", {
        productId: productIds[0] ?? products[0]?.id, productIds, productMode, noProduct, modelIds, noPeople: modelIds.length === 0, modelMode: "split",
        prompt: brief, aspect, size: "2K", variants: count, visualType: vtype, pilot: true, sketchPath: sketches[d.title]?.path ?? null,
        inspirationPaths: inspirations.map((x) => x.path), inspirationAnalyses: inspirations.filter((x) => x.state === "done").map((x) => ({ path: x.path, analysis: x.analysis, note: "" })),
        typeParams: { inspMode, direction: chosenText, textZone, socialStyle: "feed" },
      });
      sessionStorage.setItem(`run:${r.shootId}`, JSON.stringify(r.imageIds));
      router.push(`/shoots/${r.shootId}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); setBusy(""); }
  }

  const steps = ["1. Produits", "2. Brief", "3. Direction", "4. Image pilote", "5. Campagne"];
  const canNext1 = noProduct || productIds.length > 0;
  const pendingInsp = inspirations.some((x) => x.state === "loading");

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E4E4E7] rounded-2xl px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {steps.map((s, i) => (
            <button key={s} type="button" disabled={i + 1 > step || i > 2} onClick={() => setStep(i + 1)}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold border ${i + 1 < step ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : i + 1 === step ? "border-[#0A0A0B] text-[#0A0A0B] bg-white" : "border-[#E4E4E7] text-[#6B6B72] bg-white"}`}>{s}</button>
          ))}
        </div>
        <span className="text-xs text-[#52525B]">{step < 3 ? "Rien de payé jusqu'ici" : "Esquisses : quelques centimes. Aucune image en haute qualité payée avant le pilote."}</span>
      </div>
      {error && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>}

      {step === 1 && (
        <Card className="p-5 space-y-5">
          <h2 className="text-lg font-semibold">Que voulez-vous créer ?</h2>
          <div>
            <Label>Type de visuel</Label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map(([k, l]) => <button key={k} type="button" className={chip(vtype === k)} onClick={() => setVtype(k)}>{l}</button>)}
              <Link href="/studio?classic=1" className={chip(false)}>Carrousel ou avant / après</Link>
            </div>
          </div>
          <div>
            <Label>Produits (4 maximum)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              <button type="button" className={chip(!noProduct)} onClick={() => setNoProduct(false)}>Avec produit</button>
              <button type="button" className={chip(noProduct)} onClick={() => setNoProduct(true)}>Sans produit</button>
            </div>
            {!noProduct && (
              <div className="grid sm:grid-cols-2 gap-2">
                {products.map((p) => {
                  const on = productIds.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => setProductIds(on ? productIds.filter((x) => x !== p.id) : productIds.length < 4 ? [...productIds, p.id] : productIds)}
                      className={`text-left rounded-2xl border p-3 space-y-1.5 ${on ? "border-[#2B6EE8] bg-[#EBF2FF] ring-1 ring-[#2B6EE8]" : "border-[#E4E4E7] bg-white hover:bg-[#F4F4F5]"}`}>
                      <p className="text-sm font-semibold">{p.name}</p>
                      {p.missing.length
                        ? <p className="text-[12px] text-[#7A4B00] bg-[#FFF4D6] rounded-lg px-2 py-1 inline-block">Fiche incomplète : {p.missing.join(", ")}</p>
                        : <p className="text-[12px] text-[#14532D] bg-[#E7F6EC] rounded-lg px-2 py-1 inline-block">Fiche complète</p>}
                    </button>
                  );
                })}
              </div>
            )}
            {!noProduct && products.some((p) => productIds.includes(p.id) && p.missing.length > 0) && (
              <p className="text-[12px] text-[#52525B] mt-2">Une fiche incomplète est la première cause d&apos;un produit trop gros ou d&apos;une mauvaise couleur. <Link href="/products" className="text-[#1F55BC] font-semibold">Compléter les fiches</Link></p>
            )}
            {!noProduct && productIds.length > 1 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {([["mix", "Chaque produit seul, puis ensemble"], ["split", "Un produit par image"], ["together", "Tous ensemble sur chaque image"]] as const).map(([k, l]) => <button key={k} type="button" className={chip(productMode === k)} onClick={() => setProductMode(k)}>{l}</button>)}
              </div>
            )}
          </div>
          <div>
            <Label>Personne sur les photos</Label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(modelIds.length === 0)} onClick={() => setModelIds([])}>Sans personne</button>
              {models.map((m) => { const on = modelIds.includes(m.id); return <button key={m.id} type="button" className={chip(on)} onClick={() => setModelIds(on ? modelIds.filter((x) => x !== m.id) : [...modelIds, m.id])}>{m.name}</button>; })}
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label>Nombre d&apos;images</Label>
              <div className="flex flex-wrap gap-2">{[2, 4, 6, 8].map((n) => <button key={n} type="button" className={chip(count === n)} onClick={() => setCount(n)}>{n}</button>)}</div>
            </div>
            <div>
              <Label>Format de départ</Label>
              <select className={INPUT} value={aspect} onChange={(e) => setAspect(e.target.value)}>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}</select>
              <p className="text-[11px] text-[#6B6B72] mt-1">Recadrable ensuite à la souris, dans tous les formats.</p>
            </div>
            {vtype === "ad" && (
              <div>
                <Label>Place pour le texte</Label>
                <select className={INPUT} value={textZone} onChange={(e) => setTextZone(e.target.value)}>{TEXT_ZONES.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}</select>
              </div>
            )}
          </div>
          <div className="flex justify-end"><Btn onClick={() => setStep(2)} disabled={!canNext1}>Continuer</Btn></div>
        </Card>
      )}

      {step === 2 && (
        <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
          <Card className="p-5 space-y-4">
            <h2 className="text-lg font-semibold">Dites ce que vous aimeriez faire</h2>
            <p className="text-sm text-[#52525B]">Même en une phrase vague. Les idées, c&apos;est l&apos;étape suivante qui les apporte.</p>
            <textarea className={INPUT + " min-h-[130px]"} value={brief} onChange={(e) => setBrief(e.target.value)} aria-label="Votre brief" autoFocus
              placeholder="Ex. : une campagne hiver pour le Masque Nila, luxe et mode, pas nunuche." />
            <div className="flex flex-wrap items-center gap-2">
              <Btn size="sm" variant="ghost" onClick={improve} disabled={busy !== "" || !brief.trim()}>{busy === "brief" ? <Spinner /> : <Wand2 size={13} />} Améliorer mon brief</Btn>
              {prevBrief !== null && <button type="button" className="text-xs font-semibold text-[#52525B]" onClick={() => { setBrief(prevBrief); setPrevBrief(null); }}>Revenir à ma version</button>}
            </div>
            <div className="flex justify-between">
              <Btn variant="ghost" onClick={() => setStep(1)}>Retour</Btn>
              <Btn onClick={() => { setStep(3); if (!dirs.length) proposeDirs(); }} disabled={!brief.trim() || pendingInsp}>{pendingInsp ? "Analyse des inspirations…" : "Voir des directions"}</Btn>
            </div>
          </Card>
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Inspirations (facultatif)</h3>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(inspMode === "loose")} onClick={() => setInspMode("loose")}>S&apos;inspirer</button>
              <button type="button" className={chip(inspMode === "copy")} onClick={() => setInspMode("copy")}>Reproduire</button>
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-[#D4D4D8] rounded-2xl p-4 text-center text-xs text-[#52525B] hover:border-[#2B6EE8]">
              <ImagePlus className="mx-auto mb-1 text-[#6B6B72]" size={18} /> Importer ou coller (Ctrl+V), 4 maximum
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            {inspirations.map((x) => (
              <div key={x.path} className="flex gap-2 items-start">
                <div className="relative w-14 h-[70px] shrink-0 rounded-lg overflow-hidden bg-[#F4F4F5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgUrl(x.path)} alt="" className="w-full h-full object-cover" />
                  <button type="button" aria-label="Retirer" onClick={() => setInspirations(inspirations.filter((y) => y.path !== x.path))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"><X size={11} /></button>
                </div>
                {x.state === "loading" ? <p className="text-[11px] text-[#52525B] flex items-center gap-1"><Spinner className="w-3 h-3" /> Analyse…</p>
                  : <textarea className={INPUT + " !text-[11px] min-h-[70px]"} value={x.note} aria-label="Ce que l'IA reprend de cette inspiration" onChange={(e) => { const v = e.target.value; setInspirations((all) => all.map((y) => (y.path === x.path ? { ...y, note: v } : y))); }} />}
              </div>
            ))}
            {library.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-[#52525B] mb-1.5">Depuis ma bibliothèque</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {library.slice(0, 12).map((l) => {
                    const on = inspirations.some((x) => x.path === l.path);
                    return (
                      <button key={l.id} type="button" aria-label="Inspiration de la bibliothèque" aria-pressed={on} disabled={!on && inspirations.length >= 4}
                        onClick={() => setInspirations(on ? inspirations.filter((x) => x.path !== l.path) : [...inspirations, { path: l.path, analysis: l.analysis, note: l.summary, state: "done" }])}
                        className={`aspect-[4/5] rounded-lg overflow-hidden border-2 ${on ? "border-[#2B6EE8]" : "border-transparent"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgUrl(l.path)} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="text-[11px] text-[#6B6B72]">Votre <Link href="/settings/da" className="text-[#1F55BC] font-semibold">DA de marque</Link> est appliquée automatiquement.</p>
          </Card>
        </div>
      )}

      {step === 3 && (
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Choisissez une direction</h2>
              <p className="text-sm text-[#52525B]">Une direction = un univers pour toute la campagne. Les esquisses sont des brouillons rapides : seule l&apos;ambiance compte, pas les détails.</p>
            </div>
            <Btn size="sm" variant="ghost" onClick={() => proposeDirs()} disabled={busy !== ""}>{busy === "dirs" ? <Spinner /> : <Wand2 size={13} />} Autres directions</Btn>
          </div>
          {busy === "dirs" && !dirs.length && <p className="text-sm text-[#52525B] flex items-center gap-2"><Spinner /> L&apos;IA prépare 3 directions (environ 40 secondes)…</p>}
          <div className="grid md:grid-cols-3 gap-3">
            {dirs.map((d, i) => {
              const on = chosen === i; const sk = sketches[d.title];
              return (
                <div key={d.title} className={`rounded-2xl border p-2.5 flex flex-col gap-2 ${on ? "border-[#2B6EE8] bg-[#EBF2FF]" : "border-[#E4E4E7] bg-white"}`}>
                  <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-[#F4F4F5] flex items-center justify-center">
                    {sk?.state === "done" && sk.path
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={imgUrl(sk.path)} alt={`Esquisse : ${d.title}`} className="absolute inset-0 w-full h-full object-cover" />
                      : sk?.state === "error" ? <span className="text-[11px] text-[#52525B] px-3 text-center">Esquisse indisponible : le texte décrit la direction.</span>
                      : <span className="text-[11px] text-[#52525B] flex items-center gap-1.5"><Spinner className="w-3 h-3" /> Esquisse en cours…</span>}
                    <span className="absolute top-2 left-2 text-[10px] font-bold bg-white rounded-md px-1.5 py-0.5">Esquisse</span>
                  </div>
                  <p className="text-sm font-semibold">{d.title}</p>
                  <p className="text-[12px] leading-snug">{d.concept}</p>
                  <p className="text-[11px] text-[#52525B] leading-snug line-clamp-4">{d.set} · {d.palette} · {d.light}</p>
                  <Btn size="sm" variant={on ? "primary" : "ghost"} className="mt-auto" onClick={() => { setChosen(i); setChosenText(dirText(d)); }}>{on ? "Direction choisie" : "Choisir"}</Btn>
                </div>
              );
            })}
          </div>
          {dirs.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <input className={INPUT + " flex-1 min-w-[240px]"} value={rework} onChange={(e) => setRework(e.target.value)} aria-label="Retravailler les directions" placeholder="Retravailler : ex. j'aime la 2, mais plus sombre et plus mode"
                onKeyDown={(e) => { if (e.key === "Enter" && rework.trim()) proposeDirs(rework); }} />
              <Btn size="sm" variant="ghost" onClick={() => proposeDirs(rework)} disabled={busy !== "" || !rework.trim()}>Ajuster les directions</Btn>
            </div>
          )}
          {chosen !== null && (
            <div>
              <Label>Direction choisie (modifiable)</Label>
              <textarea className={INPUT + " min-h-[80px] !text-[13px]"} value={chosenText} onChange={(e) => setChosenText(e.target.value)} aria-label="Direction choisie" />
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Btn variant="ghost" onClick={() => setStep(2)}>Retour</Btn>
            <Btn onClick={launch} disabled={busy !== "" || chosen === null}>{busy === "launch" ? <><Spinner className="border-white/40 border-t-white" /> Préparation de la campagne…</> : "Créer l'image pilote (1 image payante)"}</Btn>
          </div>
          <p className="text-[11px] text-[#6B6B72]">Une seule image est générée en haute qualité. Vous la validez, puis les {count - 1} autres sont créées à partir d&apos;elle.</p>
        </Card>
      )}
    </div>
  );
}
