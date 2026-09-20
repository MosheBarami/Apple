#!/usr/bin/env node
/**
 * PUT THE SHOWCASE WHERE THE OWNER CAN OPEN IT, ON HIS PHONE, WITHOUT A CHECKOUT.
 *
 * WHY THIS EXISTS. The showcase — sixteen Roblox screens and six playable maps the deployed model
 * built out of the product's own library — was assembled into one page on 2026-09-20 and then left
 * at `docs/evidence/showcase.html`, a file on one laptop. `GET /showcase` answered 404 all night.
 * The owner is fifteen, does not use git, and asked to SEE what the model makes. Work that is not
 * deployed is invisible, and a gallery nobody can open is worth exactly as much as no gallery.
 *
 * WHAT IT DOES NOT TOUCH, and this is the point of a separate script. `infra/deploy-static.mjs`
 * with no arguments ships `apps/site/dist` and `apps/web/dist` — whatever build output happens to
 * be sitting in those directories, including another lane's half-finished page. This ships the
 * showcase and nothing else: one HTML page under /showcase and the PNGs it references. It calls
 * deploy-static's own `--file` path for every upload rather than carrying a second copy of the
 * chunking and the D1 retry, because two uploaders drift and one does not.
 *
 * UPLOADED IS NOT DEPLOYED. deploy-static learned that the expensive way — see its `verifyServed`
 * header, and the day /pricing served a page from a design that had been deleted. Its `--file`
 * path does NOT verify, so this does: every URL a reader would actually type is fetched back from
 * the live origin and its bytes compared to the bytes just sent. Anything that does not match is
 * a failure, not a warning.
 *
 * ORDER IS DELIBERATE, for the same reason deploy-static orders its uploads: images first, page
 * last. A part-way failure then leaves no page rather than a page full of broken pictures.
 *
 *   set -a && . ./.env && set +a
 *   node infra/deploy-showcase.mjs
 *   node infra/deploy-showcase.mjs --base https://apple.moshe-barami111.workers.dev --prefix /showcase
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};

// .env is a convenience, not a requirement — the same contract deploy-static states.
try {
  for (const line of readFileSync(join(REPO, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* the environment is expected to carry API_BASE and GOLEM_ADMIN_KEY */ }

const BASE = (arg('base') ?? process.env.API_BASE ?? '').replace(/\/$/, '');

// No trailing slash, exactly one leading one: every remote path below is PREFIX + '/' + something,
// and a prefix that ends in a slash would upload to `//showcase` — a key no reader ever requests.
const PREFIX = `/${String(arg('prefix', '/showcase')).replace(/^\/+|\/+$/g, '')}`;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/** deploy-static's own uploader, so the chunking and the D1 retry have one implementation. */
function upload(localPath, remotePath) {
  execFileSync(process.execPath, [join(HERE, 'deploy-static.mjs'), '--file', localPath, remotePath], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: process.env,
  });
  return readFileSync(localPath).length;
}

/**
 * The worker caches a response for 60s under a key built from the REQUEST path, while an upload
 * busts a key built from the STORED path — for an extensionless URL those are different strings,
 * so a correct upload can be shadowed by a stale cache entry for up to a minute. Hence the window.
 */
const CACHE_WAITS = Object.freeze([0, 3000, 12000, 30000]);

/**
 * `--cache-waits 0` collapses that window. IT EXISTS FOR tests/deploy-showcase.test.mjs AND FOR
 * NOTHING ELSE: the guard drives this script against a local origin with no cache in front of it,
 * and paying the real 45 seconds on every suite run would make the gate slow enough that someone
 * eventually deletes the test. Passing it against the production origin would turn a correct
 * deploy that happens to read back stale into a reported failure — noisy, not dangerous, but there
 * is no reason to reach for it.
 */
const WAITS = (() => {
  const raw = arg('cache-waits');
  if (raw === null) return CACHE_WAITS;
  const list = String(raw).split(',').map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0);
  return list.length ? Object.freeze(list) : CACHE_WAITS;
})();

/**
 * THE ONLY EVIDENCE OF A DEPLOY IS THE URL A READER TYPES.
 *
 * Retried across the worker's 60s response cache before it is believed, and then believed either
 * way: a mismatch that survives the window is a failed deploy, not a slow one.
 */
export async function verify(url, wantSha, base = BASE, waits = CACHE_WAITS) {
  let got = 'never fetched';
  for (const waitMs of waits) {
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    const res = await fetch(base + url).catch(() => null);
    if (!res || !res.ok) { got = res ? `HTTP ${res.status}` : 'no response'; continue; }
    got = sha256(new Uint8Array(await res.arrayBuffer()));
    if (got === wantSha) return null;
  }
  return { url, want: wantSha, got };
}

