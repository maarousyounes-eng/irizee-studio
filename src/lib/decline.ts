// Déclinaisons de pubs à partir des résultats envoyés par Irizée Brand.
// Fonctions pures (pas d'accès réseau ni base) : testées dans decline.test.ts.
import type { AdItem } from "@/components/ads3/AdCanvas";

export type DeclineFocus = "title" | "sub" | "cta";
export const FOCUS_LABELS: Record<DeclineFocus, string> = { title: "Titre (accroche)", sub: "Sous-titre (promesse)", cta: "Bouton" };
const FOCUS_KEYS: DeclineFocus[] = ["title", "sub", "cta"];

/** Chiffres de la créa transmis par Brand dans l'adresse de la page « Décliner ». */
export type DeclineContext = {
  reason: string;
  focus: DeclineFocus[];
  spend?: number; ctr?: number; avgCtr?: number; roas?: number; avgRoas?: number;
  cpa?: number; purchases?: number; hook?: number; avgHook?: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return v !== undefined && v !== null && v !== "" && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function parseFocus(v: unknown): DeclineFocus[] {
  const list = String(v ?? "").split(",").map((x) => x.trim()).filter((x): x is DeclineFocus => FOCUS_KEYS.includes(x as DeclineFocus));
  return list.length ? Array.from(new Set(list)) : ["title"];
}

export function parseContext(q: Record<string, unknown>): DeclineContext {
  return {
    reason: String(q.reason ?? "").slice(0, 300),
    focus: parseFocus(q.focus),
    spend: num(q.spend), ctr: num(q.ctr), avgCtr: num(q.avgCtr), roas: num(q.roas), avgRoas: num(q.avgRoas),
    cpa: num(q.cpa), purchases: num(q.purchases), hook: num(q.hook), avgHook: num(q.avgHook),
  };
}

/** IZ-ABC123 → bornes d'identifiant (les 6 premiers caractères hexadécimaux de l'uuid). */
export function codeRange(code: string): [string, string] | null {
  const hex = code.replace(/^IZ-/i, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  return [`${hex}00-0000-0000-0000-000000000000`, `${hex}ff-ffff-ffff-ffff-ffffffffffff`];
}

export const adCode = (id: string) => `IZ-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

/** Textes actuels de la pub (premier visuel : c'est celui que l'on fait varier). */
export function currentTexts(items: AdItem[]): Partial<Record<DeclineFocus, string>> {
  const els = items[0]?.els ?? [];
  const out: Partial<Record<DeclineFocus, string>> = {};
  for (const k of FOCUS_KEYS) {
    const e = els.find((x) => x.kind === k);
    if (e?.text) out[k] = e.text;
  }
  return out;
}

const pct = (v?: number) => (v == null ? "?" : `${(v * 100).toFixed(1)} %`);

export function buildPrompt(ctx: DeclineContext, texts: Partial<Record<DeclineFocus, string>>, count: number, focus: DeclineFocus[], note: string) {
  const perf = [
    ctx.spend != null ? `spend ${ctx.spend.toFixed(0)} EUR` : "",
    ctx.ctr != null ? `CTR ${pct(ctx.ctr)} (account average ${pct(ctx.avgCtr)})` : "",
    ctx.hook != null ? `video hook rate ${pct(ctx.hook)} (average ${pct(ctx.avgHook)})` : "",
    ctx.roas != null ? `ROAS ${ctx.roas.toFixed(2)} (average ${ctx.avgRoas?.toFixed(2) ?? "?"})` : "",
    ctx.purchases != null ? `${ctx.purchases} purchases` : "",
    ctx.cpa != null ? `cost per purchase ${ctx.cpa.toFixed(2)} EUR` : "",
  ].filter(Boolean).join(", ");
  const limits: Record<DeclineFocus, string> = { title: "max 45 characters", sub: "max 70 characters", cta: "2 to 3 words, max 20 characters" };
  return [
    "You write French copy for static social ads of the French cosmetics brand Irizée.",
    "The attached image is the visual of an existing ad. We want NEW VARIANTS of its texts to test against it (same visual).",
    `Current texts: ${JSON.stringify(texts)}.`,
    perf ? `Results of the current ad: ${perf}.` : "",
    ctx.reason ? `Diagnosis from the marketing team: "${ctx.reason}".` : "",
    note ? `What the team wants to test: "${note.slice(0, 300)}".` : "",
    `Write ${count} variants. Only change these fields: ${focus.join(", ")} (${focus.map((f) => `${f}: ${limits[f]}`).join("; ")}). Keep the other fields exactly as they are.`,
    "Each variant must explore a clearly different angle (e.g. benefit, emotion, curiosity, ritual, social proof without invented numbers) and give that angle in 2-4 French words.",
    "COMPLIANCE: no medical or therapeutic claim, no guaranteed result, never invent a price, discount, percentage, number, ingredient or customer review.",
    `Return JSON only: {"variants": [{"angle": str, ${focus.map((f) => `"${f}": str`).join(", ")}}]}`,
  ].filter(Boolean).join("\n");
}

export type Variant = { angle: string } & Partial<Record<DeclineFocus, string>>;

export function parseVariants(raw: unknown, focus: DeclineFocus[], count: number): Variant[] {
  const list = Array.isArray((raw as { variants?: unknown })?.variants) ? (raw as { variants: unknown[] }).variants : [];
  const out: Variant[] = [];
  for (const v of list) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const variant: Variant = { angle: String(o.angle ?? "").trim().slice(0, 40) };
    for (const f of focus) {
      const t = String(o[f] ?? "").trim();
      if (t) variant[f] = t.slice(0, f === "sub" ? 90 : 60);
    }
    if (focus.some((f) => variant[f])) out.push(variant);
    if (out.length >= count) break;
  }
  return out;
}

/** Copie des visuels de la pub d'origine avec les nouveaux textes posés sur le premier visuel. */
export function applyVariant(items: AdItem[], variant: Variant, focus: DeclineFocus[]): AdItem[] {
  return items.map((it, i) => {
    if (i !== 0) return { ...it, els: it.els.map((e) => ({ ...e })) };
    return {
      ...it,
      els: it.els.map((e) => {
        const k = e.kind as DeclineFocus;
        return focus.includes(k) && variant[k] ? { ...e, text: variant[k]! } : { ...e };
      }),
    };
  });
}
