"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { toJpeg } from "html-to-image";
import { Copy, Download, Trash2, Wand2 } from "lucide-react";
import { Btn, Spinner } from "@/components/ui";
import { api, imgUrl, useSupabase } from "@/lib/client";
import AdCanvas, { AD_FMTS, onColor, type AdEl, type AdItem, type ElKind, type Kit } from "./AdCanvas";
import { newEl } from "./defaults";

interface Design { id: string; name: string; fmt: string; items: AdItem[] }
const KIND: Record<ElKind, string> = { title: "Titre", sub: "Sous-titre", cta: "Bouton", badge: "Pastille", logo: "Logo" };
export const adCode = (id: string) => `IZ-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

export default function Editor({ design, kit, formats }: { design: Design; kit: Kit; formats: Record<string, Record<string, string>> }) {
  const sb = useSupabase();
  const router = useRouter();
  const [items, setItems] = useState<AdItem[]>(design.items);
  const [fmt, setFmt] = useState(AD_FMTS.some((f) => f.key === design.fmt) ? design.fmt : "4:5");
  const [name, setName] = useState(design.name);
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [saved, setSaved] = useState<"ok" | "saving" | "error">("ok");
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [outFmts, setOutFmts] = useState<string[]>([design.fmt || "4:5"]);
  const [exporting, setExporting] = useState(false);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportJob, setExportJob] = useState<{ item: AdItem; f: (typeof AD_FMTS)[number] } | null>(null);

  const F = AD_FMTS.find((f) => f.key === fmt)!;
  const item = items[Math.min(cur, items.length - 1)];
  const els = item?.els ?? [];
  const selEl = els.find((e) => e.id === sel) ?? null;
  const palette = useMemo(() => Array.from(new Set([...(kit.colors ?? []), "#0A0A0B", "#FFFFFF"].map((c) => c.toUpperCase()))), [kit.colors]);

  // L'image à utiliser pour un format : l'image elle-même si elle est déjà à ce format, sinon sa déclinaison faite dans Shooting, sinon un recadrage
  const srcFor = useCallback((it: AdItem, f: string) => (!it.path ? null : it.aspect === f ? it.path : formats[it.image_id]?.[f] ?? it.path), [formats]);
  const cropped = item?.path ? item.aspect !== fmt && !formats[item.image_id]?.[fmt] : false;

  useEffect(() => {
    const k = `dress-missing:${design.id}`;
    const m = sessionStorage.getItem(k);
    if (m) { sessionStorage.removeItem(k); setMsg(`Slide(s) ${m} : pas encore de photo prête, elles ne sont pas dans la pub. Ajoutez-les plus tard ou remplacez-les par une slide texte.`); }
  }, [design.id]);

  // Enregistrement automatique
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved("saving");
    const t = setTimeout(async () => {
      const { error } = await sb.from("ad_designs").update({ items, fmt, name: name.trim() || "Pub", updated_at: new Date().toISOString() }).eq("id", design.id);
      setSaved(error ? "error" : "ok");
    }, 700);
    return () => clearTimeout(t);
  }, [items, fmt, name, sb, design.id]);

  const setEls = (fn: (els: AdEl[]) => AdEl[]) => setItems((all) => all.map((it, i) => (i === Math.min(cur, all.length - 1) ? { ...it, els: fn(it.els) } : it)));
  const patchItem = (p: Partial<AdItem>) => setItems((all) => all.map((it, i) => (i === Math.min(cur, all.length - 1) ? { ...it, ...p } : it)));
  function addTextSlide() {
    const key = `t-${Date.now().toString(36)}`;
    const bg = palette.find((c) => c !== "#FFFFFF") ?? "#0A0A0B";
    const ink = onColor(bg);
    const it: AdItem = { key, image_id: "", path: "", aspect: fmt, label: "Slide texte", bg, els: [
      { id: `${key}-t`, kind: "title", text: "Votre titre", x: 8, y: 30, size: 40, font: "title", color: ink },
      { id: `${key}-b`, kind: "sub", text: "Votre texte", x: 8, y: 48, size: 18, font: "body", color: ink },
    ] };
    setItems((all) => [...all.slice(0, cur + 1), it, ...all.slice(cur + 1)]);
    setCur(cur + 1); setSel(null);
  }
  function moveItem(d: -1 | 1) {
    const j = cur + d;
    if (j < 0 || j >= items.length) return;
    setItems((all) => { const a = [...all]; [a[cur], a[j]] = [a[j], a[cur]]; return a; });
    setCur(j);
  }
  function removeItem() {
    if (items.length < 2 || !confirm("Retirer cette image de la pub ?")) return;
    setItems((all) => all.filter((_, i) => i !== cur));
    setCur(Math.max(0, cur - 1)); setSel(null);
  }
  const patch = (p: Partial<AdEl>) => sel && setEls((list) => list.map((e) => (e.id === sel ? { ...e, ...p } : e)));

  function onDown(id: string, ev: PointerEvent<HTMLDivElement>) {
    const e = els.find((x) => x.id === id);
    const box = ev.currentTarget.parentElement?.getBoundingClientRect();
    if (!e || !box) return;
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* */ }
    drag.current = { id, sx: ev.clientX, sy: ev.clientY, ox: e.x, oy: e.y, w: box.width, h: box.height };
    setSel(id);
  }
  function onMove(ev: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const x = Math.round(Math.max(-5, Math.min(97, d.ox + ((ev.clientX - d.sx) / d.w) * 100)) * 10) / 10;
    const y = Math.round(Math.max(-5, Math.min(97, d.oy + ((ev.clientY - d.sy) / d.h) * 100)) * 10) / 10;
    setEls((list) => list.map((e) => (e.id === d.id ? { ...e, x, y } : e)));
  }
  const onUp = () => { drag.current = null; };

  function add(kind: ElKind) {
    const e = newEl(kind, palette[0] ?? "#0A0A0B");
    setEls((list) => [...list, e]);
    setSel(e.id);
  }

  function applyAll() {
    if (!item) return;
    setItems((all) => all.map((it) => (it.key === item.key ? it : { ...it, els: item.els.map((e) => ({ ...e, id: `${e.id.split("~")[0]}~${it.key}` })) })));
    setMsg(`Textes et positions copiés sur les ${items.length} images. Ajustez ensuite chacune si besoin.`);
  }

  async function loadIdeas() {
    if (!item) return;
    if (!item.path) return setMsg("Les idées IA regardent une photo : choisissez une image avec photo.");
    setIdeasBusy(true); setMsg(null);
    try { const r = await api<{ ideas: string[] }>("/api/ads3/ideas", { path: item.path, kind: selEl?.kind === "sub" ? "sub" : "title" }); setIdeas(r.ideas); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Erreur"); }
    setIdeasBusy(false);
  }
  function pickIdea(t: string) {
    const target = selEl && (selEl.kind === "title" || selEl.kind === "sub") ? selEl : els.find((e) => e.kind === "title");
    if (target) { setEls((list) => list.map((e) => (e.id === target.id ? { ...e, text: t } : e))); setSel(target.id); }
    else { const e = { ...newEl("title", palette[0] ?? "#0A0A0B"), text: t }; setEls((list) => [...list, e]); setSel(e.id); }
  }

  // Export : chaque image est rendue à sa taille réelle, hors écran, puis mise dans le ZIP
  const renderOne = useCallback((job: { item: AdItem; f: (typeof AD_FMTS)[number] }) => new Promise<string>((resolve, reject) => {
    setExportJob(job);
    setTimeout(async () => {
      try {
        const node = exportRef.current;
        if (!node) throw new Error("Rendu impossible");
        const imgs = Array.from(node.querySelectorAll("img"));
        await Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = r; im.onerror = r; }))));
        resolve(await toJpeg(node, { width: job.f.out[0], height: job.f.out[1], pixelRatio: 1, quality: 0.95, cacheBust: false }));
      } catch (e) { reject(e); }
    }, 120);
  }), []);

  async function exportZip() {
    if (!outFmts.length) return setMsg("Cochez au moins un format");
    setExporting(true); setMsg(null);
    try {
      await document.fonts.ready;
      const code = adCode(design.id);
      const zip = new JSZip();
      const lines = [`Pub Irizée — ${name}`, `Code de suivi : ${code}`, `Nom à donner à la pub sur Meta / TikTok / Google : ${code} – ${name}`, ""];
      for (const fk of outFmts) {
        const f = AD_FMTS.find((x) => x.key === fk)!;
        for (let i = 0; i < items.length; i++) {
          setMsg(`Export ${f.key} : image ${i + 1}/${items.length}…`);
          const data = await renderOne({ item: items[i], f });
          zip.file(`${f.key.replace(":", "x")}/${code}-${String(i + 1).padStart(2, "0")}.jpg`, data.split(",")[1], { base64: true });
        }
      }
      items.forEach((it, i) => { lines.push(`Image ${i + 1} (${it.label}) :`, ...it.els.filter((e) => e.kind !== "logo").map((e) => `  ${KIND[e.kind]} : ${e.text.replace(/\n/g, " ")}`)); });
      zip.file("textes.txt", lines.join("\n"));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `irizee-${code}-${name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}.zip`;
      a.click();
      setMsg("Export terminé.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Export impossible"); }
    setExportJob(null); setExporting(false);
  }

  async function remove() {
    if (!confirm("Supprimer cette pub ? Les visuels du shooting ne sont pas touchés.")) return;
    await sb.from("ad_designs").update({ deleted_at: new Date().toISOString() }).eq("id", design.id);
    router.push("/ads");
  }

  async function duplicate() {
    const { data } = await sb.from("ad_designs").insert({ name: `${name} (copie)`, items, fmt }).select("id").single();
    if (data) router.push(`/ads/d/${data.id}`);
  }

  const chip = (on: boolean) => `px-3 py-2 rounded-full text-xs font-semibold border transition ${on ? "border-[#2B6EE8] bg-[#EBF2FF] text-[#1F55BC]" : "border-[#E4E4E7] bg-white text-[#3F3F46] hover:bg-[#F4F4F5]"}`;
  const tool = "h-11 rounded-xl border border-[#E4E4E7] bg-white text-xs font-semibold hover:bg-[#F4F4F5]";

  if (!item) return <p className="text-sm text-[#52525B]">Cette pub ne contient aucune image.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/ads" className="text-xs text-[#52525B] hover:text-[#0A0A0B]">← Mes pubs</Link>
          <input aria-label="Nom de la pub" value={name} onChange={(e) => setName(e.target.value)} className="block text-2xl font-semibold mt-1 bg-transparent border-b border-transparent hover:border-[#E4E4E7] focus:border-[#2B6EE8] outline-none max-w-full" />
          <p className="text-xs text-[#52525B] mt-1">Code de suivi <b>{adCode(design.id)}</b> · {saved === "saving" ? "Enregistrement…" : saved === "error" ? "Erreur d'enregistrement" : "Enregistré"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" size="sm" onClick={duplicate}><Copy size={13} /> Dupliquer</Btn>
          <Btn variant="ghost" size="sm" onClick={remove}><Trash2 size={13} /> Supprimer</Btn>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {AD_FMTS.map((f) => <button key={f.key} type="button" className={chip(fmt === f.key)} onClick={() => setFmt(f.key)}>{f.label}</button>)}
        <button type="button" className={`${chip(false)} ml-auto`} onClick={applyAll} disabled={items.length < 2}>Appliquer ces textes à toutes les images</button>
      </div>
      {msg && <div className="p-3 rounded-xl bg-[#EBF2FF] border border-[#C9D9F8] text-sm text-[#1F3F7A]">{msg}</div>}

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[999_1_560px] min-w-0 space-y-3">
          <div className="bg-[#E4E4E7] rounded-2xl p-4 sm:p-6 overflow-x-auto flex justify-center">
            <AdCanvas src={srcFor(item, fmt)} w={F.view[0]} h={F.view[1]} els={els} kit={kit} sel={sel} bg={item.bg} band={item.band}
              onElDown={onDown} onElMove={onMove} onElUp={onUp} onBg={() => setSel(null)} />
          </div>
          <p className="text-xs text-[#52525B] text-center">
            Glissez les textes à la souris. Ils gardent leur place relative dans tous les formats.
            {cropped ? " Ce format n'a pas de déclinaison dans le shooting : l'image est recadrée. Pour un cadrage refait par l'IA, créez la déclinaison dans le shooting." : ""}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map((it, i) => (
              <button key={it.key} type="button" onClick={() => { setCur(i); setSel(null); setIdeas(null); }}
                className={`shrink-0 w-24 text-left bg-white rounded-xl p-1 border-2 ${i === cur ? "border-[#2B6EE8]" : "border-transparent"}`}>
                {it.path
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={imgUrl(it.path)} alt="" className="w-full aspect-[4/5] object-cover rounded-lg" loading="lazy" />
                  : <div className="w-full aspect-[4/5] rounded-lg flex items-center justify-center text-[10px] font-bold p-1 text-center" style={{ background: it.bg || "#F3EDE4", color: onColor(it.bg || "#F3EDE4") }}>{it.els.find((e) => e.kind === "title")?.text.slice(0, 30) || "Texte"}</div>}
                <span className="block text-[11px] mt-1 px-0.5 truncate">{i + 1}. {it.label}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" variant="ghost" onClick={addTextSlide}>+ Slide texte après celle-ci</Btn>
            <Btn size="sm" variant="ghost" onClick={() => moveItem(-1)} disabled={cur === 0}>← Déplacer</Btn>
            <Btn size="sm" variant="ghost" onClick={() => moveItem(1)} disabled={cur >= items.length - 1}>Déplacer →</Btn>
            <Btn size="sm" variant="ghost" onClick={removeItem} disabled={items.length < 2}>Retirer cette image</Btn>
          </div>
        </div>

        <div className="flex-[1_1_320px] min-w-0 space-y-3">
          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-semibold">Ajouter</h2>
            <div className="grid grid-cols-3 gap-2">
              {(["title", "sub", "cta", "badge", "logo"] as ElKind[]).map((k) => <button key={k} type="button" className={tool} onClick={() => add(k)}>{KIND[k]}</button>)}
              <button type="button" className={`${tool} !bg-[#EBF2FF] !border-[#C9D9F8] text-[#1F55BC] inline-flex items-center justify-center gap-1`} onClick={loadIdeas} disabled={ideasBusy}>
                {ideasBusy ? <Spinner className="w-3 h-3" /> : <Wand2 size={13} />} Idées IA
              </button>
            </div>
            {ideas && (
              <div className="space-y-1.5 border-t border-[#E4E4E7] pt-3">
                <p className="text-[11px] text-[#52525B]">Cliquez pour l&apos;utiliser{selEl && (selEl.kind === "title" || selEl.kind === "sub") ? ` dans le ${KIND[selEl.kind].toLowerCase()} sélectionné` : " dans le titre"}, puis modifiez-la si besoin.</p>
                {ideas.map((t) => <button key={t} type="button" onClick={() => pickIdea(t)} className="w-full text-left text-sm px-3 py-2 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] hover:bg-[#F4F4F5]">{t}</button>)}
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-semibold">{item.path ? "Bandeau de couleur" : "Fond de la slide"}</h2>
            {item.path ? (
              <div className="flex flex-wrap gap-1.5">
                {([["", "Aucun"], ["top", "En haut"], ["bottom", "En bas"], ["center", "Au centre"]] as const).map(([z, l]) => (
                  <button key={z} type="button" className={chip((item.band?.zone ?? "") === z)} onClick={() => patchItem({ band: z ? { zone: z, color: item.band?.color ?? palette[0] ?? "#0A0A0B", h: item.band?.h ?? 30 } : null })}>{l}</button>
                ))}
              </div>
            ) : null}
            {item.band && item.path ? (
              <div>
                <label htmlFor="bandh" className="text-xs font-semibold">Hauteur : {item.band.h} %</label>
                <input id="bandh" type="range" min={10} max={70} value={item.band.h} onChange={(e) => patchItem({ band: { ...item.band!, h: Number(e.target.value) } })} className="w-full" />
                <label htmlFor="bando" className="text-xs font-semibold">Opacité : {item.band.opacity ?? 100} %{(item.band.opacity ?? 100) === 0 ? " (transparent)" : ""}</label>
                <input id="bando" type="range" min={0} max={100} step={5} value={item.band.opacity ?? 100} onChange={(e) => patchItem({ band: { ...item.band!, opacity: Number(e.target.value) } })} className="w-full" />
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <button type="button" className={chip(!item.band.fade)} onClick={() => patchItem({ band: { ...item.band!, fade: false } })}>Plein</button>
                  <button type="button" className={chip(!!item.band.fade)} onClick={() => patchItem({ band: { ...item.band!, fade: true } })}>Dégradé vers la photo</button>
                </div>
              </div>
            ) : null}
            {(!item.path || item.band) && (
              <div className="flex flex-wrap gap-2">
                {palette.map((c) => {
                  const on = (item.path ? item.band?.color : item.bg || "#F3EDE4")?.toUpperCase() === c;
                  return <button key={c} type="button" aria-label={`Couleur ${c}`} onClick={() => (item.path ? patchItem({ band: { ...item.band!, color: c } }) : patchItem({ bg: c }))}
                    className={`w-10 h-10 rounded-full ${on ? "ring-2 ring-offset-2 ring-[#2B6EE8]" : "border border-[#D4D4D8]"}`} style={{ background: c }} />;
                })}
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 space-y-2">
            <h2 className="text-sm font-semibold">Éléments de cette image</h2>
            {!els.length && <p className="text-xs text-[#52525B]">Aucun texte : l&apos;image sera exportée telle quelle.</p>}
            {els.map((e) => (
              <button key={e.id} type="button" onClick={() => setSel(e.id)}
                className={`w-full flex items-center gap-2 min-h-11 px-3 rounded-xl border text-left ${e.id === sel ? "border-[#2B6EE8] bg-[#EBF2FF]" : "border-[#E4E4E7] bg-white"}`}>
                <span className="w-16 shrink-0 text-[11px] font-bold text-[#52525B]">{KIND[e.kind]}</span>
                <span className="text-sm truncate">{e.kind === "logo" ? (kit.logo_path ? "Logo de la charte" : e.text) : e.text}</span>
              </button>
            ))}
          </div>

          {selEl && (
            <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-semibold">Modifier : {KIND[selEl.kind]}</h2>
              {!(selEl.kind === "logo" && kit.logo_path) && (
                <div>
                  <label htmlFor="eltext" className="text-xs font-semibold">Texte (exactement comme vous le tapez)</label>
                  <textarea id="eltext" rows={2} value={selEl.text} onChange={(e) => patch({ text: e.target.value })} className="mt-1 w-full border border-[#E4E4E7] rounded-xl p-2.5 text-sm" />
                </div>
              )}
              <div>
                <label htmlFor="elsize" className="text-xs font-semibold">Taille : {selEl.size}</label>
                <input id="elsize" type="range" min={8} max={110} value={selEl.size} onChange={(e) => patch({ size: Number(e.target.value) })} className="w-full" />
              </div>
              {selEl.kind !== "logo" && (
                <div className="space-y-1">
                  <label htmlFor="ellh" className="text-xs font-semibold">Interligne : {(selEl.lh ?? 1.1).toFixed(2)}</label>
                  <input id="ellh" type="range" min={0.8} max={2.2} step={0.05} value={selEl.lh ?? 1.1} onChange={(e) => patch({ lh: Number(e.target.value) })} className="w-full" />
                  <label htmlFor="ells" className="text-xs font-semibold">Espacement des lettres : {selEl.ls ?? (selEl.kind === "title" ? -1 : 0)}</label>
                  <input id="ells" type="range" min={-8} max={40} step={1} value={selEl.ls ?? (selEl.kind === "title" ? -1 : 0)} onChange={(e) => patch({ ls: Number(e.target.value) })} className="w-full" />
                  {selEl.kind !== "badge" && selEl.kind !== "cta" && <>
                    <label htmlFor="elw" className="text-xs font-semibold">Largeur du bloc : {selEl.w ? `${selEl.w} %` : "auto"}</label>
                    <input id="elw" type="range" min={15} max={100} step={1} value={selEl.w ?? Math.max(20, 98 - selEl.x)} onChange={(e) => patch({ w: Number(e.target.value) })} className="w-full" />
                  </>}
                  <button type="button" className="text-[11px] text-[#2B6EE8] font-semibold" onClick={() => patch({ lh: undefined, ls: undefined, w: undefined })}>Réinitialiser l&apos;espacement</button>
                </div>
              )}
              {(selEl.kind === "title" || selEl.kind === "sub" || selEl.kind === "badge") && (
                <div>
                  <span className="text-xs font-semibold">Police</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {([["title", "Titre charte"], ["body", "Texte charte"], ["impact", "Impact"]] as const).map(([k, l]) => <button key={k} type="button" className={chip(selEl.font === k)} onClick={() => patch({ font: k })}>{l}</button>)}
                  </div>
                </div>
              )}
              {(selEl.kind === "title" || selEl.kind === "sub") && (
                <div>
                  <span className="text-xs font-semibold">Alignement</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {([["left", "Gauche"], ["center", "Centré"], ["right", "Droite"]] as const).map(([k, l]) => <button key={k} type="button" className={chip((selEl.align ?? "left") === k)} onClick={() => patch({ align: k })}>{l}</button>)}
                  </div>
                </div>
              )}
              {!(selEl.kind === "logo" && kit.logo_path) && (
                <div>
                  <span className="text-xs font-semibold">Couleur{selEl.kind === "cta" || selEl.kind === "badge" ? " du fond" : ""} (charte)</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {palette.map((c) => (
                      <button key={c} type="button" aria-label={`Couleur ${c}`} onClick={() => patch({ color: c })}
                        className={`w-10 h-10 rounded-full ${selEl.color.toUpperCase() === c ? "ring-2 ring-offset-2 ring-[#2B6EE8]" : "border border-[#D4D4D8]"}`} style={{ background: c }} />
                    ))}
                  </div>
                </div>
              )}
              <button type="button" onClick={() => { setEls((list) => list.filter((e) => e.id !== sel)); setSel(null); }} className="w-full h-11 rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50">Supprimer cet élément</button>
            </div>
          )}

          <div className="bg-white border border-[#E4E4E7] rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-semibold">Exporter</h2>
            <div className="flex flex-wrap gap-1.5">
              {AD_FMTS.map((f) => {
                const on = outFmts.includes(f.key);
                return <button key={f.key} type="button" className={chip(on)} onClick={() => setOutFmts(on ? outFmts.filter((x) => x !== f.key) : [...outFmts, f.key])}>{f.label}</button>;
              })}
            </div>
            <Btn className="w-full" onClick={exportZip} disabled={exporting}>{exporting ? <Spinner className="border-white/40 border-t-white" /> : <Download size={14} />} Télécharger le ZIP ({items.length * outFmts.length} images)</Btn>
            <p className="text-[11px] text-[#52525B]">Images en haute définition (1080 px de large ou plus), code de suivi dans le nom de chaque fichier.</p>
          </div>
        </div>
      </div>

      {/* Rendu d'export, hors écran */}
      <div aria-hidden="true" style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
        {exportJob && <AdCanvas ref={exportRef} src={srcFor(exportJob.item, exportJob.f.key)} w={exportJob.f.out[0]} h={exportJob.f.out[1]} els={exportJob.item.els} kit={kit} bg={exportJob.item.bg} band={exportJob.item.band} />}
      </div>
    </div>
  );
}
