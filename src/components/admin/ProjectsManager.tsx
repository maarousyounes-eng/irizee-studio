"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Btn, Card, Empty, INPUT, Label } from "@/components/ui";
import { useSupabase } from "@/lib/client";

interface Props {
  projects: { id: string; name: string; description: string }[];
  members: { project_id: string; user_id: string }[];
  links: { project_id: string; product_id: string }[];
  products: { id: string; name: string }[];
  profiles: { id: string; email: string; display_name: string | null; role: string }[];
}

export default function ProjectsManager(p: Props) {
  const sb = useSupabase();
  const router = useRouter();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const refresh = () => router.refresh();

  async function create() {
    await sb.from("projects").insert({ name: name.trim(), description: desc.trim() });
    setName(""); setDesc(""); refresh();
  }
  async function toggleMember(pid: string, uid: string, on: boolean) {
    if (on) await sb.from("project_members").insert({ project_id: pid, user_id: uid });
    else await sb.from("project_members").delete().eq("project_id", pid).eq("user_id", uid);
    refresh();
  }
  async function toggleProduct(pid: string, prod: string, on: boolean) {
    if (on) await sb.from("project_products").insert({ project_id: pid, product_id: prod });
    else await sb.from("project_products").delete().eq("project_id", pid).eq("product_id", prod);
    refresh();
  }
  async function remove(id: string) {
    if (!confirm("Supprimer ce projet ? Les shootings déjà créés sont conservés.")) return;
    await sb.from("projects").delete().eq("id", id);
    refresh();
  }

  const externals = p.profiles.filter((x) => x.role === "creator");

  return (
    <div className="space-y-6 max-w-5xl">
      <Card className="p-5">
        <div className="grid md:grid-cols-[1fr_1.5fr_auto] gap-3 items-end">
          <div><Label>Nouveau projet</Label><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Agence Studio Lumière — lancement automne" /></div>
          <div><Label>Description (facultatif)</Label><input className={INPUT} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <Btn onClick={create} disabled={!name.trim()}><Plus size={15} /> Créer</Btn>
        </div>
      </Card>
      {p.projects.length === 0 ? <Empty>Aucun projet. Crée-en un pour donner accès à un créateur ou une agence.</Empty> : p.projects.map((pr) => (
        <Card key={pr.id} className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div><p className="font-semibold">{pr.name}</p>{pr.description && <p className="text-xs text-[#6B6B72]">{pr.description}</p>}</div>
            <Btn size="sm" variant="danger" onClick={() => remove(pr.id)}><Trash2 size={12} /></Btn>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label>Produits accessibles</Label>
              <div className="space-y-1.5">
                {p.products.length === 0 && <p className="text-xs text-[#A0A0A8]">Aucun produit dans le catalogue.</p>}
                {p.products.map((prod) => {
                  const on = p.links.some((l) => l.project_id === pr.id && l.product_id === prod.id);
                  return <label key={prod.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on} onChange={(e) => toggleProduct(pr.id, prod.id, e.target.checked)} /> {prod.name}</label>;
                })}
              </div>
            </div>
            <div>
              <Label>Créateurs / agences membres</Label>
              <div className="space-y-1.5">
                {externals.length === 0 && <p className="text-xs text-[#A0A0A8]">Aucun compte « Créateur / agence ». Les personnes qui créent un compte apparaissent ici.</p>}
                {externals.map((u) => {
                  const on = p.members.some((m) => m.project_id === pr.id && m.user_id === u.id);
                  return <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on} onChange={(e) => toggleMember(pr.id, u.id, e.target.checked)} /> {u.display_name || u.email} <span className="text-[11px] text-[#A0A0A8]">{u.email}</span></label>;
                })}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
