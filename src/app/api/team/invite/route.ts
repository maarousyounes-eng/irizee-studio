import { createClient as createAdminClient } from "@supabase/supabase-js";
import { requireUser, handle, HttpError } from "@/lib/api";

export async function POST(req: Request) {
  return handle(async () => {
    const { profile } = await requireUser();
    if (profile.role !== "admin") throw new HttpError(403, "Réservé à l'admin");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new HttpError(501, "Ajoute SUPABASE_SERVICE_ROLE_KEY dans les variables d'environnement pour activer les invitations. En attendant, la personne peut créer son compte depuis la page de connexion.");
    const { email } = await req.json();
    if (!/^\S+@\S+\.\S+$/.test(email ?? "")) throw new HttpError(400, "Email invalide");
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
    const origin = req.headers.get("origin") ?? undefined;
    const { error } = await admin.auth.admin.inviteUserByEmail(email, origin ? { redirectTo: origin } : undefined);
    if (error) throw new HttpError(400, error.message);
    return { ok: true };
  });
}
