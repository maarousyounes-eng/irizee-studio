"use client";

import { useRef, useState } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { Badge, Btn, Card, Empty, INPUT, Label, Modal, Spinner } from "@/components/ui";
import { api, uploadImage, useSignedUrls, useSupabase } from "@/lib/client";
import type { Product } from "@/types";

export default function ProductsManager({ initial, userId }: { initial: Product[]; userId: string }) {
  const sb = useSupabase();
  const [list, setList] = useState<Product[]>(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const urls = useSignedUrls(list.flatMap((p) => (p.product_images ?? []).map((i) => i.path)));

  async function reload() {
    const { data } = await sb.from("products").select("*, product_images(id, path, position)").order("created_at");
    setList((data ?? []) as any);
  }

  async function create() {
    if (!files.length) return setError("Ajoute au moins une photo");
    setBusy(true); setError(null);
    try {
      const paths: string[] = [];
      for (const f of files) paths.push(await uploadImage(sb, "products", f, 1800));
      let meta: any = {};
      try { meta = await api("/api/products/extract", { path: paths[0] }); } catch (e) { setError("Lecture automatique impossible : " + (e instanceof Error ? e.message : "") + " — tu peux saisir les textes à la main."); }
      const { data: p, error: err } = await sb.from("products").insert({
        name: name.trim() || meta.name || "Nouveau produit", texts: meta.texts ?? [], look: meta.look ?? "", real_size: meta.realSize ?? "", created_by: userId,
      }).select("id").single();
      if (err || !p) throw new Error(err?.message ?? "Création impossible");
      await sb.from("product_images").insert(paths.map((path, position) => ({ product_id: p.id, path, position })));
      setAdding(false); setName(""); setFiles([]);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mb-5"><Btn onClick={() => setAdding(true)}><Plus size={15} /> Ajouter un produit</Btn></div>
      {list.length === 0 ? <Empty>Aucun produit. Ajoute le premier packshot pour commencer.</Empty> : (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
          {list.map((p) => <ProductCard key={p.id} p={p} urls={urls} onChange={reload} />)}
        </div>
      )}
      {adding && (
        <Modal title="Ajouter un produit" onClose={() => !busy && setAdding(false)}>
          <div className="space-y-4">
            <div><Label>Nom (facultatif : lu sur la photo)</Label><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Sérum Correcteur & Éclat" /></div>
            <div>
              <Label>Photos packshot (fond blanc, de face ; ajoute d&apos;autres angles si possible)</Label>
              <Btn variant="ghost" size="sm" onClick={() => fileRef.current?.click()}><ImagePlus size={13} /> Choisir des photos</Btn>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
              <div className="flex gap-2 flex-wrap mt-2">
                {files.map((f, i) => (
                  <div key={i} className="relative w-16 h-20 rounded-lg border border-[#E4E4E7] overflow-hidden bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-contain" />
                    <button onClick={() => setFiles(files.filter((_, k) => k !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center"><X size={10} /></button>
                  </div>
                ))}
              </div>
            </div>
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>}
            <Btn className="w-full" onClick={create} disabled={busy || !files.length}>{busy ? <><Spinner className="border-white/40 border-t-white" /> Analyse en cours…</> : "Ajouter et analyser"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProductCard({ p, urls, onChange }: { p: Product; urls: Record<string, string>; onChange: () => void }) {
  const sb = useSupabase();
  const [name, setName] = useState(p.name);
  const [texts, setTexts] = useState((p.texts ?? []).join("\n"));
  const [look, setLook] = useState(p.look ?? "");
  const [size, setSize] = useState(p.real_size ?? "");
  const [rules, setRules] = useState<string[]>(p.rules ?? []);
  const [newRule, setNewRule] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgs = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position);

  async function save(nextRules = rules) {
    await sb.from("products").update({ name, texts: texts.split("\n").map((t) => t.trim()).filter(Boolean), look, real_size: size, rules: nextRules }).eq("id", p.id);
    setSaved(true); setTimeout(() => setSaved(false), 1800); onChange();
  }
  async function addImages(files: FileList) {
    for (const f of Array.from(files)) {
      const path = await uploadImage(sb, "products", f, 1800);
      await sb.from("product_images").insert({ product_id: p.id, path, position: imgs.length });
    }
    onChange();
  }
  async function remove() {
    if (!confirm(`Supprimer « ${p.name} » ? Les shootings existants seront aussi supprimés.`)) return;
    const { error } = await sb.from("products").delete().eq("id", p.id);
    if (error) alert("Suppression impossible (des shootings utilisent ce produit) : " + error.message);
    onChange();
  }

  return (
    <Card className="p-4 flex gap-4">
      <div className="w-24 flex-shrink-0 space-y-2">
        {imgs.map((i) => urls[i.path] ? /* eslint-disable-next-line @next/next/no-img-element */ <img key={i.id} src={urls[i.path]} alt="" className="w-24 h-28 object-contain bg-white rounded-xl border border-[#E4E4E7]" /> : <div key={i.id} className="w-24 h-28 rounded-xl bg-[#F4F4F5]" />)}
        <Btn size="sm" variant="ghost" className="w-full" onClick={() => fileRef.current?.click()}><ImagePlus size={12} /> Angle</Btn>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addImages(e.target.files)} />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div><Label>Nom</Label><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Textes imprimés à contrôler (un par ligne)</Label><textarea className={INPUT + " min-h-[120px] text-[13px]"} value={texts} onChange={(e) => setTexts(e.target.value)} /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Aspect</Label><textarea className={INPUT + " min-h-[64px] text-[13px]"} value={look} onChange={(e) => setLook(e.target.value)} /></div>
          <div><Label>Taille réelle</Label><textarea className={INPUT + " min-h-[64px] text-[13px]"} value={size} onChange={(e) => setSize(e.target.value)} /></div>
        </div>
        <div>
          <Label>Règles propres à ce produit</Label>
          {rules.length === 0 && <p className="text-[12px] text-[#A0A0A8] mb-2">Aucune. Elles se créent aussi en cochant « Retenir cette consigne » lors d&apos;une correction.</p>}
          <div className="space-y-1.5 mb-2">
            {rules.map((r, k) => (
              <div key={k} className="flex items-start gap-2 text-[12px] bg-[#F4F4F5] rounded-xl px-3 py-2">
                <span className="flex-1">{r}</span>
                <button onClick={() => { const n = rules.filter((_, i) => i !== k); setRules(n); save(n); }} className="text-[#A0A0A8] hover:text-[#E8444A]"><X size={13} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={INPUT + " !py-2"} value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="Ex : toujours montrer le bouchon noir" />
            <Btn size="sm" variant="ghost" disabled={!newRule.trim()} onClick={() => { const n = [...rules, newRule.trim()]; setRules(n); setNewRule(""); save(n); }}>Ajouter</Btn>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Btn size="sm" onClick={() => save()}>Enregistrer</Btn>
          {saved && <Badge tone="green">Enregistré</Badge>}
          <Btn size="sm" variant="danger" className="ml-auto" onClick={remove}><Trash2 size={12} /></Btn>
        </div>
      </div>
    </Card>
  );
}
