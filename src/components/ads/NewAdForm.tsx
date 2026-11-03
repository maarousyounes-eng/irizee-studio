"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Sparkles, Wand2, X } from "lucide-react";
import { Btn, Card, INPUT, Label, Spinner, Empty } from "@/components/ui";
import { api, imgUrl, uploadImage, usePipeline, useSupabase } from "@/lib/client";

type Pic = { id: string; path: string; thumb: string | null; productIds: string[]; approved: boolean };

const EXAMPLES = [
  "Mettre en avant l'éclat du teint avec le Masque Nila, ton glamour",
  "Lancement du Sérum Correcteur & Éclat : nouveau",
  "Routine du soir en 2 étapes : masque puis sérum",
];

type Model = { id: string; name: string; path: string | null; is_brand_model: boolean };
type GenImg = { id: string; path: string | null; thumb_path: string | null; state: string; verdict: string | null; score: number | null; error: string | null };

const SPACE: Record<string, { label: string; text: string }> = {
  top: { label: "En haut", text: "dans le tiers HAUT de l'image" },
  bottom: { label: "En bas", text: "dans le tiers BAS de l'image" },
  left: { label: "À gauche", text: "dans la moitié GAUCHE de l'image" },
  none: { label: "Pas d'espace", text: "" },
};

