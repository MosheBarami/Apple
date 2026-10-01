/**
 * THE BRANDING WINDOW (V3 gate G15), RENDERED AND ROUND-TRIPPED.
 *
 * The real component and the real API client are bundled with esbuild; fetch is a small in-memory
 * stand-in for the worker's three routes that keeps what was PUT and answers the next GET with it,
 * so "the edit persists" is checked as a save followed by a fresh read. Asserted:
 *
 *   * saved data renders: the fields hold the saved words, every picture is an <img> of the art's
 *     own bytes, and every picture is labelled Branding and "not a gameplay screenshot";
 *   * Save is off until something changed, Regenerate is always offered, the no-publish note shows;
 *   * a save is one authenticated PUT carrying exactly the edited fields, and a reload shows them;
 *   * the worker's needs-Studio 409 is recognised as an answer and its sentence is shown;
 *   * the window's URL is a route app.tsx registers.
 *
 * NOT CHECKED HERE: the worker side (apps/worker/tests/branding-routes-live.test.mjs) and the
 * browser-only PNG download in routes/branding.tsx (canvas does not exist in node).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = createRequire(join(WEB, '..', 'worker', 'package.json'))('esbuild');

const entry = `
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { BrandingDetails, BRANDING_LABEL, draftFrom, isDirty } from './src/components/branding/branding-details';
  import { fetchBranding, saveBranding, generateBranding, needsStudio, brandingWindowUrl } from './src/lib/branding-api';
  export { h, renderToStaticMarkup, BrandingDetails, BRANDING_LABEL, draftFrom, isDirty, fetchBranding, saveBranding, generateBranding, needsStudio, brandingWindowUrl };
`;

// The session is the one thing stood in for: no Supabase client is created, the token is fixed.
const fakeSession = {
  name: 'supabase-session-stub',
  setup(build) {
    build.onResolve({ filter: /\/supabase$/ }, () => ({ path: 'supabase', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: "export const SUPABASE_URL = ''; export const SUPABASE_ANON_KEY = ''; export const supabase = {}; export async function getAccessToken() { return 'token-owner'; }",
      loader: 'js',
    }));
  },
};

const out = join(mkdtempSync(join(tmpdir(), 'branding-window-')), 'bundle.cjs');
const built = await esbuild.build({
  stdin: { contents: entry, resolveDir: WEB, loader: 'tsx', sourcefile: 'entry.tsx' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env': '{}' },
  plugins: [fakeSession],
  outfile: out,
  logLevel: 'silent',
});
assert.deepEqual(built.errors, []);
const ui = createRequire(import.meta.url)(out);
const { h, renderToStaticMarkup, BrandingDetails, BRANDING_LABEL } = ui;

function render(element) {
  const warnings = [];
  const original = console.error;
  console.error = (...args) => warnings.push(args.join(' '));
  try {
    return renderToStaticMarkup(element);
  } finally {
    console.error = original;
    assert.deepEqual(warnings, [], 'rendering printed a React warning');
  }
}

const b64 = (s) => Buffer.from(s).toString('base64');
const PROV = 'Branding art composed from a Studio viewport capture (hero view, 320x180) enlarged to 1920x1080. Not gameplay evidence.';

function savedView() {
  return {
    branding: {
      v: 1,
      names: ['Lava Rush', 'Floor Is Lava', 'Magma Dash'],
      selectedName: 'Lava Rush',
      shortDescription: 'Jump across rising lava and outlast everyone.',
      longDescription: 'Race up floating platforms as the lava climbs. Grab boosts, dodge falling rocks and be the last one standing.',
      tagline: 'Outrun the lava',
      accent: '#FFB020',
      captures: [{ imageId: 'img-1', source: 'studio_viewport', view: 'hero', width: 320, height: 180, capturedAt: '2026-09-29T10:00:00.000Z' }],
      generatedAt: '2026-09-29T10:00:00.000Z',
      updatedAt: '2026-09-29T10:00:00.000Z',
    },
    art: [
      { id: 'icon-img-1', kind: 'icon', captureImageId: 'img-1', width: 512, height: 512, mediaType: 'image/svg+xml', base64: b64('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"/>'), provenance: PROV },
      { id: 'thumb-img-1', kind: 'thumbnail', captureImageId: 'img-1', width: 1920, height: 1080, mediaType: 'image/svg+xml', base64: b64('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"/>'), provenance: PROV },
    ],
    publish: { published: false, uploadSupported: false, note: 'Nothing was uploaded or published to Roblox. Download the images and set them on the Creator Dashboard yourself when you are ready.' },
  };
}

/** The worker's routes, in memory: GET answers what the last PUT stored. */
function fakeWorker(initial) {
  let view = initial;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    const req = { url: String(url), method: init.method ?? 'GET', auth: headers.get('Authorization'), body: init.body ? JSON.parse(init.body) : null };
    requests.push(req);
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (req.url !== '/api/projects/p%201/branding' && req.url !== '/api/projects/p%201/branding/generate') return json(404, { error: 'not found' });
    if (req.method === 'GET') return json(200, view);
    if (req.method === 'PUT') {
      view = { ...view, branding: { ...view.branding, ...req.body, updatedAt: '2026-09-29T11:00:00.000Z' } };
      return json(200, view);
    }
    return json(409, { state: 'needs_studio', error: 'No branding was made: it needs real pictures of your game. Connect Roblox Studio with this place open, then press Generate again.' });
  };
  return requests;
}

