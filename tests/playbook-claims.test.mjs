/**
 * THE PLAYBOOK MUST NOT DESCRIBE SOMETHING THAT IS NOT THERE.
 *
 * `docs/playbook/` and `.claude/skills/rbxai-working-rules/SKILL.md` exist to stop an agent
 * re-deriving what the last six already paid for. Guidance that has drifted is worse than none: it
 * is confidently wrong, it is read FIRST, and it is read by someone with no way to check it.
 *
 * That is the same defect the playbook's own first page is about — a failure to observe rendering
 * as an observation — so it would be absurd to leave it unguarded. `Nav.astro` carried a perfectly
 * correct diagnosis of dangling anchors for months after the premise expired, and nobody could see
 * the reason had gone stale because nothing measured it.
 *
 * This checks only CHECKABLE claims: that every file named exists, and that the specific mechanisms
 * the prose points at are really in the code. It cannot check whether the advice is good.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const SKILL = '.claude/skills/rbxai-working-rules/SKILL.md';
const PLAYBOOK = 'docs/playbook';
const AGENTS = 'AGENTS.md';

/** Every document an agent is told to read before its first edit. */
const guidance = () => [SKILL, AGENTS, ...readdirSync(join(ROOT, PLAYBOOK)).map((f) => `${PLAYBOOK}/${f}`)];

test('the skill and the playbook are where everything says they are', () => {
  assert.ok(existsSync(join(ROOT, SKILL)), `${SKILL} is gone — sessions load it automatically and would silently get nothing`);
  const files = readdirSync(join(ROOT, PLAYBOOK));
  assert.ok(files.includes('README.md'), 'the playbook has no index');
  assert.ok(files.length >= 4, `the playbook is down to ${files.length} file(s)`);
});

test('the skill has the frontmatter a session needs to load it', () => {
  const s = read(SKILL);
  assert.match(s, /^---\nname: rbxai-working-rules\n/, 'the skill needs `name` in its frontmatter');
  assert.match(s, /\ndescription: .{40,}/, 'the description is what decides whether a session reads it');
});

test('AGENTS.md is at the root, where an agent will find it without being told', () => {
  assert.ok(existsSync(join(ROOT, AGENTS)), 'AGENTS.md is gone — it is the map');
  const s = read(AGENTS);
  assert.match(s, /rbxai-working-rules/, 'AGENTS.md must point at the skill that carries the method');
});

test('every repository path the guidance names exists', () => {
  const docs = guidance();
  const missing = [];
  for (const doc of docs) {
    const body = read(doc);
    // Backticked paths that look like real repo paths: a slash, and a known top-level directory.
    for (const [, p] of body.matchAll(/`((?:apps|docs|scripts|infra|packages|tests|\.claude)\/[A-Za-z0-9._/-]+)`/g)) {
      const clean = p.replace(/[.,)]$/, '');
      // A directory reference ends in / or has no extension; both are checked the same way.
      if (!existsSync(join(ROOT, clean))) missing.push(`${doc} -> ${clean}`);
    }
  }
  assert.deepEqual(
    [...new Set(missing)].sort(),
    [],
    'the guidance points at files that are not there:\n  ' + [...new Set(missing)].sort().join('\n  '),
  );
});

