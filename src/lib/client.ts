"use client";
import { useCallback, useMemo, useRef } from "react";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export async function api<T = any>(url: string, body?: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
  return j as T;
}

/**
 * Appel d'une étape longue, insensible aux coupures de connexion : si la requête est coupée en route,
 * le résultat est récupéré dans `ai_jobs` dès que le serveur a fini.
 */
export async function apiJob<T = any>(sb: { from: (t: string) => any }, url: string, body: Record<string, unknown>, maxMs = 240_000): Promise<T> {
  const jobId = crypto.randomUUID();
  let direct: { ok: true; data: T } | { ok: false; error: string } | null = null;
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, jobId }) })
    .then(async (res) => {
      const j = await res.json().catch(() => null);
      if (res.ok && j) direct = { ok: true, data: j as T };
      else if (j?.error && res.status < 500) direct = { ok: false, error: j.error }; // vraie erreur de l'application (pas une coupure)
    }).catch(() => { /* coupure : on attend le résultat enregistré */ });
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, 2500));
    const d = direct as { ok: true; data: T } | { ok: false; error: string } | null;
    if (d?.ok) return d.data;
    if (d && !d.ok) throw new Error(d.error);
    const { data } = await sb.from("ai_jobs").select("state, result, error").eq("id", jobId).maybeSingle();
    if (data?.state === "done") return data.result as T;
    if (data?.state === "error") throw new Error(data.error || "Erreur");
  }
  throw new Error("Le serveur met trop de temps à répondre. Réessayez.");
}

/** Réduit une image avant envoi (JPEG) pour rester léger. */
export async function shrinkImage(file: Blob, max = 1800): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("Image illisible")); i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("Compression impossible"))), "image/jpeg", 0.92));
  } finally { URL.revokeObjectURL(url); }
}

export async function uploadImage(sb: SupabaseClient, prefix: string, file: Blob, max = 1800) {
  const blob = await shrinkImage(file, max);
  const path = `${prefix}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from("studio").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Envoi impossible : " + error.message);
  return path;
}

/** URL d'une image du stockage privé, servie avec un cache navigateur long (voir /api/img). */
export const imgUrl = (path: string) => `/api/img?p=${encodeURIComponent(path)}`;

export async function signUrls(_sb: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  paths.forEach((p) => { if (p) out[p] = imgUrl(p); });
  return out;
}

export function useSupabase() {
  const ref = useRef<SupabaseClient>();
  if (!ref.current) ref.current = createClient();
  return ref.current;
}

export function useSignedUrls(paths: (string | null | undefined)[]) {
  const key = paths.filter(Boolean).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => signSync(paths), [key]);
}
function signSync(paths: (string | null | undefined)[]) {
  const out: Record<string, string> = {};
  paths.forEach((p) => { if (p) out[p] = imgUrl(p); });
  return out;
}

/** File d'attente côté navigateur : génère puis contrôle chaque image (3 en parallèle). */
export function usePipeline(onChange: () => void) {
  const [running, setRunning] = useState<Set<string>>(new Set());
  const queue = useRef<{ id: string; qcOnly: boolean }[]>([]);
  const active = useRef(0);
  const inFlight = useRef<Set<string>>(new Set());
  const errors = useRef<Record<string, string>>({});
  const ctrls = useRef<Map<string, AbortController>>(new Map());
  const cancelled = useRef<Set<string>>(new Set());
  const [, force] = useState(0);

  const sync = useCallback(() => setRunning(new Set(inFlight.current)), []);

  const pump = useCallback(() => {
    while (active.current < 3 && queue.current.length) {
      const job = queue.current.shift()!;
      active.current++;
      inFlight.current.add(job.id); sync();
      const ctrl = new AbortController();
      ctrls.current.set(job.id, ctrl);
      (async () => {
        try {
          if (!job.qcOnly) await api(`/api/images/${job.id}/generate`, undefined, "POST", ctrl.signal);
          onChange();
          if (!cancelled.current.has(job.id)) await api(`/api/images/${job.id}/qc`, undefined, "POST", ctrl.signal);
        } catch (e) {
          if (!cancelled.current.has(job.id)) errors.current[job.id] = e instanceof Error ? e.message : "Erreur";
        } finally {
          ctrls.current.delete(job.id);
          active.current--; inFlight.current.delete(job.id); sync(); onChange(); force((n) => n + 1); pump();
        }
      })();
    }
  }, [onChange, sync]);

  const run = useCallback((ids: string[], qcOnly = false) => {
    ids.forEach((id) => { if (!inFlight.current.has(id) && !queue.current.some((j) => j.id === id)) { delete errors.current[id]; queue.current.push({ id, qcOnly }); inFlight.current.add(id); } });
    sync(); pump();
  }, [pump, sync]);

  /** Annule des images : retire celles en attente et interrompt celles en cours. */
  const cancel = useCallback((ids: string[]) => {
    ids.forEach((id) => {
      cancelled.current.add(id);
      queue.current = queue.current.filter((j) => j.id !== id);
      ctrls.current.get(id)?.abort();
      inFlight.current.delete(id);
    });
    sync();
  }, [sync]);

  return { running, run, cancel, errors: errors.current };
}
