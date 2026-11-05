import { createHmac, timingSafeEqual } from "crypto";

// Connexion unique depuis l'accueil Irizée Brand (irizee-brand.com/accueil).
// Jeton = base64url(payload JSON) + "." + base64url(HMAC-SHA256(SSO_SHARED_SECRET, payload)),
// signé par irizee-brand (src/lib/sso.ts), valable 60 secondes.

const APP = "studio";
const MAX_AGE_SECONDS = 120;

export function verifySsoToken(token: string, secret: string): { email: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let data: { email?: unknown; aud?: unknown; iat?: unknown; exp?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (data.aud !== APP) return null;
  if (typeof data.email !== "string" || typeof data.exp !== "number" || typeof data.iat !== "number") return null;
  if (data.exp < now || data.iat > now + 30 || data.exp - data.iat > MAX_AGE_SECONDS) return null;

  return { email: data.email.toLowerCase() };
}
