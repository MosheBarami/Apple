/**
 * THUMBNAILS — the image that represents an experience on its Roblox store page.
 *
 * WHAT THIS FEATURE CAN AND CANNOT DO, stated here because the tests below are the place the
 * limit is enforced rather than merely described.
 *
 * Roblox wants 1920x1080. The only pixels this product can obtain of a customer's place come from
 * the plugin's own software rasteriser, which clamps at 320x240 (apps/plugin/src/Render.luau,
 * `Render.capture`) because it runs synchronously on Studio's main thread — Roblox gives plugins
 * no viewport readback at all (ThumbnailGenerator is not a valid service; CaptureService's
 * callback never fires in edit mode). So the largest honest 16:9 frame of the real place is
 * 320x180: one sixth of the published requirement on each side, flat-shaded, with no lighting,
 * shadows, materials or post-processing.
 *
 * Three ways to fake past that, all refused, and each has a test here:
 *
 *   1. UPSCALE IT. Six-times nearest-neighbour is not a 1920x1080 thumbnail, it is a 320x180
 *      thumbnail that lies about its size. Nothing here resizes.
 *   2. GENERATE A PICTURE INSTEAD. `generate_image` can produce a beautiful 1024x1024 render of a
 *      game that does not exist. A store page image that is not the place is a misrepresentation
 *      of the product being sold, and Roblox's own thumbnail policy forbids it. So when the render
 *      fails, this tool REFUSES; it does not fall through to the image model.
 *   3. UPLOAD IT ANYWAY. Roblox publishes no Open Cloud endpoint for experience thumbnails, and
 *      the one write scope that exists (`asset:write`) creates permanent, undeletable Images in
 *      the customer's account — the exact mistake that put 299 assets in the owner's account for
 *      good. Nothing in this path uploads anything, and a test asserts the absence.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

function bundle(entry, name) {
  const out = join(mkdtempSync(join(tmpdir(), `thumb-${name}-`)), `${name}.mjs`);
  execFileSync(
    ESBUILD,
    [join(WORKER, 'src', entry), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' },
  );
  return out;
}

const T = await import(`file://${bundle('thumbnail.ts', 'thumbnail')}`);
const { TOOLS, runTool } = await import(`file://${bundle('tools.ts', 'tools')}`);

const SRC = join(WORKER, 'src');
const toolsSource = readFileSync(join(SRC, 'tools.ts'), 'utf8');
const thumbSource = readFileSync(join(SRC, 'thumbnail.ts'), 'utf8');

/** The `compose_thumbnail` entry of the registry, by brace-matching its literal. */
function toolBlock(name) {
  const start = toolsSource.indexOf(`\n  ${name}: {`);
  assert.ok(start > 0, `${name} is not in the registry`);
  let depth = 0;
  for (let i = toolsSource.indexOf('{', start); i < toolsSource.length; i += 1) {
    if (toolsSource[i] === '{') depth += 1;
    else if (toolsSource[i] === '}') {
      depth -= 1;
      if (depth === 0) return toolsSource.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced');
}

/* ------------------------------------------------------------------ THE REQUIREMENT ----------- */

test('CONTROL: the spec module really loaded, so nothing below is vacuous', () => {
  assert.equal(typeof T.captureSizeFor, 'function');
  assert.ok(T.ROBLOX_IMAGE_SPECS.thumbnail);
  assert.ok(T.ROBLOX_IMAGE_SPECS.icon);
});

test("Roblox's published requirement is carried verbatim, with the page it came from", () => {
  const s = T.ROBLOX_THUMBNAIL;
  assert.equal(s.width, 1920);
  assert.equal(s.height, 1080);
  assert.equal(s.aspectLabel, '16:9');
  assert.equal(s.maxBytes, 3 * 1024 * 1024);
  assert.equal(s.maxPerExperience, 10);
  assert.deepEqual([...s.formats].sort(), ['bmp', 'gif', 'jpg', 'png', 'tga']);
  assert.match(s.source, /^https:\/\/create\.roblox\.com\/docs\/production\/publishing\/thumbnails$/);

  const i = T.ROBLOX_ICON;
  assert.equal(i.width, 512);
  assert.equal(i.height, 512);
  assert.match(i.source, /experience-icons$/);
});

test('THE DIMENSIONS ARE WRITTEN DOWN ONCE — no other worker source names them', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.ts') || p === join(SRC, 'thumbnail.ts')) continue;
      // \b1080\b does not match "1080p", which imagegen uses as a prose unit in an art-direction
      // sentence. A pixel dimension is what is being hunted, not the string.
      if (/\b1920\b|\b1080\b/.test(readFileSync(p, 'utf8'))) offenders.push(p.slice(SRC.length + 1));
    }
  };
  walk(SRC);
  assert.deepEqual(offenders, [], `a second copy of the thumbnail size lives in: ${offenders.join(', ')}`);

  // And the tool itself types no dimension at all: it asks the spec.
  const block = toolBlock('compose_thumbnail');
  assert.doesNotMatch(block, /\b(1920|1080|512|320|180|240)\b/, 'compose_thumbnail hard-codes a size instead of reading the spec');
});

