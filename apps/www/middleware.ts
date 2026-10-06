import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

const PUBLIC_PATHS = ["/login", "/auth/"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Verifies the token against the project's signing keys (refreshing it when it is close to expiry).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const redirectTo = signedIn
    ? pathname === "/login"
      ? "/"
      : null
    : isPublic
      ? null
      : "/login";
  if (!redirectTo) {
    return response;
  }
  const redirect = NextResponse.redirect(new URL(redirectTo, request.url));
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  // The two API prefixes are proxied to the StudPilot worker and carry their own bearer token.
  matcher: ["/((?!api/|studio/api/|_next/static|_next/image|favicon.ico).*)"],
};
