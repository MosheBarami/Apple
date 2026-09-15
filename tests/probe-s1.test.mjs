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
import { spawnSync } from 'node:child_process';
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

test('an unreadable PLAN_LIMITS refuses the whole station rather than checking three of four', () => {
  // The break that falsified G-S1, run as a test: clause 4 has no expected value, so the probe must
  // exit non-zero WITHOUT printing the success token. This is the case that was silently matching.
  const dir = mkdtempSync(join(tmpdir(), 'probe-s1-'));
  DIRS.push(dir);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'packages', 'shared', 'src'), { recursive: true });
  cpSync(PROBE, join(dir, 'scripts', 'probe-s1.mjs'));
  // A shared module with no PLAN_LIMITS in it at all.
  writeFileSync(join(dir, 'packages', 'shared', 'src', 'index.ts'), 'export const nothing = 1;\n');

  const r = spawnSync(process.execPath, [join(dir, 'scripts', 'probe-s1.mjs')], {
    cwd: dir, encoding: 'utf8', timeout: 120_000,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.notEqual(r.status, 0, `must not exit 0 with clause 4 underivable:\n${out}`);
  assert.ok(!out.includes(TOKEN), `a refused run must not print the success token:\n${out}`);
  assert.match(out, /cannot read PLAN_LIMITS\.free/, out);
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