/* ------------------------------------------------------------------ THE CAPTURE --------------- */

test('the capture size is DERIVED from the spec aspect and the rasteriser clamp', () => {
  const t = T.captureSizeFor('thumbnail');
  assert.deepEqual(t, { width: 320, height: 180 }, 'the largest 16:9 frame Render.capture will produce');
  assert.equal(t.width / t.height, T.ROBLOX_THUMBNAIL.width / T.ROBLOX_THUMBNAIL.height, 'aspect must match the requirement exactly');

  const i = T.captureSizeFor('icon');
  assert.deepEqual(i, { width: 240, height: 240 }, 'a square is bounded by the clamp height, not its width');

  // Inside the clamp the plugin applies, so nothing is silently reshaped on the far side.
  for (const s of [t, i]) {
    assert.ok(s.width >= T.RASTERISER_CLAMP.minWidth && s.width <= T.RASTERISER_CLAMP.maxWidth);
    assert.ok(s.height >= T.RASTERISER_CLAMP.minHeight && s.height <= T.RASTERISER_CLAMP.maxHeight);
  }
});

test('the shortfall is measured and stated, never rounded away', () => {
  const s = T.shortfallAgainst('thumbnail');
  assert.equal(s.scale, 6, '1920 / 320');
  assert.equal(s.aspectMatches, true);
  assert.equal(s.uploadReady, false);
  assert.match(s.note, /1920/);
  assert.match(s.note, /320/);
  // It must say what the image IS good for, not only what it is not.
  assert.ok(s.note.length > 80, 'a shortfall the user cannot act on is a shrug');
});

/* ------------------------------------------------------------------ THE FRAMING --------------- */

const framing = (view, over = {}) => ({
  view, coverage: 0.4, colourfulness: 30, centroidOffset: 0.1, silhouetteRange: 0.4, ...over,
});

test('a plan view is never a thumbnail, however well it measures', () => {
  assert.equal(T.isFramableView('top'), false);
  for (const v of ['hero', 'front', 'side', 'eye']) assert.equal(T.isFramableView(v), true);

  const chosen = T.chooseFraming([framing('top', { coverage: 0.5, colourfulness: 90 }), framing('hero')]);
  assert.equal(chosen.view, 'hero', 'the plan view won on measurement and must still be refused');
});

test('framing prefers the angle where the place actually fills the frame', () => {
  const chosen = T.chooseFraming([framing('front', { coverage: 0.03 }), framing('hero', { coverage: 0.42 })]);
  assert.equal(chosen.view, 'hero');
});

test('nothing framable means nothing is chosen — not a silent fallback to the first row', () => {
  assert.equal(T.chooseFraming([]), null);
  assert.equal(T.chooseFraming([framing('top')]), null);
});

/* ------------------------------------------------------------------ NOTHING UPLOADS ----------- */

