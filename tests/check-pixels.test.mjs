// The test of the checker that looks at the pages.
//
// It is the only checker here whose subject is pixels, which means its failure mode is the one
// this repository keeps rediscovering in other forms: reporting clean over something it never
// looked at. So the cases below serve real pages from a real server and check what the checker
// says about them, rather than reading its source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'check-pixels.mjs');

/** A server that answers every path with the same body, so the checker's route list drives it. */
function serve(body) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ port: server.address().port, close: () => server.close() }));
  });
}

/**
 * Run the checker and collect everything it said.
 *
 * ASYNC, AND THAT IS NOT A STYLE CHOICE. This was `spawnSync`, which blocks the event loop of the
 * very process holding the HTTP server the checker is pointed at — so the server never accepted a
 * connection, every frame failed with `page.goto: Timeout 30000ms exceeded`, and four of the seven
 * cases below "failed" for a reason that had nothing to do with the checker they were testing.
 *
 * Worth naming because of which way it broke. `A BLANK PAGE IS CAUGHT` asserted exit 1 and got
 * exit 1 — from a page that never loaded rather than a page that rendered blank. A synchronous
 * runner here would eventually have been "fixed" by relaxing that assertion, and the test would
 * then have passed forever without the checker ever seeing a pixel.
 */
function run(flags, timeout = 300_000) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CHECKER, ...flags], { cwd: ROOT });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.on('close', (code) => { clearTimeout(timer); resolve({ exit: code, out }); });
  });
}

/** The two cases that need no server can stay synchronous; nothing is listening for them. */
function runSync(flags) {
  const p = spawnSync(process.execPath, [CHECKER, ...flags], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
}

/* ------------------------------------------------- baseline provenance --- */

const SCRATCH = [];
const scratchDir = () => { const d = mkdtempSync(join(tmpdir(), 'pixels-base-')); SCRATCH.push(d); return d; };

test('a baseline records the origin it was captured from', async () => {
  const dir = scratchDir();
  const srv = await serve('<html><body style="background:#123456"><h1>a</h1><p>b</p></body></html>');
  try {
    const r = await run(['--base', `http://localhost:${srv.port}`, '--pass', 'test-prov', '--routes', '/',
      '--baseline', dir, '--write-baseline']);
    assert.match(r.out, /BASELINE PROVENANCE written/, r.out);
    const prov = JSON.parse(readFileSync(join(dir, 'PROVENANCE.json'), 'utf8'));
    assert.equal(prov.origin, `http://localhost:${srv.port}`);
    assert.match(String(prov.sha), /^[0-9a-f]{40}$/, 'the sha is read from git, not invented');
  } finally { srv.close(); }
});

test('THE CONTROL: against a SAME-ORIGIN baseline, a real change is still an undeclared regression', async () => {
  // Without this, the cross-build classification below could have disabled the drift rule outright
  // and every assertion about it would still pass. This is the case that proves the rule survives:
  // same origin, changed pixels, reported as a regression in the original words.
  const dir = scratchDir();
  const srv = await serve('<html><body style="background:#123456"><h1>a</h1></body></html>');
  const port = srv.port;
  try {
    await run(['--base', `http://localhost:${port}`, '--pass', 'test-ctrl', '--routes', '/',
      '--baseline', dir, '--write-baseline']);
  } finally { srv.close(); }

  // The SAME port, so the origin matches the provenance, serving a visibly different page.
  const srv2 = await new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body style="background:#ff0000"><h1>completely different</h1></body></html>');
    });
    server.listen(port, () => resolve({ close: () => server.close() }));
  });
  try {
    const r = await run(['--base', `http://localhost:${port}`, '--pass', 'test-ctrl2', '--routes', '/',
      '--baseline', dir]);
    assert.equal(r.exit, 1, r.out);
    assert.match(r.out, /differs from its baseline by/, r.out);
    assert.match(r.out, /undeclared regression/, r.out);
    assert.doesNotMatch(r.out, /Comparing two BUILDS/, 'a same-origin diff is not a cross-build comparison');
  } finally { srv2.close(); }
});

