/**
 * Local-only guard for the API routes. The server already binds to 127.0.0.1; this additionally
 * rejects requests whose Host or Origin is not local, so a web page on another origin (or a DNS
 * rebinding trick) cannot spend the owner's API credits.
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function guard(req: Request): Response | null {
  const host = hostOf(req.headers.get("host"));
  if (!host || !LOCAL_HOSTS.has(host)) return new Response("forbidden host", { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") {
    const oh = hostOf(origin);
    if (!oh || !LOCAL_HOSTS.has(oh)) return new Response("forbidden origin", { status: 403 });
  }
  return null;
}