test('THE SPEC SAYS PLAINLY THAT NOTHING CAN UPLOAD, AND WHY', () => {
  assert.equal(T.THUMBNAIL_UPLOAD.supported, false);
  assert.match(T.THUMBNAIL_UPLOAD.reason, /Creator Dashboard|Open Cloud/);
  assert.ok(T.THUMBNAIL_UPLOAD.reason.length > 100, 'the reason has to survive being read by the next person');
});

test('no code path in this feature can put anything into a Roblox account', () => {
  // Names of things that WRITE to Roblox. `asset:write` itself is deliberately not hunted: it
  // appears in THUMBNAIL_UPLOAD.reason as prose, which is the explanation, not a call site.
  const writers = ['uploadAsset', 'importAsset', 'creator-dashboard', 'creatorDashboard', 'useRobloxCredential', 'apis.roblox.com', 'fetch('];
  const block = toolBlock('compose_thumbnail');
  for (const forbidden of writers) {
    assert.ok(!block.includes(forbidden), `compose_thumbnail reaches ${forbidden}`);
    assert.ok(!thumbSource.includes(forbidden), `thumbnail.ts reaches ${forbidden}`);
  }
  // And it imports nothing that could: the spec module is pure, with no imports at all.
  assert.doesNotMatch(thumbSource, /^\s*import\s/m, 'thumbnail.ts grew a dependency — check it cannot write anywhere');
  // The whole tool is reachable from the deployed entry point, or none of the above is worth much.
  const bundled = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  assert.ok(bundled.includes('compose_thumbnail'), 'the tool is not registered');
});

test('the human steps are the Creator Dashboard, named in order', () => {
  const steps = T.publishSteps('thumbnail');
  assert.ok(steps.length >= 3);
  assert.match(steps.join(' '), /Creator Dashboard/);
  assert.match(steps.join(' '), /Thumbnails/);
  assert.match(T.publishSteps('icon').join(' '), /Icon/);
});

/* ------------------------------------------------------------------ THE TOOL ------------------ */

/** A frame the mask will read as sky, ground and one block of geometry. */
function fakeRgb(width, height, coverage) {
  const rgb = new Uint8Array(width * height * 3);
  const horizon = Math.floor(height * 0.62);
  const cols = Math.max(1, Math.round(width * Math.sqrt(coverage)));
  const rows = Math.max(1, Math.round(height * Math.sqrt(coverage)));
  const x0 = Math.floor((width - cols) / 2);
  const y0 = Math.floor((height - rows) / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const inBlock = x >= x0 && x < x0 + cols && y >= y0 && y < y0 + rows;
      const c = inBlock
        ? [40 + ((x * 7) % 180), 90 + ((y * 5) % 120), 70 + ((x * 3) % 140)]
        : y < horizon ? [0x9f, 0xc7, 0xe8] : [0x6e, 0x7a, 0x63];
      rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2];
    }
  }
  return rgb;
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return Buffer.from(s, 'binary').toString('base64');
}

function fakeRender(size) {
  const view = (name, coverage) => ({
    name,
    rgbBase64: b64(fakeRgb(size.width, size.height, coverage)),
    meta: {
      width: size.width, height: size.height,
      partsConsidered: 90, partsVisible: 80, partsOffCamera: 10,
      subjectCoverage: coverage, distinctColours: 14,
      materials: [{ material: 'Wood', parts: 40 }, { material: 'Slate', parts: 40 }],
    },
  });
  return {
    subject: 'game.Workspace',
    boundsSize: [220, 40, 180],
    views: [view('hero', 0.44), view('front', 0.2), view('side', 0.18), view('top', 0.62), view('eye', 0.3)],
    lighting: { brightness: 2, clockTime: 17, ambient: [30, 30, 40], lightInstances: 3, effects: ['Atmosphere'] },
  };
}

function ctxFor({ connected = true, op } = {}) {
  const stored = [];
  return {
    stored,
    ops: [],
    projectId: 'proj_thumb',
    env: { KV: { put: async (k, v) => stored.push({ k, v }) } },
    studioConnected: () => connected,
    execStudioOp: async (o) => {
      const self = ctxFor;
      void self;
      return op ? op(o) : { ok: false, error: 'no stub' };
    },
    emitFrame: () => {},
  };
}

