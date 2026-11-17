"use client";

import { useRef, useState } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { Badge, Btn, Card, Empty, INPUT, Label, Lightbox, Modal, Spinner } from "@/components/ui";
import { api, apiJob, uploadImage, useSignedUrls, useSupabase } from "@/lib/client";
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
  const [applied, setApplied] = useState(p.applied_look ?? "");
  const [texture, setTexture] = useState<string | null>(p.texture_path ?? null);
  const texRef = useRef<HTMLInputElement>(null);
  const texUrls = useSignedUrls([texture]);
  // Photo de référence réaliste : l'aspect réel du produit (vraie photo importée, ou proposition IA choisie)
  const [real, setReal] = useState<string | null>(p.real_photo_path ?? null);
  const [cands, setCands] = useState<{ path: string; label: string }[]>(p.ref_candidates ?? []);
  const [refBusy, setRefBusy] = useState(false);
  const [refErr, setRefErr] = useState<string | null>(null);
  const realRef = useRef<HTMLInputElement>(null);
  const refUrls = useSignedUrls([real, ...cands.map((c) => c.path)]);
  const [zoom, setZoom] = useState<string | null>(null);
  async function chooseReal(path: string | null) {
    setReal(path);
    await sb.from("products").update({ real_photo_path: path }).eq("id", p.id);
    onChange();
  }
  async function proposeRefs() {
    if (!confirm("Créer 4 photos réalistes de ce produit ? 4 images payantes, environ 0,80 € au total.")) return;
    setRefErr(null); setRefBusy(true);
    try { const r = await apiJob<{ candidates: { path: string; label: string }[] }>(sb, `/api/products/${p.id}/reference`, {}, 420_000); setCands(r.candidates); }
    catch (e) { setRefErr(e instanceof Error ? e.message : "Erreur"); }
    setRefBusy(false);
  }
  const [rules, setRules] = useState<string[]>(p.rules ?? []);
  const [newRule, setNewRule] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgs = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position);

  async function save(nextRules = rules) {
    await sb.from("products").update({ name, texts: texts.split("\n").map((t) => t.trim()).filter(Boolean), look, real_size: size, applied_look: applied, texture_path: texture, rules: nextRules }).eq("id", p.id);
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
          <div><Label>Taille réelle</Label><textarea className={INPUT + " min-h-[64px] text-[13px]"} value={size} onChange={(e) => setSize(e.target.value)} placeholder="Ex : tube de 15 cm de long et 4 cm de large (75 ml)" /></div>
        </div>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-start">
          <div>
            <Label>Couleur et texture du soin (sorti du tube, appliqué)</Label>
            <textarea className={INPUT + " min-h-[64px] text-[13px]"} value={applied} onChange={(e) => setApplied(e.target.value)} placeholder="Ex : crème-gel bleu indigo moyen, ni foncé ni pastel, fine et lisse, couche fine et semi-opaque sur la peau" />
          </div>
          <div>
            <Label>Photo de la texture</Label>
            <button type="button" onClick={() => texRef.current?.click()} className="w-24 h-24 rounded-xl border border-dashed border-[#D4D4D8] bg-[#F4F4F5] overflow-hidden flex items-center justify-center text-[11px] text-[#6B6B72]">
              {texture && texUrls[texture] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={texUrls[texture]} alt="Texture" className="w-full h-full object-cover" /> : "Ajouter"}
            </button>
            {texture && <button type="button" className="block text-[11px] text-[#A0A0A8] hover:text-[#E8444A] mt-1" onClick={() => setTexture(null)}>Retirer</button>}
            <input ref={texRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setTexture(await uploadImage(sb, "products", f, 1400)); }} />
          </div>
        </div>
        <div className="rounded-2xl border border-[#E4E4E7] p-3 space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="max-w-xl">
              <Label>Photo de référence réaliste</Label>
              <p className="text-[12px] text-[#52525B]">Le packshot montre le design. Cette photo montre à l&apos;IA à quoi le produit ressemble en vrai (matière, reflets) : elle est reprise dans les esquisses, les images et les corrections. Importez une vraie photo du produit, ou choisissez parmi 4 propositions.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn size="sm" variant="ghost" onClick={() => realRef.current?.click()}><ImagePlus size={12} /> Importer une vraie photo</Btn>
              <Btn size="sm" onClick={proposeRefs} disabled={refBusy}>{refBusy ? "Création en cours (environ 2 minutes)…" : cands.length ? "Refaire 4 propositions (≈ 0,80 €)" : "Créer 4 propositions (≈ 0,80 €)"}</Btn>
            </div>
            <input ref={realRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await chooseReal(await uploadImage(sb, "products", f, 1800)); e.target.value = ""; }} />
          </div>
          {refErr && <p className="text-[12px] text-[#B91C1C]">{refErr}</p>}
          {real && (
            <div className="flex items-center gap-3 bg-[#E7F6EC] rounded-xl p-2">
              {refUrls[real] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={refUrls[real]} alt="Photo de référence actuelle" onClick={() => setZoom(refUrls[real])} className="w-16 h-24 object-cover rounded-lg cursor-zoom-in" />}
              <p className="text-[12px] text-[#14532D] flex-1"><b>Référence actuelle.</b> Elle est utilisée dans toutes les nouvelles générations de ce produit.</p>
              <Btn size="sm" variant="ghost" onClick={() => chooseReal(null)}>Retirer</Btn>
            </div>
          )}
          {cands.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold mb-1.5">Les propositions, du plus lisse au plus marqué. Cliquez sur une image pour l&apos;agrandir, puis choisissez celle qui fait vrai pour vous.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {cands.map((c) => {
                  const on = real === c.path;
                  return (
                    <div key={c.path} className={`rounded-xl border p-1.5 space-y-1.5 ${on ? "border-[#2B6EE8] bg-[#EBF2FF]" : "border-[#E4E4E7] bg-white"}`}>
                      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#F4F4F5]">
                        {refUrls[c.path] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={refUrls[c.path]} alt={`Proposition : ${c.label}`} onClick={() => setZoom(refUrls[c.path])} className="w-full h-full object-cover cursor-zoom-in" />}
                      </div>
                      <p className="text-[11px] font-semibold text-center">{c.label}</p>
                      <Btn size="sm" variant={on ? "primary" : "ghost"} className="w-full" onClick={() => chooseReal(c.path)}>{on ? "Choisie" : "Choisir"}</Btn>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <Lightbox src={zoom} onClose={() => setZoom(null)} />
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