const details = (view, draft = ui.draftFrom(view), extra = {}) =>
  render(h(BrandingDetails, { view, draft, onDraft() {}, onSave() {}, onRegenerate() {}, onDownload() {}, ...extra }));

// PROPERTY: the <input> named `name` carries `value`. Not "name is the first attribute": React 19
// serialises attributes in its own order (maxLength ahead of name), and the order protects nothing.
const inputHolds = (name, value) =>
  new RegExp(`<input(?=[^>]*\\sname="${name}")(?=[^>]*\\svalue="${value}")[^>]*>`);

test('saved branding renders: the fields hold it and every picture is its own bytes, labelled Branding', () => {
  const view = savedView();
  const html = details(view);

  for (const [name, value] of Object.entries(ui.draftFrom(view))) {
    if (name === 'longDescription' || name === 'shortDescription') assert.ok(html.includes(`name="${name}"`) && html.includes(`>${value}</textarea>`), `${name} is not shown`);
    else assert.match(html, inputHolds(name, value), `${name} is not shown`);
  }
  for (const n of view.branding.names) assert.ok(html.includes(`>${n}</button>`), `suggestion ${n} is not offered`);

  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(imgs.length, view.art.length, 'one picture per piece of art');
  for (const art of view.art) {
    const img = imgs.find((tag) => tag.includes(`src="data:image/svg+xml;base64,${art.base64}"`));
    assert.ok(img, `${art.id}: its bytes are not what is shown`);
    assert.match(img, /alt="Branding [^"]*Not a gameplay screenshot\."/);
    assert.match(img, new RegExp(`width="${art.width}" height="${art.height}"`));
  }
  const figures = html.match(/<figure [^>]*data-branding="true"/g) ?? [];
  assert.equal(figures.length, view.art.length, 'every picture sits in a figure marked as branding');
  assert.equal((html.match(/class="brand__badge">Branding</g) ?? []).length, view.art.length + 1, 'a Branding badge on the section and on each picture');
  assert.ok(html.includes(BRANDING_LABEL) && /not gameplay evidence/.test(BRANDING_LABEL));
  assert.equal((html.match(/Not gameplay evidence\./g) ?? []).length, view.art.length, 'each provenance line is shown');
  assert.ok(html.includes('Nothing was uploaded or published to Roblox.'));
  assert.match(html, /<button type="submit" class="btn btn-primary" disabled="">Save<\/button>/, 'Save is off while nothing changed');
  assert.match(html, /<button type="button" class="btn">Regenerate<\/button>/);
});

test('an edit is one authenticated PUT of exactly the edited fields, and a reload shows it', async () => {
  const requests = fakeWorker(savedView());
  const first = await ui.fetchBranding('p 1');
  const edit = { ...ui.draftFrom(first), selectedName: 'Magma Dash', tagline: 'Keep climbing', longDescription: 'A new description of the climb, written by the owner.' };
  assert.equal(ui.isDirty(first, edit), true);
  assert.match(details(first, edit), /<button type="submit" class="btn btn-primary">Save<\/button>/, 'Save turns on once something changed');

  await ui.saveBranding('p 1', edit);
  const put = requests.find((r) => r.method === 'PUT');
  assert.ok(put, 'no PUT was sent');
  assert.equal(put.url, '/api/projects/p%201/branding');
  assert.equal(put.auth, 'Bearer token-owner');
  assert.deepEqual(put.body, edit);

  const reloaded = await ui.fetchBranding('p 1');
  assert.deepEqual(ui.draftFrom(reloaded), edit, 'the reload does not hold the edit');
  assert.equal(ui.isDirty(reloaded, ui.draftFrom(reloaded)), false);
  const html = details(reloaded);
  assert.match(html, inputHolds('selectedName', 'Magma Dash'));
  assert.match(html, inputHolds('tagline', 'Keep climbing'));
  assert.match(html, /aria-pressed="true"[^>]*>Magma Dash</);
  assert.equal(requests.filter((r) => r.method === 'POST').length, 0, 'saving never asks the worker to generate');
});

test('no Studio: the 409 is read as an answer and its sentence is shown; nothing yet shows no picture', async () => {
  fakeWorker({ branding: null, art: [], publish: savedView().publish });
  const view = await ui.fetchBranding('p 1');
  let refusal;
  await ui.generateBranding('p 1').catch((e) => (refusal = e));
  assert.equal(ui.needsStudio(refusal), true);
  assert.equal(ui.needsStudio(new Error('x')), false);
  const html = details(view, null, { message: { tone: 'info', text: refusal.message } });
  assert.ok(html.includes('No branding yet'));
  assert.ok(html.includes('Connect Roblox Studio with this place open'));
  assert.match(html, />Generate branding<\/button>/);
  assert.doesNotMatch(html, /<img\b/, 'with nothing captured there is no picture to show');
});

test('the window URL is a route app.tsx registers', () => {
  const app = readFileSync(join(WEB, 'src', 'app.tsx'), 'utf8');
  assert.match(app, /<BrowserRouter basename="\/app">/);
  assert.match(app, /path="\/projects\/:id\/branding"/);
  assert.equal(ui.brandingWindowUrl('p 1'), '/app/projects/p%201/branding');
});
