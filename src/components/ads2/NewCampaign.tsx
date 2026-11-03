"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Sparkles, X, Check } from "lucide-react";
import { Btn, Card, INPUT, Label, Spinner } from "@/components/ui";
import { api, imgUrl, uploadImage, useSupabase } from "@/lib/client";

type Pic = { id: string; path: string; thumb: string | null; productIds: string[] };

const ANGLES = ["Offre / promo", "Avis client", "Nous vs les autres", "Problème → solution", "Bénéfices / ingrédients", "3 raisons de l'adopter", "Gamme complète", "Style TikTok / UGC", "Rituel / moment de soi"];

export default function NewCampaign({ products, pics }: { products: { id: string; name: string }[]; pics: Pic[] }) {
  const sb = useSupabase();
  const router = useRouter();
  const inspRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [origin, setOrigin] = useState<"inspi" | "idea">("inspi");
  const [insp, setInsp] = useState<string[]>([]);
  const [keepChange, setKeepChange] = useState("");
  const [idea, setIdea] = useState("");
  const [productIds, setProductIds] = useState<string[]>(products[0] ? [products[0].id] : []);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [offer, setOffer] = useState("");
  const [textMode, setTextMode] = useState<"ai" | "exact">("ai");
  const [count, setCount] = useState(6);
  const [engine, setEngine] = useState<"openai" | "pro">("openai");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addInsp(files: FileList | File[] | null) {
    if (!files || !files.length) return;
    setBusy(true); setError(null);
    try { for (const f of Array.from(files).slice(0, 4 - insp.length)) { const p = await uploadImage(sb, "inspirations", f, 2000); setInsp((x) => [...x, p]); } }
    catch (e) { setError(e instanceof Error ? e.message : "Envoi impossible"); }
    setBusy(false);
  }
  // Coller une image (Ctrl+V) à l'étape 1
  useEffect(() => {
    if (step !== 1 || origin !== "inspi") return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? []).filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()).filter(Boolean) as File[];
      if (files.length) addInsp(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, origin, insp.length]);

  async function addPhoto(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try { const p = await uploadImage(sb, "ads/photos", files[0], 2400); setUploadedPhotos((x) => [p, ...x]); setPhotos((x) => [...x, p].slice(-3)); }
    catch (e) { setError(e instanceof Error ? e.message : "Envoi impossible"); }
    setBusy(false);
  }

  const shownPics = useMemo(() => pics.filter((p) => p.productIds.some((id) => productIds.includes(id))).slice(0, 60), [pics, productIds]);
  const unit = engine === "openai" ? 0.2 : 0.13;
  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-max));

  function next() {
    setError(null);
    if (origin === "inspi" && !insp.length) return setError("Ajoute au moins une pub d'inspiration");
    if (origin === "idea" && !idea.trim()) return setError("Décris ton idée");
    setStep(2);
  }

  async function create() {
    setError(null);
    if (!productIds.length) return setError("Choisis au moins un produit");
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/ads2/campaigns", { origin, idea, keepChange, inspirationPaths: insp, productIds, photoPaths: photos, message, offer, textMode, engine, count });
      router.push(`/ads/c/${r.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); setBusy(false); }
  }

  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-semibold border transition ${on ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#1F55BC]" : "border-[#E4E4E7] text-[#3F3F46] hover:bg-[#F4F4F5]"}`;
  const bigCard = (on: boolean) => `text-left rounded-2xl border-2 p-4 transition ${on ? "border-[#2B6EE8] bg-[#F5F9FF]" : "border-[#E4E4E7] bg-white hover:bg-[#FAFAFA]"}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {[["1", "Point de départ"], ["2", "Produits et message"]].map(([n, l]) => (
          <button key={n} type="button" onClick={() => (n === "1" ? setStep(1) : next())} className={chip(String(step) === n)}>{n} {l}</button>
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <button type="button" onClick={() => setOrigin("inspi")} className={bigCard(origin === "inspi")}>
              <p className="font-semibold">Une pub que j&apos;aime</p>
              <p className="text-xs text-[#52525B] mt-1 leading-snug">Dépose une ou plusieurs pubs (concurrent, Pinterest, Instagram). L&apos;IA reprend le concept, la composition et le style, avec tes produits et ton message. Jamais leur marque, leurs textes ni leurs visages.</p>
            </button>
            <button type="button" onClick={() => setOrigin("idea")} className={bigCard(origin === "idea")}>
              <p className="font-semibold">Une idée en mots</p>
              <p className="text-xs text-[#52525B] mt-1 leading-snug">Décris ce que tu veux montrer : l&apos;IA propose plusieurs directions artistiques vraiment différentes.</p>
            </button>
          </div>

          {origin === "inspi" ? (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold">Pubs d&apos;inspiration</p><span className="text-xs text-[#52525B]">{insp.length}/4</span></div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {insp.map((p) => (
                  <div key={p} className="relative aspect-[4/5] rounded-xl overflow-hidden border border-[#E4E4E7]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgUrl(p)} alt="" className="w-full h-full object-cover" />
                    <button type="button" aria-label="Retirer" onClick={() => setInsp((x) => x.filter((i) => i !== p))} className="absolute top-1 right-1 bg-white/95 rounded-full p-1"><X size={12} /></button>
                  </div>
                ))}
                {insp.length < 4 && (
                  <button type="button" onClick={() => inspRef.current?.click()} disabled={busy} className="aspect-[4/5] rounded-xl border-2 border-dashed border-[#A1A1AA] bg-[#FAFAFA] text-xs font-semibold text-[#3F3F46] flex flex-col items-center justify-center gap-1 p-2 text-center">
                    {busy ? <Spinner /> : <ImagePlus size={18} />}Importer ou coller (Ctrl+V)
                  </button>
                )}
              </div>
              <input ref={inspRef} type="file" accept="image/*" multiple hidden onChange={(e) => addInsp(e.target.files)} />
              <div>
                <Label>Ce que tu veux garder ou changer (facultatif)</Label>
                <textarea className={INPUT} rows={2} value={keepChange} onChange={(e) => setKeepChange(e.target.value)} placeholder="Ex : garde le gros titre en haut, mais avec mes couleurs et un fond plus clair" />
              </div>
            </Card>
          ) : (
            <Card className="p-4 space-y-3">
              <div>
                <Label>Ton idée</Label>
                <textarea className={INPUT} rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Ex : montrer que le masque Nila transforme le rituel du soir en moment spa, ambiance salle de bain luxe" />
              </div>
              <div>
                <p className="text-xs text-[#52525B] mb-1.5">Besoin d&apos;un déclic ? Ces angles marchent bien en beauté (des idées, pas des modèles) :</p>
                <div className="flex flex-wrap gap-1.5">
                  {ANGLES.map((a) => <button key={a} type="button" onClick={() => setIdea((x) => (x.trim() ? `${x.trim()} — angle « ${a} »` : `Angle « ${a} » : `))} className={chip(false)}>{a}</button>)}
                </div>
              </div>
            </Card>
          )}
          {error && <p className="text-sm text-[#E8444A]">{error}</p>}
          <div className="flex justify-end"><Btn onClick={next}>Continuer →</Btn></div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px] items-start">
          <div className="space-y-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold">Produits dans la pub</p><span className="text-xs text-[#52525B]">{productIds.length} sur 4 maximum</span></div>
              <div className="flex flex-wrap gap-2">
                {products.map((p) => {
                  const on = productIds.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggle(productIds, setProductIds, p.id, 4)} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm ${on ? "border-[#2B6EE8] bg-[#EBF2FF]" : "border-[#E4E4E7] bg-white"}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? "bg-[#2B6EE8] border-[#2B6EE8] text-white" : "border-[#A1A1AA]"}`}>{on && <Check size={11} />}</span>
                      {p.name}
                    </button>
                  );
                })}
              </div>
              {productIds.length > 1 && <p className="text-[11px] text-[#52525B]">Chaque pub montrera un exemplaire de chaque produit coché.</p>}
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div><p className="text-sm font-semibold">Tes photos à utiliser (facultatif, 3 maximum)</p><p className="text-[11px] text-[#52525B]">Sinon l&apos;IA crée les visuels elle-même à partir de tes packshots.</p></div>
                <Btn size="sm" variant="ghost" onClick={() => photoRef.current?.click()} disabled={busy}><ImagePlus size={12} /> Importer</Btn>
                <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => addPhoto(e.target.files)} />
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 xl:grid-cols-8 gap-2 max-h-[340px] overflow-auto">
                {[...uploadedPhotos.map((p) => ({ id: p, path: p, thumb: null as string | null })), ...shownPics].map((p) => {
                  const on = photos.includes(p.path);
                  return (
                    <button key={p.path} type="button" onClick={() => toggle(photos, setPhotos, p.path, 3)} className={`relative aspect-[4/5] rounded-lg overflow-hidden border-2 ${on ? "border-[#2B6EE8]" : "border-transparent"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imgUrl(p.thumb || p.path)} alt="" className="w-full h-full object-cover" loading="lazy" />
                      {on && <span className="absolute top-1 right-1 w-5 h-5 rounded-md bg-[#2B6EE8] text-white flex items-center justify-center"><Check size={12} /></span>}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          <Card className="p-4 space-y-3">
            <div>
              <Label>Ce que la pub doit dire</Label>
              <textarea className={INPUT} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ex : le masque bleu qui purifie et donne de l'éclat, pour le rituel du soir" />
            </div>
            <div>
              <Label>Offre (seulement si elle est vraie)</Label>
              <input className={INPUT} value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Ex : -20 % ce week-end" />
            </div>
            <div className="space-y-1.5">
              <Label>Texte sur la pub</Label>
              {([["ai", "Dessiné par l'IA (créatif)", "Le texte fait partie du design. Le contrôle relit chaque mot et signale les fautes."], ["exact", "Vraie police (texte exact)", "L'IA crée le visuel avec un espace libre ; le texte est posé avec ta police : zéro faute. Idéal pour prix et promos."]] as const).map(([k, l, d]) => (
                <button key={k} type="button" onClick={() => setTextMode(k)} className={`${bigCard(textMode === k)} w-full !p-3`}>
                  <p className="text-sm font-semibold">{l}</p><p className="text-[11px] text-[#52525B] mt-0.5 leading-snug">{d}</p>
                </button>
              ))}
              <p className="text-[11px] text-[#52525B]">Tu pourras changer pub par pub ensuite.</p>
            </div>
            <div>
              <Label>Nombre de pubs</Label>
              <div className="flex gap-1.5 flex-wrap">{[4, 6, 8, 12].map((n) => <button key={n} type="button" onClick={() => setCount(n)} className={chip(count === n)}>{n} pubs</button>)}</div>
            </div>
            <div>
              <Label>Moteur d&apos;image</Label>
              <select className={INPUT} value={engine} onChange={(e) => setEngine(e.target.value as "openai" | "pro")}>
                <option value="openai">OpenAI — meilleur pour le texte (≈ 0,20 € / pub)</option>
                <option value="pro">Gemini — qualité max (≈ 0,13 € / pub)</option>
              </select>
            </div>
            <div className="rounded-xl bg-[#EBF2FF] p-3">
              <p className="text-sm font-semibold text-[#1F55BC]">{count} pubs, chacune avec sa propre mise en page</p>
              <p className="text-[11px] text-[#1F55BC]">Coût estimé : environ {(count * (unit + 0.01) + 0.01).toFixed(2).replace(".", ",")} € (images + contrôle)</p>
            </div>
            {error && <p className="text-sm text-[#E8444A]">{error}</p>}
            <Btn onClick={create} disabled={busy}>{busy ? <><Spinner /> L&apos;IA imagine les pubs…</> : <><Sparkles size={14} /> Créer les pubs</>}</Btn>
          </Card>
        </div>
      )}
    </div>
  );
}
