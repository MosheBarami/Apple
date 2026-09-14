// The test of the checker that makes a disposition cost something.
//
// FEATURES.json holds 1,249 rows, 1,085 not-started. The terminal condition wants each one either
// closed with evidence or carrying a disposition that explains why not — and the moment that
// becomes the goal, the cheapest path stops being "do the work" and becomes "write the same
// sentence a thousand times". Every case below plants the shortcut it is meant to stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'check-dispositions.mjs');

/** A scratch ledger: rows go in one section unless they carry their own. */
function ledger(items, decisions = '', extraSections = []) {
  const dir = mkdtempSync(join(tmpdir(), 'dispositions-'));
  mkdirSync(join(dir, 'docs', 'backlog'), { recursive: true });
  const sections = [{ section: 'A', count: items.length, items }, ...extraSections];
  writeFileSync(join(dir, 'docs', 'backlog', 'FEATURES.json'), JSON.stringify({
    capturedAt: '2026-01-01', source: 'fixture',
    sectionCount: sections.length,
    itemCount: sections.reduce((n, s) => n + s.items.length, 0),
    sections,
  }, null, 2));
  writeFileSync(join(dir, 'docs', 'DECISIONS.md'), decisions);
  return dir;
}

function run(dir, flags = []) {
  const p = spawnSync(process.execPath, [CHECKER, '--root', dir, ...flags], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
}

const row = (id, over = {}) => ({ id, name: id, status: 'done', evidence: 'x', ...over });
let DIRS = [];
const keep = (d) => { DIRS.push(d); return d; };

/* ------------------------------------------------------------- it can pass --- */

test('a ledger with no dispositions has nothing to violate, and says what it examined', () => {
  const r = run(keep(ledger([row('f-1', { status: 'not-started', disposition: undefined })])));
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /^DENOMINATOR 1 row\(s\); 0 carry a disposition/m);
});

/* ------------------------------------------------- STRUCTURALLY-BLOCKED --- */

test('unfinished work described as an obstacle is refused', () => {
  // "Not built" is what the row already said. A disposition that restates the status is a way of
  // closing a row by describing it more confidently.
  for (const cite of ['not built yet', 'no caller yet', 'requires a refactor first']) {
    const r = run(keep(ledger([row('f-1', { disposition: 'STRUCTURALLY-BLOCKED', dispositionCitation: cite })])));
    assert.equal(r.exit, 1, r.out);
    assert.match(r.out, /cites unfinished work as a structural block/);
  }
});

test('a constraint inside this repository is a task, not a wall', () => {
  const r = run(keep(ledger([row('f-1', { disposition: 'STRUCTURALLY-BLOCKED', dispositionCitation: 'blocked by apps/worker/src/session.ts' })])));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /cites something inside this repository/);
});

test('a constraint another row in the same section CLOSED against is survivable', () => {
  // The most useful of these: the counter-example is already in the file. If one row shipped
  // against this exact wall, the wall is not what is stopping the other.
  const r = run(keep(ledger([
    row('f-1', { disposition: 'STRUCTURALLY-BLOCKED', dispositionCitation: 'Roblox has no API for this' }),
    row('f-2', { disposition: 'CLOSED-WITH-EVIDENCE', dispositionCitation: 'Roblox has no API for this' }),
  ])));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /is blocked by something f-2 closed against/);
});

test('a genuine external constraint passes — the control', () => {
  const r = run(keep(ledger([row('f-1', { disposition: 'STRUCTURALLY-BLOCKED', dispositionCitation: 'Roblox Creator Store has no upload API for third parties' })])));
  assert.equal(r.exit, 0, r.out);
});

/* --------------------------------------------------------------- FACET-BOUND --- */

test('a facet of a promise is a promise', () => {
  const r = run(keep(ledger([
    row('f-1', { disposition: 'FACET-BOUND', facetOf: 'f-2' }),
    row('f-2', { disposition: 'STRUCTURALLY-BLOCKED', dispositionCitation: 'Roblox has no such API' }),
  ])));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /FACET-BOUND to f-2, which is "STRUCTURALLY-BLOCKED"/);
});