export default function NewAdForm({ products, pics, models }: { products: { id: string; name: string }[]; pics: Pic[]; models: Model[] }) {
  const sb = useSupabase();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [idea, setIdea] = useState("");
  const [onlyProduct, setOnlyProduct] = useState(true);
  const [onlyApproved, setOnlyApproved] = useState(true);
  const [picked, setPicked] = useState<{ path: string; id: string | null } | null>(null);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Création d'une image dédiée à la pub
  const [mode, setMode] = useState<"existing" | "generate">("existing");
  const [visual, setVisual] = useState("");
  const [space, setSpace] = useState("top");
  const [people, setPeople] = useState<"models" | "random" | "none">(models.length ? "models" : "random");
  const [modelIds, setModelIds] = useState<string[]>(models.filter((m) => m.is_brand_model).map((m) => m.id).slice(0, 1));
  const [insp, setInsp] = useState<string[]>([]);
  const [engine, setEngine] = useState("pro");
  const [count, setCount] = useState(2);
  const [aspect, setAspect] = useState("4:5");
  const [imgProducts, setImgProducts] = useState<"one" | "several" | "none">("one");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [productMode, setProductMode] = useState<"together" | "split" | "mix">("together");
  const risky = /avant|apr[eè]s|acn[eé]|bouton|imperfection|ride|tache|cicatrice|ecz[eé]ma|rougeur|pore dilat/i.test(visual);
  const [shootId, setShootId] = useState<string | null>(null);
  const [gen, setGen] = useState<GenImg[]>([]);
  const inspRef = useRef<HTMLInputElement>(null);
  const reload = useCallback(async () => {
    if (!shootId) return;
    const { data } = await sb.from("images").select("id, path, thumb_path, state, verdict, score, error").eq("shoot_id", shootId).eq("kind", "generated").order("variant_index");
    setGen((data ?? []) as GenImg[]);
  }, [sb, shootId]);
  const { running, run } = usePipeline(reload);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!shootId || !gen.some((g) => g.state === "generating" || (g.state === "done" && !g.verdict))) return;
    const tm = setInterval(reload, 3000);
    return () => clearInterval(tm);
  }, [shootId, gen, reload]);

  async function addInsp(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try { for (const f of Array.from(files).slice(0, 3 - insp.length)) { const p = await uploadImage(sb, "inspirations", f); setInsp((x) => [...x, p]); } }
    catch (e) { setError(e instanceof Error ? e.message : "Envoi impossible"); }
    setBusy(false);
  }

  async function generate() {
    setError(null);
    if (!productId) return setError("Choisis un produit (à droite)");
    if (!visual.trim()) return setError("Décris le visuel à créer");
    if (people === "models" && !modelIds.length) return setError("Coche au moins un mannequin");
    if (imgProducts === "several" && !extraIds.filter((x) => x !== productId).length) return setError("Coche au moins un autre produit");
    setBusy(true);
    try {
      const sp = SPACE[space];
      const prompt = `[Ads] ${visual.trim()}` + (sp.text ? `\n\nVisuel pour une publicité : laisse un grand espace vide et uni (fond simple, sans objet ni personne) ${sp.text}, pour y poser un titre plus tard. Le produit et le visage restent en dehors de cette zone.` : "") + " Aucun texte ajouté dans l'image.";
      const r = await api<{ shootId: string; imageIds: string[] }>("/api/shoots", {
        productId, prompt, aspect, size: "2K", engine, variants: count, noPeople: people === "none",
        noProduct: imgProducts === "none",
        productIds: imgProducts === "several" ? [productId, ...extraIds.filter((x) => x !== productId)].slice(0, 4) : [productId],
        productMode: imgProducts === "several" ? productMode : undefined,
        modelIds: people === "models" ? modelIds : [], inspirationPaths: insp,
      });
      setShootId(r.shootId);
      run(r.imageIds);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    setBusy(false);
  }

  const list = useMemo(() => pics.filter((p) => (!onlyProduct || p.productIds.includes(productId)) && (!onlyApproved || p.approved)), [pics, onlyProduct, onlyApproved, productId]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try {
      const path = await uploadImage(sb, "ads", files[0], 2400);
      setUploaded((u) => [path, ...u]);
      setPicked({ path, id: null });
    } catch (e) { setError(e instanceof Error ? e.message : "Envoi impossible"); }
    setBusy(false);
  }

  async function create() {
    setError(null);
    if (!productId) return setError("Choisis un produit");
    if (!idea.trim()) return setError("Décris l'idée de la pub");
    if (!picked) return setError("Choisis une image");
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/ads", { productId, idea, sourcePath: picked.path, sourceImageId: picked.id });
      router.push(`/ads/${r.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); setBusy(false); }
  }

  const tile = (path: string, thumb: string | null, id: string | null) => (
    <button key={path} type="button" onClick={() => setPicked({ path, id })} className={`relative rounded-xl overflow-hidden border-2 aspect-[4/5] ${picked?.path === path ? "border-[#2B6EE8]" : "border-transparent hover:border-[#C0C0C8]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgUrl(thumb || path)} alt="" className="w-full h-full object-cover" loading="lazy" />
    </button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => setMode("existing")} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${mode === "existing" ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#2B6EE8]" : "border-[#E4E4E7]"}`}>Utiliser une photo existante</button>
          <button type="button" onClick={() => setMode("generate")} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${mode === "generate" ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#2B6EE8]" : "border-[#E4E4E7]"}`}>Créer une image pour la pub</button>
        </div>
        {mode === "generate" && (
          <div className="space-y-3">
            <div>
              <Label>Décris le visuel à créer</Label>
              <textarea className={INPUT} rows={3} value={visual} onChange={(e) => setVisual(e.target.value)} placeholder="Ex : gros plan beauté, mannequin qui applique le Masque Nila sur la joue, fond beige uni, lumière douce" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Espace libre pour le texte</Label>
                <div className="grid grid-cols-4 gap-1">
                  {Object.entries(SPACE).map(([k, v]) => <button key={k} type="button" onClick={() => setSpace(k)} className={`rounded-lg border px-1 py-1.5 text-[11px] ${space === k ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#2B6EE8] font-semibold" : "border-[#E4E4E7]"}`}>{v.label}</button>)}
                </div>
              </div>
              <div>
                <Label>Personnes</Label>
                <div className="grid grid-cols-3 gap-1">
                  {([["models", "Mes mannequins"], ["random", "Visages IA"], ["none", "Produit seul"]] as const).map(([k, l]) => <button key={k} type="button" disabled={k === "models" && !models.length} onClick={() => setPeople(k)} className={`rounded-lg border px-1 py-1.5 text-[11px] disabled:opacity-40 ${people === k ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#2B6EE8] font-semibold" : "border-[#E4E4E7]"}`}>{l}</button>)}
                </div>
              </div>
            </div>
            <div>
              <Label>Produits dans l&apos;image</Label>
              <div className="grid grid-cols-3 gap-1">
                {([["one", "Le produit choisi"], ["several", "Plusieurs produits"], ["none", "Aucun produit"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setImgProducts(k)} className={`rounded-lg border px-1 py-1.5 text-[11px] ${imgProducts === k ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#2B6EE8] font-semibold" : "border-[#E4E4E7]"}`}>{l}</button>)}
              </div>
              {imgProducts === "one" && <p className="text-[11px] text-[#A0A0A8] mt-1">Le produit choisi à droite, avec son vrai packshot.</p>}
              {imgProducts === "none" && <p className="text-[11px] text-[#A0A0A8] mt-1">Gros plan peau, texture, ambiance, lifestyle… : aucun flacon ni logo dans l&apos;image. Le produit choisi à droite sert seulement aux textes de la pub.</p>}
              {imgProducts === "several" && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-3">
                    {products.filter((x) => x.id !== productId).map((x) => {
                      const on = extraIds.includes(x.id);
                      return <label key={x.id} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={on} disabled={!on && extraIds.filter((e) => e !== productId).length >= 3} onChange={(e) => setExtraIds((c) => e.target.checked ? [...c, x.id] : c.filter((i) => i !== x.id))} />{x.name}</label>;
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {([["together", "Tous ensemble"], ["split", "Un par image"], ["mix", "Mélange"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setProductMode(k)} className={`rounded-lg border px-1 py-1.5 text-[11px] ${productMode === k ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#2B6EE8] font-semibold" : "border-[#E4E4E7]"}`}>{l}</button>)}
                  </div>
                  <p className="text-[11px] text-[#A0A0A8]">Avec le produit choisi à droite + les produits cochés (4 au total maximum).</p>
                </div>
              )}
            </div>
            {risky && <p className="text-[11px] text-[#B45309] bg-amber-50 rounded-lg px-2.5 py-1.5">Attention : les visuels « avant / après » ou montrant des imperfections de peau sont souvent refusés par Meta et TikTok pour les cosmétiques, et ta règle de marque n°4 interdit de suggérer un résultat sur la peau. Préfère une peau naturelle, sans promesse de résultat.</p>}
            {people === "models" && (
              <div className="flex flex-wrap gap-2">
                {models.map((m) => {
                  const on = modelIds.includes(m.id);
                  return (
                    <button key={m.id} type="button" onClick={() => setModelIds((x) => on ? x.filter((i) => i !== m.id) : [...x, m.id])} className={`flex items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-1 text-xs ${on ? "border-[#2B6EE8] bg-[#EBF2FF]" : "border-[#E4E4E7]"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {m.path ? <img src={imgUrl(m.path)} alt="" className="w-6 h-6 rounded-full object-cover" /> : <span className="w-6 h-6 rounded-full bg-[#E4E4E7]" />}
                      {m.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div>
              <Label>Inspiration (facultatif, jusqu&apos;à 3 : une pub de concurrent, une photo Pinterest…)</Label>
              <div className="flex flex-wrap gap-2 items-center">
                {insp.map((p) => (
                  <div key={p} className="relative w-16 h-20 rounded-lg overflow-hidden border border-[#E4E4E7]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgUrl(p)} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setInsp((x) => x.filter((i) => i !== p))} className="absolute top-0.5 right-0.5 bg-white/90 rounded-full p-0.5"><X size={10} /></button>
                  </div>
                ))}
                {insp.length < 3 && <Btn size="sm" variant="ghost" onClick={() => inspRef.current?.click()} disabled={busy}><ImagePlus size={12} /> Ajouter</Btn>}
                <input ref={inspRef} type="file" accept="image/*" multiple hidden onChange={(e) => addInsp(e.target.files)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Moteur</Label>
                <select className={INPUT} value={engine} onChange={(e) => setEngine(e.target.value)}>
                  <option value="pro">Gemini (≈ 0,13 €)</option>
                  <option value="openai">OpenAI (≈ 0,20 €)</option>
                </select>
              </div>
              <div>
                <Label>Format de base</Label>
                <select className={INPUT} value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  <option value="4:5">Portrait 4:5</option>
                  <option value="9:16">Vertical 9:16</option>
                  <option value="1:1">Carré 1:1</option>
                </select>
              </div>
              <div>
                <Label>Images</Label>
                <select className={INPUT} value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <Btn onClick={generate} disabled={busy || running.size > 0}>{busy ? <Spinner /> : <Sparkles size={14} />} Créer {count} image{count > 1 ? "s" : ""} (≈ {(count * (engine === "openai" ? 0.2 : 0.13)).toFixed(2)} €)</Btn>
            <p className="text-[11px] text-[#A0A0A8]">Les autres formats (9:16, 1:1, paysage) sont recadrés depuis cette image dans l&apos;éditeur. Le produit garde son vrai design ; les textes de la pub seront posés ensuite avec une vraie police.</p>
            {gen.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {gen.map((g) => (
                  g.state === "done" && g.path ? (
                    <button key={g.id} type="button" onClick={() => setPicked({ path: g.path!, id: g.id })} className={`relative rounded-xl overflow-hidden border-2 aspect-[4/5] ${picked?.path === g.path ? "border-[#2B6EE8]" : "border-transparent hover:border-[#C0C0C8]"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imgUrl(g.thumb_path || g.path)} alt="" className="w-full h-full object-cover" />
                      {g.verdict && <span className={`absolute top-1 left-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-white/95 ${g.verdict === "valid" ? "text-[#16A249]" : g.verdict === "review" ? "text-[#B45309]" : "text-[#E8444A]"}`}>{g.verdict === "valid" ? "Validée" : g.verdict === "review" ? "À vérifier" : "Rejetée"}{g.score != null ? ` · ${g.score}` : ""}</span>}
                    </button>
                  ) : (
                    <div key={g.id} className="rounded-xl aspect-[4/5] bg-[#F4F4F5] flex flex-col items-center justify-center gap-1 text-[11px] text-[#6B6B72] p-2 text-center">
                      {g.state === "error" ? <span className="text-[#E8444A]">{(g.error ?? "Échec").slice(0, 90)}</span> : <><Spinner /> Création…</>}
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        )}
        {mode === "existing" && <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">1. Choisis l&apos;image de la pub</p>
          <div className="flex flex-wrap gap-3 text-xs text-[#6B6B72]">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlyProduct} onChange={(e) => setOnlyProduct(e.target.checked)} /> Ce produit seulement</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlyApproved} onChange={(e) => setOnlyApproved(e.target.checked)} /> Approuvées / validées seulement</label>
            <Btn size="sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}><ImagePlus size={12} /> Importer une image</Btn>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files)} />
          </div>
        </div>
        {uploaded.length + list.length === 0 ? (
          <Empty>Aucune image ici. Décoche les filtres, ou importe une image.</Empty>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2 max-h-[560px] overflow-auto">
            {uploaded.map((p) => tile(p, null, null))}
            {list.map((p) => tile(p.path, p.thumb, p.id))}
          </div>
        )}
        </>}
      </Card>
      <Card className="p-4 space-y-3 h-fit">
        <p className="text-sm font-semibold">2. Produit et idée</p>
        <div>
          <Label>Produit</Label>
          <select className={INPUT} value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Idée de la pub</Label>
          <textarea className={INPUT} rows={4} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Ex : promo -20 % ce week-end sur le Masque Nila, ton glamour" />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setIdea(x)} className="text-[10px] rounded-full border border-[#E4E4E7] px-2 py-0.5 text-[#6B6B72] hover:bg-[#F4F4F5]">{x}</button>)}
          </div>
          <p className="text-[11px] text-[#A0A0A8] mt-1.5">Donne toi-même les prix, promos et avis clients : l&apos;IA n&apos;en invente jamais.</p>
        </div>
        {error && <p className="text-sm text-[#E8444A]">{error}</p>}
        <Btn onClick={create} disabled={busy}>{busy ? <Spinner /> : <Wand2 size={14} />} Créer la pub et proposer des textes</Btn>
        <p className="text-[11px] text-[#A0A0A8]">Coût : quelques centimes (textes par l&apos;IA). L&apos;image n&apos;est pas regénérée.</p>
      </Card>
    </div>
  );
}
