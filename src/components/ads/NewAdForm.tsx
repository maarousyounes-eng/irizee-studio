"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Wand2 } from "lucide-react";
import { Btn, Card, INPUT, Label, Spinner, Empty } from "@/components/ui";
import { api, imgUrl, uploadImage, useSupabase } from "@/lib/client";

type Pic = { id: string; path: string; thumb: string | null; productIds: string[]; approved: boolean };

const EXAMPLES = [
  "Mettre en avant l'éclat du teint avec le Masque Nila, ton glamour",
  "Lancement du Sérum Correcteur & Éclat : nouveau",
  "Routine du soir en 2 étapes : masque puis sérum",
];

export default function NewAdForm({ products, pics }: { products: { id: string; name: string }[]; pics: Pic[] }) {
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
