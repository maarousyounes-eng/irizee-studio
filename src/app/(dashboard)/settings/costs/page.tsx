import { requireAdmin } from "@/components/admin/guard";
import { Card, PageHeader, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

type Call = { created_at: string; image_id: string | null; purpose: string; model: string; status: string; cost_eur: number; duration_ms: number | null; note: string | null };
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });

export default async function CostsPage() {
  const sb = await requireAdmin();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data }, { data: gone }] = await Promise.all([
    sb.from("ai_calls").select("created_at, image_id, purpose, model, status, cost_eur, duration_ms, note").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    sb.from("images").select("id").not("deleted_at", "is", null),
  ]);
  const calls = (data ?? []) as Call[];
  const deleted = new Set((gone ?? []).map((g: any) => g.id as string));
  const now = Date.now();
  const sum = (f: (c: Call) => boolean) => calls.filter(f).reduce((a, c) => a + Number(c.cost_eur), 0);
  const today = day(new Date());
  const tot = {
    today: sum((c) => day(new Date(c.created_at)) === today),
    week: sum((c) => now - +new Date(c.created_at) < 7 * 86400_000),
    month: sum(() => true),
  };
  const lost = sum((c) => !!c.image_id && deleted.has(c.image_id));
  const timeouts = calls.filter((c) => c.status === "timeout").length;
  const errors = calls.filter((c) => c.status === "error").length;

  const group = (key: (c: Call) => string) => {
    const m = new Map<string, { n: number; eur: number }>();
    calls.forEach((c) => { const k = key(c); const v = m.get(k) ?? { n: 0, eur: 0 }; v.n++; v.eur += Number(c.cost_eur); m.set(k, v); });
    return Array.from(m.entries()).sort((a, b) => b[1].eur - a[1].eur);
  };
  const byPurpose = group((c) => c.purpose);
  const byModel = group((c) => c.model);
  const byDay = group((c) => day(new Date(c.created_at))).slice(0, 14);

  const Table = ({ rows }: { rows: [string, { n: number; eur: number }][] }) => (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-t border-[#F0F0F1] first:border-0">
            <td className="py-1.5 text-[#0A0A0B]">{k}</td>
            <td className="py-1.5 text-right text-[#6B6B72] tabular-nums">{v.n} appel{v.n > 1 ? "s" : ""}</td>
            <td className="py-1.5 text-right font-medium tabular-nums w-24">{eur(v.eur)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <Card className="p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#A0A0A8]">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-xs text-[#6B6B72] mt-0.5">{sub}</p>}
    </Card>
  );

  return (
    <div>
      <PageHeader title="Coûts IA" subtitle="Chaque appel Gemini est enregistré à partir de maintenant. Les montants sont des estimations : compare-les à ta facture Google AI Studio." />
      {!calls.length ? <Empty>Aucun appel enregistré pour l'instant. Lance une génération : elle apparaîtra ici.</Empty> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Aujourd'hui" value={eur(tot.today)} />
            <Stat label="7 derniers jours" value={eur(tot.week)} />
            <Stat label="30 derniers jours" value={eur(tot.month)} sub={`${calls.length} appels`} />
            <Stat label="Images supprimées" value={eur(lost)} sub="argent dépensé sur des images jetées" />
          </div>
          {(timeouts > 0 || errors > 0) && (
            <p className="text-sm text-[#B45309] bg-amber-50 rounded-xl px-4 py-3">
              {timeouts} appel{timeouts > 1 ? "s" : ""} coupé{timeouts > 1 ? "s" : ""} (délai ou annulation) — possiblement facturé{timeouts > 1 ? "s" : ""} sans résultat — et {errors} erreur{errors > 1 ? "s" : ""} Google (en général non facturées).
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4"><p className="font-semibold mb-2 text-sm">Par type d'appel</p><Table rows={byPurpose} /></Card>
            <Card className="p-4"><p className="font-semibold mb-2 text-sm">Par modèle</p><Table rows={byModel} /></Card>
          </div>
          <Card className="p-4"><p className="font-semibold mb-2 text-sm">Par jour</p><Table rows={byDay} /></Card>
          <Card className="p-4">
            <p className="font-semibold mb-2 text-sm">Derniers appels</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {calls.slice(0, 40).map((c, i) => (
                    <tr key={i} className="border-t border-[#F0F0F1] first:border-0">
                      <td className="py-1.5 pr-3 text-[#6B6B72] whitespace-nowrap">{new Date(c.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                      <td className="py-1.5 pr-3">{c.purpose}</td>
                      <td className="py-1.5 pr-3 text-[#6B6B72]">{c.model}</td>
                      <td className={`py-1.5 pr-3 ${c.status === "ok" ? "text-[#16A249]" : c.status === "timeout" ? "text-[#B45309]" : "text-[#E8444A]"}`}>{c.status}</td>
                      <td className="py-1.5 pr-3 text-[#6B6B72]">{c.duration_ms ? `${Math.round(c.duration_ms / 1000)} s` : ""}</td>
                      <td className="py-1.5 text-right tabular-nums">{eur(Number(c.cost_eur))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
