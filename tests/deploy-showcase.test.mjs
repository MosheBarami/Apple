// The showcase deploy, rehearsed against a throwaway origin — including the failure it prevents.
//
// WHY THIS IS IN tests/ AND NOT infra/. `scripts/gate-suite.mjs` globs root-level tests out of
// `tests/` only. A guard beside the script it guards would be run by nothing, which is the same
// nothing that ran over thirty-six unshipped commits while every script printed success.
//
// WHAT IS BEING DEFENDED. `infra/deploy-showcase.mjs` puts the model's showcase — sixteen Roblox
// screens and six maps — at a URL the owner can open. Its only real assertion is the fetch-back:
// every URL a reader would type is retrieved from the origin and its bytes compared. That check is
// the whole value of the script, so it has to be watched coming out NEGATIVE, or it is decoration.
//
// Two layers here:
//   1. `verify` in isolation, against an origin that is right, wrong, absent and slow.
//   2. THE WHOLE SCRIPT, against an origin that accepts every upload and stores nothing — F-62 as
//      a server, and the failure mode under which a deploy is least likely to be doubted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from '../infra/deploy-showcase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const execFile = promisify(execFileCb);
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const SENT = 'the exact bytes the uploader sent';
const NOW = [0]; // no cache-window waiting: there is no cache in front of these servers
const LUAU = 'local screenGui = Instance.new("ScreenGui")\n';

// ---------------------------------------------------------------------------------------------
// 1. THE FETCH-BACK, IN ISOLATION
// ---------------------------------------------------------------------------------------------

async function plainOrigin() {
  const server = createServer((req, res) => {
    if (req.url === '/right') { res.writeHead(200); res.end(SENT); return; }
    if (req.url === '/wrong') { res.writeHead(200); res.end('an older page nobody replaced'); return; }
    res.writeHead(404); res.end('not found');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    stop: () => new Promise((r) => server.close(r)),
  };
}

test('bytes that match are reported as deployed', async () => {
  const o = await plainOrigin();
  try {
    assert.equal(await verify('/right', sha(SENT), o.url, NOW), null);
  } finally { await o.stop(); }
});

test('THE AIMED CASE — an origin still serving the old page is caught, not passed', async () => {
  // The shape a stale shadowing row takes: the upload succeeded, the row it wrote is correct, and
  // the site serves the other one. HTTP 200, wrong body, and for a day nobody noticed.
  const o = await plainOrigin();
  try {
    const bad = await verify('/wrong', sha(SENT), o.url, NOW);
    assert.ok(bad, 'different bytes at HTTP 200 must not verify');
    assert.equal(bad.want, sha(SENT));
    assert.equal(bad.got, sha('an older page nobody replaced'), 'the report must carry what was actually served');
  } finally { await o.stop(); }
});

test('a 404 is a failed deploy that names its status, not a thrown stack', async () => {
  const o = await plainOrigin();
  try {
    const bad = await verify('/missing', sha(SENT), o.url, NOW);
    assert.equal(bad?.got, 'HTTP 404');
  } finally { await o.stop(); }
});

test('an origin that is not there at all is reported, not swallowed', async () => {
  // The likeliest shape of "you deployed to the wrong host". `fetch` rejects, and the verifier
  // must turn that into a finding rather than an exception some caller upstream logs as a warning.
  const o = await plainOrigin();
  await o.stop();
  const bad = await verify('/right', sha(SENT), o.url, NOW);
  assert.equal(bad?.got, 'no response');
});

test('a later attempt inside the cache window can still clear a mismatch', async () => {
  // The worker caches for 60s under the REQUEST path while an upload busts the STORED path, so a
  // correct upload can read back stale. The verifier must believe the LAST answer, not the first.
  let hit = 0;
  const server = createServer((_q, res) => { hit += 1; res.writeHead(200); res.end(hit === 1 ? 'stale cached copy' : SENT); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await verify('/right', sha(SENT), base, [0, 0]), null);
    assert.equal(hit, 2, 'the first answer must not have been accepted');
  } finally { await new Promise((r) => server.close(r)); }
});

// ---------------------------------------------------------------------------------------------
// 2. THE WHOLE SCRIPT
// ---------------------------------------------------------------------------------------------

/**
 * A static origin in the worker's shape: the admin upload route deploy-static.mjs POSTs to, and
 * the `/showcase` → `/showcase/index.html` resolution the real worker performs.
 *
 * `mode`: 'store' is honest; 'silent' answers 200 to every upload and writes NOTHING.
 */
async function fakeOrigin({ mode = 'store', seed = null } = {}) {
  const store = new Map();
  if (seed) for (const [k, v] of Object.entries(seed)) store.set(k, { body: Buffer.from(v), contentType: 'text/html; charset=utf-8' });
  const uploads = [];
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/admin/static-upload') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const p = JSON.parse(body);
        uploads.push(p.path);
        if (mode !== 'silent') {
          const bytes = Buffer.from(p.b64, 'base64');
          const prior = p.append === true ? store.get(p.path)?.body ?? Buffer.alloc(0) : Buffer.alloc(0);
          store.set(p.path, { body: Buffer.concat([prior, bytes]), contentType: p.contentType });
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      });
      return;
    }
    const url = req.url.split('?')[0];
    const alt = `${url.replace(/\/$/, '')}/index.html`;
    const key = store.has(url) ? url : store.has(alt) ? alt : null;
    if (key === null) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': store.get(key).contentType ?? 'application/octet-stream' }).end(store.get(key).body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, store, uploads, stop: () => new Promise((r) => server.close(r)) };
}

