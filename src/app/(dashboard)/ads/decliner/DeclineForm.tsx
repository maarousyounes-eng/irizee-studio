"use client";

import { useState } from "react";
import Link from "next/link";
import { Btn, Card, INPUT, LABEL, Spinner } from "@/components/ui";
import { FOCUS_LABELS, type DeclineContext, type DeclineFocus } from "@/lib/decline";

const imgUrl = (path: string) => `/api/img?p=${encodeURIComponent(path)}`;
const pct = (v?: number) => (v == null ? "—" : `${(v * 100).toFixed(1)} %`);
const eur = (v?: number) => (v == null ? "—" : `${v.toFixed(2)} €`);
const ALL: DeclineFocus[] = ["title", "sub", "cta"];

type Created = { id: string; name: string; code: string; texts: Partial<Record<DeclineFocus, string>> & { angle: string } };

export default function DeclineForm({ design, texts, context, existing }: {
  design: { id: string; name: string; code: string; thumb: string | null; aspect: string };
  texts: Partial<Record<DeclineFocus, string>>;
  context: DeclineContext;
  existing: { id: string; name: string; code: string }[];
}) {
  // Un texte absent de la pub (ex. pas de sous-titre) ne peut pas varier
  const available = ALL.filter((f) => texts[f]);
  const [focus, setFocus] = useState<DeclineFocus[]>(() => {
    const f = context.focus.filter((x) => available.includes(x));
    return f.length ? f : available.slice(0, 1);
  });
  const [count, setCount] = useState(3);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created[]>([]);

  const toggle = (f: DeclineFocus) => setFocus((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  async function run() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/ads3/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: design.id, count, focus, note, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setCreated(data.created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) => `px-3 py-2 rounded-full text-xs font-semibold border transition ${on ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#1F55BC]" : "border-[#E4E4E7] bg-white text-[#3F3F46] hover:bg-[#F4F4F5]"}`;
  const hasPerf = [context.ctr, context.roas, context.hook, context.cpa, context.spend].some((v) => v != null);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card className="p-4 space-y-3 h-fit">
        <div className="rounded-xl overflow-hidden bg-[#F4F4F5]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {design.thumb ? <img src={imgUrl(design.thumb)} alt="" className="w-full object-cover" /> : <div className="aspect-[4/5]" />}
        </div>
        <div>
          <Link href={`/ads/d/${design.id}`} className="text-sm font-semibold hover:underline">{design.name}</Link>
          <p className="text-[11px] text-[#52525B]">{design.code}</p>
        </div>
        <dl className="text-xs space-y-1">
          {available.map((f) => (
            <div key={f}><dt className="text-[#A0A0A8]">{FOCUS_LABELS[f]}</dt><dd className="font-medium">{texts[f]}</dd></div>
          ))}
        </dl>
      </Card>

      <div className="space-y-6">
        {(context.reason || hasPerf) && (
          <Card className="p-4 space-y-3">
            <p className="text-sm font-semibold">Résultats dans Irizée Brand</p>
            {context.reason && <p className="text-sm text-[#3F3F46]">{context.reason}</p>}
            {hasPerf && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  ["CTR", pct(context.ctr), context.avgCtr != null ? `moy. ${pct(context.avgCtr)}` : ""],
                  ["Accroche vidéo", pct(context.hook), context.avgHook != null ? `moy. ${pct(context.avgHook)}` : ""],
                  ["ROAS", context.roas != null ? `${context.roas.toFixed(2)}×` : "—", context.avgRoas != null ? `moy. ${context.avgRoas.toFixed(2)}×` : ""],
                  ["Coût / achat", eur(context.cpa), context.purchases != null ? `${context.purchases} achat${context.purchases > 1 ? "s" : ""}` : ""],
                ].map(([l, v, s]) => (
                  <div key={l} className="rounded-xl bg-[#FAFAFA] border border-[#F0F0F1] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-widest text-[#A0A0A8] font-semibold">{l}</p>
                    <p className="text-sm font-semibold tabular-nums">{v}</p>
                    {s && <p className="text-[10px] text-[#A0A0A8]">{s}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Card className="p-4 space-y-4">
          <div>
            <p className={LABEL}>Ce qui change dans les déclinaisons</p>
            {available.length ? (
              <div className="flex flex-wrap gap-2">
                {available.map((f) => <button key={f} type="button" onClick={() => toggle(f)} className={chip(focus.includes(f))}>{FOCUS_LABELS[f]}</button>)}
              </div>
            ) : <p className="text-sm text-[#52525B]">Cette pub n&apos;a pas de titre, sous-titre ni bouton à faire varier.</p>}
            <p className="text-[11px] text-[#A0A0A8] mt-1.5">Pré-coché d&apos;après les résultats. Les visuels et le reste de la pub ne changent pas.</p>
          </div>
          <div>
            <p className={LABEL}>Nombre de déclinaisons</p>
            <div className="flex gap-2">{[2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setCount(n)} className={chip(count === n)}>{n}</button>)}</div>
          </div>
          <div>
            <label className={LABEL} htmlFor="note">Une idée à tester ? (facultatif)</label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="ex. plus émotionnel, parler du rituel du soir…" className={INPUT} />
          </div>
          {error && <p className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{error}</p>}
          <Btn onClick={run} disabled={busy || !focus.length}>{busy ? <><Spinner className="mr-2" />L&apos;IA écrit les variantes…</> : `Créer ${count} déclinaisons`}</Btn>
        </Card>

        {created.length > 0 && (
          <Card className="p-4 space-y-3">
            <p className="text-sm font-semibold">{created.length} déclinaisons créées</p>
            <ul className="space-y-2">
              {created.map((c) => (
                <li key={c.id} className="rounded-xl border border-[#E4E4E7] px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/ads/d/${c.id}`} className="text-sm font-semibold hover:underline">{c.name}</Link>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EBF2FF] text-[#2B6EE8]">{c.code}</span>
                  </div>
                  <p className="text-xs text-[#52525B] mt-0.5">{ALL.filter((f) => c.texts[f]).map((f) => `${FOCUS_LABELS[f]} : « ${c.texts[f]} »`).join(" · ")}</p>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-[#52525B]">Ouvre chaque déclinaison pour ajuster et exporter. Mets son code IZ dans le nom de la pub sur Meta : Irizée Brand comparera ses résultats à ceux de la pub d&apos;origine.</p>
          </Card>
        )}

        {existing.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#52525B] mb-1.5">Déjà déclinée</p>
            <div className="flex flex-wrap gap-2">
              {existing.map((e) => <Link key={e.id} href={`/ads/d/${e.id}`} className="text-xs px-2.5 py-1 rounded-full border border-[#E4E4E7] hover:bg-[#F4F4F5]">{e.code} · {e.name}</Link>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
