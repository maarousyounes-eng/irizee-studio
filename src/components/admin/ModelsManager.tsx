"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RotateCcw, Star, Trash2 } from "lucide-react";
import { Badge, Btn, Card, Empty, INPUT, Label, Lightbox, Modal, Spinner } from "@/components/ui";
import { api, useSignedUrls, useSupabase } from "@/lib/client";
import type { Model } from "@/types";

const EXAMPLES = [
  "Femme d'environ 25 ans, peau mate, cheveux noirs mi-longs ondulés, yeux marron foncé, sourcils marqués",
  "Femme d'environ 30 ans, peau claire, cheveux roux bouclés courts, taches de rousseur",
  "Femme d'environ 22 ans, peau noire, cheveux naturels afro, regard direct",
];

export default function ModelsManager({ initial, userId }: { initial: Model[]; userId: string }) {
  const sb = useSupabase();
  const [list, setList] = useState<Model[]>(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [brand, setBrand] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useSignedUrls(list.map((m) => m.path));

  const reload = useCallback(async () => {
    const { data } = await sb.from("models").select("*").order("is_brand_model", { ascending: false }).order("created_at");
    setList((data ?? []) as any);
  }, [sb]);

  useEffect(() => {
    if (!list.some((m) => m.state === "generating")) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [list, reload]);

  async function generate(id: string) {
    setList((l) => l.map((m) => (m.id === id ? { ...m, state: "generating" } : m)));
    try { await api(`/api/models/${id}/generate`); } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    reload();
  }

  async function create() {
    const { data, error: err } = await sb.from("models").insert({ name: name.trim(), description: desc.trim(), is_brand_model: brand, created_by: userId }).select("id").single();
    if (err || !data) return setError(err?.message ?? "Création impossible");
    setAdding(false); setName(""); setDesc(""); setBrand(false);
    await reload();
    generate(data.id);
  }

  async function toggleBrand(m: Model) { await sb.from("models").update({ is_brand_model: !m.is_brand_model }).eq("id", m.id); reload(); }
  async function remove(m: Model) {
    if (!confirm(`Supprimer le mannequin « ${m.name} » ?`)) return;
    await sb.from("models").delete().eq("id", m.id);
    reload();
  }

  return (
    <div>
      <div className="mb-5"><Btn onClick={() => { setAdding(true); setError(null); }}><Plus size={15} /> Créer un mannequin</Btn></div>
      {error && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>}
      {list.length === 0 ? <Empty>Aucun mannequin. Crée-en plusieurs pour varier les profils, et marque ton mannequin favori comme « mannequin de la marque ».</Empty> : (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {list.map((m) => (
            <Card key={m.id} className="overflow-hidden flex flex-col">
              <div className="aspect-[3/4] bg-[#F4F4F5] relative">
                {m.state === "generating" ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-[#6B6B72]"><Spinner className="w-6 h-6" />Création du visage…</div>
                  : m.path && urls[m.path] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[m.path]} alt={m.name} onClick={() => setZoom(urls[m.path!])} className="w-full h-full object-cover cursor-zoom-in" />
                  : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-xs text-[#6B6B72]">{m.state === "error" ? <span className="text-[#E8444A]">{m.error}</span> : "Pas encore d'image"}</div>}
                {m.is_brand_model && <div className="absolute top-2 left-2"><Badge tone="blue" className="bg-white/95"><Star size={10} /> Marque</Badge></div>}
              </div>
              <div className="p-3 space-y-2">
                <p className="font-semibold text-sm truncate">{m.name}</p>
                <p className="text-[11px] text-[#6B6B72] line-clamp-3 min-h-[3.2em]">{m.description}</p>
                <div className="flex gap-1.5 flex-wrap">
                  <Btn size="sm" variant="ghost" onClick={() => generate(m.id)} disabled={m.state === "generating"} title="Générer un nouveau visage"><RotateCcw size={12} /></Btn>
                  <Btn size="sm" variant={m.is_brand_model ? "soft" : "ghost"} onClick={() => toggleBrand(m)} title="Mannequin de la marque"><Star size={12} /></Btn>
                  <Btn size="sm" variant="danger" onClick={() => remove(m)}><Trash2 size={12} /></Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[#A0A0A8] mt-6 max-w-2xl">Les mannequins sont toujours générés par l&apos;IA et fictifs. N&apos;importe aucune photo d&apos;une vraie personne sans son accord écrit.</p>
      {adding && (
        <Modal title="Créer un mannequin" onClose={() => setAdding(false)}>
          <div className="space-y-4">
            <div><Label>Nom interne</Label><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Nila" autoFocus /></div>
            <div>
              <Label>Apparence</Label>
              <textarea className={INPUT + " min-h-[100px]"} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Âge, teint, cheveux, traits, maquillage (ex : eyeliner graphique, gloss)…" />
              <div className="flex flex-wrap gap-1.5 mt-2">{EXAMPLES.map((e, i) => <button key={i} onClick={() => setDesc(e)} className="text-[11px] px-2 py-1 rounded-lg bg-[#F4F4F5] hover:bg-[#EBF2FF] text-[#6B6B72]">Exemple {i + 1}</button>)}</div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={brand} onChange={(e) => setBrand(e.target.checked)} /> Mannequin de la marque (visage récurrent)</label>
            <Btn className="w-full" onClick={create} disabled={!name.trim()}>Créer et générer le visage</Btn>
          </div>
        </Modal>
      )}
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
