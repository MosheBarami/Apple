// GENERATE BRANDING (V3 §7, G15), EXECUTED through the real Hono app.
//
// Stubbed only at the boundaries a test cannot reach: Supabase ownership (modelled as a map), JWT
// verification, the session Durable Object (a recorder that answers the paths the routes use), the
// quota DO, and the gateway's `chat` (a script, so the model's answers and the NUMBER of calls are
// both under test). D1 is real sqlite, so persistence is a real round trip.
//
// The properties: owner-only; a real capture or an honest "connect Studio" with no model call; the
// model's words are validated English and the calls are bounded; generating never starts a run,
// never sends a mutating Studio op and never reaches Roblox; edits persist and survive a reopen.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1 } from './stubs/d1.mjs';
import { BRANDING_COST_UNITS } from '../../../packages/shared/src/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `studpilot-branding-live-${process.pid}.mjs`);
const REAL_GATEWAY = join(WORKER, 'src', 'gateway.ts');

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
      // index.ts's own `chat` is replaced; everything else it imports from the gateway is real.
      b.onResolve({ filter: /^\.\/gateway$/ }, (args) =>
        args.importer.endsWith(join('src', 'index.ts')) ? { path: 'gateway-for-index', namespace: 'branding-stub' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'branding-stub' }, () => ({
        resolveDir: join(WORKER, 'src'),
        loader: 'js',
        contents: `export * from ${JSON.stringify(REAL_GATEWAY)};
export async function chat(env, req, opts) {
  const s = globalThis.__brandingChat;
  s.calls.push({ req, opts });
  const next = s.answers.shift();
  if (next instanceof Error) throw next;
  return { text: next ?? '' };
}`,
      }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
const { PROJECTS } = await import(`file://${join(HERE, 'stubs', 'supa.mjs')}`);
process.on('exit', () => rmSync(OUT, { force: true }));

const chatScript = { calls: [], answers: [] };
globalThis.__brandingChat = chatScript;

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';
PROJECTS.set(P1, ALICE);
PROJECTS.set(P2, ALICE);
PROJECTS.set(P3, ALICE);

/** A 320x180 software render: sky, ground, and a coloured building in the middle. */
function frameRgbBase64(w = 320, h = 180) {
  const px = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    let c = y < h * 0.55 ? [135, 190, 235] : [90, 140, 70];
    if (x > w * 0.3 && x < w * 0.7 && y > h * 0.25 && y < h * 0.8) c = x < w / 2 ? [220, 60, 50] : [240, 200, 40];
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
  }
  return Buffer.from(px).toString('base64');
}
const view = (name) => ({
  name, rgbBase64: frameRgbBase64(),
  meta: { width: 320, height: 180, partsConsidered: 10, partsVisible: 10, partsOffCamera: 0, subjectCoverage: 0.4, distinctColours: 4, materials: [] },
});

/** Session DO: records every path and op; Studio connected per project. */
const doCalls = [];
const connected = new Map([[P1, true], [P2, false], [P3, true]]);
const sessionDo = {
  idFromName: (n) => n,
  get: (id) => ({
    async fetch(input, init) {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const body = init?.body ? JSON.parse(init.body) : null;
      doCalls.push({ project: id, path: url.pathname, op: body?.op?.op ?? null });
      const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s });
      if (url.pathname === '/init') return json({ ok: true });
      if (url.pathname === '/memory') return json({ memory: { summary: 'An obby where players jump across floating lava islands to reach a castle.', facts: ['Has checkpoints', 'Has a timer'] } });
      if (url.pathname === '/messages') return json({ messages: [{ role: 'user', content: 'Build a lava obby with a castle at the end' }, { role: 'assistant', content: 'Done.' }] });
      if (url.pathname === '/studio-op') {
        if (!connected.get(id)) return json({ ok: false, error: 'Studio is not connected' }, 409);
        return json({ id: 'op', ok: true, data: { subject: 'game.Workspace', boundsSize: [10, 10, 10], views: [view('hero'), view('front'), view('top')] } });
      }
      return json({ error: `unexpected DO path ${url.pathname}` }, 500);
    },
  }),
};
let credits = 5;
const quotaCalls = [];
const quotaDo = {
  idFromName: (n) => n,
  get: () => ({ async fetch(_u, init) { quotaCalls.push(JSON.parse(init.body)); const ok = credits > 0; if (ok) credits -= 1; return new Response(JSON.stringify({ ok })); } }),
};

const DB = d1();
const env = {
  CORPUS: DB.CORPUS,
  KV: { async get() { return null; }, async getWithMetadata() { return { value: null, metadata: null }; }, async put() {} },
  SESSION_DO: sessionDo,
  QUOTA_DO: quotaDo,
  ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}'); } }) },
  SUPABASE_URL: 'https://supa.test', SUPABASE_ANON_KEY: 'anon',
};

