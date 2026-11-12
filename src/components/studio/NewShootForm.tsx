"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X, Wand2 } from "lucide-react";
import { Btn, Card, INPUT, Label, Spinner, Badge } from "@/components/ui";
import { api, uploadImage, useSignedUrls, useSupabase } from "@/lib/client";
import { FORMATS, type Role } from "@/types";
import { VISUAL_TYPES, SOCIAL_STYLES, TEXT_ZONES, BA_CHANGES, CAROUSEL_STYLES, SLIDE_LAYOUTS, SLIDE_ZONES, emptySlide, normalizeSlides, type Slide, type VisualType } from "@/lib/visualTypes";

interface Props {
  role: Role;
  products: { id: string; name: string }[];
  models: { id: string; name: string; is_brand_model: boolean; path: string | null }[];
  concepts: { id: string; name: string; prompt: string; aspect: string; inspiration_paths: string[] }[];
  projects: { id: string; name: string }[];
  projectProducts: Record<string, string[]>;
  quota: { used: number; limit: number | null };
  initialConceptId?: string;
  initialProductId?: string;
  initial: { inspirationPaths: string[]; productId?: string; aspect?: string };
  again?: { visualType?: string; typeParams?: Record<string, any>; modelMode?: string; noProduct?: boolean; productId: string; productIds?: string[]; productMode?: string | null; projectId: string | null; modelIds: string[]; noPeople: boolean; prompt: string; aspect: string; size: string; engine: string; variants: number; inspirationPaths: string[] };
}

