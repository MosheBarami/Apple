/**
 * AN EXEMPTION THAT DESCRIBES NOTHING.
 *
 * Defect Dad0bbf. `AUTH_EXEMPT` is the list reviewers read to decide which endpoints may skip JWT
 * auth — "ADDING A LINE HERE IS THE REVIEW", as the assertion guarding it in
 * packages/evals/src/security.test.mjs puts it. It contained `/api/waitlist`, annotated
 * "write-only, rate-limited, holds an email and nothing else", and there is no such handler in
 * index.ts and no caller anywhere in apps/site or apps/web.
 *
 * Nothing is broken for a user today, and that is the whole risk: the entry costs nothing until
 * somebody adds a `/api/waitlist` handler, at which point it ships already exempt from
 * authentication with a reviewed-and-signed-off comment attached, and nobody re-reads the decision.
 *
 * WHAT THESE TESTS MEASURE is the shape of the refusal, not the absence of the string. An exempt
 * path with no handler falls through the middleware to the 404 handler; a path that is not exempt
 * is refused 401 before routing. So `/api/waitlist` answering exactly what every other unknown
 * `/api/*` path answers IS the exemption being gone, observed rather than asserted about source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `golem-waitlist-exempt-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(pathToFileURL(OUT).href)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

const env = {
  KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
  ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{"stored":0}', { status: 200 }); } }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

const anon = (path, method = 'POST') => app.fetch(new Request(`https://w${path}`, { method }), env, ctx);

test('there is genuinely no /api/waitlist handler — the entry described nothing', () => {
  const src = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  assert.equal(
    /app\.(get|post|put|patch|delete)\('\/api\/waitlist'/.test(src),
    false,
    'a handler appeared: this defect is now a live route and the exemption needs a real review, not a deletion',
  );
});

test('/api/waitlist is refused exactly as any other unknown /api path is', async () => {
  const waitlist = await anon('/api/waitlist');
  const sibling = await anon('/api/not-a-route-at-all');
  assert.equal(
    waitlist.status,
    sibling.status,
    `/api/waitlist answered ${waitlist.status} where a sibling unknown path answers ${sibling.status} — it is still exempt`,
  );
  assert.equal(waitlist.status, 401, 'an unauthenticated caller must be refused before routing');
});

test('the exemptions that remain all point at a handler that exists', async () => {
  const src = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  const list = JSON.parse('[' + /const AUTH_EXEMPT = \[([^\]]*)\]/.exec(src)[1].replace(/'/g, '"') + ']');
  assert.ok(list.length > 0);
  for (const path of list) {
    assert.ok(
      new RegExp(`app\\.(get|post|put|patch|delete)\\('${path.replace(/\//g, '\\/')}'`).test(src),
      `${path} is exempt from JWT auth and has no handler — the review said something about nothing`,
    );
  }
});