/** The smallest showcase the gallery builder will assemble: one built screen with a PNG beside it. */
function tinyShowcase() {
  const dir = mkdtempSync(join(tmpdir(), 'showcase-src-'));
  const ui = join(dir, 'ui-showcase');
  const maps = join(dir, 'map-showcase');
  mkdirSync(ui, { recursive: true });
  mkdirSync(maps, { recursive: true });
  // A 1x1 PNG. The content is irrelevant; that the SAME bytes come back is the entire point.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  writeFileSync(join(ui, 'screen-shop--tycoon.png'), png);
  // THE SCRIPT IS ON DISK, because the page links it and the deploy has to carry it. A card that
  // names a .luau the uploader never sends is a dead link the deploy would still call verified —
  // it would have verified only what it sent.
  writeFileSync(join(ui, 'screen-shop--tycoon.luau'), LUAU);
  writeFileSync(join(ui, 'manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), model: 'rune', lane: 'Apple MAX', genre: 'tycoon',
    counts: { targets: 1, built: 1, byOutcome: { built: 1 } },
    results: [{
      target: 'screen-shop', id: 'screen-shop', genre: 'tycoon', outcome: 'built', codeChars: LUAU.length,
      guiNodes: 3, sources: 2, asScripted: { painted: 2, textNodes: 1, hidden: 0, offscreen: 0 },
      opened: null, files: { luau: 'screen-shop--tycoon.luau', svg: 'screen-shop--tycoon.svg' },
    }],
  }));
  writeFileSync(join(maps, 'manifest.json'), JSON.stringify({ counts: { built: 0 }, results: [] }));
  return { dir, ui, maps };
}

const runDeploy = (origin, src) => execFile(process.execPath, [
  join(ROOT, 'infra/deploy-showcase.mjs'),
  '--base', origin.url, '--prefix', '/showcase', '--ui', src.ui, '--maps', src.maps,
  // No worker cache sits in front of these origins, so the production wait window would add 45
  // seconds of sleeping to every suite run and buy nothing. See WAITS in the script.
  '--cache-waits', '0',
], { env: { ...process.env, GOLEM_ADMIN_KEY: 'test-key', API_BASE: origin.url } });

