#!/usr/bin/env node
// CAPTURE THE WEB APP FOR THE SITE: real product UI, in an idle or empty state, and nothing that is output.
//
// Handoff 2.2 and M2: "The landing hero and the catalog use real product UI". Plan step 2.3: Playwright against the web app in
// its mock mode, for empty or idle states only, converted to webp, with a record of where each picture came from.
//
//   node scripts/m2-capture-ui.mjs                write apps/site/public/assets/screens/*.webp and apps/site/src/data/screens.json
//   node scripts/m2-capture-ui.mjs --skip-build   do not build apps/web first (the build is only a "this commit builds" proof)
//   node scripts/m2-capture-ui.mjs --port 5188    the port of the throw-away dev server (default 5199)
//
// WHAT IT DOES, IN ORDER
//   1. Refuses unless apps/web, packages/shared and packages/design have no uncommitted change: a picture is recorded with the
//      commit it was taken at, and a picture of a dirty tree is a picture of nothing a reader can check out.
//   2. Builds apps/web (typecheck, then a production build into a throw-away folder) and proves the production bundle holds none of
//      the mock fixtures. THE MOCK MODE IS DEV-ONLY ON PURPOSE (apps/web/tests/mock-mode-production.test.mjs): it folds to false in a
//      production build, so the app is captured from the Vite dev server with VITE_STUDPILOT_MOCK=1, and the build above is the
//      proof that the same commit also builds for production.
//   3. Starts that dev server, opens it in Chromium with every request to a host other than localhost aborted (no Supabase call, no
//      worker call, nothing leaves the machine), and answers the one request mock mode forgot: GET /api/shared/<project>, the
//      access check, which it answers as the owner (without it the composer says "We could not check your access").
//   4. For each capture: first the CANARY (the app's own mock conversation page is loaded and the guard must find conversation
//      elements in it, so the guard is shown to see in this very browser), then the idle page, which must hold no conversation
//      element, no picture, no failure text, and not one line of the canary's conversation. Any of those fails the whole run and
//      writes nothing.
//   5. Screenshots, encodes webp in Chromium (quality lowered until the file is within its budget), writes the file, hashes it,
//      and writes screens.json: { id, file, sha256, source, commit, date, containsResult: false, alt, width, height, ... }.
//
// WHAT IT DOES NOT CAPTURE, AND WHY (planning/proof/M2/DECISIONS.md, section 12.5)
//   The plugin in Studio: Studio is not running where this is run, and the site never shows a Studio picture it did not take.
//   The dashboard, the usage page and the pairing dialog: in mock mode they carry fixtures that are wrong or read as results
//   (a project summary of what was built, an invented 30-day spending chart beside a sentence about complete Roblox games, "Studio connected" with
//   a code that is not six characters).
//   The empty pieces state, and the dashboard after one-click create: neither is on main yet.
//
// WHAT THE PICTURES SHOW THAT IS SIMULATED. The mock fixture (apps/web/src/lib/mock.ts) reports a Studio selection of 2 objects, so the composer
// draws its "2 selected" chip, a state a new customer cannot reach while the plugin cannot be had. The alt and caption of every capture say so
// (tests/no-fake-output.test.mjs holds the words); capturing without the chip would need a change to the app's fixture, which this lane does not make.
//
// No secret is read. Nothing is written outside apps/site/public/assets/screens and apps/site/src/data/screens.json.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { assertIdleFrame, conversationLines, inspectFrame, linesShownIn } from './lib/capture-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'apps', 'site', 'public', 'assets', 'screens');
const RECORDS = join(ROOT, 'apps', 'site', 'src', 'data', 'screens.json');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const portAt = argv.indexOf('--port');
const PORT = portAt === -1 ? 5199 : Number(argv[portAt + 1]);
for (const a of argv) {
  if (a === '--skip-build' || a === '--port' || a === String(PORT)) continue;
  console.error(`m2-capture-ui: unrecognised argument ${a}. Known: --skip-build, --port <n>`);
  process.exit(2);
}

/** The project the mock mode opens (apps/web/src/lib/mock.ts, mockProjects[0]). */
const PROJECT = 'p-lobby';
const ORIGIN = `http://localhost:${PORT}`;

/**
 * THE CAPTURES. `maxBytes` is the file's budget: the landing hero is held to 25 KB (plan step 2.3, scripts/check-landing-budget.mjs is
 * not raised); the phone one is on the catalog, which the landing budget does not count.
 */