test('THE CHECKABLE CLAIMS — each mechanism the prose points at is really in the code', () => {
  const claims = [
    // "Both end by fetching what they deployed and comparing it to what they sent."
    ['infra/deploy-static.mjs', /async function verifyServed/, 'the static deploy no longer verifies what it served'],
    ['infra/deploy-static.mjs', /DEPLOYED BYTES ARE NOT WHAT/, 'the static deploy no longer fails on a mismatch'],
    ['infra/deploy-worker.mjs', /\/api\/health/, 'the worker deploy no longer asks what is running'],
    ['infra/deploy-worker.mjs', /BUILD_SHA:\$\{stamp\}/, 'the worker deploy no longer stamps the sha from git'],
    // "Three locators, in packages/evals/src/security.test.mjs"
    ['packages/evals/src/security.test.mjs', /function braceBlock\(/, 'braceBlock is gone'],
    ['packages/evals/src/security.test.mjs', /function bodyBlock\(/, 'bodyBlock is gone'],
    // "assert that the read found something"
    ['packages/evals/src/security.test.mjs', /this test would check nothing/, 'the empty-read assertions are gone'],
    // The waitUntil finding, and the guard that keeps it fixed.
    ['apps/worker/tests/durable-object-waituntil.test.mjs', /no Durable Object hands work to waitUntil/, 'the waitUntil guard is gone'],
  ];
  for (const [file, re, why] of claims) {
    assert.ok(existsSync(join(ROOT, file)), `${file} is named by the playbook and does not exist`);
    assert.match(read(file), re, `${why} — the playbook still says it is there (${file})`);
  }
});

test('THE MEASURED FACTS — a figure in the prose is the figure in the data', () => {
  //[[ AGENTS.md states counts. A count in prose is a second copy of a fact, and the copy is the one
  //   that rots — so each of these is compared against its source. A re-harvest or a new Durable
  //   Object turns this red, which is the point: the document gets corrected instead of quietly
  //   becoming wrong for the next agent who has no way to check it. ]]
  const s = read(AGENTS);

  const index = JSON.parse(read('packages/corpus/data/library/index.json'));
  const total = index.total.toLocaleString('en-US');
  assert.ok(s.includes(total), `AGENTS.md does not state the library total; index.json says ${total}`);
  // `usableWithoutUploadKnown` no longer exists. w21 found the figure it held was three facts
  // added together — it counted Creator Store rows that repeat up to ten times, and 13,023 audio
  // rows that are ingested nowhere and so are usable by nobody. The canonicaliser replaced it with
  // a LIVE measurement of the table the product actually inserts from, and kept the old value in
  // `supersededUsable` with the reason. Reading the key by name is checked first: a schema change
  // should say which key went missing, not throw a TypeError on `undefined.toLocaleString`.
  assert.ok(index.liveMeasurement && typeof index.liveMeasurement.active === 'number',
    'index.json has no liveMeasurement.active — the usable-without-upload figure moved again; read scripts/library-canonicalise.mjs before editing this');
  const usable = index.liveMeasurement.active.toLocaleString('en-US');
  assert.ok(s.includes(usable), `AGENTS.md does not state the live-insertable figure; index.json says ${usable}`);

  const wrangler = read('apps/worker/wrangler.apple.jsonc');
  const classes = [...new Set([...wrangler.matchAll(/"class_name":\s*"(\w+)"/g)].map((m) => m[1]))];
  assert.ok(classes.length >= 5, 'no Durable Object classes parsed — this check would be vacuous');
  for (const c of classes) {
    assert.ok(s.includes(c), `${c} is a Durable Object in wrangler.apple.jsonc and AGENTS.md does not name it`);
  }

  // The bindings it tells you not to rename must be the bindings that exist.
  for (const b of [...new Set([...wrangler.matchAll(/"binding":\s*"([A-Z_]+)"/g)].map((m) => m[1]))]) {
    assert.ok(s.includes(`\`${b}\``), `binding ${b} exists and AGENTS.md does not name it`);
  }
});

test('the decisions and failures the guidance cites by id are in their logs', () => {
  const text = guidance().map(read).join('\n');
  const decisions = read('docs/DECISIONS.md');
  const failures = read('docs/FAILURES.md');
  for (const [, id] of text.matchAll(/\b(ADR-\d{3})\b/g)) {
    assert.match(decisions, new RegExp(`^##\\s+${id}\\b`, 'm'), `${id} is cited by the guidance and is not in docs/DECISIONS.md`);
  }
  for (const [, id] of text.matchAll(/\b(F-\d{2,3})\b/g)) {
    assert.ok(failures.includes(id), `${id} is cited by the guidance and is not in docs/FAILURES.md`);
  }
});
