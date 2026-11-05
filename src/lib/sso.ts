import { createPublicKey, verify } from "crypto";

// Connexion unique depuis le portail Irizée Tools (irizee-tools).
// Jeton = base64url(payload JSON) + "." + base64url(signature Ed25519), valable 60 secondes.
// Seul le portail possède la clé privée ; cette plateforme n'a que la clé publique (SSO_PUBLIC_KEY) :
// elle peut vérifier un jeton, jamais en fabriquer un.

const APP = "studio";
const MAX_AGE_SECONDS = 120;

export function verifySsoToken(token: string, publicKeyPem: string): { email: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  try {
    const key = createPublicKey(publicKeyPem.replace(/\\n/g, "\n"));
    if (!verify(null, Buffer.from(payload), key, Buffer.from(sig, "base64url"))) return null;
  } catch {
    return null;
  }

  let data: { iss?: unknown; email?: unknown; aud?: unknown; iat?: unknown; exp?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (data.iss !== "irizee-tools" || data.aud !== APP) return null;
  if (typeof data.email !== "string" || typeof data.exp !== "number" || typeof data.iat !== "number") return null;
  if (data.exp < now || data.iat > now + 30 || data.exp - data.iat > MAX_AGE_SECONDS) return null;

  return { email: data.email.toLowerCase() };
}
