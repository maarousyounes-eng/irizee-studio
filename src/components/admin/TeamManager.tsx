"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Badge, Btn, Card, INPUT, Label } from "@/components/ui";
import { api, useSupabase } from "@/lib/client";
import type { Profile } from "@/types";

const ROLES = [
  { v: "admin", l: "Administrateur" },
  { v: "employee", l: "Équipe Irizée" },
  { v: "creator", l: "Créateur / agence" },
];

export default function TeamManager({ initial, used }: { initial: (Profile & { created_at: string })[]; used: Record<string, number> }) {
  const sb = useSupabase();
  const [list, setList] = useState(initial);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(p: Profile) {
    const { error } = await sb.rpc("admin_update_profile", { uid: p.id, new_role: p.role, new_quota: p.monthly_quota });
    if (error) return setMsg(error.message);
    setSaved(p.id); setTimeout(() => setSaved(null), 1800);
  }
  const patch = (id: string, v: Partial<Profile>) => setList(list.map((p) => (p.id === id ? { ...p, ...v } : p)));

  async function invite() {
    setMsg(null);
    try { await api("/api/team/invite", { email }); setMsg(`Invitation envoyée à ${email}`); setEmail(""); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Erreur"); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="p-5">
        <Label>Inviter quelqu&apos;un par email</Label>
        <div className="flex gap-2">
          <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@agence.com" />
          <Btn onClick={invite} disabled={!email.includes("@")}><Mail size={14} /> Inviter</Btn>
        </div>
        {msg && <p className="text-[12px] text-[#6B6B72] mt-2">{msg}</p>}
        <p className="text-[11px] text-[#A0A0A8] mt-2">Sinon, la personne crée son compte depuis la page de connexion et tu lui attribues ses accès ici.</p>
      </Card>

      <Card className="overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_190px_120px_130px_80px] gap-3 px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#A0A0A8] border-b border-[#F0F0F1]">
          <span>Utilisateur</span><span>Rôle</span><span>Quota / mois</span><span>Utilisé ce mois</span><span />
        </div>
        {list.map((p) => (
          <div key={p.id} className="grid md:grid-cols-[1fr_190px_120px_130px_80px] gap-3 px-5 py-3.5 items-center border-b border-[#F0F0F1] last:border-0">
            <div className="min-w-0"><p className="text-sm font-semibold truncate">{p.display_name || p.email}</p><p className="text-[11px] text-[#A0A0A8] truncate">{p.email}</p></div>
            <select className={INPUT + " !py-2"} value={p.role} onChange={(e) => patch(p.id, { role: e.target.value as Profile["role"] })}>{ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select>
            <input className={INPUT + " !py-2"} type="number" min={0} value={p.role === "admin" ? 0 : p.monthly_quota} disabled={p.role === "admin"} onChange={(e) => patch(p.id, { monthly_quota: Math.max(0, +e.target.value) })} />
            <div>{p.role === "admin" ? <Badge tone="blue">{used[p.id] ?? 0} · illimité</Badge> : <Badge tone={(used[p.id] ?? 0) >= p.monthly_quota ? "red" : "gray"}>{used[p.id] ?? 0} / {p.monthly_quota}</Badge>}</div>
            <div className="flex items-center gap-2"><Btn size="sm" variant="ghost" onClick={() => save(p)}>OK</Btn>{saved === p.id && <span className="text-[11px] text-[#16A249] font-semibold">✓</span>}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}
