"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import { Badge, Btn, Card, Empty, Spinner } from "@/components/ui";
import { imgUrl, useSupabase } from "@/lib/client";
import { FORMATS, type Role } from "@/types";

const DAYS = 30;
const daysLeft = (iso: string) => Math.max(0, DAYS - Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

export default function TrashManager({ role }: { role: Role }) {
  const sb = useSupabase();
  const isStaff = role !== "creator";
  const [shoots, setShoots] = useState<any[] | null>(null);
  const [images, setImages] = useState<any[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, i] = await Promise.all([
      sb.from("shoots").select("id, prompt, aspect, deleted_at, products(name), images(id, path, thumb_path, score)").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      sb.from("images").select("id, path, thumb_path, aspect, shoot_id, deleted_at, shoots(prompt, deleted_at, products(name))").not("deleted_at", "is", null).not("path", "is", null).order("deleted_at", { ascending: false }).limit(200),
    ]);
    setShoots(s.data ?? []);
    // les images d'un shooting déjà à la corbeille sont affichées avec lui
    setImages((i.data ?? []).filter((x: any) => !x.shoots?.deleted_at));
  }, [sb]);

  /** Effacement définitif d'images (fichiers compris). Réservé à l'équipe. */
  async function purgeImages(ids: string[], paths: string[]) {
    if (paths.length) await sb.storage.from("studio").remove(paths);
    if (ids.length) await sb.from("images").delete().in("id", ids);
  }
  async function purgeShoot(id: string) {
    const { data } = await sb.from("images").select("id, path, thumb_path").eq("shoot_id", id);
    await purgeImages([], (data ?? []).flatMap((x: any) => [x.path, x.thumb_path]).filter(Boolean));
    await sb.from("shoots").delete().eq("id", id);
  }

  useEffect(() => {
    (async () => {
      // Nettoyage automatique des éléments à la corbeille depuis plus de 30 jours
      if (isStaff) {
        const limit = new Date(Date.now() - DAYS * 86400000).toISOString();
        const { data: oldShoots } = await sb.from("shoots").select("id").lt("deleted_at", limit);
        for (const s of oldShoots ?? []) await purgeShoot(s.id);
        const { data: oldImgs } = await sb.from("images").select("id, path, thumb_path").lt("deleted_at", limit);
        if (oldImgs?.length) await purgeImages(oldImgs.map((x: any) => x.id), oldImgs.flatMap((x: any) => [x.path, x.thumb_path]).filter(Boolean));
      }
      load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };

  async function restoreShoot(id: string) { await sb.from("shoots").update({ deleted_at: null }).eq("id", id); flash("Shooting restauré"); load(); }
  async function restoreImage(id: string) { await sb.from("images").update({ deleted_at: null }).eq("id", id); flash("Image restaurée"); load(); }
  async function deleteShootForever(id: string) {
    if (!confirm("Supprimer définitivement ce shooting et toutes ses images ? Cette action est irréversible.")) return;
    await purgeShoot(id); flash("Shooting supprimé définitivement"); load();
  }
  async function deleteImageForever(i: any) {
    if (!confirm("Supprimer définitivement cette image ? Cette action est irréversible.")) return;
    await purgeImages([i.id], [i.path, i.thumb_path].filter(Boolean)); flash("Image supprimée définitivement"); load();
  }

  if (!shoots || !images) return <div className="py-10 text-center"><Spinner /></div>;
  if (!shoots.length && !images.length) return <Empty>La corbeille est vide.</Empty>;

  return (
    <div className="space-y-8">
      {msg && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#0A0A0B] text-white text-sm px-4 py-2.5 rounded-xl z-50">{msg}</div>}

      {shoots.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3">Shootings supprimés</h2>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {shoots.map((s) => {
              const best = [...(s.images ?? [])].filter((x: any) => x.path).sort((a: any, b: any) => (b.score ?? -1) - (a.score ?? -1))[0];
              return (
                <Card key={s.id} className="overflow-hidden flex flex-col">
                  <div className="aspect-[4/5] bg-[#F4F4F5]">
                    {best && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl(best.thumb_path ?? best.path)} alt="" loading="lazy" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-3.5 space-y-2 flex-1 flex flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{s.products?.name ?? "Produit"}</p>
                      <Badge tone="blue">{FORMATS[s.aspect]?.short ?? s.aspect}</Badge>
                    </div>
                    <p className="text-xs text-[#6B6B72] line-clamp-2">{s.prompt}</p>
                    <div className="flex gap-1.5 flex-wrap"><Badge>{(s.images ?? []).length} images</Badge><Badge tone={daysLeft(s.deleted_at) <= 5 ? "amber" : "gray"}>{daysLeft(s.deleted_at)} j restants</Badge></div>
                    <div className="flex gap-2 mt-auto pt-1">
                      <Btn size="sm" onClick={() => restoreShoot(s.id)}><RotateCcw size={12} /> Restaurer</Btn>
                      {isStaff && <Btn size="sm" variant="danger" onClick={() => deleteShootForever(s.id)}><Trash2 size={12} /> Définitivement</Btn>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {images.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3">Images supprimées</h2>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {images.map((i) => (
              <Card key={i.id} className="overflow-hidden flex flex-col">
                <div className="bg-[#F4F4F5]" style={{ aspectRatio: String(i.aspect ?? "4:5").replace(":", " / ") }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgUrl(i.thumb_path ?? i.path)} alt="" loading="lazy" className="w-full h-full object-cover" />
                </div>
                <div className="p-2.5 space-y-1.5">
                  <p className="text-[11px] text-[#6B6B72] truncate">{i.shoots?.products?.name} · {daysLeft(i.deleted_at)} j restants</p>
                  <div className="flex gap-1.5">
                    <Btn size="sm" onClick={() => restoreImage(i.id)}><RotateCcw size={11} /></Btn>
                    <Link href={`/shoots/${i.shoot_id}`} className="inline-flex items-center px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border border-[#E4E4E7] hover:bg-[#F4F4F5]">Shooting</Link>
                    {isStaff && <Btn size="sm" variant="danger" onClick={() => deleteImageForever(i)}><Trash2 size={11} /></Btn>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