test('an honest origin: the page is verified at the URL a reader types, not the key it is stored under', async () => {
  const origin = await fakeOrigin();
  const src = tinyShowcase();
  try {
    const { stdout } = await runDeploy(origin, src);
    assert.match(stdout, /verified/, 'a good deploy must say so');
    // THE DISTINCTION THAT MATTERS. The bytes go to /showcase/index.html; the owner opens
    // /showcase. Verifying the stored key instead of the typed one is how a shadowed row survives.
    assert.ok(origin.uploads.includes('/showcase/index.html'), 'the page is stored under the index key');
    assert.ok(origin.uploads.includes('/showcase/ui-showcase/screen-shop--tycoon.png'), 'the image ships under the prefix');
    const served = await fetch(`${origin.url}/showcase`).then((r) => r.text());
    assert.match(served, /src="\/showcase\/ui-showcase\/screen-shop--tycoon\.png"/, 'the served page must point at the deployed image, not a relative path');
  } finally { await origin.stop(); rmSync(src.dir, { recursive: true, force: true }); }
});

test('THE CENTRAL CASE — an origin that accepts every upload and stores nothing fails the run', async () => {
  // F-62, as a server: 200 on every POST, zero bytes retained. This is the failure under which a
  // deploy is least likely to be doubted, because everything the uploader can see went perfectly.
  // The run must exit non-zero and must never print the word `verified`.
  const origin = await fakeOrigin({ mode: 'silent' });
  const src = tinyShowcase();
  try {
    let err = null;
    await runDeploy(origin, src).catch((e) => { err = e; });
    assert.ok(err, 'a deploy that stored nothing must not exit 0');
    assert.equal(err.code, 3, 'the documented exit code for "the origin does not serve what was sent"');
    assert.doesNotMatch(`${err.stdout}${err.stderr}`, /verified/, 'nothing may report success here');
    assert.match(err.stderr, /DOES NOT SERVE WHAT WAS JUST SENT/);
    assert.ok(origin.uploads.length > 0, 'the uploads were accepted — which is exactly why the fetch-back is the only evidence');
  } finally { await origin.stop(); rmSync(src.dir, { recursive: true, force: true }); }
});

test('a gallery with no pictures in it is refused rather than shipped', async () => {
  // With no PNG on disk build-showcase-gallery draws the screen as a failed card carrying no
  // image, so the page references nothing. Uploading that would put a picture-less "showcase" in
  // front of the owner and report success.
  const origin = await fakeOrigin();
  const src = tinyShowcase();
  rmSync(join(src.ui, 'screen-shop--tycoon.png'));
  try {
    let err = null;
    await runDeploy(origin, src).catch((e) => { err = e; });
    assert.ok(err, 'an empty gallery must fail the run');
    assert.match(`${err.stdout}${err.stderr}`, /references no images/);
    assert.equal(origin.uploads.length, 0, 'nothing may be uploaded before the references are checked');
  } finally { await origin.stop(); rmSync(src.dir, { recursive: true, force: true }); }
});

