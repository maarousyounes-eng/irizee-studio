"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Btn, Card, INPUT, Label, Spinner } from "@/components/ui";
import { apiJob, useSupabase } from "@/lib/client";

interface Concept { name: string; idea: string; why: string; set: string; palette: string; light: string; attitude: string; shots: string[]; hook: string; keywords: string[] }
const GOALS = ["Lancement", "Précommande", "Promotion", "Notoriété", "Fidélisation"];
const CHANNELS = ["Pub Meta (Instagram, Facebook)", "Pub TikTok", "Post Instagram", "Carrousel éducatif"];
const MOMENTS = ["Aucun", "Hiver", "Noël", "Nouvel An", "Saint-Valentin", "Printemps", "Fête des mères", "Été", "Rentrée", "Black Friday"];

export default function ConceptGenerator({ products, userId }: { products: { id: string; name: string }[]; userId: string }) {
  const sb = useSupabase();
  const router = useRouter();
  const [productIds, setProductIds] = useState<string[]>(products[0] ? [products[0].id] : []);
  const [goal, setGoal] = useState(GOALS[0]);
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [moment, setMoment] = useState(MOMENTS[0]);
  const [words, setWords] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [kept, setKept] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const chip = (on: boolean) => `px-3.5 py-2.5 rounded-full text-sm border transition ${on ? "bg-[#EBF2FF] border-[#2B6EE8] text-[#1F55BC] font-semibold" : "bg-white border-[#E4E4E7] text-[#0A0A0B] hover:bg-[#F4F4F5]"}`;

  async function generate(like?: Concept) {
    setBusy(true); setMsg(null);
    try {
      const r = await apiJob<{ concepts: Concept[] }>(sb, "/api/concepts", { productIds, goal, channel, moment: moment === "Aucun" ? "" : moment, words, avoid: seen, like: like ? `${like.name} : ${like.idea}` : undefined });
      setConcepts(r.concepts); setSeen((s) => Array.from(new Set([...s, ...r.concepts.map((c) => c.name)])));
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erreur"); }
    setBusy(false);
  }
  const full = (c: Concept) => `Campagne « ${c.name} » : ${c.idea}\nObjectif : ${goal}. Canal : ${channel}.${moment !== "Aucun" ? ` Moment : ${moment}.` : ""}\nAccroche : ${c.hook}`;

  function launch(c: Concept) {
    // Le parcours « Nouvelle campagne » s'ouvre avec le brief rempli et cette direction déjà proposée
    sessionStorage.setItem("wizard:prefill", JSON.stringify({
      brief: full(c), vtype: /Pub/.test(channel) ? "ad" : "social", productIds,
      direction: { title: c.name, concept: c.idea, set: c.set, palette: c.palette, light: c.light, attitude: `${c.attitude} Série prévue : ${c.shots.join(" ; ")}` },
    }));
    router.push("/studio");
  }
  async function keep(c: Concept) {
    const { error } = await sb.from("concepts").insert({ name: c.name, prompt: `${full(c)}\nDécor : ${c.set}\nCouleurs : ${c.palette}\nLumière : ${c.light}\nAttitude : ${c.attitude}\nSérie : ${c.shots.join(" ; ")}`, aspect: "4:5", inspiration_paths: [], created_by: userId });
    if (error) setMsg(error.message); else setKept((k) => [...k, c.name]);
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <Card className="p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Produits</Label>
            <div className="flex flex-wrap gap-2">
              {products.map((p) => { const on = productIds.includes(p.id); return <button key={p.id} type="button" className={chip(on)} onClick={() => setProductIds(on ? productIds.filter((x) => x !== p.id) : [...productIds, p.id].slice(0, 4))}>{p.name}</button>; })}
            </div>
          </div>
          <div>
            <Label>Objectif</Label>
            <div className="flex flex-wrap gap-2">{GOALS.map((g) => <button key={g} type="button" className={chip(goal === g)} onClick={() => setGoal(g)}>{g}</button>)}</div>
          </div>
          <div>
            <Label>Canal</Label>
            <div className="flex flex-wrap gap-2">{CHANNELS.map((g) => <button key={g} type="button" className={chip(channel === g)} onClick={() => setChannel(g)}>{g}</button>)}</div>
          </div>
          <div>
            <Label>Moment de l&apos;année</Label>
            <div className="flex flex-wrap gap-2">{MOMENTS.map((g) => <button key={g} type="button" className={chip(moment === g)} onClick={() => setMoment(g)}>{g}</button>)}</div>
          </div>
        </div>
        <div>
          <Label>Quelques mots (facultatif)</Label>
          <input className={INPUT} value={words} onChange={(e) => setWords(e.target.value)} placeholder="Ex. : attitude « baddie », luxe moderne, mettre en avant le nila" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Btn onClick={() => generate()} disabled={busy}>{busy ? <><Spinner className="border-white/40 border-t-white" /> L&apos;IA cherche des concepts (environ 1 minute)…</> : <><Wand2 size={15} /> {concepts.length ? "Autre chose : 5 nouveaux concepts" : "Proposer 5 concepts"}</>}</Btn>
          <span className="text-xs text-[#52525B]">Texte seul : quelques centimes. Votre DA de marque et ce que la plateforme a appris de vos choix sont pris en compte.</span>
        </div>
        {msg && <p className="text-sm text-[#E8444A]">{msg}</p>}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {concepts.map((c) => (
          <Card key={c.name} className="p-5 space-y-2.5 flex flex-col">
            <h2 className="text-lg font-semibold">{c.name}</h2>
            <p className="text-sm leading-snug">{c.idea}</p>
            <p className="text-[13px] text-[#1F3F7A] bg-[#EBF2FF] rounded-lg px-2.5 py-1.5"><b>Pourquoi ça marche :</b> {c.why}</p>
            <p className="text-[12px] text-[#3F3F46] leading-snug"><b>Décor :</b> {c.set}</p>
            <p className="text-[12px] text-[#3F3F46] leading-snug"><b>Couleurs :</b> {c.palette} · <b>Lumière :</b> {c.light}</p>
            <p className="text-[12px] text-[#3F3F46] leading-snug"><b>Attitude :</b> {c.attitude}</p>
            <div>
              <p className="text-[12px] font-bold">La série d&apos;images</p>
              <ol className="list-decimal pl-5 text-[12px] text-[#3F3F46] space-y-0.5">{c.shots.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </div>
            <p className="text-[13px]"><b>Accroche :</b> « {c.hook} »</p>
            <div className="flex flex-wrap gap-1.5">
              {c.keywords.map((k) => <a key={k} href={`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(k)}`} target="_blank" rel="noreferrer" className="text-[11px] px-2 py-1 rounded-full bg-[#F4F4F5] text-[#0A0A0B] hover:bg-[#E4E4E7]">Pinterest : {k}</a>)}
            </div>
            <div className="flex flex-wrap gap-2 mt-auto pt-2">
              <Btn size="sm" onClick={() => launch(c)}>Lancer cette campagne</Btn>
              <Btn size="sm" variant="ghost" onClick={() => generate(c)} disabled={busy}>Plus comme ça</Btn>
              <Btn size="sm" variant="ghost" onClick={() => keep(c)} disabled={kept.includes(c.name)}>{kept.includes(c.name) ? "Gardé dans la bibliothèque" : "Garder"}</Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
