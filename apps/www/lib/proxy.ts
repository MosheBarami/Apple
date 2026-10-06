// Same-origin API: in production this app is served at studpilot.app, so /api/* and /studio/api/* are already the
// worker's. Anywhere else (the preview, local dev) these route handlers forward them there, server-side, so the
// browser never needs CORS. The body goes both ways as a stream, and the Authorization header is kept.
const ORIGIN = process.env.STUDPILOT_API_ORIGIN ?? "https://studpilot.app";

const DROP_REQUEST = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-for",
  "x-real-ip",
]);
const DROP_RESPONSE = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "set-cookie",
]);

export async function proxyToStudpilot(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, ORIGIN);

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (!(DROP_REQUEST.has(name) || name.startsWith("cf-"))) {
      headers.set(name, value);
    }
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // Required by the fetch spec when the body is a stream.
    ...(hasBody ? { duplex: "half" } : {}),
    redirect: "manual",
    signal: request.signal,
  } as RequestInit);

  const out = new Headers();
  for (const [name, value] of upstream.headers) {
    if (!DROP_RESPONSE.has(name)) {
      out.set(name, value);
    }
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
