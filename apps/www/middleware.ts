import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

// The website pages never need a session; the sign-in pages do their own redirects below.
const MARKETING_PATHS = new Set(["/", "/product", "/pricing", "/docs", "/privacy", "/terms"]);
const PUBLIC_PATHS = ["/login", "/auth/"];
// A page that renders the app shell with made-up data, for design review. It does not exist in a production build.
const DEV_ONLY_PATHS = process.env.NODE_ENV === "production" ? [] : ["/dev/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    MARKETING_PATHS.has(pathname) ||
    pathname.startsWith("/docs/") ||
    DEV_ONLY_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next({ request });
  }

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
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const redirectTo = signedIn
    ? pathname === "/login"
      ? "/app"
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
  // The two API prefixes are proxied to the StudPilot worker and carry their own bearer token; the renders and
  // other static files in public/ are served to everyone.
  matcher: [
    "/((?!api/|studio/api/|_next/static|_next/image|favicon.ico|renders/|fonts/|.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico|txt|xml)$).*)",
  ],
};
