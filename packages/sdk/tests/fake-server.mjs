// A real HTTP server for the transport tests.
//
// NOT A MOCKED `fetch`. The interesting failures of an HTTP client live in the parts a mock
// replaces: a body that is HTML when JSON was expected, a 429 that arrives twice and then
// clears, a header the client must read back off the response, a request that must NOT have
// been sent at all. A stubbed fetch would agree with whatever the client did.
import { createServer } from 'node:http';

/**
 * @param routes  `{ 'GET /api/health': handler }`, where a handler is
 *                `(req, body, hit) => ({ status?, headers?, body? })` and `hit` is how many
 *                times that route has been called including this one.
 */
export async function startServer(routes) {
  const requests = [];
  const hits = new Map();
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const url = new URL(req.url, 'http://localhost');
      const key = `${req.method} ${url.pathname}`;
      requests.push({ method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers, body: raw });
      const handler = routes[key];
      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `no route for ${key}` }));
        return;
      }
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      const out = handler(requests.at(-1), raw, n) ?? {};
      const headers = { 'Content-Type': 'application/json', ...(out.headers ?? {}) };
      res.writeHead(out.status ?? 200, headers);
      // A Buffer is written as bytes. Letting it go through String() would put every byte
      // above 0x7f through UTF-8 and the image test would be asserting on the harness.
      if (Buffer.isBuffer(out.body) || out.body instanceof Uint8Array) res.end(Buffer.from(out.body));
      else res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body ?? { ok: true }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
