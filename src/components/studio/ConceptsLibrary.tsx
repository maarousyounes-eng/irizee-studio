"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ImagePlus, Plus, Trash2, Wand2 } from "lucide-react";
import { Badge, Btn, Card, Empty, INPUT, Label, Modal, Spinner } from "@/components/ui";
import { uploadImage, useSignedUrls, useSupabase } from "@/lib/client";
import { FORMATS, type Concept, type Role } from "@/types";

export default function ConceptsLibrary({ initial, role, userId }: { initial: Concept[]; role: Role; userId: string }) {
  const sb = useSupabase();
  const isStaff = role !== "creator";
  const [list, setList] = useState<Concept[]>(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("4:5");
  const [paths, setPaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const urls = useSignedUrls([...list.flatMap((c) => c.inspiration_paths.slice(0, 3)), ...paths]);

  async function reload() {
    const { data } = await sb.from("concepts").select("*").order("created_at", { ascending: false });
    setList((data as Concept[]) ?? []);
  }

  async function addFiles(files: FileList) {
    setUploading(true);
    try { for (const f of Array.from(files)) { const p = await uploadImage(sb, `inspirations/${userId}`, f, 1400); setPaths((x) => [...x, p]); } }
    finally { setUploading(false); }
  }

  async function save() {
    const { error } = await sb.from("concepts").insert({ name: name.trim(), prompt: prompt.trim(), aspect, inspiration_paths: paths, created_by: userId });
    if (error) return alert(error.message);
    setAdding(false); setName(""); setPrompt(""); setPaths([]); reload();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce concept ?")) return;
    await sb.from("concepts").delete().eq("id", id);
    reload();
  }

  return (
    <div>
      {isStaff && <div className="mb-5"><Btn onClick={() => setAdding(true)}><Plus size={15} /> Nouveau concept</Btn></div>}
      {list.length === 0 ? (
        <Empty>Aucun concept pour l&apos;instant. Enregistre-en un depuis un shooting réussi, ou crée-le ici.</Empty>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <Card key={c.id} className="p-4 flex flex-col gap-3">
              <div className="flex gap-2">
                {c.inspiration_paths.slice(0, 3).map((p) => urls[p] ? /* eslint-disable-next-line @next/next/no-img-element */ <img key={p} src={urls[p]} alt="" className="h-28 flex-1 min-w-0 rounded-xl object-cover border border-[#E4E4E7]" /> : <div key={p} className="h-28 flex-1 rounded-xl bg-[#F4F4F5]" />)}
                {c.inspiration_paths.length === 0 && <div className="h-28 flex-1 rounded-xl bg-[#F4F4F5] flex items-center justify-center text-xs text-[#A0A0A8]">Sans image</div>}
              </div>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm">{c.name}</p>
                <Badge tone="blue">{FORMATS[c.aspect]?.short ?? c.aspect}</Badge>
              </div>
              <p className="text-xs text-[#6B6B72] line-clamp-3 flex-1">{c.prompt || "—"}</p>
              <div className="flex gap-2">
                <Link href={`/studio?concept=${c.id}`} className="flex-1"><Btn size="sm" className="w-full"><Wand2 size={12} /> Utiliser ce concept</Btn></Link>
                {isStaff && <Btn size="sm" variant="danger" onClick={() => remove(c.id)}><Trash2 size={12} /></Btn>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {adding && (
        <Modal title="Nouveau concept" onClose={() => setAdding(false)}>
          <div className="space-y-4">
            <div><Label>Nom</Label><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Monochrome rayons contre-plongée" /></div>
            <div>
              <Label>Images d&apos;inspiration</Label>
              <Btn variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>{uploading ? <Spinner /> : <ImagePlus size={13} />} Ajouter des images</Btn>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
              <div className="flex gap-2 mt-2 flex-wrap">{paths.map((p) => urls[p] && /* eslint-disable-next-line @next/next/no-img-element */ <img key={p} src={urls[p]} alt="" className="w-16 h-20 rounded-lg object-cover" />)}</div>
            </div>
            <div><Label>Consigne</Label><textarea className={INPUT + " min-h-[90px]"} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>
            <div><Label>Format</Label><select className={INPUT} value={aspect} onChange={(e) => setAspect(e.target.value)}>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <Btn className="w-full" onClick={save} disabled={!name.trim()}>Enregistrer</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