test('NO STUDIO: a thumbnail request refuses rather than inventing an image', async () => {
  const ctx = ctxFor({ connected: false });
  const out = await runTool(ctx, 'compose_thumbnail', '{}');
  assert.equal(out.ok, false);
  assert.match(out.resultForLlm, /Studio is not connected/);
  assert.equal(ctx.stored.length, 0, 'nothing may be stored when no place was rendered');
});

test('A RENDER FAILURE REFUSES — it never falls through to the image model', async () => {
  const ctx = ctxFor({ op: async () => ({ ok: false, error: 'the place is empty' }) });
  const res = await TOOLS.compose_thumbnail.run(ctx, {});
  assert.ok('error' in res);
  assert.match(res.error, /the place is empty/);
  assert.doesNotMatch(res.error, /generate_image/i);
  assert.equal(ctx.stored.length, 0);
  assert.equal(ctx.uiDetail, undefined, 'a failed capture must not put a card on screen');
});

test('THE HAPPY PATH: a real frame of the real place is captured, saved and shown', async () => {
  const size = T.captureSizeFor('thumbnail');
  let asked = null;
  const ctx = ctxFor({
    op: async (o) => {
      asked = o;
      return { ok: true, data: fakeRender(size) };
    },
  });
  const res = await TOOLS.compose_thumbnail.run(ctx, {});

  assert.equal(asked.op, 'render_view', 'it must use the EXISTING render path');
  assert.equal(asked.width, size.width, 'the render is asked for at the thumbnail aspect');
  assert.equal(asked.height, size.height);

  assert.ok(!('error' in res), JSON.stringify(res));
  assert.equal(res.view, 'hero', 'the best-measuring framable angle');
  assert.deepEqual(res.captured, size);
  assert.deepEqual(res.requirement, { width: 1920, height: 1080, aspect: '16:9' });
  assert.equal(res.uploadReady, false);
  assert.equal(res.uploadedToRoblox, false);
  assert.ok(Array.isArray(res.nextSteps) && res.nextSteps.length >= 3);

  // Saved where the user can get it, through the store the serving route already reads.
  assert.equal(ctx.stored.length, 1);
  assert.match(ctx.stored[0].k, /^image:proj_thumb:/);
  assert.equal(ctx.stored[0].v.slice(0, 8), 'iVBORw0K', 'a real PNG signature, not raw RGB');
  assert.ok(typeof res.imageId === 'string' && res.imageId.length > 0);
  assert.ok(!JSON.stringify(res).includes('/api/projects/'), 'the fetchable path stays out of the transcript');

  // Shown to the user, by path.
  const panel = ctx.uiDetail;
  assert.equal(panel.v, 1);
  const picker = panel.blocks.find((b) => b.type === 'asset_picker');
  const callout = panel.blocks.find((b) => b.type === 'callout');
  assert.ok(picker && callout, 'the card must carry both the image and the honest caption');
  assert.equal(picker.assets[0].thumbnail.src, `/api/projects/proj_thumb/images/${res.imageId}`);
  assert.equal(picker.assets[0].thumbnail.width, size.width);
  assert.match(callout.text, /1920/);
  assert.equal(callout.tone, 'warn');
});

test('the icon variant renders square and says so', async () => {
  const size = T.captureSizeFor('icon');
  let asked = null;
  const ctx = ctxFor({ op: async (o) => { asked = o; return { ok: true, data: fakeRender(size) }; } });
  const res = await TOOLS.compose_thumbnail.run(ctx, { kind: 'icon' });
  assert.equal(asked.width, size.width);
  assert.equal(asked.height, size.height);
  assert.deepEqual(res.requirement, { width: 512, height: 512, aspect: '1:1' });
});

test('with no project there is nowhere to save it, and it says so before rendering', async () => {
  const ctx = ctxFor({ op: async () => { throw new Error('Studio was touched'); } });
  ctx.projectId = undefined;
  const res = await TOOLS.compose_thumbnail.run(ctx, {});
  assert.ok('error' in res);
  assert.match(res.error, /project/i);
});
