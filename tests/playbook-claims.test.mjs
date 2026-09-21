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
import { execFileSync } from 'node:child_process';
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

/**
 * WHAT A CLONE CAN SEE. Re-aimed 2026-09-21; the history is the point of the comment.
 *
 * This used to be `existsSync(join(ROOT, claimed))` — it asked the DEVELOPER'S DISK. On this
 * repository that answer is not the runner's answer, and the gap is not small: `.dev.vars` holds
 * secrets, `packages/corpus/data/chunks.jsonl` is a 10 MB build artefact, `apps/site/dist` is
 * build output and `.claude/worktrees/` is a runtime directory. All four are on a machine that has
 * worked here and in no fresh checkout, so the test was green on every Mac and red on every clone
 * — CI run 35554147167 failed on exactly this, and it had been failing unseen because the same
 * class of defect (a test reading a gitignored artefact) had already taken `pnpm -r test` down at
 * three other packages the same night.
 *
 * It also let the WRONG thing pass. A path deleted from git but still lying on someone's disk read
 * as present, which is the same shape as the checker that printed REBRAND COMPLETE four times over
 * a fix that was never committed.
 *
 * So the question is asked of git, and it is asked in two tiers, because there are two different
 * things a reader can be told:
 *
 *   IN THE COMMITTED TREE  — the reader will have it. Assert it is in HEAD, not on a disk.
 *   NOT IN THE COMMITTED TREE — the reader will NOT have it, and no clone can observe whether it
 *                               exists. The guidance may still name it (a secret file and a build
 *                               directory are worth naming), but `.gitignore` must SAY the path is
 *                               deliberately not carried. That rule is the declaration, it is a
 *                               reviewable line, and this repository's .gitignore already writes a
 *                               paragraph of reasoning for each one.
 *
 * A typo is in neither tier and fails. A path dropped from git and left on a disk is in neither
 * tier and fails.
 *
 * WHAT IT STILL CANNOT DO, said plainly rather than left to be discovered: for a gitignored path it
 * checks the DECLARATION, not the file. If guidance describes a gitignored directory that was
 * deleted, nothing here can tell — the directory is invisible to every clone either way. That is a
 * limit of the evidence, not an oversight, and pretending otherwise would be the failure this file
 * is named after. Stale prose about an ignored path is caught by reading, and by the test below.
 */
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // A guard that cannot run its instrument must say so, not report clean.
    throw new Error(`git ${args.join(' ')} failed, so this test measured nothing: ${e.message}`);
  }
};

/** Every path in HEAD, plus every directory prefix, with and without a trailing slash. */
const committedPaths = () => {
  const out = new Set();
  for (const file of git('ls-tree', '-r', '--name-only', 'HEAD').split('\n')) {
    if (!file) continue;
    out.add(file);
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i += 1) {
      const dir = parts.slice(0, i).join('/');
      out.add(dir);
      out.add(`${dir}/`);
    }
  }
  return out;
};

/**
 * The subset of `candidates` that .gitignore deliberately keeps out of a checkout.
 *
 * Every candidate is offered TWICE, once with a trailing slash. `git check-ignore` decides whether
 * a rule written `dist/` applies by asking the filesystem whether the path is a directory — so on a
 * machine that has built the site `apps/site/dist` matches and in a fresh clone the identical
 * repository says it does not. The trailing slash is how you tell git "this is a directory" without
 * a directory being there, and it is the difference between this function reading the RULES and
 * reading one machine's disk, which is the whole defect this file was re-aimed for.
 */
const declaredIgnored = (candidates) => {
  if (candidates.length === 0) return new Set();
  const asked = candidates.flatMap((p) => [p.replace(/\/$/, ''), `${p.replace(/\/$/, '')}/`]);
  let out;
  try {
    out = execFileSync('git', ['check-ignore', '--stdin'], {
      cwd: ROOT,
      input: asked.join('\n'),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    // check-ignore exits 1 when NOTHING matched. That is the answer "none of them", and it is
    // the answer in the case this guard exists for, so it must not surface as a crash with no
    // list in it. Any OTHER status is the instrument failing and is re-thrown.
    if (e.status !== 1) throw new Error(`git check-ignore failed (status ${e.status}), so this test measured nothing: ${e.message}`);
    out = e.stdout ?? '';
  }
  return new Set(String(out).split('\n').filter(Boolean).map((p) => p.replace(/\/$/, '')));
};

test('every repository path the guidance names is in the clone, or is declared not to be', () => {
  const claimed = new Map(); // path -> the document that named it
  for (const doc of guidance()) {
    const body = read(doc);
    // Backticked paths that look like real repo paths: a slash, and a known top-level directory.
    for (const [, p] of body.matchAll(/`((?:apps|docs|scripts|infra|packages|tests|\.claude)\/[A-Za-z0-9._\/-]+)`/g)) {
      const clean = p.replace(/[.,)]$/, '');
      if (!claimed.has(clean)) claimed.set(clean, doc);
    }
  }
  assert.ok(claimed.size > 10, `only ${claimed.size} path(s) matched — the reader stopped reading`);

  const inHead = committedPaths();
  const unresolved = [...claimed.keys()].filter((p) => !inHead.has(p) && !inHead.has(p.replace(/\/$/, '')));
  const ignored = declaredIgnored(unresolved);

  const missing = unresolved
    .filter((p) => !ignored.has(p.replace(/\/$/, '')))
    .map((p) => `${claimed.get(p)} -> ${p}`)
    .sort();

  assert.deepEqual(
    missing,
    [],
    'the guidance names paths that are not in the committed tree and that .gitignore does not ' +
      'declare — each is a typo, or a path that left git and is still lying on one machine:\n  ' +
      missing.join('\n  '),
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

  //[[ THE LIBRARY FIGURES WERE CHECKED HERE AND THE LIBRARY IS GONE (2026-09-20).
  //
  //   Two counts were compared against `packages/corpus/data/library/index.json`: the harvest total
  //   and `liveMeasurement.active`, the number of rows the product could actually insert. The owner
  //   removed the asset catalogue, and the manifest went with the directory — so this cross-check
  //   now has nothing on either side of it.
  //
  //   It is deleted rather than pointed at some other file. The pairing was the whole value: a
  //   count in AGENTS.md checked against the data it was copied from. AGENTS.md no longer states
  //   either figure, so there is no second copy left to rot. What replaced that section is a
  //   statement that the library was removed, and that claim is not a number — it is checked by
  //   the path assertion above, which fails the moment the prose points at a file that is not
  //   there, and by the suite's own absence of a catalogue.
  //
  //   The Durable Object and binding checks below are untouched and are the reason this test still
  //   earns its place. ]]
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