test('against a baseline with NO provenance, the same diff is reported as a cross-build comparison', async () => {
  // What pass 12 actually produced: --deployed against a baseline captured from a local build gave
  // 72 findings across 72 frames, every one worded "an undeclared regression". They were not
  // regressions; they were two different builds. A rule that fires on 100% of frames is not
  // measuring what its message says.
  const dir = scratchDir();
  const srv = await serve('<html><body style="background:#123456"><h1>a</h1></body></html>');
  try {
    await run(['--base', `http://localhost:${srv.port}`, '--pass', 'test-noprov', '--routes', '/',
      '--baseline', dir, '--write-baseline']);
    rmSync(join(dir, 'PROVENANCE.json'));
  } finally { srv.close(); }

  const srv2 = await serve('<html><body style="background:#ff0000"><h1>different</h1></body></html>');
  try {
    const r = await run(['--base', `http://localhost:${srv2.port}`, '--pass', 'test-noprov2', '--routes', '/',
      '--baseline', dir]);
    // STILL FAILS. A deployed site that does not look like the repository is a finding; it was
    // only ever the WORDING that was wrong.
    assert.equal(r.exit, 1, r.out);
    assert.match(r.out, /does not record its origin/, r.out);
    assert.match(r.out, /Comparing two BUILDS/, r.out);
    // COLLAPSED TO ONE, and asserted as one CROSS-BUILD finding rather than as a total. The first
    // version of this checked `PIXELS FAILED — 1 finding(s)` and failed honestly: the fixture page
    // is plain enough to also trip the three intrinsic rules, so the run legitimately reports 13.
    // Asserting the total would have been asserting against the fixture instead of the rule.
    const crossBuildFindings = [...r.out.matchAll(/Comparing two BUILDS/g)].length;
    assert.equal(crossBuildFindings, 1, `one cross-build finding, not one per frame:\n${r.out}`);
    assert.doesNotMatch(r.out, /undeclared regression/, 'and not ALSO reported in the old words');
  } finally { srv2.close(); }
});

test('the scratch baselines are removed', () => {
  for (const d of SCRATCH) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  SCRATCH.length = 0;
});

/* ------------------------------------------------------------------ flags --- */

test('it refuses to run without a target rather than guessing one', () => {
  const r = runSync([]);
  assert.equal(r.exit, 2);
  assert.match(r.out, /pass --deployed, or --base/);
});

test('an unrecognised flag exits 2 and lists what it knows', () => {
  const r = runSync(['--base', 'http://localhost:1', '--yolo']);
  assert.equal(r.exit, 2);
  assert.match(r.out, /known flags/);
});

/* ------------------------------------------------------------ denominator --- */

test('the DENOMINATOR names routes, viewports and schemes, and is derived', async () => {
  // §6.3. A hard-coded route list is a denominator that silently stops growing: the day someone
  // adds a page, the checker reports clean over a route it has never seen.
  const pages = readdirSync(join(ROOT, 'apps', 'site', 'src', 'pages'), { recursive: true })
    .filter((f) => String(f).endsWith('.astro')).length;
  const srv = await serve('<html><body><h1>x</h1></body></html>');
  try {
    // NARROWED to one route so this costs four frames, and the NARROWED note is what proves the
    // full count is still being derived underneath it.
    const r = await run(['--base', `http://localhost:${srv.port}`, '--pass', 'test-denominator', '--routes', '/']);
    const m = /DENOMINATOR (\d+) route\(s\) x (\d+) viewport\(s\) x (\d+) scheme\(s\)/.exec(r.out);
    assert.ok(m, r.out);
    assert.equal(Number(m[1]), 1, 'a narrowed run sweeps what it was narrowed to');
    const narrowed = /NARROWED from (\d+) routes/.exec(r.out);
    assert.ok(narrowed, 'a narrowed run must say so beside its verdict');
    assert.equal(Number(narrowed[1]), pages, 'every .astro page must be a route in the full denominator');
    assert.equal(Number(m[2]), 2);
    assert.equal(Number(m[3]), 2);
  } finally { srv.close(); }
});

/* --------------------------------------------------------- it can fail --- */