export default function NewShootForm(p: Props) {
  const sb = useSupabase();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const isCreator = p.role === "creator";

  const [projectId, setProjectId] = useState<string>(p.again?.projectId ?? (isCreator ? p.projects[0]?.id ?? "" : ""));
  const [productMode, setProductMode] = useState<"split" | "together" | "mix">(p.again?.productMode === "together" || p.again?.productMode === "split" ? p.again.productMode : "mix");
  const [extraIds, setExtraIds] = useState<string[]>(p.again?.productIds?.slice(1) ?? []);
  const [productId, setProductId] = useState(p.again?.productId ?? p.initial.productId ?? p.initialProductId ?? "");
  // Mannequins : par défaut, les mannequins de la marque (ou tous ceux qui existent)
  const brandIds = p.models.filter((m) => m.is_brand_model).map((m) => m.id);
  const [peopleMode, setPeopleMode] = useState<"models" | "random" | "none">(p.again ? (p.again.noPeople ? "none" : p.again.modelIds.length ? "models" : "random") : p.models.length ? "models" : "random");
  const [modelIds, setModelIds] = useState<string[]>(p.again?.modelIds.length ? p.again.modelIds : brandIds.length ? brandIds : p.models.map((m) => m.id));
  const [conceptId, setConceptId] = useState<string>("");
  const [prompt, setPrompt] = useState(p.again?.prompt ?? "");
  const [aspect, setAspect] = useState(p.again && FORMATS[p.again.aspect] ? p.again.aspect : p.initial.aspect && FORMATS[p.initial.aspect] ? p.initial.aspect : "4:5");
  const [variants, setVariants] = useState(p.again?.variants ?? 6);
  const engine = "openai";
  const [size, setSize] = useState(p.again?.size ?? "2K");
  const [inspirations, setInspirations] = useState<string[]>(p.again?.inspirationPaths ?? p.initial.inspirationPaths);
  const [vtype, setVtype] = useState<VisualType>((VISUAL_TYPES.find((t) => t.id === p.again?.visualType)?.id) ?? "photo");
  const tp0 = p.again?.typeParams ?? {};
  const [noProduct, setNoProduct] = useState(!!p.again?.noProduct);
  const [modelMode, setModelMode] = useState<"split" | "together">(p.again?.modelMode === "together" ? "together" : "split");
  const [socialStyle, setSocialStyle] = useState<string>(tp0.socialStyle ?? "feed");
  const [textZone, setTextZone] = useState<string>(tp0.textZone ?? "top");
  const [slides, setSlides] = useState<Slide[]>(normalizeSlides(tp0.slides).length ? normalizeSlides(tp0.slides) : Array.from({ length: 5 }, emptySlide));
  const [carouselStyle, setCarouselStyle] = useState<string>(tp0.carouselStyle ?? "edu");
  const setSlide = (i: number, p: Partial<Slide>) => setSlides((all) => all.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const [planning, setPlanning] = useState(false);
  const [baChange, setBaChange] = useState<string>(tp0.baChange ?? "terne");
  const [baBefore, setBaBefore] = useState<string>(tp0.baBefore ?? "");
  const [baAfter, setBaAfter] = useState<string>(tp0.baAfter ?? "");
  const [pairs, setPairs] = useState(1);
  const [inspMode, setInspMode] = useState<"copy" | "loose">(tp0.inspMode === "copy" ? "copy" : "loose");
  const [uploading, setUploading] = useState(0);
  // Chaque inspiration est analysée dès son ajout : le client voit ce que l'IA a compris et peut le corriger avant de lancer
  const [insp, setInsp] = useState<Record<string, { state: "loading" | "done" | "error"; analysis: string; summary: string; note: string; phoneUi: boolean }>>({});
  useEffect(() => {
    inspirations.forEach((path) => {
      if (insp[path]) return;
      setInsp((m) => ({ ...m, [path]: { state: "loading", analysis: "", summary: "", note: "", phoneUi: false } }));
      api<{ analysis: string; summary: string; phoneUi: boolean }>("/api/inspirations/analyze", { path })
        .then((r) => setInsp((m) => ({ ...m, [path]: { state: "done", analysis: r.analysis, summary: r.summary, note: r.summary, phoneUi: r.phoneUi } })))
        .catch(() => setInsp((m) => ({ ...m, [path]: { state: "error", analysis: "", summary: "", note: "", phoneUi: false } })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspirations]);
  const inspPending = inspirations.some((p) => insp[p]?.state === "loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urls = useSignedUrls(inspirations);
  const modelUrls = useSignedUrls(p.models.map((m) => m.path));

  const allowedProducts = useMemo(() => {
    if (!projectId) return p.products;
    const ids = p.projectProducts[projectId];
    return ids ? p.products.filter((x) => ids.includes(x.id)) : isCreator ? [] : p.products;
  }, [projectId, p.products, p.projectProducts, isCreator]);

  useEffect(() => {
    if (!allowedProducts.find((x) => x.id === productId)) setProductId(allowedProducts[0]?.id ?? "");
  }, [allowedProducts, productId]);

  useEffect(() => {
    if (!p.initialConceptId) return;
    const c = p.concepts.find((x) => x.id === p.initialConceptId);
    if (c) applyConcept(c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyConcept(id: string) {
    setConceptId(id);
    const c = p.concepts.find((x) => x.id === id);
    if (!c) return;
    setPrompt(c.prompt);
    if (FORMATS[c.aspect]) setAspect(c.aspect);
    setInspirations(c.inspiration_paths);
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setUploading((n) => n + list.length);
    try {
      const { data: { user } } = await sb.auth.getUser();
      for (const f of list) {
        const path = await uploadImage(sb, `inspirations/${user!.id}`, f, 1400);
        setInspirations((prev) => [...prev, path]);
        setUploading((n) => n - 1);
      }
      setConceptId("");
    } catch (e) { setError(e instanceof Error ? e.message : "Envoi impossible"); setUploading(0); }
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const fs = Array.from(e.clipboardData?.files ?? []); if (fs.length) addFiles(fs); };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remaining = p.quota.limit === null ? Infinity : p.quota.limit - p.quota.used;
  const noPeople = peopleMode === "none";
  const nImages = vtype === "carousel" ? Math.max(1, slides.filter((x) => x.layout !== "text").length) : vtype === "ba" ? pairs * 2 : variants;

  function selectType(t: VisualType) {
    setVtype(t);
    if (t === "ba") setNoProduct(true);
    if (t === "carousel" || t === "social" || t === "ad") { if (aspect === "16:9") setAspect("4:5"); }
  }

  async function proposeSlides() {
    setError(null);
    if (!prompt.trim()) return setError("Décris d'abord l'histoire du carrousel dans la consigne");
    setPlanning(true);
    try {
      const r = await api<{ slides: Slide[] }>("/api/shoots/slides", { idea: prompt, n: slides.length, style: carouselStyle, productIds: noProduct ? [] : [productId, ...extraIds.filter((x) => x !== productId)], noProduct, people: !noPeople });
      setSlides(r.slides);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    setPlanning(false);
  }

  async function submit() {
    setError(null);
    if (!productId) return setError("Choisis un produit");
    if (!prompt.trim() && vtype !== "carousel" && vtype !== "ba") return setError("Écris une consigne");
    if (vtype === "carousel" && !prompt.trim() && !slides.some((x) => x.photo || x.title || x.body)) return setError("Décris le carrousel dans la consigne, ou remplis les slides");
    if (vtype === "carousel" && !slides.some((x) => x.layout !== "text")) return setError("Il faut au moins une slide avec photo");
    if (vtype === "ba" && baChange === "autre" && (!baBefore.trim() || !baAfter.trim())) return setError("Décris l'avant et l'après");
    if (isCreator && !projectId) return setError("Choisis un projet");
    if (peopleMode === "models" && !modelIds.length) return setError("Coche au moins un mannequin, ou choisis « Varié » / « Sans personne »");
    setBusy(true);
    try {
      const r = await api<{ shootId: string; imageIds: string[] }>("/api/shoots", {
        productId, productIds: [productId, ...extraIds.filter((x) => x !== productId)].slice(0, 4), productMode, projectId: projectId || null, modelIds: peopleMode === "models" ? modelIds : [],
        conceptId: conceptId || null, prompt, aspect, size, engine, variants, noPeople, noProduct, inspirationPaths: inspirations,
        inspirationAnalyses: inspirations.map((p) => {
          const a = insp[p];
          if (a?.state !== "done") return null;
          const edited = a.note.trim() !== a.summary.trim();
          // Interface de téléphone retirée du texte par le client : on ne la reproduit pas
          const dropUi = a.phoneUi && edited && !/interface|t[ée]l[ée]phone|iphone/i.test(a.note);
          return { path: p, analysis: dropUi ? a.analysis.replace(/PHONE UI:\s*yes/gi, "PHONE UI: no") : a.analysis, note: edited ? a.note : "" };
        }).filter(Boolean),
        visualType: vtype, modelMode, slideCount: slides.length, pairs,
        typeParams: { inspMode, socialStyle, textZone, slides, carouselStyle, baChange, baBefore, baAfter },
      });
      sessionStorage.setItem(`run:${r.shootId}`, JSON.stringify(r.imageIds));
      router.push(`/shoots/${r.shootId}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); setBusy(false); }
  }

  if (!p.products.length) {
    return <Card className="p-8 text-center text-sm text-[#6B6B72]">{isCreator ? "Aucun produit ne t'est encore assigné. Demande à l'équipe Irizée de t'ajouter à un projet." : <>Ajoute d'abord un produit dans <a className="text-[#2B6EE8] font-medium" href="/products">Catalogue → Produits</a>.</>}</Card>;
  }

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="space-y-5">
        <div>
          <Label>Type de visuel</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {VISUAL_TYPES.map((t) => (
              <button key={t.id} type="button" onClick={() => selectType(t.id)}
                className={`text-left rounded-2xl border p-3 transition ${vtype === t.id ? "border-[#2B6EE8] bg-[#EBF2FF] ring-1 ring-[#2B6EE8]" : "border-[#E4E4E7] bg-white hover:bg-[#F4F4F5]"}`}>
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-[11px] text-[#6B6B72] mt-0.5 leading-snug">{t.desc}</p>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#A0A0A8] mt-1.5">Les images sortent sans texte : vous poserez les textes ensuite dans Ads.</p>
        </div>

        {vtype === "social" && (
          <div>
            <Label>Style du post</Label>
            <div className="flex flex-wrap gap-1.5">
              {SOCIAL_STYLES.map((x) => <Chip key={x.id} on={socialStyle === x.id} onClick={() => setSocialStyle(x.id)}>{x.label}</Chip>)}
            </div>
          </div>
        )}
        {vtype === "ad" && (
          <div>
            <Label>Où laisser de la place pour le texte ?</Label>
            <div className="flex flex-wrap gap-1.5">
              {TEXT_ZONES.map((x) => <Chip key={x.id} on={textZone === x.id} onClick={() => setTextZone(x.id)}>{x.label}</Chip>)}
            </div>
          </div>
        )}
        {vtype === "ba" && (
          <div className="space-y-2">
            <Label>Ce qui change entre l&apos;avant et l&apos;après</Label>
            <div className="flex flex-wrap gap-1.5">
              {BA_CHANGES.map((x) => <Chip key={x.id} on={baChange === x.id} onClick={() => setBaChange(x.id)}>{x.label}</Chip>)}
            </div>
            {baChange === "autre" && (
              <div className="grid sm:grid-cols-2 gap-2">
                <input className={INPUT} value={baBefore} onChange={(e) => setBaBefore(e.target.value)} placeholder="Avant : ex. peau déshydratée, ridules visibles" />
                <input className={INPUT} value={baAfter} onChange={(e) => setBaAfter(e.target.value)} placeholder="Après : ex. peau rebondie, ridules atténuées" />
              </div>
            )}
            <p className="text-[11px] text-[#6B6B72]">L&apos;« après » est créé à partir de l&apos;« avant » : même personne, même cadrage, même lumière, seule la peau change.</p>
            <p className="text-[12px] p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">Rappel : en publicité payante, Meta et la réglementation française refusent un « résultat » trompeur. Un avant/après généré par IA ne doit pas être présenté comme un vrai résultat client. Plus souple en organique.</p>
          </div>
        )}
        {p.concepts.length > 0 && (
          <div>
            <Label>Partir d&apos;un concept de la bibliothèque</Label>
            <select className={INPUT} value={conceptId} onChange={(e) => applyConcept(e.target.value)}>
              <option value="">— Nouveau concept —</option>
              {p.concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <Label>Images d&apos;inspiration (Pinterest…)</Label>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <button type="button" onClick={() => setInspMode("loose")} className={`text-left px-3 py-2 rounded-xl border transition ${inspMode === "loose" ? "bg-[#EBF2FF] border-[#2B6EE8]" : "bg-white border-[#E4E4E7] hover:bg-[#F4F4F5]"}`}>
              <span className={`block text-xs font-semibold ${inspMode === "loose" ? "text-[#2B6EE8]" : "text-[#0A0A0B]"}`}>S&apos;inspirer</span>
              <span className="block text-[11px] text-[#6B6B72] leading-snug">Même ambiance, couleurs et lumière, mais une photo différente.</span>
            </button>
            <button type="button" onClick={() => setInspMode("copy")} className={`text-left px-3 py-2 rounded-xl border transition ${inspMode === "copy" ? "bg-[#EBF2FF] border-[#2B6EE8]" : "bg-white border-[#E4E4E7] hover:bg-[#F4F4F5]"}`}>
              <span className={`block text-xs font-semibold ${inspMode === "copy" ? "text-[#2B6EE8]" : "text-[#0A0A0B]"}`}>Reproduire</span>
              <span className="block text-[11px] text-[#6B6B72] leading-snug">Même composition, cadrage et pose, avec vos produits.</span>
            </button>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="border-2 border-dashed border-[#E4E4E7] rounded-2xl p-5 text-center text-sm text-[#6B6B72] cursor-pointer hover:border-[#2B6EE8] hover:bg-[#EBF2FF]/40 transition"
          >
            <ImagePlus className="mx-auto mb-1.5 text-[#A0A0A8]" size={22} />
            Dépose, colle (Ctrl+V) ou clique pour ajouter des images
            <p className="text-[11px] text-[#A0A0A8] mt-1">Elles servent uniquement à l&apos;ambiance (angle, lumière, composition) : jamais copiées.</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          {(inspirations.length > 0 || uploading > 0) && (
            <div className="space-y-2 mt-3">
              {inspirations.map((path, i) => {
                const a = insp[path];
                return (
                  <div key={path} className="flex gap-3 items-start bg-white border border-[#E4E4E7] rounded-2xl p-2">
                    <div className="relative w-20 h-24 shrink-0 rounded-xl overflow-hidden bg-[#F4F4F5]">
                      {urls[path] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[path]} alt="" className="w-full h-full object-cover" />}
                      <button onClick={() => { setInspirations(inspirations.filter((_, k) => k !== i)); setConceptId(""); }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center" aria-label="Retirer"><X size={11} /></button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-[#6B6B72] mb-1">Ce que l&apos;IA va reprendre de cette inspiration</p>
                      {!a || a.state === "loading" ? <p className="text-xs text-[#6B6B72] flex items-center gap-1.5"><Spinner className="w-3 h-3" /> Analyse en cours…</p>
                        : a.state === "error" ? <p className="text-xs text-[#B45309]">Analyse impossible pour l&apos;instant : elle sera refaite au lancement.</p>
                        : <>
                          <textarea className={INPUT + " min-h-[64px] !text-[12px]"} value={a.note} onChange={(e) => { const v = e.target.value; setInsp((m) => ({ ...m, [path]: { ...m[path], note: v } })); }} />
                          <p className="text-[11px] text-[#A0A0A8] mt-1">Corrigez ce texte si l&apos;IA s&apos;est trompée ou s&apos;il faut ignorer quelque chose : votre version passe avant.{a.phoneUi ? " Interface de téléphone détectée : elle sera reproduite (retirez-la du texte si vous n'en voulez pas)." : ""}</p>
                        </>}
                    </div>
                  </div>
                );
              })}
              {uploading > 0 && <div className="w-20 h-24 rounded-xl border border-dashed border-[#E4E4E7] flex items-center justify-center"><Spinner /></div>}
            </div>
          )}
        </div>

        <div>
          <Label>Consigne</Label>
          <textarea className={INPUT + " min-h-[110px]"} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder={vtype === "carousel" ? "Ex : le rituel du soir avec le Masque Nila, de la couverture jusqu'au résultat. Ambiance douce, tons sable." : vtype === "ba" ? "Ex : portrait de face, lumière neutre, cheveux attachés (facultatif)" : vtype === "free" ? "Ex : gros plan d'une goutte de texture sur une pierre sombre" : "Ex : même ambiance mais tout en bleu électrique : chemise, lunettes et rayons au sol. Lumière douce du matin."} />
          <p className="text-[11px] text-[#A0A0A8] mt-1">Les règles de la marque sont appliquées automatiquement à chaque génération.</p>
        </div>

        {vtype === "carousel" && (
          <div className="space-y-3">
            <div>
              <Label>Style de carrousel</Label>
              <div className="flex flex-wrap gap-1.5">
                {CAROUSEL_STYLES.map((x) => <Chip key={x.id} on={carouselStyle === x.id} onClick={() => setCarouselStyle(x.id)}>{x.label}</Chip>)}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Les slides ({slides.length})</Label>
              <div className="flex items-center gap-1.5">
                <Btn size="sm" variant="ghost" disabled={slides.length <= 3} onClick={() => setSlides(slides.slice(0, -1))}>− 1</Btn>
                <Btn size="sm" variant="ghost" disabled={slides.length >= 10} onClick={() => setSlides([...slides, emptySlide()])}>+ 1</Btn>
                <Btn size="sm" onClick={proposeSlides} disabled={planning}>{planning ? <Spinner className="border-white/40 border-t-white" /> : <Wand2 size={13} />} L&apos;IA propose le plan et les textes</Btn>
              </div>
            </div>
            <div className="space-y-2">
              {slides.map((x, i) => (
                <div key={i} className="rounded-2xl border border-[#E4E4E7] bg-white p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold w-14 shrink-0">Slide {i + 1}</span>
                    <select aria-label={`Mise en page de la slide ${i + 1}`} className={INPUT + " !w-auto !py-1.5 text-xs"} value={x.layout} onChange={(e) => setSlide(i, { layout: e.target.value as Slide["layout"] })}>
                      {SLIDE_LAYOUTS.filter((l) => i > 0 || l.id !== "text").map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                    <select aria-label={`Place du texte, slide ${i + 1}`} className={INPUT + " !w-auto !py-1.5 text-xs"} value={x.zone} onChange={(e) => setSlide(i, { zone: e.target.value as Slide["zone"] })}>
                      {SLIDE_ZONES.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
                    </select>
                  </div>
                  {x.layout !== "text" && (
                    <input className={INPUT} value={x.photo} onChange={(e) => setSlide(i, { photo: e.target.value })} aria-label={`Photo de la slide ${i + 1}`}
                      placeholder={i === 0 ? "Photo : ex. le tube posé sur une pierre claire, lumière douce" : "Photo à créer (vide : l'IA décide)"} />
                  )}
                  <div className="grid sm:grid-cols-[1fr_1.4fr] gap-2">
                    <input className={INPUT} value={x.title} maxLength={80} onChange={(e) => setSlide(i, { title: e.target.value })} aria-label={`Titre de la slide ${i + 1}`} placeholder="Titre" />
                    <input className={INPUT} value={x.body} maxLength={220} onChange={(e) => setSlide(i, { body: e.target.value })} aria-label={`Texte de la slide ${i + 1}`} placeholder="Petit texte (facultatif)" />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[#A0A0A8]">Les photos sont générées sans texte, avec de la place pour lui. Les textes sont posés ensuite, exactement comme écrits ici, avec « Habiller le carrousel » sur la page du shooting. Les slides texte seules ne coûtent rien. Slides vides : l&apos;IA propose le plan au lancement.</p>
          </div>
        )}
      </div>

      <Card className="p-5 space-y-4 lg:sticky lg:top-3">
        {(p.projects.length > 0) && (
          <div>
            <Label>Projet {isCreator ? "" : "(facultatif)"}</Label>
            <select className={INPUT} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {!isCreator && <option value="">Aucun</option>}
              {p.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <Label>Produit</Label>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <button type="button" onClick={() => setNoProduct(false)} className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition ${!noProduct ? "bg-[#EBF2FF] border-[#2B6EE8] text-[#2B6EE8]" : "bg-white border-[#E4E4E7] text-[#6B6B72] hover:bg-[#F4F4F5]"}`}>Avec produit</button>
            <button type="button" onClick={() => setNoProduct(true)} className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition ${noProduct ? "bg-[#EBF2FF] border-[#2B6EE8] text-[#2B6EE8]" : "bg-white border-[#E4E4E7] text-[#6B6B72] hover:bg-[#F4F4F5]"}`}>Sans produit</button>
          </div>
          {noProduct ? <p className="text-[11px] text-[#6B6B72]">Aucun produit dans l&apos;image : seulement la personne, le décor ou la texture décrits.</p> : <>
          <select className={INPUT} value={productId} onChange={(e) => setProductId(e.target.value)}>
            {allowedProducts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {allowedProducts.length > 1 && (
            <div className="mt-2">
              <p className="text-[11px] text-[#6B6B72] mb-1">Ajouter d&apos;autres produits dans la même photo (4 au total maximum) :</p>
              <div className="space-y-1">
                {allowedProducts.filter((x) => x.id !== productId).map((x) => {
                  const on = extraIds.includes(x.id);
                  return (
                    <label key={x.id} className="flex items-center gap-2 text-xs text-[#0A0A0B]">
                      <input type="checkbox" checked={on} disabled={!on && extraIds.filter((e) => e !== productId).length >= 3}
                        onChange={(e) => setExtraIds((cur) => e.target.checked ? [...cur, x.id] : cur.filter((i) => i !== x.id))} />
                      {x.name}
                    </label>
                  );
                })}
              </div>
              {extraIds.filter((e) => e !== productId).length > 0 && (
                <div className="mt-2 space-y-1">
                  <label className="flex items-start gap-2 text-xs"><input type="radio" className="mt-0.5" checked={productMode === "mix"} onChange={() => setProductMode("mix")} /><span><b>Mélange</b> (recommandé) : des images avec chaque produit seul, et des images avec tous les produits ensemble. Chaque inspiration est utilisée pour chaque cas.</span></label>
                  <label className="flex items-start gap-2 text-xs"><input type="radio" className="mt-0.5" checked={productMode === "split"} onChange={() => setProductMode("split")} /><span><b>Un produit par image</b>, en alternance.</span></label>
                  <label className="flex items-start gap-2 text-xs"><input type="radio" className="mt-0.5" checked={productMode === "together"} onChange={() => setProductMode("together")} /><span><b>Tous ensemble</b> dans chaque photo : le texte et la forme de chacun sont plus difficiles à garder fidèles.</span></label>
                  {productMode === "mix" && <p className="text-[11px] text-[#6B6B72]">Avec {1 + extraIds.filter((e) => e !== productId).length} produits, {2 + extraIds.filter((e) => e !== productId).length} variantes font un cycle complet (chaque produit seul + tous ensemble) : choisis un multiple de {2 + extraIds.filter((e) => e !== productId).length}.</p>}
                </div>
              )}
            </div>
          )}
          </>}
        </div>
        <div>
          <Label>Personnes sur les photos</Label>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {([["models", "Mes mannequins"], ["random", "Visages IA"], ["none", "Produit seul"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPeopleMode(k)} disabled={k === "models" && !p.models.length}
                className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition disabled:opacity-40 ${peopleMode === k ? "bg-[#EBF2FF] border-[#2B6EE8] text-[#2B6EE8]" : "bg-white border-[#E4E4E7] text-[#6B6B72] hover:bg-[#F4F4F5]"}`}>{l}</button>
            ))}
          </div>
          {peopleMode === "models" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {p.models.map((m) => {
                  const on = modelIds.includes(m.id);
                  return (
                    <button key={m.id} type="button" onClick={() => setModelIds(on ? modelIds.filter((x) => x !== m.id) : [...modelIds, m.id])}
                      className={`relative rounded-xl overflow-hidden border-2 text-left transition ${on ? "border-[#2B6EE8]" : "border-[#E4E4E7] opacity-70 hover:opacity-100"}`}>
                      <div className="aspect-[3/4] bg-[#F4F4F5]">
                        {m.path && modelUrls[m.path] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={modelUrls[m.path]} alt={m.name} className="w-full h-full object-cover" />}
                      </div>
                      <p className="text-[11px] font-semibold px-1.5 py-1 truncate">{m.is_brand_model ? "★ " : ""}{m.name}</p>
                      {on && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#2B6EE8] text-white text-[11px] flex items-center justify-center">✓</span>}
                    </button>
                  );
                })}
              </div>
              {modelIds.length > 1 && (
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  <button type="button" onClick={() => setModelMode("split")} className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition ${modelMode === "split" ? "bg-[#EBF2FF] border-[#2B6EE8] text-[#2B6EE8]" : "bg-white border-[#E4E4E7] text-[#6B6B72]"}`}>Un par image</button>
                  <button type="button" onClick={() => setModelMode("together")} className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition ${modelMode === "together" ? "bg-[#EBF2FF] border-[#2B6EE8] text-[#2B6EE8]" : "bg-white border-[#E4E4E7] text-[#6B6B72]"}`}>Ensemble (max 3)</button>
                </div>
              )}
              <p className="text-[11px] text-[#A0A0A8] mt-1.5">
                {modelIds.length > 1 && modelMode === "together" ? `Les ${Math.min(3, modelIds.length)} mannequins sont ensemble sur chaque image.`
                  : vtype === "carousel" ? "Le carrousel garde le même mannequin sur toutes les slides (le premier coché)."
                  : vtype === "ba" ? "Chaque paire avant/après garde le même mannequin."
                  : modelIds.length > 1 ? `Les ${variants} variantes alternent entre les ${modelIds.length} mannequins cochés.` : modelIds.length === 1 ? "Toutes les variantes utilisent ce mannequin." : "Coche au moins un mannequin."}
              </p>
            </>
          )}
          {peopleMode === "random" && <p className="text-[11px] text-[#A0A0A8]">L&apos;IA invente un nouveau visage à chaque image : ce ne sont pas tes mannequins. Choisis « Mes mannequins » pour garder tes visages.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Format</Label>
            <select className={INPUT} value={aspect} onChange={(e) => setAspect(e.target.value)}>
              {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}
            </select>
          </div>
          {vtype === "carousel" ? (
            <div><Label>Slides</Label><p className="text-sm font-semibold py-2">{slides.length} slides · {nImages} photo{nImages > 1 ? "s" : ""}</p></div>
          ) : vtype === "ba" ? (
            <div>
              <Label>Paires avant/après</Label>
              <select className={INPUT} value={pairs} onChange={(e) => setPairs(+e.target.value)}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n} ({n * 2} images)</option>)}
              </select>
            </div>
          ) : (
            <div>
              <Label>Variantes</Label>
              <select className={INPUT} value={variants} onChange={(e) => setVariants(+e.target.value)}>
                {[2, 4, 6, 8, 10, 12].map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Moteur</Label>
            <p className="text-sm font-semibold py-2">OpenAI <span className="text-[11px] font-normal text-[#6B6B72]">(≈ 0,20 € / image)</span></p>
          </div>
          <div>
            <Label>Résolution</Label>
            <select className={INPUT} value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="1K">Standard</option>
              <option value="2K">Haute (textes lisibles)</option>
              <option value="4K">Maximale</option>
            </select>
          </div>
        </div>

        {p.quota.limit !== null && (
          <p className="text-[12px] text-[#6B6B72] flex items-center gap-2">
            Quota du mois : <Badge tone={remaining < nImages ? "amber" : "blue"}>{p.quota.used} / {p.quota.limit} images</Badge>
          </p>
        )}
        {error && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>}
        <Btn className="w-full" onClick={submit} disabled={busy || uploading > 0 || inspPending || remaining < nImages}>
          {busy ? <><Spinner className="border-white/40 border-t-white" /> Préparation…</> : inspPending ? <><Spinner className="border-white/40 border-t-white" /> Analyse des inspirations…</> : <><Wand2 size={15} /> Générer {nImages} images</>}
        </Btn>
        {remaining < nImages && <p className="text-[12px] text-[#E8444A]">Il ne te reste que {Math.max(0, remaining)} images ce mois-ci.</p>}
      </Card>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-2 rounded-full text-xs font-semibold border transition ${on ? "bg-[#EBF2FF] border-[#2B6EE8] text-[#2B6EE8]" : "bg-white border-[#E4E4E7] text-[#0A0A0B] hover:bg-[#F4F4F5]"}`}>{children}</button>
  );
}