const CAPTURES = [
  {
    id: 'app-idle',
    path: `/app/projects/${PROJECT}?mock=1&empty=1`,
    viewport: { width: 1200, height: 900 },
    scale: 1,
    maxBytes: 25_000,
    state: 'the workspace of a project with no conversation yet: the composer waiting for a request, and three example ideas',
    alt: 'The StudPilot web app with an empty chat: a box to describe what to build, and three example ideas. The project name, the numbers and the "2 selected" chip are sample data. No Studio is connected.',
    caption: 'The real web app with an empty chat. The project name, the numbers and the "2 selected" chip, which the app shows when Studio reports a selection, are sample data. No Studio is connected.',
  },
  {
    id: 'app-idle-phone',
    path: `/app/projects/${PROJECT}?mock=1&empty=1`,
    viewport: { width: 390, height: 844 },
    scale: 2,
    maxBytes: 40_000,
    state: 'the same empty workspace on a phone',
    alt: 'The StudPilot web app on a phone with an empty chat: a box to describe what to build, and three example ideas. The project name, the numbers and the "2 selected" chip are sample data. No Studio is connected.',
    caption: 'The same empty chat on a phone. The project name, the numbers and the "2 selected" chip are sample data. No Studio is connected.',
  },
];

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fail = (msg) => {
  console.error(`m2-capture-ui: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
};

/* ------------------------------------------------------------------------------------------------ 1. the commit */

const dirty = sh('git', ['status', '--porcelain', '--', 'apps/web', 'packages/shared', 'packages/design']).trim();
if (dirty) {
  console.error(`m2-capture-ui: refusing to capture a tree with uncommitted changes in the app or the packages it imports:\n${dirty}`);
  process.exit(1);
}
const COMMIT = sh('git', ['rev-parse', 'HEAD']).trim();
const DATE = new Date().toISOString().slice(0, 10);

/* -------------------------------------------------------------------------------------------------- 2. the build */

if (!flag('--skip-build')) {
  const out = mkdtempSync(join(tmpdir(), 'm2-capture-web-'));
  try {
    console.log('m2-capture-ui: typechecking and building apps/web (a production build, into a throw-away folder)');
    sh('pnpm', ['--filter', '@studpilot/web', 'exec', 'tsc', '--noEmit'], { maxBuffer: 64 * 1024 * 1024 });
    sh('pnpm', ['--filter', '@studpilot/web', 'exec', 'vite', 'build', '--outDir', out, '--emptyOutDir'], { maxBuffer: 64 * 1024 * 1024 });
    // The production bundle must not hold the mock fixtures: that is what "mock mode is dev-only" means in bytes.
    const mockProjectName = (/name:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'apps/web/src/lib/mock.ts'), 'utf8').split('export const mockProjects')[1] ?? '') ?? [])[1];
    if (!mockProjectName) fail('could not read the first mock project name from apps/web/src/lib/mock.ts: the build check would prove nothing');
    const files = readdirSync(join(out, 'assets')).filter((f) => f.endsWith('.js'));
    if (files.length === 0) fail('the production build wrote no script: nothing was checked');
    for (const f of files) {
      if (readFileSync(join(out, 'assets', f), 'utf8').includes(mockProjectName)) fail(`the production bundle ${f} carries the mock project "${mockProjectName}": mock mode is not dev-only`);
    }
    console.log(`m2-capture-ui: apps/web builds, and its ${files.length} production scripts carry no mock fixture ("${mockProjectName}")`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------------------------------------ 3. the dev server */

const server = spawn('pnpm', ['--filter', '@studpilot/web', 'exec', 'vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  env: { ...process.env, VITE_STUDPILOT_MOCK: '1' },
  detached: true,
  stdio: 'ignore',
});
const stopServer = () => {
  try {
    process.kill(-server.pid);
  } catch {
    /* already gone */
  }
};
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`${ORIGIN}/app/`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  fail(`the dev server did not answer on ${ORIGIN} in 30 seconds`);
}

/* ------------------------------------------------------------------------------------------------- 4. and 5. capture */

const ACCESS_ANSWER = {
  role: 'owner',
  capabilities: ['read', 'comment', 'react', 'request_review', 'approve', 'chat', 'build', 'restore_version', 'manage_members', 'share', 'delete_project'],
};

async function openApp(browser, capture, path) {
  const ctx = await browser.newContext({ viewport: capture.viewport, deviceScaleFactor: capture.scale, reducedMotion: 'reduce', colorScheme: 'dark' });
  // The first-run tour is a layer over the app, not the app: it is marked as seen, the way a returning visitor has it.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('apple.tour.v1', JSON.stringify({ seen: [], dismissed: true }));
    } catch {
      /* no storage: the tour would show, and the frame check would see its dialog */
    }
  });
  // NOTHING LEAVES THIS MACHINE. Mock mode still reads a few things from the network (Supabase for the project list, for one); each
  // of those requests is aborted here and the page falls back to its fixtures.
  const aborted = [];
  await ctx.route(
    (url) => !/^(localhost|127\.0\.0\.1)$/.test(url.hostname),
    (route) => {
      aborted.push(route.request().url().slice(0, 90));
      return route.abort();
    },
  );
  const page = await ctx.newPage();
  await page.route(`**/api/shared/${PROJECT}`, (route) => route.fulfill({ json: ACCESS_ANSWER }));
  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('textarea', { timeout: 20_000 }).catch(() => {});
  return { ctx, page, aborted };
}

async function encodeWebp(page, png, maxBytes) {
  for (const q of [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5]) {
    const b64 = await page.evaluate(
      async ({ b64, q }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/webp', q).split(',')[1];
      },
      { b64: png.toString('base64'), q },
    );
    const buf = Buffer.from(b64, 'base64');
    if (buf.length <= maxBytes) return { buf, quality: q };
  }
  return null;
}

const browser = await chromium.launch();
const records = [];
const written = [];
try {
  await waitForServer();
  mkdirSync(OUT_DIR, { recursive: true });

  for (const capture of CAPTURES) {
    // THE CANARY. The app's mock conversation is loaded in this same browser and the guard must see turns in it.
    const canary = await openApp(browser, capture, `/app/projects/${PROJECT}?mock=1`);
    const seen = await inspectFrame(canary.page);
    if (seen.turns.length === 0) fail(`${capture.id}: the guard found no conversation element in the app's own mock conversation, so it cannot be trusted to find one in the idle page`);
    const lines = await conversationLines(canary.page);
    if (lines.length < 3) fail(`${capture.id}: the mock conversation yielded ${lines.length} line(s) of text to compare with; the comparison would prove nothing`);
    await canary.ctx.close();

    const { ctx, page, aborted } = await openApp(browser, capture, capture.path);
    // The "Studio connected" toast of mock mode is a layer that leaves on its own.
    await page.waitForFunction(() => !/Studio connected/.test(document.body.innerText), null, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(600);

    await assertIdleFrame(page, capture.id);
    const echoed = await linesShownIn(page, lines);
    if (echoed.length) fail(`${capture.id}: the idle frame shows ${echoed.length} line(s) of the mock conversation: ${echoed.slice(0, 3).join(' | ')}`);

    const png = await page.screenshot();
    const encoded = await encodeWebp(page, png, capture.maxBytes);
    if (!encoded) fail(`${capture.id}: no webp quality from 0.9 to 0.5 fits ${capture.maxBytes} bytes`);
    await ctx.close();

    const file = `${capture.id}.webp`;
    writeFileSync(join(OUT_DIR, file), encoded.buf);
    written.push(file);
    records.push({
      id: capture.id,
      file: `/assets/screens/${file}`,
      sha256: sha256(encoded.buf),
      source: `apps/web route ${capture.path.split('?')[0]} in mock mode (VITE_STUDPILOT_MOCK=1 on the Vite dev server, ?empty=1): ${capture.state}; ${capture.viewport.width}x${capture.viewport.height} at ${capture.scale}x; the access check /api/shared/${PROJECT} answered as the owner by the capture script`,
      commit: COMMIT,
      date: DATE,
      containsResult: false,
      alt: capture.alt,
      caption: capture.caption,
      width: capture.viewport.width * capture.scale,
      height: capture.viewport.height * capture.scale,
      bytes: encoded.buf.length,
      webpQuality: encoded.quality,
      tool: 'scripts/m2-capture-ui.mjs',
      requestsAborted: aborted.length,
    });
    console.log(`m2-capture-ui: ${capture.id}  ${capture.viewport.width * capture.scale}x${capture.viewport.height * capture.scale}  ${encoded.buf.length} B (budget ${capture.maxBytes})  quality ${encoded.quality}  ${aborted.length} outside request(s) aborted`);
  }
} finally {
  await browser.close();
  stopServer();
}

// The folder is the script's: a file the records do not name is a picture nothing vouches for.
for (const f of readdirSync(OUT_DIR)) if (!written.includes(f)) rmSync(join(OUT_DIR, f), { force: true });
mkdirSync(dirname(RECORDS), { recursive: true });
writeFileSync(RECORDS, `${JSON.stringify(records, null, 2)}\n`);
console.log(`m2-capture-ui: wrote ${records.length} picture(s) and ${RECORDS.replace(`${ROOT}/`, '')} at ${COMMIT.slice(0, 8)}`);
if (!existsSync(join(OUT_DIR, written[0] ?? ''))) fail('nothing was written');