test('A BLANK PAGE IS CAUGHT — the rule that makes this checker worth running', async () => {
  // The whole point. A page that renders nothing satisfies every source-reading check in this
  // repository: the route exists, the component is imported, the test asserts the markup. Only
  // the pixels say it came out empty.
  const srv = await serve('<html><body style="background:#fff;margin:0"></body></html>');
  try {
    const r = await run(['--base', `http://localhost:${srv.port}`, '--pass', 'test-blank', '--routes', '/']);
    assert.equal(r.exit, 1, r.out);
    assert.match(r.out, /100\.0% one colour/);
    assert.match(r.out, /the page did not render, or rendered empty/);
  } finally { srv.close(); }
});

test('a page with real content is NOT reported — the control', async () => {
  // Without this the test above passes against a checker that condemns every frame, which would
  // be a different way of looking at nothing.
  const busy = `<html><body style="margin:0">${
    Array.from({ length: 400 }, (_, i) =>
      `<div style="height:14px;background:rgb(${i % 255},${(i * 7) % 255},${(i * 13) % 255})"></div>`).join('')
  }</body></html>`;
  const srv = await serve(busy);
  try {
    const r = await run(['--base', `http://localhost:${srv.port}`, '--pass', 'test-busy', '--routes', '/']);
    assert.doesNotMatch(r.out, /one colour/, r.out);
  } finally { srv.close(); }
});

/* ------------------------------------------- an unchecked rule says so --- */

test('rules with no source of truth are REPORTED as a gap, never skipped silently', async () => {
  // Rules 2 and 3 need a token vocabulary in packages/design. Reading it from the site's own CSS
  // would make them circular — the page checked against itself, unable to fail. Until that file
  // exists the checker must say two of its four rules are not running, because a checker that
  // quietly drops half its rules and prints CLEAN is the exact thing this repository keeps finding.
  const srv = await serve('<html><body><h1>x</h1></body></html>');
  try {
    // POINTED AT A FILE THAT DOES NOT EXIST. This case used to rely on packages/design having no
    // tokens.mjs, and became untestable the day one landed — the good outcome quietly making its
    // own guard unobservable, which is the same shape as a fixture that assumes a property of the
    // tree instead of establishing it.
    const r = await run(['--base', `http://localhost:${srv.port}`, '--pass', 'test-gap', '--routes', '/',
      '--tokens', join(tmpdir(), 'no-such-tokens.mjs')]);
    assert.match(r.out, /declares no token vocabulary/);
    assert.match(r.out, /this is a gap, not a pass/);
    assert.equal(r.exit, 1, 'an unchecked rule must fail the run, not pass it');
  } finally { srv.close(); }
});

test('--routes can only narrow, and a filter matching nothing is an error', () => {
  // A filter that silently matched nothing would let any run be made to look clean by pointing it
  // somewhere empty — the same shape as a denominator that quietly shrinks.
  const r = runSync(['--base', 'http://localhost:1', '--routes', '/does-not-exist']);
  assert.equal(r.exit, 2);
  assert.match(r.out, /matched none of the \d+ routes that exist/);
});

test('with a vocabulary present, rules 2 and 3 actually run', async () => {
  // THE CONTROL for the gap case above. A checker that reported the gap unconditionally would
  // satisfy that test forever while never applying either rule — which is exactly the failure the
  // gap message exists to prevent, one level up.
  const srv = await serve('<html><head><style>:root{--gx-ink:#111}</style></head>'
    + '<body style="font-family:Archivo,sans-serif"><h1>real content</h1>'
    + Array.from({ length: 200 }, (_, i) => `<div style="height:3px;background:rgb(${i},${(i * 5) % 255},90)"></div>`).join('')
    + '</body></html>');
  try {
    const r = await run(['--base', `http://localhost:${srv.port}`, '--pass', 'test-vocab', '--routes', '/']);
    assert.doesNotMatch(r.out, /declares no token vocabulary/, r.out);
    assert.doesNotMatch(r.out, /uses no design token/, 'a page using --gx- must satisfy rule 3');
    assert.doesNotMatch(r.out, /bare system font/, 'a page in Archivo must satisfy rule 2');
  } finally { srv.close(); }
});
