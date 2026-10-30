"use client";

import { useState } from "react";
import { Btn, Card, INPUT, Label, Spinner } from "@/components/ui";
import { api, useSignedUrls } from "@/lib/client";

type Res = { label: string; provider: string; path: string; ms: number; error?: string };

export default function BenchmarkRunner({ shoots }: { shoots: { id: string; label: string }[] }) {
  const [shootId, setShootId] = useState(shoots[0]?.id ?? "");
  const [n, setN] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Res[] | null>(null);
  const [reveal, setReveal] = useState(false);
  const urls = useSignedUrls((results ?? []).map((r) => r.path || null));

  async function run() {
    if (!shootId) return;
    if (!confirm(`Lancer ${2 * n} images (${n} par modèle) ? Coût estimé : ${(n * 0.13 + n * 0.2).toFixed(2)} €`)) return;
    setBusy(true); setError(null); setResults(null); setReveal(false);
    try {
      const r = await api<{ results: Res[] }>("/api/benchmark", { shootId, n });
      setResults(r.results);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <Label>Shooting de référence (produit, mannequin, inspiration et consigne repris)</Label>
          <select className={INPUT} value={shootId} onChange={(e) => setShootId(e.target.value)}>
            {shoots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <Label>Images par modèle</Label>
          <select className={INPUT} value={n} onChange={(e) => setN(Number(e.target.value))}>
            {[1, 2, 3].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <p className="text-xs text-[#6B6B72]">Coût estimé : environ {(n * 0.13 + n * 0.2).toFixed(2)} € (Gemini ≈ 0,13 € / image, OpenAI ≈ 0,20 € / image). Il faut la variable OPENAI_API_KEY dans Vercel.</p>
        <Btn onClick={run} disabled={busy || !shootId}>{busy ? <><Spinner /> Génération en cours (jusqu'à 2 min)…</> : "Lancer la comparaison"}</Btn>
        {error && <p className="text-sm text-[#E8444A]">{error}</p>}
      </Card>
      {results && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Btn variant="soft" size="sm" onClick={() => setReveal(true)} disabled={reveal}>Révéler les modèles</Btn>
            <p className="text-xs text-[#6B6B72]">Choisis les meilleures images avant de révéler.</p>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((r) => (
              <Card key={r.label} className="overflow-hidden">
                {r.path && urls[r.path] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[r.path]} alt={r.label} className="w-full" /> : <div className="p-6 text-xs text-[#E8444A]">{r.error ?? "Pas d'image"}</div>}
                <div className="p-3 text-sm flex justify-between">
                  <b>Image {r.label}</b>
                  <span className="text-[#6B6B72]">{reveal ? `${r.provider} · ${Math.round(r.ms / 1000)} s` : "modèle masqué"}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
