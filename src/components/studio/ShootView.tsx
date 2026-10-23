"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BookmarkPlus, Check, Download, LayoutTemplate, MessageSquare, Pencil, RotateCcw, Send, Trash2, Type, X } from "lucide-react";
import { Badge, Btn, Card, INPUT, Label, Lightbox, Modal, Spinner } from "@/components/ui";
import Comments from "./Comments";
import CorrectionModal, { type Zone } from "./CorrectionModal";
import { api, signUrls, useSignedUrls, usePipeline, useSupabase } from "@/lib/client";
import { FORMATS, FORMAT_PACKS, type ImageRow, type Role } from "@/types";

interface Props {
  shoot: { id: string; prompt: string; aspect: string; product_id: string; created_by: string; created_at: string; analysis: string | null; inspiration_paths: string[]; engine: string; size: string };
  productName: string;
  modelNames: string[];
  me: { id: string; name: string; role: Role };
  initialImages: ImageRow[];
}

const VERDICT: Record<string, { label: string; tone: "green" | "amber" | "red" }> = {
  valid: { label: "Validée par le contrôle", tone: "green" },
  review: { label: "À vérifier", tone: "amber" },
  rejected: { label: "Rejetée par le contrôle", tone: "red" },
};
const REVIEW: Record<string, { label: string; tone: "gray" | "blue" | "green" | "red" }> = {
  draft: { label: "Brouillon", tone: "gray" },
  pending: { label: "À valider", tone: "blue" },
  approved: { label: "Approuvée", tone: "green" },
  rejected: { label: "Refusée", tone: "red" },
};

