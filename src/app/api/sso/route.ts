import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { verifySsoToken } from "@/lib/sso";

export const dynamic = "force-dynamic";

// GET /api/sso?token=...  — arrivée depuis l'accueil Irizée Brand.
// Vérifie le jeton signé puis ouvre une session pour le compte existant ayant le même e-mail.
export async function GET(request: NextRequest) {
  const fail = (reason: string) => {
    const url = new URL("/login", request.url);
    url.searchParams.set("sso", reason);
    return NextResponse.redirect(url);
  };

  const secret = process.env.SSO_SHARED_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !serviceKey) return fail("non-configure");

  const token = request.nextUrl.searchParams.get("token") ?? "";
  const claims = verifySsoToken(token, secret);
  if (!claims) return fail("lien-invalide");

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Uniquement un compte qui existe déjà ici : on ne crée jamais de compte via ce lien.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return fail("erreur");
  const exists = list.users.some((u) => u.email?.toLowerCase() === claims.email);
  if (!exists) return fail("compte-inconnu");

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: claims.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return fail("erreur");

  const supabase = createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (otpError) return fail("erreur");

  return NextResponse.redirect(new URL("/studio", request.url));
}
