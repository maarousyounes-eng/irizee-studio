import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

// Sert les images du stockage privé avec un cache navigateur long : une image déjà vue ne se recharge plus.
// L'accès reste protégé par les règles du stockage (session obligatoire).
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("p") ?? "";
  if (!/^(products|models|inspirations|corrections|generated)\/[\w\-./]+$/.test(p) || p.includes("..")) return new Response("Requête invalide", { status: 400 });
  const sb = createClient();
  const { data, error } = await sb.storage.from("studio").download(p);
  if (error || !data) return new Response("Introuvable", { status: 404 });
  const ext = p.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new Response(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