async function main() {
  // Checked HERE rather than at module scope: infra/deploy-showcase.test.mjs imports this file to
  // exercise `verify`, and a credential check at import time would make the guard unrunnable
  // without the production key — which is how a verifier ends up with no test at all.
  if (!BASE || !process.env.GOLEM_ADMIN_KEY) throw new Error('API_BASE / GOLEM_ADMIN_KEY missing');
  const uiDir = resolve(arg('ui', join(REPO, 'docs/evidence/ui-showcase')));
  const mapDir = resolve(arg('maps', join(REPO, 'docs/evidence/map-showcase')));

  // Rebuilt here rather than reused from docs/, because the committed copy carries RELATIVE image
  // paths. Served at /showcase, `ui-showcase/x.png` resolves to /ui-showcase/x.png — the wrong
  // key, a page of broken images, and a deploy that would still report success.
  const tmp = mkdtempSync(join(tmpdir(), 'showcase-deploy-'));
  const htmlPath = join(tmp, 'index.html');
  execFileSync(process.execPath, [
    join(REPO, 'packages/training/src/build-showcase-gallery.mjs'),
    '--ui', uiDir, '--maps', mapDir, '--out', htmlPath,
    '--ui-prefix', `${PREFIX}/ui-showcase/`,
    '--map-prefix', `${PREFIX}/map-showcase/`,
  ], { stdio: ['ignore', 'pipe', 'inherit'] });

  const html = readFileSync(htmlPath, 'utf8');

  //[[ SHIP WHAT THE PAGE ASKS FOR, NOT WHAT THE DIRECTORY HOLDS.
  //
  //   Reading the srcs out of the built HTML means the uploaded set cannot drift from the
  //   referenced set in either direction: no orphan megabytes in D1 for screens the gallery
  //   dropped, and — the one that would show — no card pointing at a PNG nobody sent.
  //
  //   There is deliberately NO existsSync check on the local file. build-showcase-gallery only
  //   emits an <img> when the PNG is on disk (`hasPng`; a screen without one becomes a failed
  //   card with no picture), and it is handed the same two directories this reads from — so a
  //   referenced-but-missing file cannot occur, and a branch no test can reach is not a guard,
  //   it is a comfort. An earlier version had that check; a mutation removing it left the suite
  //   green, which is how it was found. The refusal below IS reachable and IS tested. ]]
  const refs = [...new Set([...html.matchAll(/src="([^"]+\.png)"/g)].map((m) => m[1]))];
  const images = refs.map((remote) => ({
    local: join(remote.includes('/map-showcase/') ? mapDir : uiDir, basename(remote)),
    remote,
  }));
  if (!images.length) throw new Error('the built page references no images — refusing to ship an empty gallery');

  console.log(`${BASE}${PREFIX} — ${images.length} image(s) + 1 page`);
  let bytes = 0;
  for (const [i, img] of images.entries()) {
    bytes += upload(img.local, img.remote);
    process.stdout.write(`\r  images ${i + 1}/${images.length}, ${(bytes / 1024).toFixed(0)}KB   `);
  }
  console.log();
  upload(htmlPath, `${PREFIX}/index.html`);
  console.log(`  page uploaded (${(html.length / 1024).toFixed(0)}KB)`);

  // The page is reached at /showcase, not /showcase/index.html — the worker resolves the bare path
  // to the index. Verifying the stored key instead of the typed one is how a shadowed row goes
  // unnoticed, which is the exact failure deploy-static's verifyServed was written for.
  const wrong = [];
  for (const bad of await Promise.all([
    verify(PREFIX, sha256(Buffer.from(html)), BASE, WAITS),
    ...images.map((img) => verify(img.remote, sha256(readFileSync(img.local)), BASE, WAITS)),
  ])) if (bad) wrong.push(bad);

  if (wrong.length) {
    console.error(`\n${BASE} DOES NOT SERVE WHAT WAS JUST SENT — ${wrong.length} URL(s):`);
    for (const w of wrong) console.error(`  ${w.url}   want ${w.want}, got ${w.got}`);
    process.exit(3);
  }
  console.log(`verified — ${BASE}${PREFIX} and all ${images.length} image(s) serve the bytes just sent`);
}

// Imported by infra/deploy-showcase.test.mjs to exercise `verify` against a throwaway origin,
// which is the only way to watch the verifier FAIL. Running it as a script still deploys.
if (import.meta.url === `file://${process.argv[1]}`) await main();
