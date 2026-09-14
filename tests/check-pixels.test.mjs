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
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
    const r = await run(['--base', `http://localhost:${srv.port}`, '--pass', 'test-gap', '--routes', '/']);
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
