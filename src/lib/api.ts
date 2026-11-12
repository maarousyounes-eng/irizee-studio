import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new HttpError(401, "Session expirée : reconnecte-toi");
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) throw new HttpError(403, "Profil introuvable");
  return { sb, user, profile: profile as { id: string; role: "admin" | "employee" | "creator"; email: string; monthly_quota: number } };
}

export function handle(fn: () => Promise<unknown>) {
  return fn().then(
    (data) => NextResponse.json(data ?? { ok: true }),
    (e: unknown) => {
      const status = e instanceof HttpError ? e.status : 500;
      return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, { status });
    }
  );
}

/**
 * Étape longue : le résultat est aussi enregistré dans `ai_jobs`, pour que la page le récupère
 * même si la connexion a coupé la requête en route (réseau lent, proxy, mobile).
 */
export async function withJob<T>(sb: { from: (t: string) => any }, jobId: unknown, fn: () => Promise<T>): Promise<T> {
  const id = typeof jobId === "string" && /^[0-9a-f-]{36}$/i.test(jobId) ? jobId : null;
  if (!id) return fn();
  await sb.from("ai_jobs").upsert({ id, state: "running" });
  try {
    const result = await fn();
    await sb.from("ai_jobs").update({ state: "done", result }).eq("id", id);
    return result;
  } catch (e) {
    await sb.from("ai_jobs").update({ state: "error", error: e instanceof Error ? e.message.slice(0, 500) : "Erreur" }).eq("id", id);
    throw e;
  }
}
