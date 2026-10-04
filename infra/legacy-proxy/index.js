// The former hosts of the product (apple.<sub>.workers.dev, golem.<sub>.workers.dev), kept for 90 days
// after the StudPilot rename (handoff 1.3, until 2027-01-02).
//
// Every published Studio plugin hard-codes the old host and POSTs to /api/studio/* with X-Golem-*
// headers. A 301 would turn those POSTs into GETs and drop the body, so the API is PASSED THROUGH
// unchanged (method, headers, body, WebSocket upgrades) to the studpilot Worker, and only a page load
// in a browser is redirected to https://studpilot.app.
//
// THROUGH A SERVICE BINDING, NOT fetch(). A fetch() to studpilot.app leaves from a Cloudflare address,
// so the origin's per-IP limits (pairing claims, polls) would put every old-host user in one bucket.
// Measured 2026-10-04: through fetch() the origin saw a 2a06:… egress address; through a service
// binding it saw the client's own address.
const ORIGIN = 'https://studpilot.app';
const PASS_THROUGH = /^\/(?:api|v1|ws|auth|mcp)(?:\/|$)/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // Plain HTTP gets the origin's own answer, a 308 to HTTPS on the same host (index.ts). Passing it
    // on as HTTPS would accept an API key that has just crossed the network in cleartext.
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 308);
    }
    const target = ORIGIN + url.pathname + url.search;
    const isPage = (req.method === 'GET' || req.method === 'HEAD') && !PASS_THROUGH.test(url.pathname) && req.headers.get('upgrade') === null;
    if (isPage) return Response.redirect(target, 301);
    return env.STUDPILOT.fetch(new Request(target, req));
  },
};