test('THE /pricing FAILURE — a stale row at the bare path shadows the index and must fail the deploy', async () => {
  // MEASURED, once, in production, and it was live for a day: `/pricing` served a page from a
  // design that had been deleted while apps/site/dist held the current one and every deploy
  // printed `done`. The worker tries `/x` BEFORE `/x/index.html`, so an old object at the bare key
  // wins forever, and this uploader can neither replace nor delete it.
  //
  // Verifying the key the bytes were STORED under would pass here — that row is perfect. Only
  // fetching the URL the owner actually types catches it. That is the difference this test exists
  // to hold, and a mutation pointing verify() at `${PREFIX}/index.html` passed the suite until it
  // was added.
  const origin = await fakeOrigin({ seed: { '/showcase': 'a showcase from a design that was deleted' } });
  const src = tinyShowcase();
  try {
    let err = null;
    await runDeploy(origin, src).catch((e) => { err = e; });
    assert.ok(err, 'a shadowed page must not report a successful deploy');
    assert.equal(err.code, 3);
    assert.doesNotMatch(`${err.stdout}${err.stderr}`, /verified/);
    assert.match(err.stderr, /\/showcase\b/, 'the failing URL must be named');
    // The upload itself was fine — which is exactly why uploading is not evidence.
    assert.ok(origin.uploads.includes('/showcase/index.html'));
    assert.equal(
      origin.store.get('/showcase').body.toString(),
      'a showcase from a design that was deleted',
      'the shadowing row is still there; the deploy simply refused to claim otherwise',
    );
  } finally { await origin.stop(); rmSync(src.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------
// 3. THE CODE THE MODEL WROTE
// ---------------------------------------------------------------------------------------------

test('the scripts the page links are uploaded AND fetched back, not just linked', async () => {
  // Each card now carries `<a href=".../x.luau">` and fetches the same URL when opened. Shipping
  // the page without the scripts puts a dead link under every picture, and this script would still
  // print `verified` — because verifying what you sent says nothing about what you did not send.
  const origin = await fakeOrigin();
  const src = tinyShowcase();
  try {
    const { stdout } = await runDeploy(origin, src);
    assert.match(stdout, /verified/);
    assert.match(stdout, /1 script\(s\)/, 'the run does not account for the scripts it shipped');
    assert.ok(origin.uploads.includes('/showcase/ui-showcase/screen-shop--tycoon.luau'), 'the script never left the laptop');
    const res = await fetch(`${origin.url}/showcase/ui-showcase/screen-shop--tycoon.luau`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), LUAU, 'the origin serves something other than the script that was sent');
  } finally { await origin.stop(); rmSync(src.dir, { recursive: true, force: true }); }
});

test('THE AIMED CASE — an origin that drops the SCRIPT while serving the page fails the run', async () => {
  // The page is perfect, the images are perfect, and the one thing the page promises — "the Luau
  // the model wrote" — 404s. This is the deploy most likely to be believed, because everything a
  // reader checks first is right.
  const origin = await fakeOrigin();
  const src = tinyShowcase();
  const swallow = '/showcase/ui-showcase/screen-shop--tycoon.luau';
  const realSet = origin.store.set.bind(origin.store);
  origin.store.set = (k, v) => (k === swallow ? origin.store : realSet(k, v));
  try {
    let err = null;
    await runDeploy(origin, src).catch((e) => { err = e; });
    assert.ok(err, 'a deploy that lost the script must not exit 0');
    assert.equal(err.code, 3);
    assert.doesNotMatch(`${err.stdout}${err.stderr}`, /verified/);
    assert.match(err.stderr, /screen-shop--tycoon\.luau/, 'the missing script must be named');
  } finally { await origin.stop(); rmSync(src.dir, { recursive: true, force: true }); }
});

test('a script the page does NOT link is not uploaded — the page decides, not the directory', async () => {
  // The same contract the images keep. An orphan in the evidence directory is megabytes in D1 for
  // something no card points at, and — worse in the other direction — it would let the uploaded
  // set drift from the referenced one without anything noticing.
  const origin = await fakeOrigin();
  const src = tinyShowcase();
  writeFileSync(join(src.ui, 'screen-nobody--tycoon.luau'), 'local orphan = true\n');
  try {
    await runDeploy(origin, src);
    assert.ok(!origin.uploads.some((u) => u.includes('screen-nobody')), 'an unreferenced script was shipped');
  } finally { await origin.stop(); rmSync(src.dir, { recursive: true, force: true }); }
});

test('a script is uploaded as text, or the browser downloads it instead of showing it', async () => {
  // `nosniff` is set on every static response, so the stored content type is the whole decision.
  // With no `luau` entry in deploy-static's MIME map the upload sends none, the worker guesses
  // application/octet-stream, and every "the Luau the model wrote" link becomes a file download —
  // which is not showing a fifteen-year-old the code, it is handing his phone a file it cannot
  // open. This is the /pricing failure again, one content type over.
  const origin = await fakeOrigin();
  const src = tinyShowcase();
  try {
    await runDeploy(origin, src);
    const res = await fetch(`${origin.url}/showcase/ui-showcase/screen-shop--tycoon.luau`);
    assert.match(res.headers.get('content-type'), /^text\/plain/, 'a browser would download this rather than render it');
  } finally { await origin.stop(); rmSync(src.dir, { recursive: true, force: true }); }
});
