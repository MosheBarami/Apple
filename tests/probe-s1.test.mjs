// The test of the station probe, and mostly the test of one property of it.
//
// G-S1's first falsification came back `exit=2, EXPECT=matched`. The break removed clause 4's
// derivation so the probe refused to run — correctly — and then printed an error that explained
// itself by quoting the gate's own success token. A failing run therefore MATCHED the EXPECT it
// was supposed to fail. The gate was still red, because gate-check demands a zero exit as well as
// a match, but the token had quietly stopped discriminating and any later failure path that
// exited 0 would have passed.
//
// That is the sixth instance in this repository of a check matching its own explanatory prose, and
// the first written into an oracle rather than found in one. So the property is asserted here
// rather than remembered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROBE = join(ROOT, 'scripts', 'probe-s1.mjs');
const SRC = readFileSync(PROBE, 'utf8');

// Assembled rather than written, so this file can assert on the token without containing a literal
// copy that a careless future grep would count as an occurrence in the wrong place.
const TOKEN = `S1 ${'PROVEN'}`;

const DIRS = [];

test('THE SUCCESS TOKEN APPEARS EXACTLY ONCE, including in comments', () => {
  const hits = SRC.split(TOKEN).length - 1;
  assert.equal(hits, 1, `the EXPECT token must appear once and only on the success line; found ${hits}`);
});

test('no error path prints the success token', () => {
  // The specific shape that caused it: console.error carrying the words the gate greps for.
  for (const line of SRC.split('\n')) {
    if (!line.includes('console.error')) continue;
    assert.ok(!line.includes(TOKEN), `an error line prints the success token: ${line.trim()}`);
  }
});

test('the failure line is a DIFFERENT word, so the two verdicts cannot be confused', () => {
  assert.match(SRC, /S1 UNPROVEN/, 'the red verdict must have its own token');
  // And it must not be a superstring of the green one, or a substring match would find the green
  // token inside the red verdict.
  assert.equal('S1 UNPROVEN'.includes(TOKEN), false, 'the red token must not contain the green one');
});

test('an unreadable PLAN_TABLE refuses the whole station rather than checking three of four', () => {
  // The break that falsified G-S1, run as a test: clause 4 has no expected value, so the probe must
  // exit non-zero WITHOUT printing the success token. This is the case that was silently matching.
  const dir = mkdtempSync(join(tmpdir(), 'probe-s1-'));
  DIRS.push(dir);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'packages', 'shared', 'src'), { recursive: true });
  cpSync(PROBE, join(dir, 'scripts', 'probe-s1.mjs'));
  mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
  cpSync(join(ROOT, 'scripts', 'lib', 'product-origin.mjs'), join(dir, 'scripts', 'lib', 'product-origin.mjs'));
  // A shared module with no PLAN_TABLE in it at all — and the origin the probe reads at import
  // time, because the fixture is about clause 4 being underivable and nothing else. Leaving
  // PRODUCT_ORIGIN out would make the probe die one line earlier, for a reason this test is not
  // about, and the assertion below would be measuring the wrong refusal.
  writeFileSync(join(dir, 'packages', 'shared', 'src', 'index.ts'),
    "export const PRODUCT_ORIGIN = 'https://studpilot.app';\n"
    + "export const LEGACY_PRODUCT_HOST = 'golem.moshe-barami111.workers.dev';\n"
    + 'export const nothing = 1;\n');

  const r = spawnSync(process.execPath, [join(dir, 'scripts', 'probe-s1.mjs')], {
    cwd: dir, encoding: 'utf8', timeout: 120_000,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.notEqual(r.status, 0, `must not exit 0 with clause 4 underivable:\n${out}`);
  assert.ok(!out.includes(TOKEN), `a refused run must not print the success token:\n${out}`);
  assert.match(out, /cannot read PLAN_TABLE\.free/, out);
});

test('clause 2 exempts platform spellings only: a former workers.dev host in a page is a finding', async () => {
  // Pages carry https://studpilot.app in canonical, og:url and twitter:image now, so the probe has no
  // closed-list hostname to let through. Run against two pages that differ only in the canonical host;
  // both carry the platform spellings (the system font stack, the iOS icon), which must stay exempt.
  const page = (host) => `<!doctype html><html><head><link rel="canonical" href="${host}/">`
    + '<link rel="apple-touch-icon" href="/i.png"><style>body{font-family:-apple-system,sans-serif}</style></head>'
    + '<body><h1>StudPilot</h1></body></html>';
  const clause2 = async (host) => {
    const server = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page(host)); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const out = join(mkdtempSync(join(tmpdir(), 'probe-s1-clause2-')), 'out');
    DIRS.push(dirname(out));
    try {
      const r = await new Promise((resolve) => {
        const child = spawn(process.execPath, [PROBE, '--base', `http://127.0.0.1:${server.address().port}`, '--out', out], { cwd: ROOT });
        let text = '';
        child.stdout.on('data', (d) => { text += d; });
        child.stderr.on('data', (d) => { text += d; });
        child.on('close', () => resolve(text));
      });
      const m = /clause 2\s+user-visible \w+: (\d+)/.exec(r);
      assert.ok(m, `the probe printed no clause 2 count:\n${r}`);
      return Number(m[1]);
    } finally { server.close(); }
  };
  assert.equal(await clause2('https://studpilot.app'), 0, 'the platform spellings or the product host were counted');
  assert.ok(await clause2('https://apple.moshe-barami111.workers.dev') > 0, 'a page that points at a former host passed clause 2');
});

test('an unrecognised flag is refused rather than ignored', () => {
  const r = spawnSync(process.execPath, [PROBE, '--yolo'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 2);
  assert.match(`${r.stdout ?? ''}${r.stderr ?? ''}`, /unrecognised flag/);
});

test('every request is cache-busted', () => {
  // The live pages carry max-age=60. A probe reading a cached body is answering a question about
  // the CDN, and it already cost one misread verification today.
  const get = SRC.slice(SRC.indexOf('async function get('), SRC.indexOf('/* -------'));
  assert.match(get, /_probe=/, 'the request must carry a unique query parameter');
  assert.match(get, /Date\.now\(\)|Math\.random\(\)/, 'and it must actually vary');
});

test('the scratch copies are removed', () => {
  for (const d of DIRS) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  DIRS.length = 0;
});
