"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Wand2, X } from "lucide-react";
import { Btn, Card, INPUT, Label, Spinner } from "@/components/ui";
import { api, apiJob, imgUrl, uploadImage, useSupabase } from "@/lib/client";
import { FORMATS } from "@/types";
import { TEXT_ZONES, BA_CHANGES, CAROUSEL_STYLES, emptySlide, type Slide } from "@/lib/visualTypes";
import SlideCards from "./SlideCards";

interface Props {
  products: { id: string; name: string; missing: string[] }[];
  models: { id: string; name: string; path: string | null }[];
  library: { id: string; path: string; analysis: string; summary: string }[];
  /** Réglages repris d'un concept de la bibliothèque ou d'une campagne existante (« Recommencer ») */
  prefill?: Prefill;
}
export interface Prefill {
  source?: string; conceptId?: string;
  brief?: string; vtype?: string; productIds?: string[]; productMode?: string; noProduct?: boolean; modelIds?: string[];
  aspect?: string; count?: number; textZone?: string; inspMode?: string; inspirations?: string[];
  direction?: Dir; directionText?: string; sketchPath?: string;
  carouselStyle?: string; slides?: Slide[]; baChange?: string; baBefore?: string; baAfter?: string; pairs?: number;
}
type Dir = { title: string; concept: string; set: string; palette: string; light: string; attitude: string };
type Sketch = { state: "loading" | "done" | "error"; path?: string };
const TYPES = [["photo", "Shooting photo"], ["social", "Visuel réseaux"], ["ad", "Visuel pub"], ["carousel", "Carrousel"], ["ba", "Avant / après"], ["free", "Libre"]] as const;
type Step = "setup" | "brief" | "direction" | "plan";
const dirText = (d: Dir) => `${d.title}. ${d.concept} Décor et matières : ${d.set}. Couleurs : ${d.palette}. Lumière : ${d.light}. Attitude : ${d.attitude}.`;

/**
 * Nouveau parcours : Produits → Brief → Direction (esquisses) → Image pilote. Rien n'est payé en haute qualité avant l'image pilote.
 * Carrousel : une étape de plus, le plan des slides (photo + textes), puis la couverture comme image pilote.
 * Avant / après : pas de direction (le portrait reste neutre) ; la photo « avant » est l'image pilote.
 */
