import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function redirect(url: URL, base: NextResponse) {
  const res = NextResponse.redirect(url);
  base.cookies.getAll().forEach(({ name, value }) => res.cookies.set(name, value));
  return res;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Les routes API vérifient elles-mêmes la session (et renvoient du JSON en 401).
  if (pathname.startsWith("/api/")) return response;

  if (!user) {
    if (pathname === "/login") return response;
    return redirect(new URL("/login", request.url), response);
  }
  if (pathname === "/login" || pathname === "/") return redirect(new URL("/studio", request.url), response);
  return response;
}
