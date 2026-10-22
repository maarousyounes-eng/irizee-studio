"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Btn, Card, INPUT } from "@/components/ui";
import { useSupabase } from "@/lib/client";

interface Rule { id: string; text: string; position: number }

export default function RulesEditor({ initial }: { initial: Rule[] }) {
  const sb = useSupabase();
  const [rules, setRules] = useState<Rule[]>(initial);
  const [text, setText] = useState("");

  async function reload() {
    const { data } = await sb.from("brand_rules").select("id, text, position").order("position");
    setRules(data ?? []);
  }
  async function add() {
    const pos = (rules[rules.length - 1]?.position ?? 0) + 1;
    await sb.from("brand_rules").insert({ text: text.trim(), position: pos });
    setText(""); reload();
  }
  async function remove(id: string) { await sb.from("brand_rules").delete().eq("id", id); reload(); }
  async function edit(r: Rule, value: string) { if (value.trim() && value !== r.text) { await sb.from("brand_rules").update({ text: value.trim() }).eq("id", r.id); reload(); } }
  async function move(i: number, d: -1 | 1) {
    const a = rules[i], b = rules[i + d];
    if (!a || !b) return;
    await Promise.all([sb.from("brand_rules").update({ position: b.position }).eq("id", a.id), sb.from("brand_rules").update({ position: a.position }).eq("id", b.id)]);
    reload();
  }

  return (
    <Card className="p-5 max-w-3xl">
      <div className="space-y-2">
        {rules.map((r, i) => (
          <div key={r.id} className="flex items-start gap-2">
            <span className="mt-2.5 text-[11px] font-bold text-[#A0A0A8] w-4">{i + 1}</span>
            <textarea className={INPUT + " min-h-[64px] text-[13px]"} defaultValue={r.text} onBlur={(e) => edit(r, e.target.value)} />
            <div className="flex flex-col gap-1">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-[#A0A0A8] hover:text-[#0A0A0B] disabled:opacity-30"><ArrowUp size={14} /></button>
              <button onClick={() => move(i, 1)} disabled={i === rules.length - 1} className="p-1 text-[#A0A0A8] hover:text-[#0A0A0B] disabled:opacity-30"><ArrowDown size={14} /></button>
            </div>
            <button onClick={() => remove(r.id)} className="p-2 mt-1 text-[#A0A0A8] hover:text-[#E8444A]"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-5 pt-5 border-t border-[#F0F0F1]">
        <textarea className={INPUT + " min-h-[64px] text-[13px]"} value={text} onChange={(e) => setText(e.target.value)} placeholder="Nouvelle règle. Ex : toujours une lumière naturelle, jamais de fond noir" />
        <Btn onClick={add} disabled={!text.trim()}>Ajouter</Btn>
      </div>
      <p className="text-[11px] text-[#A0A0A8] mt-3">Les modifications sont enregistrées dès que tu quittes le champ.</p>
    </Card>
  );
}