export default function CampaignWizard({ products, models, library, prefill }: Props) {
  const sb = useSupabase();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("setup");
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
  const [busy, setBusy] = useState<"" | "brief" | "dirs" | "launch" | "plan">("");
  // Carrousel
  const [carouselStyle, setCarouselStyle] = useState("edu");
  const [slideCount, setSlideCount] = useState(5);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [planFor, setPlanFor] = useState("");
  const [planRework, setPlanRework] = useState("");
  // Avant / après
  const [baChange, setBaChange] = useState("terne");
  const [baBefore, setBaBefore] = useState("");
  const [baAfter, setBaAfter] = useState("");
  const [pairs, setPairs] = useState(1);
  const isCar = vtype === "carousel";
  const isBa = vtype === "ba";
  const flow: Step[] = isBa ? ["setup", "brief"] : isCar ? ["setup", "brief", "direction", "plan"] : ["setup", "brief", "direction"];
  const noPeople = isBa ? false : modelIds.length === 0;

  function pickType(k: string) {
    if (k === "ba") setNoProduct(true); else if (vtype === "ba") setNoProduct(false);
    if (k === "carousel" && modelIds.length > 1) setModelIds(modelIds.slice(0, 1));
    if ((k === "carousel" || k === "ba" || k === "social" || k === "ad") && aspect === "16:9") setAspect("4:5");
    setVtype(k);
  }
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [keptSketch, setKeptSketch] = useState<string | null>(null);
  const [conceptId, setConceptId] = useState<string | null>(null);

  // Arrivée depuis « Idées de campagne » : brief rempli et direction déjà proposée (avec son esquisse)
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    let p: Prefill | undefined = prefill;
    try {
      const raw = sessionStorage.getItem("wizard:prefill");
      if (raw) { sessionStorage.removeItem("wizard:prefill"); p = JSON.parse(raw) as Prefill; }
    } catch { /* rien à préremplir */ }
    if (!p) return;
    const t = p.vtype && TYPES.some(([k]) => k === p!.vtype) ? p.vtype : null;
    if (t) setVtype(t);
    if (p.brief) setBrief(p.brief);
    const pids = (p.productIds ?? []).filter((id) => products.some((x) => x.id === id));
    if (pids.length) setProductIds(pids);
    if (p.noProduct !== undefined) setNoProduct(!!p.noProduct);
    if (p.productMode === "mix" || p.productMode === "split" || p.productMode === "together") setProductMode(p.productMode);
    const mids = (p.modelIds ?? []).filter((id) => models.some((x) => x.id === id));
    if (p.modelIds) setModelIds(t === "carousel" ? mids.slice(0, 1) : mids);
    if (p.aspect && FORMATS[p.aspect]) setAspect(p.aspect);
    if (p.count) setCount([2, 4, 6, 8].reduce((best, n) => (Math.abs(n - p!.count!) < Math.abs(best - p!.count!) ? n : best), 4));
    if (p.textZone && TEXT_ZONES.some((z) => z.id === p!.textZone)) setTextZone(p.textZone);
    if (p.inspMode === "copy" || p.inspMode === "loose") setInspMode(p.inspMode);
    if (p.carouselStyle && CAROUSEL_STYLES.some((x) => x.id === p!.carouselStyle)) setCarouselStyle(p.carouselStyle);
    if (p.slides?.length) { setSlides(p.slides); setSlideCount(Math.min(10, Math.max(3, p.slides.length))); setPlanFor(p.directionText ?? ""); }
    if (p.baChange && BA_CHANGES.some((x) => x.id === p!.baChange)) setBaChange(p.baChange);
    if (p.baBefore) setBaBefore(p.baBefore);
    if (p.baAfter) setBaAfter(p.baAfter);
    if (p.pairs) setPairs(Math.min(3, Math.max(1, p.pairs)));
    if (p.source) setSource(p.source);
    if (p.conceptId) setConceptId(p.conceptId);
    const insp = (p.inspirations ?? []).filter((x) => /^inspirations\//.test(x)).slice(0, 4);
    if (insp.length) { setInspirations(insp.map((path) => ({ path, analysis: "", note: "", state: "loading" as const }))); insp.forEach((path) => analyze(path)); }
    if (p.direction?.title) {
      // Direction complète (concept) : elle est déjà proposée. Son esquisse est faite à l'étape 3, avec les produits
      // et la personne confirmés à l'étape 1 (jamais avant : sans le vrai packshot, l'IA inventerait un produit).
      const d = p.direction;
      setDirs([d]); setChosen(0); setChosenText(dirText(d));
    } else if (p.directionText) {
      // Direction d'une campagne précédente : reprise telle quelle, avec son esquisse
      setChosenText(p.directionText);
      if (p.sketchPath) setKeptSketch(p.sketchPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const onPaste = (e: ClipboardEvent) => { const fs = Array.from(e.clipboardData?.files ?? []); if (fs.length && step === "brief") addFiles(fs); };
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

  const common = () => ({ brief, visualType: vtype, productIds: ids, noProduct, noPeople, textZone, inspirationPaths: inspirations.map((x) => x.path), inspirationAnalyses: inspirations.filter((x) => x.state === "done").map((x) => ({ analysis: x.analysis, note: x.note })) });

  // Une esquisse rapide par direction, pour choisir avec les yeux : toujours avec les vrais packshots des produits choisis
  const sketchSig = `${ids.join(",")}|${noProduct}|${noPeople}`;
  const sketchRun = useRef(0);
  const [sketchedFor, setSketchedFor] = useState("");
  function makeSketches(list: Dir[]) {
    const run = ++sketchRun.current;
    setSketchedFor(sketchSig);
    const next: Record<string, Sketch> = {};
    list.forEach((d) => { next[d.title] = { state: "loading" }; });
    setSketches(next);
    list.forEach((d) => {
      apiJob<{ path: string }>(sb, "/api/shoots/sketch", { direction: dirText(d), productIds: ids, noProduct, noPeople })
        .then((sk) => { if (run === sketchRun.current) setSketches((m) => ({ ...m, [d.title]: { state: "done", path: sk.path } })); })
        .catch(() => { if (run === sketchRun.current) setSketches((m) => ({ ...m, [d.title]: { state: "error" } })); });
    });
  }
  function goDirections() {
    setStep("direction");
    if (!dirs.length && !chosenText.trim()) proposeDirs();
    // produits ou personne changés depuis les esquisses (ou direction reprise d'un concept) : on les refait avec les bons
    else if (dirs.length && sketchedFor !== sketchSig) makeSketches(dirs);
  }

  async function proposeDirs(feedback = "") {
    setError(null); setBusy("dirs");
    try {
      const r = await apiJob<{ directions: Dir[] }>(sb, "/api/shoots/directions", { ...common(), n: 3, avoid: dirs.map((d) => d.title), feedback, previous: feedback ? dirs.map((d) => `${d.title}: ${d.concept}`) : [] });
      setDirs(r.directions); setChosen(null); setChosenText(""); setRework(""); setKeptSketch(null);
      makeSketches(r.directions);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    setBusy("");
  }

  // Carrousel : le plan des slides (photo + textes), dans la direction choisie. Texte seul : quelques centimes.
  async function proposePlan(feedback = "") {
    setError(null); setBusy("plan");
    try {
      const r = await apiJob<{ slides: Slide[] }>(sb, "/api/shoots/slides", {
        idea: brief, n: slides.length || slideCount, style: carouselStyle, productIds: ids, productMode, noProduct, people: !noPeople,
        direction: chosenText, feedback, previous: feedback ? slides : [],
      });
      setSlides(r.slides); setPlanFor(chosenText); setPlanRework("");
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    setBusy("");
  }
  function goPlan() {
    if (!chosenText.trim()) return setError("Choisissez d'abord une direction");
    setError(null); setStep("plan");
    if (!slides.length) proposePlan();
  }
  const photoSlides = slides.filter((x) => x.layout !== "text").length;

  async function launch() {
    if (!isBa && !chosenText.trim()) return setError("Choisissez d'abord une direction");
    if (isCar && photoSlides < 1) return setError("Il faut au moins une slide avec photo");
    setError(null); setBusy("launch");
    try {
      const d = chosen !== null ? dirs[chosen] : null;
      const r = await apiJob<{ shootId: string; imageIds: string[] }>(sb, "/api/shoots", {
        productId: productIds[0] ?? products[0]?.id, productIds, productMode, noProduct, modelIds, noPeople, modelMode: "split",
        prompt: brief, aspect, size: "2K", variants: count, slideCount: slides.length, pairs, visualType: vtype, pilot: true, sketchPath: d ? sketches[d.title]?.path ?? null : keptSketch, conceptId,
        inspirationPaths: inspirations.map((x) => x.path), inspirationAnalyses: inspirations.filter((x) => x.state === "done").map((x) => ({ path: x.path, analysis: x.analysis, note: "" })),
        typeParams: isBa ? { inspMode, baChange, baBefore, baAfter }
          : isCar ? { inspMode, direction: chosenText, carouselStyle, slides }
          : { inspMode, direction: chosenText, textZone, socialStyle: "feed" },
      });
      sessionStorage.setItem(`run:${r.shootId}`, JSON.stringify(r.imageIds));
      router.push(`/shoots/${r.shootId}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); setBusy(""); }
  }

  const steps = (isBa ? ["Réglages", "Brief", "Photo « avant »", "Avant / après"] : isCar ? ["Produits", "Brief", "Direction", "Plan des slides", "Slide de couverture", "Carrousel"] : ["Produits", "Brief", "Direction", "Image pilote", "Campagne"]).map((l, i) => `${i + 1}. ${l}`);
  const at = flow.indexOf(step);
  const canNext1 = (noProduct || productIds.length > 0) && (!isBa || baChange !== "autre" || (!!baBefore.trim() && !!baAfter.trim()));
  const pendingInsp = inspirations.some((x) => x.state === "loading");

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E4E4E7] rounded-2xl px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {steps.map((s, i) => (
            <button key={s} type="button" disabled={i > at || i >= flow.length} onClick={() => setStep(flow[i])}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold border ${i < at ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : i === at ? "border-[#0A0A0B] text-[#0A0A0B] bg-white" : "border-[#E4E4E7] text-[#6B6B72] bg-white"}`}>{s}</button>
          ))}
        </div>
        <span className="text-xs text-[#52525B]">{step === "setup" || step === "brief" ? "Rien de payé jusqu'ici" : step === "plan" ? "Le plan est du texte : quelques centimes. Aucune photo payée avant la couverture." : "Esquisses : quelques centimes. Aucune image en haute qualité payée avant le pilote."}</span>
      </div>
      {error && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>}
      {source && step === "setup" && <div className="p-3 rounded-xl bg-[#EBF2FF] border border-[#C9D9F8] text-sm text-[#1F3F7A]">{source} Vérifiez les réglages, puis continuez : rien n&apos;est payé avant l&apos;image pilote.</div>}

      {step === "setup" && (
        <Card className="p-5 space-y-5">
          <h2 className="text-lg font-semibold">Que voulez-vous créer ?</h2>
          <div>
            <Label>Type de visuel</Label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map(([k, l]) => <button key={k} type="button" className={chip(vtype === k)} onClick={() => pickType(k)}>{l}</button>)}
            </div>
            {isCar && <p className="text-[12px] text-[#52525B] mt-2">3 à 10 slides qui se suivent, dans un seul univers. Vous validez la direction, puis le plan (photos et textes), puis la couverture, avant de créer les autres photos.</p>}
            {isBa && <p className="text-[12px] text-[#52525B] mt-2">Même personne, même cadrage, même lumière : seule la peau change. Vous validez la photo « avant », puis l&apos;« après » est créé à partir d&apos;elle.</p>}
          </div>
          {isCar && (
            <div className="grid sm:grid-cols-[1fr_auto] gap-4">
              <div>
                <Label>Style de carrousel</Label>
                <div className="flex flex-wrap gap-2">{CAROUSEL_STYLES.map((x) => <button key={x.id} type="button" className={chip(carouselStyle === x.id)} onClick={() => setCarouselStyle(x.id)}>{x.label}</button>)}</div>
              </div>
              <div>
                <Label>Nombre de slides</Label>
                <select className={INPUT} value={slideCount} aria-label="Nombre de slides" onChange={(e) => { setSlideCount(+e.target.value); setSlides([]); }}>{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} slides</option>)}</select>
              </div>
            </div>
          )}
          {isBa && (
            <div className="space-y-2">
              <Label>Ce qui change entre l&apos;avant et l&apos;après</Label>
              <div className="flex flex-wrap gap-2">{BA_CHANGES.map((x) => <button key={x.id} type="button" className={chip(baChange === x.id)} onClick={() => setBaChange(x.id)}>{x.label}</button>)}</div>
              {baChange === "autre" && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <input className={INPUT} value={baBefore} onChange={(e) => setBaBefore(e.target.value)} aria-label="La peau avant" placeholder="Avant : ex. peau déshydratée, ridules visibles" />
                  <input className={INPUT} value={baAfter} onChange={(e) => setBaAfter(e.target.value)} aria-label="La peau après" placeholder="Après : ex. peau rebondie, ridules atténuées" />
                </div>
              )}
              <p className="text-[12px] p-2.5 rounded-xl bg-[#FFF4D6] text-[#7A4B00]">Rappel : en publicité payante, Meta et la réglementation française refusent un « résultat » trompeur. Un avant/après créé par IA ne doit pas être présenté comme un vrai résultat client. C&apos;est plus souple en publication classique.</p>
            </div>
          )}
          <div>
            <Label>{isBa ? "Produit dans la photo" : "Produits (4 maximum)"}</Label>
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
              <button type="button" className={chip(modelIds.length === 0)} onClick={() => setModelIds([])}>{isBa ? "Visage inventé par l'IA" : "Sans personne"}</button>
              {models.map((m) => { const on = modelIds.includes(m.id); return <button key={m.id} type="button" className={chip(on)} onClick={() => setModelIds(on ? modelIds.filter((x) => x !== m.id) : isCar ? [m.id] : [...modelIds, m.id])}>{m.name}</button>; })}
            </div>
            {isCar && <p className="text-[11px] text-[#6B6B72] mt-1.5">Un carrousel garde le même mannequin sur toutes les slides.</p>}
            {isBa && <p className="text-[11px] text-[#6B6B72] mt-1.5">Chaque paire avant/après garde la même personne. Avec plusieurs mannequins, chaque paire a le sien.</p>}
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {isBa ? (
              <div>
                <Label>Paires avant / après</Label>
                <div className="flex flex-wrap gap-2">{[1, 2, 3].map((n) => <button key={n} type="button" className={chip(pairs === n)} onClick={() => setPairs(n)}>{n}</button>)}</div>
                <p className="text-[11px] text-[#6B6B72] mt-1">{pairs * 2} images au total.</p>
              </div>
            ) : !isCar && (
              <div>
                <Label>Nombre d&apos;images</Label>
                <div className="flex flex-wrap gap-2">{[2, 4, 6, 8].map((n) => <button key={n} type="button" className={chip(count === n)} onClick={() => setCount(n)}>{n}</button>)}</div>
              </div>
            )}
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
          <div className="flex justify-end"><Btn onClick={() => setStep("brief")} disabled={!canNext1}>Continuer</Btn></div>
        </Card>
      )}

      {step === "brief" && (
        <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
          <Card className="p-5 space-y-4">
            <h2 className="text-lg font-semibold">{isBa ? "Précisions sur le portrait (facultatif)" : isCar ? "Racontez votre carrousel" : "Dites ce que vous aimeriez faire"}</h2>
            <p className="text-sm text-[#52525B]">{isBa ? "Cadrage, lumière, coiffure, âge… Laissez vide pour un portrait de face, en lumière neutre."
              : isCar ? "Le sujet et le message, même en une phrase. Si vous avez déjà votre plan slide par slide, collez-le ici : il sera suivi tel quel. Le plan détaillé vous est proposé à l'étape 4."
              : "Même en une phrase vague. Les idées, c'est l'étape suivante qui les apporte."}</p>
            <textarea className={INPUT + " min-h-[130px]"} value={brief} onChange={(e) => setBrief(e.target.value)} aria-label="Votre brief" autoFocus
              placeholder={isBa ? "Ex. : portrait de face, cheveux attachés, fond clair." : isCar ? "Ex. : pourquoi le nila bleu illumine le teint, du geste jusqu'au résultat. Ton direct, pas nunuche." : "Ex. : une campagne hiver pour le Masque Nila, luxe et mode, pas nunuche."} />
            {!isBa && (
              <div className="flex flex-wrap items-center gap-2">
                <Btn size="sm" variant="ghost" onClick={improve} disabled={busy !== "" || !brief.trim()}>{busy === "brief" ? <Spinner /> : <Wand2 size={13} />} Améliorer mon brief</Btn>
                {prevBrief !== null && <button type="button" className="text-xs font-semibold text-[#52525B]" onClick={() => { setBrief(prevBrief); setPrevBrief(null); }}>Revenir à ma version</button>}
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Btn variant="ghost" onClick={() => setStep("setup")}>Retour</Btn>
              {isBa
                ? <Btn onClick={launch} disabled={busy !== "" || pendingInsp}>{busy === "launch" ? <><Spinner className="border-white/40 border-t-white" /> Préparation…</> : pendingInsp ? "Analyse des inspirations…" : "Créer la photo « avant » (1 image payante)"}</Btn>
                : <Btn onClick={goDirections} disabled={!brief.trim() || pendingInsp}>{pendingInsp ? "Analyse des inspirations…" : "Voir des directions"}</Btn>}
            </div>
            {isBa && <p className="text-[11px] text-[#6B6B72]">Une seule image est générée d&apos;abord : la photo « avant ». Vous la validez, puis l&apos;« après » est créé à partir d&apos;elle{pairs > 1 ? `, ainsi que les ${pairs - 1} autre${pairs > 2 ? "s" : ""} paire${pairs > 2 ? "s" : ""}` : ""}.</p>}
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
            {isCar && inspirations.length > 1 && <p className="text-[11px] text-[#7A4B00] bg-[#FFF4D6] rounded-lg px-2 py-1.5">Pour un carrousel, c&apos;est la première inspiration qui donne le style de toutes les photos. Les autres servent seulement aux directions.</p>}
            <p className="text-[11px] text-[#6B6B72]">Votre <Link href="/settings/da" className="text-[#1F55BC] font-semibold">DA de marque</Link> est appliquée automatiquement.</p>
          </Card>
        </div>
      )}

      {step === "direction" && (
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Choisissez une direction</h2>
              <p className="text-sm text-[#52525B]">Une direction = un univers pour {isCar ? "tout le carrousel" : "toute la campagne"}. Les esquisses sont des brouillons rapides : seule l&apos;ambiance compte, pas les détails.</p>
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
          {chosen === null && chosenText.trim() !== "" && !dirs.length && busy !== "dirs" && (
            <div className="flex flex-wrap gap-3 items-start bg-[#EBF2FF] border border-[#C9D9F8] rounded-2xl p-3">
              {keptSketch && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl(keptSketch)} alt="Esquisse de la direction reprise" className="w-24 aspect-[4/5] object-cover rounded-xl" />}
              <p className="text-sm text-[#1F3F7A] flex-1 min-w-[220px]"><b>Direction reprise de la campagne précédente.</b> Vous pouvez la garder, la modifier ci-dessous, ou demander d&apos;autres directions avec le bouton « Autres directions ».</p>
            </div>
          )}
          {(chosen !== null || chosenText.trim() !== "") && (
            <div>
              <Label>Direction choisie (modifiable)</Label>
              <textarea className={INPUT + " min-h-[80px] !text-[13px]"} value={chosenText} onChange={(e) => setChosenText(e.target.value)} aria-label="Direction choisie" />
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Btn variant="ghost" onClick={() => setStep("brief")}>Retour</Btn>
            {isCar
              ? <Btn onClick={goPlan} disabled={busy !== "" || !chosenText.trim()}>Continuer : le plan des slides</Btn>
              : <Btn onClick={launch} disabled={busy !== "" || !chosenText.trim()}>{busy === "launch" ? <><Spinner className="border-white/40 border-t-white" /> Préparation de la campagne…</> : "Créer l'image pilote (1 image payante)"}</Btn>}
          </div>
          <p className="text-[11px] text-[#6B6B72]">{isCar ? "Le plan des slides (photos et textes) est écrit dans cette direction. Rien n'est payé en haute qualité à cette étape." : `Une seule image est générée en haute qualité. Vous la validez, puis les ${count - 1} autres sont créées à partir d'elle.`}</p>
        </Card>
      )}

      {step === "plan" && (
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold">Le plan du carrousel</h2>
              <p className="text-sm text-[#52525B]">Pour chaque slide : la photo à créer, le titre et le petit texte. Tout est modifiable. Les photos sortent sans texte ; les textes sont posés ensuite, exactement comme écrits ici, avec « Habiller le carrousel ».</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Btn size="sm" variant="ghost" disabled={busy !== "" || slides.length <= 3} onClick={() => setSlides(slides.slice(0, -1))}>− 1 slide</Btn>
              <Btn size="sm" variant="ghost" disabled={busy !== "" || !slides.length || slides.length >= 10} onClick={() => setSlides([...slides, emptySlide()])}>+ 1 slide</Btn>
              <Btn size="sm" variant="ghost" onClick={() => proposePlan()} disabled={busy !== ""}>{busy === "plan" ? <Spinner /> : <Wand2 size={13} />} Refaire le plan</Btn>
            </div>
          </div>
          {busy === "plan" && <p className="text-sm text-[#52525B] flex items-center gap-2"><Spinner /> L&apos;IA écrit le plan dans la direction choisie (environ 30 secondes)…</p>}
          {slides.length > 0 && planFor !== chosenText && busy !== "plan" && (
            <p className="text-[12px] text-[#7A4B00] bg-[#FFF4D6] rounded-xl px-3 py-2">La direction a changé depuis ce plan : les photos décrites ici correspondent à l&apos;ancienne. Cliquez sur « Refaire le plan » pour les réécrire (vos textes modifiés seront remplacés).</p>
          )}
          {slides.length > 0 && <SlideCards slides={slides} onChange={setSlides} />}
          {slides.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <input className={INPUT + " flex-1 min-w-[240px]"} value={planRework} onChange={(e) => setPlanRework(e.target.value)} aria-label="Retravailler le plan" placeholder="Retravailler : ex. textes plus courts, ton plus direct, la slide 3 sur la texture"
                onKeyDown={(e) => { if (e.key === "Enter" && planRework.trim() && busy === "") proposePlan(planRework); }} />
              <Btn size="sm" variant="ghost" onClick={() => proposePlan(planRework)} disabled={busy !== "" || !planRework.trim()}>Ajuster le plan</Btn>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Btn variant="ghost" onClick={() => setStep("direction")}>Retour</Btn>
            <Btn onClick={launch} disabled={busy !== "" || photoSlides < 1}>{busy === "launch" ? <><Spinner className="border-white/40 border-t-white" /> Préparation du carrousel…</> : photoSlides > 1 ? "Créer la couverture (1 image payante)" : "Créer la photo (1 image payante)"}</Btn>
          </div>
          {slides.length > 0 && <p className="text-[11px] text-[#6B6B72]">{slides.length} slides, dont {photoSlides} photo{photoSlides > 1 ? "s" : ""} à créer (environ 0,20 € chacune){slides.length > photoSlides ? " ; les slides texte seules ne coûtent rien" : ""}. Une seule est générée d&apos;abord : la couverture. Vous la validez, puis les autres sont créées dans le même univers.</p>}
        </Card>
      )}
    </div>
  );
}