// Anything leaving the worker (Roblox, Supabase REST) is recorded; the routes must reach none of it.
const outbound = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => { outbound.push(String(typeof input === 'string' ? input : input.url)); return new Response('[]'); };
process.on('exit', () => { globalThis.fetch = realFetch; });

const GOOD = JSON.stringify({
  names: ['Lava Leap Castle', 'Magma Run', 'Ember Obby', 'Floor Is Lava Quest'],
  shortDescription: 'Jump across floating lava islands and race the clock to the castle.',
  longDescription: 'Leap between floating islands above a sea of lava.\n\nHit checkpoints, beat the timer and reach the castle at the end.',
  tagline: 'Do not touch the lava',
  accent: '#ff5a1f',
});

const call = (method, path, user, body) => app.request(`https://x${path}`, {
  method,
  headers: { Authorization: `Bearer ${user}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
}, env);

test('owner generates branding from a real capture: images, names, descriptions; no run, no publish', async () => {
  chatScript.calls.length = 0; chatScript.answers = [GOOD];
  doCalls.length = 0; outbound.length = 0;
  const res = await call('POST', `/api/projects/${P1}/branding/generate`, ALICE);
  assert.equal(res.status, 200, await res.clone().text());
  const out = await res.json();
  assert.equal(out.captured, 'fresh');
  assert.deepEqual(out.branding.names, ['Lava Leap Castle', 'Magma Run', 'Ember Obby', 'Floor Is Lava Quest']);
  assert.equal(out.branding.selectedName, 'Lava Leap Castle');
  assert.equal(out.branding.accent, '#FF5A1F');
  assert.equal(out.branding.captures.length, 1);
  assert.equal(out.branding.captures[0].source, 'software_render');
  assert.notEqual(out.branding.captures[0].view, 'top', 'a plan view is never branding');
  // actual images: an icon and a thumbnail, each an SVG embedding the captured PNG, sized to spec
  assert.deepEqual(out.art.map((a) => [a.kind, a.width, a.height]), [['icon', 512, 512], ['thumbnail', 1920, 1080]]);
  for (const a of out.art) {
    const svg = Buffer.from(a.base64, 'base64').toString('utf8');
    assert.match(svg, /<image href="data:image\/png;base64,iVBORw0KGgo/, 'the art must embed the real captured PNG');
    assert.match(svg, /Lava Leap Castle/);
    assert.match(a.provenance, /Branding art composed from .*Not gameplay evidence/);
  }
  // one model call, on GLM via the existing gateway key, with the game's own context
  assert.equal(chatScript.calls.length, 1);
  assert.equal(chatScript.calls[0].req.model, 'plan');
  assert.match(chatScript.calls[0].req.messages[1].content, /lava obby/i);
  // The charge is the shared constant the app prints its "Uses about 0.01 Credits" from, so copy and charge cannot differ.
  assert.equal(BRANDING_COST_UNITS, 1, 'one model pass is one ledger unit');
  assert.deepEqual(quotaCalls.at(-1), { credits: BRANDING_COST_UNITS, kind: 'branding_copy' });
  // no run, and Studio was only READ
  const paths = doCalls.map((c) => c.path);
  assert.ok(paths.includes('/studio-op'));
  for (const p of paths) assert.ok(['/init', '/studio-op', '/memory', '/messages'].includes(p), `unexpected DO call ${p}`);
  assert.deepEqual(doCalls.filter((c) => c.op).map((c) => c.op), ['render_view']);
  assert.deepEqual(outbound, [], 'generating branding must not reach Roblox or any other outside service');
  assert.equal(out.publish.published, false);
});

test('saved branding persists: read back, edit, and read again after a "reopen"', async () => {
  const first = await (await call('GET', `/api/projects/${P1}/branding`, ALICE)).json();
  assert.equal(first.branding.selectedName, 'Lava Leap Castle');
  assert.equal(first.art.length, 2);

  const put = await call('PUT', `/api/projects/${P1}/branding`, ALICE, { selectedName: 'Magma Run', shortDescription: 'Race over lava.', tagline: 'Keep moving' });
  assert.equal(put.status, 200);
  const edited = await put.json();
  assert.equal(edited.branding.selectedName, 'Magma Run');
  assert.match(Buffer.from(edited.art[1].base64, 'base64').toString('utf8'), /Magma Run/, 'the art follows the edited name');

  chatScript.calls.length = 0;
  doCalls.length = 0;
  const again = await (await call('GET', `/api/projects/${P1}/branding`, ALICE)).json();
  assert.equal(again.branding.selectedName, 'Magma Run');
  assert.equal(again.branding.shortDescription, 'Race over lava.');
  assert.equal(again.branding.tagline, 'Keep moving');
  assert.equal(again.branding.captures[0].imageId, first.branding.captures[0].imageId);
  assert.equal(chatScript.calls.length, 0, 'reading saved branding never calls the model');
  assert.equal(doCalls.filter((c) => c.path === '/studio-op').length, 0, 'reading saved branding never touches Studio');
});

test('edits are validated: non-English or oversized text is refused and nothing changes', async () => {
  for (const body of [{ selectedName: 'משחק לבה' }, { selectedName: 'x'.repeat(51) }, { longDescription: '' }, { accent: 'red' }]) {
    const res = await call('PUT', `/api/projects/${P1}/branding`, ALICE, body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const still = await (await call('GET', `/api/projects/${P1}/branding`, ALICE)).json();
  assert.equal(still.branding.selectedName, 'Magma Run');
});

test('a stranger gets the same 404 on every branding route', async () => {
  assert.equal((await call('GET', `/api/projects/${P1}/branding`, BOB)).status, 404);
  assert.equal((await call('PUT', `/api/projects/${P1}/branding`, BOB, { selectedName: 'Mine Now' })).status, 404);
  const before = chatScript.calls.length;
  assert.equal((await call('POST', `/api/projects/${P1}/branding/generate`, BOB)).status, 404);
  assert.equal(chatScript.calls.length, before, 'a refused caller never reaches the model');
});

test('no Studio and nothing captured before: an honest "connect Studio" state, no model call, nothing saved', async () => {
  chatScript.calls.length = 0; chatScript.answers = [GOOD];
  const spent = quotaCalls.length;
  const res = await call('POST', `/api/projects/${P2}/branding/generate`, ALICE);
  assert.equal(res.status, 409);
  const out = await res.json();
  assert.equal(out.state, 'needs_studio');
  assert.match(out.error, /Connect Roblox Studio/);
  assert.equal(chatScript.calls.length, 0);
  assert.equal(quotaCalls.length, spent, 'no Credit is spent without a picture');
  assert.equal((await (await call('GET', `/api/projects/${P2}/branding`, ALICE)).json()).branding, null);
});

test('no Studio but captures saved before: regenerate reuses the saved real captures', async () => {
  connected.set(P1, false);
  chatScript.calls.length = 0; chatScript.answers = [GOOD];
  const prior = (await (await call('GET', `/api/projects/${P1}/branding`, ALICE)).json()).branding;
  const res = await call('POST', `/api/projects/${P1}/branding/generate`, ALICE);
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.captured, 'reused');
  assert.deepEqual(out.branding.captures, prior.captures);
  connected.set(P1, true);
});

test('model output is validated and bounded: one corrective retry, then an honest failure with nothing saved', async () => {
  chatScript.calls.length = 0;
  chatScript.answers = [
    JSON.stringify({ names: ['Only One'], shortDescription: 'x', longDescription: 'y', tagline: '', accent: '#000000' }),
    'שלום, not JSON at all',
    GOOD,
  ];
  const res = await call('POST', `/api/projects/${P3}/branding/generate`, ALICE);
  assert.equal(res.status, 502);
  assert.equal(chatScript.calls.length, 2, 'at most two model calls per Generate');
  assert.match(chatScript.calls[1].req.messages[1].content, /previous answer was refused/);
  assert.equal((await (await call('GET', `/api/projects/${P3}/branding`, ALICE)).json()).branding, null);
  chatScript.answers = [];
});

test('non-English names from the model are dropped, not stored', async () => {
  chatScript.calls.length = 0;
  chatScript.answers = [JSON.stringify({
    names: ['Лава', 'Lava Dash', 'ラヴァ', 'Castle Sprint', 'Ember Hop', 'Heat Run', 'Sixth Name'],
    shortDescription: 'Sprint over lava to the castle.',
    longDescription: 'A short lava obby with checkpoints and a timer, ending at a castle.',
    tagline: 'Hot hot hot', accent: 'orange',
  })];
  const res = await call('POST', `/api/projects/${P3}/branding/generate`, ALICE);
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.deepEqual(out.branding.names, ['Lava Dash', 'Castle Sprint', 'Ember Hop', 'Heat Run', 'Sixth Name']);
  assert.equal(out.branding.accent, '#FFB020', 'an invalid colour falls back to the default');
});

test('out of Credits: no model call and nothing saved', async () => {
  credits = 0;
  chatScript.calls.length = 0; chatScript.answers = [GOOD];
  const res = await call('POST', `/api/projects/${P1}/branding/generate`, ALICE);
  assert.equal(res.status, 429);
  assert.equal(chatScript.calls.length, 0);
  credits = 5;
  chatScript.answers = [];
});
