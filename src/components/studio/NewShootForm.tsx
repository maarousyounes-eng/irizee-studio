"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X, Wand2 } from "lucide-react";
import { Btn, Card, INPUT, Label, Spinner, Badge } from "@/components/ui";
import { api, uploadImage, useSignedUrls, useSupabase } from "@/lib/client";
import { FORMATS, type Role } from "@/types";

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
  again?: { productId: string; productIds?: string[]; productMode?: string | null; projectId: string | null; modelIds: string[]; noPeople: boolean; prompt: string; aspect: string; size: string; engine: string; variants: number; inspirationPaths: string[] };
}

export default function NewShootForm(p: Props) {
  const sb = useSupabase();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const isCreator = p.role === "creator";

  const [projectId, setProjectId] = useState<string>(p.again?.projectId ?? (isCreator ? p.projects[0]?.id ?? "" : ""));
  const [productMode, setProductMode] = useState<"split" | "together">(p.again?.productMode === "together" ? "together" : "split");
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
  const [engine, setEngine] = useState(p.again?.engine ?? "pro");
  const [size, setSize] = useState(p.again?.size ?? "2K");
  const [inspirations, setInspirations] = useState<string[]>(p.again?.inspirationPaths ?? p.initial.inspirationPaths);
  const [uploading, setUploading] = useState(0);
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

  async function submit() {
    setError(null);
    if (!productId) return setError("Choisis un produit");
    if (!prompt.trim()) return setError("Écris une consigne");
    if (isCreator && !projectId) return setError("Choisis un projet");
    if (peopleMode === "models" && !modelIds.length) return setError("Coche au moins un mannequin, ou choisis « Varié » / « Sans personne »");
    setBusy(true);
    try {
      const r = await api<{ shootId: string; imageIds: string[] }>("/api/shoots", {
        productId, productIds: [productId, ...extraIds.filter((x) => x !== productId)].slice(0, 4), productMode, projectId: projectId || null, modelIds: peopleMode === "models" ? modelIds : [],
        conceptId: conceptId || null, prompt, aspect, size, engine, variants, noPeople, inspirationPaths: inspirations,
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
            <div className="flex gap-2 flex-wrap mt-3">
              {inspirations.map((path, i) => (
                <div key={path} className="relative w-20 h-24 rounded-xl overflow-hidden border border-[#E4E4E7] bg-[#F4F4F5]">
                  {urls[path] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[path]} alt="" className="w-full h-full object-cover" />}
                  <button onClick={() => { setInspirations(inspirations.filter((_, k) => k !== i)); setConceptId(""); }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center" aria-label="Retirer"><X size={11} /></button>
                </div>
              ))}
              {uploading > 0 && <div className="w-20 h-24 rounded-xl border border-dashed border-[#E4E4E7] flex items-center justify-center"><Spinner /></div>}
            </div>
          )}
        </div>

        <div>
          <Label>Consigne</Label>
          <textarea className={INPUT + " min-h-[110px]"} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex : même ambiance mais tout en bleu électrique : chemise, lunettes et rayons au sol. Lumière douce du matin." />
          <p className="text-[11px] text-[#A0A0A8] mt-1">Les règles de la marque sont appliquées automatiquement à chaque génération.</p>
        </div>
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
                  <label className="flex items-start gap-2 text-xs"><input type="radio" className="mt-0.5" checked={productMode === "split"} onChange={() => setProductMode("split")} /><span><b>Un produit par image</b>, en alternance (recommandé si tes inspirations montrent un seul produit). Chaque inspiration est utilisée pour chaque produit.</span></label>
                  <label className="flex items-start gap-2 text-xs"><input type="radio" className="mt-0.5" checked={productMode === "together"} onChange={() => setProductMode("together")} /><span><b>Tous ensemble dans la même photo</b> : le texte et la forme de chacun sont plus difficiles à garder fidèles.</span></label>
                </div>
              )}
            </div>
          )}
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
              <p className="text-[11px] text-[#A0A0A8] mt-1.5">
                {modelIds.length > 1 ? `Les ${variants} variantes alternent entre les ${modelIds.length} mannequins cochés.` : modelIds.length === 1 ? "Toutes les variantes utilisent ce mannequin." : "Coche au moins un mannequin."}
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
          <div>
            <Label>Variantes</Label>
            <select className={INPUT} value={variants} onChange={(e) => setVariants(+e.target.value)}>
              {[2, 4, 6, 8, 10, 12].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Moteur</Label>
            <select className={INPUT} value={engine} onChange={(e) => setEngine(e.target.value)}>
              <option value="pro">Qualité max (conseillé)</option>
              <option value="mix">Mix</option>
              <option value="flash">Rapide</option>
            </select>
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
            Quota du mois : <Badge tone={remaining < variants ? "amber" : "blue"}>{p.quota.used} / {p.quota.limit} images</Badge>
          </p>
        )}
        {error && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>}
        <Btn className="w-full" onClick={submit} disabled={busy || uploading > 0 || remaining < variants}>
          {busy ? <><Spinner className="border-white/40 border-t-white" /> Préparation…</> : <><Wand2 size={15} /> Générer {variants} variantes</>}
        </Btn>
        {remaining < variants && <p className="text-[12px] text-[#E8444A]">Il ne te reste que {Math.max(0, remaining)} images ce mois-ci.</p>}
      </Card>
    </div>
  );
}
