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