export default function ShootView({ shoot, productName, modelNames, me, initialImages }: Props) {
  const sb = useSupabase();
  const router = useRouter();
  const isStaff = me.role !== "creator";
  const [images, setImages] = useState<ImageRow[]>(initialImages);
  const [filter, setFilter] = useState<"all" | "valid" | "review" | "rejected" | "pending" | "approved">("all");
  const [hideRejected, setHideRejected] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [fix, setFix] = useState<string | null>(null);
  const [compare, setCompare] = useState<string | null>(null);
  const [formatFor, setFormatFor] = useState<string | null>(null);
  const [formats, setFormats] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showConcept, setShowConcept] = useState(false);
  const [conceptName, setConceptName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const autoQc = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data } = await sb.from("images").select("*").eq("shoot_id", shoot.id).order("created_at");
    if (data) setImages(data as ImageRow[]);
  }, [sb, shoot.id]);

  const { running, run, errors } = usePipeline(load);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  // Lancement des générations demandées depuis le formulaire
  useEffect(() => {
    const key = `run:${shoot.id}`;
    const raw = sessionStorage.getItem(key);
    if (raw) { sessionStorage.removeItem(key); try { run(JSON.parse(raw)); } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contrôle qualité manquant (page rechargée en cours de route)
  useEffect(() => {
    const todo = images.filter((i) => i.state === "done" && !i.qc && !running.has(i.id) && !autoQc.current.has(i.id));
    if (todo.length) { todo.forEach((i) => autoQc.current.add(i.id)); run(todo.map((i) => i.id), true); }
  }, [images, running, run]);

  // Rafraîchissement tant que quelque chose est en cours
  const busy = images.some((i) => i.state === "generating" || (i.state === "done" && !i.qc));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [busy, load]);

  const urls = useSignedUrls(images.map((i) => i.path));
  const inspUrls = useSignedUrls(shoot.inspiration_paths);

  const visible = useMemo(() => {
    const list = images.filter((i) => {
      if (!showArchived && i.params?.archived) return false;
      if (hideRejected && i.verdict === "rejected") return false;
      if (filter === "all") return true;
      if (filter === "pending" || filter === "approved") return i.review_status === filter;
      return i.verdict === filter;
    });
    return list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.variant_index - b.variant_index || a.version - b.version);
  }, [images, filter, hideRejected, showArchived]);

  // Si aucune proposition ne répond à la demande, la plateforme réessaie seule (une fois), en disant à l'IA ce qui a échoué.
  const retried = useRef<Set<string>>(new Set());
  useEffect(() => {
    const groups = new Map<string, ImageRow[]>();
    images.forEach((i) => { const g = i.params?.group; if (g && i.kind === "correction" && !i.params?.archived) groups.set(g, [...(groups.get(g) ?? []), i]); });
    groups.forEach((list, g) => {
      if (retried.current.has(g) || list[0].created_by !== me.id) return;
      if (list.some((i) => i.state === "generating" || (i.state === "done" && !i.qc) || running.has(i.id))) return;
      if (Number(list[0].params?.round ?? 0) >= 1) return;
      const judged = list.filter((i) => i.state === "done" && i.qc);
      if (!judged.length || judged.some((i) => i.qc!.instruction_followed !== false && !i.qc!.ghost_or_duplicate)) return;
      retried.current.add(g);
      const parent = images.find((i) => i.id === list[0].parent_id);
      if (!parent) return;
      const issues = Array.from(new Set(judged.map((i) => [
        i.qc!.instruction_followed === false ? "the requested change was not clearly visible (the image looked unchanged)" : "",
        i.qc!.ghost_or_duplicate ? "a ghost or duplicate of the old object was left" : "",
        i.qc!.comment ?? "",
      ].filter(Boolean).join("; ")))).slice(0, 2).join(" | ");
      Promise.all(list.map((i) => sb.from("images").update({ params: { ...i.params, archived: true } }).eq("id", i.id))).then(() =>
        submitFix(parent, "edit", { feedback: String(list[0].params?.original ?? list[0].feedback ?? ""), zone: (list[0].params?.zone as Zone) ?? null, remember: false }, issues, 1));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, running]);

  const archivedCount = images.filter((i) => i.params?.archived).length;
  const counts = useMemo(() => ({
    valid: images.filter((i) => i.verdict === "valid").length,
    review: images.filter((i) => i.verdict === "review").length,
    rejected: images.filter((i) => i.verdict === "rejected").length,
    pending: images.filter((i) => i.review_status === "pending").length,
    approved: images.filter((i) => i.review_status === "approved").length,
    generating: images.filter((i) => i.state === "generating").length,
  }), [images]);

  async function submitFix(img: ImageRow, mode: "edit" | "label", v?: { feedback: string; zone: Zone | null; remember: boolean }, avoid?: string, round = 0) {
    try {
      const r = await api<{ imageIds: string[] }>(`/api/images/${img.id}/correct`, { mode, feedback: v?.feedback ?? "", zone: v?.zone ?? null, remember: !!v?.remember, avoid, round, candidates: 3 });
      setFix(null);
      await load(); run(r.imageIds);
      flash(mode === "label" ? "Réparation de l'étiquette lancée" : round > 0 ? "Aucune proposition ne convenait : je réessaie automatiquement avec une consigne plus précise" : `${r.imageIds.length} propositions lancées — la meilleure sera mise en avant`);
    } catch (e) { flash(e instanceof Error ? e.message : "Erreur"); }
  }

  /** Relance la correction depuis l'image d'origine, en disant à l'IA ce qui n'a pas marché la dernière fois. */
  async function retryFix(img: ImageRow) {
    const parent = images.find((i) => i.id === img.parent_id);
    if (!parent) return;
    const q = img.qc;
    const issues = [
      q?.instruction_followed === false ? "the requested change was not clearly visible" : "",
      q?.ghost_or_duplicate ? "a ghost or duplicate of the old object was left" : "",
      q?.unwanted_changes ? `unrequested changes: ${q.unwanted_changes}` : "",
      q?.comment ?? "",
    ].filter(Boolean).join("; ");
    // les anciennes propositions sont écartées pour ne pas encombrer la page
    await archiveGroup(img, null);
    await submitFix(parent, "edit", { feedback: String(img.params?.original ?? img.feedback ?? ""), zone: (img.params?.zone as Zone) ?? null, remember: false }, issues || "the result did not match the request");
  }

  /** Garde cette proposition et écarte les autres essais du même groupe. */
  async function archiveGroup(keep: ImageRow, _unused: null | undefined = undefined) {
    const g = keep.params?.group;
    if (!g) return;
    const sibs = images.filter((i) => i.params?.group === g && i.id !== keep.id && !i.params?.archived);
    await Promise.all(sibs.map((s) => sb.from("images").update({ params: { ...s.params, archived: true } }).eq("id", s.id)));
    await load();
  }

  async function launchFormats() {
    if (!formatFor) return;
    try {
      const r = await api<{ imageIds: string[] }>(`/api/images/${formatFor}/formats`, { aspects: formats });
      setFormatFor(null); setFormats([]);
      await load(); run(r.imageIds);
      flash(`${r.imageIds.length} déclinaison(s) lancée(s)`);
    } catch (e) { flash(e instanceof Error ? e.message : "Erreur"); }
  }

  async function setReview(img: ImageRow, status: "pending" | "approved" | "rejected" | "draft", comment?: string) {
    const { error } = await sb.from("images").update({ review_status: status }).eq("id", img.id);
    if (error) return flash(error.message.includes("équipe") ? "Seule l'équipe Irizée peut valider" : error.message);
    if (comment?.trim()) await sb.from("comments").insert({ image_id: img.id, user_id: me.id, body: comment.trim(), author_name: me.name, author_role: me.role });
    flash(status === "pending" ? "Soumise à validation" : status === "approved" ? "Image approuvée" : status === "rejected" ? "Image refusée" : "Remise en brouillon");
    load(); router.refresh();
  }

  async function removeImage(img: ImageRow) {
    if (!confirm("Supprimer cette image ?")) return;
    await sb.from("images").delete().eq("id", img.id);
    load();
  }

  const fileName = (img: ImageRow) => `irizee_${productName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}_${(img.aspect ?? shoot.aspect).replace(":", "x")}_${img.id.slice(0, 6)}.png`;

  async function downloadZip(list: ImageRow[]) {
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const u = await signUrls(sb, list.map((i) => i.path!));
      await Promise.all(list.map(async (i) => { const b = await (await fetch(u[i.path!])).blob(); zip.file(fileName(i), b); }));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `irizee_${productName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}_${shoot.id.slice(0, 6)}.zip`; a.click();
    } finally { setZipping(false); }
  }

  async function saveConcept() {
    if (!conceptName.trim()) return;
    const { error } = await sb.from("concepts").insert({ name: conceptName.trim(), prompt: shoot.prompt, aspect: shoot.aspect, inspiration_paths: shoot.inspiration_paths, analysis: shoot.analysis, created_by: me.id });
    setShowConcept(false); setConceptName("");
    flash(error ? error.message : "Concept enregistré dans la bibliothèque");
  }

  async function deleteShoot() {
    if (!confirm("Supprimer ce shooting et toutes ses images ?")) return;
    await sb.from("shoots").delete().eq("id", shoot.id);
    router.push("/shoots"); router.refresh();
  }

  const approved = images.filter((i) => i.review_status === "approved" && i.path);
  const chip = (k: typeof filter, label: string, n?: number) => (
    <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${filter === k ? "bg-[#2B6EE8] text-white border-[#2B6EE8]" : "bg-white text-[#6B6B72] border-[#E4E4E7] hover:bg-[#F4F4F5]"}`}>
      {label}{n !== undefined ? ` · ${n}` : ""}
    </button>
  );

  return (
    <div>
      <div className="mb-5">
        <Link href="/shoots" className="text-xs text-[#6B6B72] hover:text-[#2B6EE8]">← Tous les shootings</Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{productName}</h1>
            <p className="text-sm text-[#6B6B72] max-w-3xl mt-0.5">{shoot.prompt}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge tone="blue">{FORMATS[shoot.aspect]?.short ?? shoot.aspect}</Badge>
              <Badge>{modelNames.length ? `${modelNames.length > 1 ? "Mannequins" : "Mannequin"} : ${modelNames.join(", ")}` : "Mannequins variés (IA)"}</Badge>
              <Badge>{new Date(shoot.created_at).toLocaleDateString("fr-FR")}</Badge>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {approved.length > 0 && <Btn size="sm" variant="soft" onClick={() => downloadZip(approved)} disabled={zipping}>{zipping ? <Spinner /> : <Archive size={13} />} ZIP des approuvées ({approved.length})</Btn>}
            {isStaff && <Btn size="sm" variant="ghost" onClick={() => setShowConcept(true)}><BookmarkPlus size={13} /> Enregistrer comme concept</Btn>}
            {isStaff && <Btn size="sm" variant="danger" onClick={deleteShoot}><Trash2 size={13} /></Btn>}
          </div>
        </div>
        {inspUrls && shoot.inspiration_paths.length > 0 && (
          <div className="flex gap-2 mt-3">
            {shoot.inspiration_paths.map((p) => inspUrls[p] && /* eslint-disable-next-line @next/next/no-img-element */ <img key={p} src={inspUrls[p]} alt="Inspiration" onClick={() => setZoom(inspUrls[p])} className="w-12 h-14 rounded-lg object-cover border border-[#E4E4E7] cursor-zoom-in" />)}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {chip("all", "Toutes", images.length)}
        {chip("valid", "Validées", counts.valid)}
        {chip("review", "À vérifier", counts.review)}
        {chip("rejected", "Rejetées", counts.rejected)}
        <span className="w-px h-5 bg-[#E4E4E7] mx-1" />
        {chip("pending", "En validation", counts.pending)}
        {chip("approved", "Approuvées", counts.approved)}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-[#6B6B72]"><input type="checkbox" checked={hideRejected} onChange={(e) => setHideRejected(e.target.checked)} /> Masquer les rejetées</label>
        {archivedCount > 0 && <label className="flex items-center gap-1.5 text-xs text-[#6B6B72]"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Afficher les essais écartés ({archivedCount})</label>}
      </div>
      {counts.generating > 0 && <p className="text-xs text-[#6B6B72] mb-3 flex items-center gap-2"><Spinner /> {counts.generating} image(s) en cours de génération — tu peux rester sur cette page.</p>}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map((img) => {
          const url = img.path ? urls[img.path] : undefined;
          const generating = img.state === "generating";
          const stuck = generating && !running.has(img.id) && Date.now() - new Date(img.created_at).getTime() > 180_000;
          const v = img.verdict ? VERDICT[img.verdict] : null;
          const qc = img.qc;
          const mine = img.created_by === me.id;
          return (
            <Card key={img.id} className="overflow-hidden flex flex-col">
              <div className="relative bg-[#F4F4F5]" style={{ aspectRatio: (img.aspect ?? shoot.aspect).replace(":", " / ") }}>
                {img.state === "error" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <p className="text-sm font-semibold text-[#E8444A]">Échec</p>
                    <p className="text-[11px] text-[#6B6B72]">{(errors[img.id] ?? img.error ?? "").slice(0, 160)}</p>
                    <Btn size="sm" variant="ghost" onClick={() => { sb.from("images").update({ state: "generating", error: null }).eq("id", img.id).then(() => { load(); run([img.id]); }); }}><RotateCcw size={12} /> Relancer</Btn>
                  </div>
                ) : generating ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-[#6B6B72]">
                    <Spinner className="w-6 h-6" /> Génération…
                    {stuck && <Btn size="sm" variant="ghost" onClick={() => run([img.id])}><RotateCcw size={12} /> Relancer</Btn>}
                  </div>
                ) : url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" onClick={() => setZoom(url)} className="w-full h-full object-cover cursor-zoom-in" />
                ) : <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
                {img.state === "done" && (
                  <div className="absolute top-2 left-2 right-2 flex justify-between items-start gap-1">
                    <div className="flex flex-col gap-1 items-start">
                      {v ? <Badge tone={v.tone} className="bg-white/95">{v.label}</Badge> : <Badge tone="gray" className="bg-white/95"><Spinner className="w-3 h-3" /> Contrôle…</Badge>}
                      {(img.kind !== "generated" || img.version > 1) && <Badge tone="blue" className="bg-white/95">{img.kind === "format" ? `Format ${FORMATS[img.aspect ?? ""]?.short ?? img.aspect}` : img.params?.n > 1 ? `Proposition ${img.params.i}/${img.params.n}` : `Version ${img.version}`}</Badge>}
                      {img.params?.archived && <Badge tone="gray" className="bg-white/95">Écartée</Badge>}
                    </div>
                    {img.score !== null && <span className="bg-black/65 text-white rounded-full px-2 py-0.5 text-[11px] font-bold">{img.score}/100</span>}
                  </div>
                )}
              </div>

              {img.state === "done" && (
                <div className="p-3.5 flex flex-col gap-2.5 text-[12px] flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={REVIEW[img.review_status].tone}>{REVIEW[img.review_status].label}</Badge>
                    {img.feedback && <span className="text-[11px] text-[#A0A0A8] truncate" title={img.feedback}>{img.feedback}</span>}
                  </div>
                  {img.params?.understood && <p className="text-[#2B6EE8] bg-[#EBF2FF] rounded-lg px-2.5 py-1.5 leading-snug"><span className="font-semibold">Compris :</span> {String(img.params.understood)}</p>}
                  {img.kind === "correction" && qc && qc.instruction_followed !== undefined && (
                    <p className={`leading-snug font-semibold ${qc.instruction_followed && !qc.ghost_or_duplicate ? "text-[#16A249]" : "text-[#E8444A]"}`}>
                      {qc.instruction_followed && !qc.ghost_or_duplicate ? "✓ Ta demande a été faite" : qc.ghost_or_duplicate ? "✗ Un reste de l'ancien élément est visible" : "✗ Ta demande n'est pas visible"}
                      {qc.unwanted_changes && !/^(none|aucun|-)?$/i.test(qc.unwanted_changes.trim()) && <span className="block font-normal text-[#B45309]">Autres changements : {qc.unwanted_changes}</span>}
                    </p>
                  )}
                  {qc?.comment && <p className="text-[#6B6B72] leading-snug">{qc.comment}</p>}
                  {qc && (
                    <details className="text-[#6B6B72]">
                      <summary className="cursor-pointer text-[11px] font-semibold text-[#A0A0A8]">Détail du contrôle</summary>
                      <ul className="mt-1.5 space-y-0.5">
                        {qc.texts.map((t, k) => (
                          <li key={k} className={t.status === "ok" ? "text-[#16A249]" : t.status === "wrong" ? "text-[#E8444A]" : "text-[#B45309]"}>
                            {t.status === "ok" ? "✓" : t.status === "wrong" ? "✗" : "?"} {t.expected}{t.status === "wrong" ? ` → lu « ${t.read} »` : ""}
                          </li>
                        ))}
                        <li>{qc.color_ok ? "✓" : "✗"} couleur / matière · {qc.shape_ok ? "✓" : "✗"} forme · {qc.anatomy_ok ? "✓" : "✗"} mains / visage</li>
                        <li>{qc.hero_foreground ? "✓" : "✗"} produit en héros ({qc.product_height_pct}% de la hauteur) · {qc.proportion_ok ? "✓" : "✗"} échelle</li>
                      </ul>
                    </details>
                  )}

                    <div className="flex flex-wrap gap-1.5 mt-auto">
                      <Btn size="sm" variant="ghost" onClick={() => setFix(img.id)}><Pencil size={12} /> Corriger</Btn>
                      {img.kind === "correction" && img.params?.n > 1 && !img.params?.archived && <Btn size="sm" onClick={() => { archiveGroup(img); flash("Proposition gardée, les autres sont écartées"); }}><Check size={12} /> Garder celle-ci</Btn>}
                      {img.kind === "correction" && !img.params?.archived && <Btn size="sm" variant="ghost" onClick={() => retryFix(img)} title="Relance 3 nouvelles propositions en tenant compte de ce qui n'a pas marché"><RotateCcw size={12} /> Réessayer</Btn>}
                      {img.parent_id && img.kind !== "format" && <Btn size="sm" variant="ghost" onClick={() => setCompare(img.id)}>Avant / après</Btn>}
                      <Btn size="sm" variant="ghost" onClick={() => submitFix(img, "label")} title="Corrige uniquement le texte de l'étiquette"><Type size={12} /> Étiquette</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => { setFormatFor(img.id); setFormats([]); }}><LayoutTemplate size={12} /> Décliner</Btn>
                      {url && <a href={url} download={fileName(img)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl border border-[#E4E4E7] hover:bg-[#F4F4F5]"><Download size={12} /></a>}
                      {(isStaff || mine) && <Btn size="sm" variant="ghost" onClick={() => setOpen({ ...open, [img.id]: !open[img.id] })}><MessageSquare size={12} /></Btn>}
                      {isStaff && <Btn size="sm" variant="danger" onClick={() => removeImage(img)}><Trash2 size={12} /></Btn>}
                    </div>

                  {/* Validation */}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#F0F0F1]">
                    {img.review_status === "draft" && <Btn size="sm" variant="soft" onClick={() => setReview(img, "pending")}><Send size={12} /> Soumettre à validation</Btn>}
                    {img.review_status === "pending" && !isStaff && <Btn size="sm" variant="ghost" onClick={() => setReview(img, "draft")}>Retirer de la validation</Btn>}
                    {isStaff && img.review_status !== "approved" && <Btn size="sm" onClick={() => setReview(img, "approved")}><Check size={12} /> Approuver</Btn>}
                    {isStaff && img.review_status !== "rejected" && <Btn size="sm" variant="danger" onClick={() => { const c = prompt("Motif du refus (visible dans les commentaires) :"); if (c !== null) setReview(img, "rejected", c); }}><X size={12} /> Refuser</Btn>}
                    {isStaff && img.review_status !== "draft" && <Btn size="sm" variant="ghost" onClick={() => setReview(img, "draft")}>Brouillon</Btn>}
                  </div>
                  {open[img.id] && <Comments imageId={img.id} me={me} />}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {visible.length === 0 && <p className="text-sm text-[#6B6B72] text-center py-10">Aucune image dans ce filtre.</p>}

      <Lightbox src={zoom} onClose={() => setZoom(null)} />
      {fix && (() => { const img = images.find((i) => i.id === fix); const url = img?.path ? urls[img.path] : undefined; return img && url ? (
        <CorrectionModal imageUrl={url} aspect={img.aspect ?? shoot.aspect} isStaff={isStaff} onClose={() => setFix(null)} onSubmit={(v) => submitFix(img, "edit", v)} />
      ) : null; })()}
      {compare && (() => { const img = images.find((i) => i.id === compare); const par = images.find((i) => i.id === img?.parent_id); const a = par?.path ? urls[par.path] : undefined; const b = img?.path ? urls[img.path] : undefined; return img && a && b ? (
        <Modal title="Avant / après" onClose={() => setCompare(null)} wide>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[11px] font-semibold text-[#A0A0A8] uppercase tracking-widest mb-1.5">Avant</p>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={a} alt="Avant" className="w-full rounded-xl border border-[#E4E4E7]" /></div>
            <div><p className="text-[11px] font-semibold text-[#2B6EE8] uppercase tracking-widest mb-1.5">Après</p>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={b} alt="Après" className="w-full rounded-xl border border-[#2B6EE8]" /></div>
          </div>
          {img.feedback && <p className="text-sm text-[#6B6B72] mt-3">Demande : {img.feedback}</p>}
        </Modal>
      ) : null; })()}
      {formatFor && (
        <Modal title="Décliner en formats" onClose={() => setFormatFor(null)}>
          <p className="text-sm text-[#6B6B72] mb-3">La photo est recomposée dans chaque format en gardant le produit entier et la direction artistique. Chaque déclinaison est contrôlée.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {FORMAT_PACKS.map((pk) => {
              const cur = images.find((i) => i.id === formatFor)?.aspect;
              return (
                <Btn key={pk.label} size="sm" variant="soft" onClick={() => setFormats(pk.aspects.filter((a) => a !== cur))} title={pk.hint}>{pk.label}</Btn>
              );
            })}
            <Btn size="sm" variant="ghost" onClick={() => setFormats([])}>Tout décocher</Btn>
          </div>
          <div className="space-y-1.5 mb-4">
            {Object.entries(FORMATS).map(([k, f]) => {
              const cur = images.find((i) => i.id === formatFor)?.aspect === k;
              return (
                <label key={k} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm cursor-pointer ${cur ? "opacity-40" : "hover:bg-[#F4F4F5]"} ${formats.includes(k) ? "border-[#2B6EE8] bg-[#EBF2FF]" : "border-[#E4E4E7]"}`}>
                  <input type="checkbox" disabled={cur} checked={formats.includes(k)} onChange={(e) => setFormats(e.target.checked ? [...formats, k] : formats.filter((x) => x !== k))} />
                  <span className="font-semibold whitespace-nowrap">{f.label}</span><span className="text-xs text-[#6B6B72] ml-auto text-right">{cur ? "format actuel" : f.usage}</span>
                </label>
              );
            })}
          </div>
          <Btn className="w-full" onClick={launchFormats} disabled={!formats.length}>Générer {formats.length || ""} déclinaison(s)</Btn>
        </Modal>
      )}
      {showConcept && (
        <Modal title="Enregistrer comme concept" onClose={() => setShowConcept(false)}>
          <p className="text-sm text-[#6B6B72] mb-3">Les images d&apos;inspiration, la consigne et le format seront réutilisables sur n&apos;importe quel produit.</p>
          <Label>Nom du concept</Label>
          <input className={INPUT} value={conceptName} onChange={(e) => setConceptName(e.target.value)} placeholder="Ex : Monochrome rayons contre-plongée" autoFocus />
          <Btn className="w-full mt-4" onClick={saveConcept} disabled={!conceptName.trim()}>Enregistrer</Btn>
        </Modal>
      )}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#0A0A0B] text-white text-sm px-4 py-2.5 rounded-xl z-50 max-w-[90vw]">{toast}</div>}
    </div>
  );
}