test('a facet of a closed row passes — the control', () => {
  const r = run(keep(ledger([
    row('f-1', { disposition: 'FACET-BOUND', facetOf: 'f-2' }),
    row('f-2', { disposition: 'CLOSED-WITH-EVIDENCE', dispositionCitation: 'proven by G7' }),
  ])));
  assert.equal(r.exit, 0, r.out);
});

/* ----------------------------------------------------------- MERGE-DUPLICATE --- */

test('a survivor named approximately is two rows and a hopeful sentence', () => {
  const r = run(keep(ledger([
    { id: 'f-1', name: 'Webhooks', status: 'done', disposition: 'MERGE-DUPLICATE', survivor: 'f-2' },
    { id: 'f-2', name: 'Webhooks (outbound)', status: 'done', disposition: 'CLOSED-WITH-EVIDENCE', dispositionCitation: 'proven by G8' },
  ])));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /merges into a row with a different name/);
});

/* ------------------------------------------------------------- ACCEPTED_DEBT --- */

test('a paraphrase of the owner is me deciding', () => {
  const r = run(keep(ledger(
    [row('f-1', { disposition: 'ACCEPTED_DEBT', dispositionCitation: 'the owner said this can wait' })],
    '# decisions\n\nf-1 — Moshe said: "ship without it for now"\n',
  )));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /quote does not appear in docs\/DECISIONS\.md/);
});

test('one owner sentence cannot license every row that cites it', () => {
  // The quote is real and byte-exact — but it was written about a different row. Without the
  // proximity check, one convenient sentence closes the whole backlog.
  const r = run(keep(ledger(
    [row('f-1', { disposition: 'ACCEPTED_DEBT', dispositionCitation: 'ship without it for now' })],
    `# decisions\n\nf-999 — Moshe said: "ship without it for now"\n${'filler\n'.repeat(400)}`,
  )));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /not beside this row/);
});

test('an owner quote recorded beside the row passes — the control', () => {
  const r = run(keep(ledger(
    [row('f-1', { disposition: 'ACCEPTED_DEBT', dispositionCitation: 'ship without it for now' })],
    '# decisions\n\nf-1 — Moshe said: "ship without it for now"\n',
  )));
  assert.equal(r.exit, 0, r.out);
});

/* ------------------------------------------- the thousand-row shortcut --- */

test('THE ONE THAT MATTERS — pasting one justification across many rows collapses them', () => {
  // Every rule above is satisfiable by writing one good justification and pasting it. This is the
  // rule that makes 1,085 rows cost 1,085 decisions rather than one.
  const many = Array.from({ length: 25 }, (_, i) =>
    row(`f-${i}`, { disposition: 'STRUCTURALLY-BLOCKED', dispositionCitation: 'Roblox has no API for this', dispositionPass: '9' }));
  const r = run(keep(ledger(many)), ['--pass', '9']);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /applied to 25 rows in one pass and 25 share a citation/);
  assert.match(r.out, /identical citations collapse to one row and reopen the rest/);
});

test('twenty-five rows with twenty-five distinct citations pass — the control', () => {
  // The rule is against pasting, not against volume. Real work on many rows must remain possible.
  const many = Array.from({ length: 25 }, (_, i) =>
    row(`f-${i}`, { disposition: 'STRUCTURALLY-BLOCKED', dispositionCitation: `Roblox has no API for capability number ${i}`, dispositionPass: '9' }));
  const r = run(keep(ledger(many)), ['--pass', '9']);
  assert.equal(r.exit, 0, r.out);
});

test('at or below twenty rows the citation rule does not apply', () => {
  const few = Array.from({ length: 20 }, (_, i) =>
    row(`f-${i}`, { disposition: 'STRUCTURALLY-BLOCKED', dispositionCitation: 'Roblox has no API for this', dispositionPass: '9' }));
  const r = run(keep(ledger(few)), ['--pass', '9']);
  assert.equal(r.exit, 0, r.out);
});

/* --------------------------------------------------------------- vocabulary --- */

test('an invented disposition is refused', () => {
  const r = run(keep(ledger([row('f-1', { disposition: 'PROBABLY-FINE' })])));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /is not a disposition/);
});

test('an unrecognised flag exits 2', () => {
  const p = spawnSync(process.execPath, [CHECKER, '--wat'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(p.status, 2);
});

test('the scratch ledgers are removed', () => {
  for (const d of DIRS) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  DIRS = [];
});
