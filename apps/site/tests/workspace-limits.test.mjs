// THE 48 KB CEILING WAS FIRST MET AS AN ERROR.
//
// A project's files live in a text store with three limits — which extensions it holds, how big one
// file may be, how long a deleted file stays recoverable — and none of them was written down
// anywhere a customer could read before running into it. credits-and-limits.astro explains the
// quota in detail and did not mention that a file has a size limit at all, so the first statement
// of the number was a refusal inside a drawer.
//
// WHY THE PAGE STATES THE NUMBERS RATHER THAN IMPORTING THEM. Importing the constant would be
// better and is not available: apps/site and apps/worker are separate packages, and the shared
// package they could both read is resolved through a symlink that this test cannot verify from a
// worktree. So this file is the mechanism instead, and it is the one check-proof-figures.mjs
// already uses for the landing page's three numbers: READ THE CONSTANTS OUT OF THE WORKER and fail
// when the prose disagrees. Fix the page, or fix the claim.
//
// IT REFUSES TO REPORT CLEAN WHEN IT CANNOT SEE. A constant it cannot find in webtools.ts, or a
// page section it cannot locate, is a hard failure naming the harness as broken — never a pass. A
// guard that stops finding what it guards has learned nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const page = readFileSync(join(ROOT, 'apps', 'site', 'src', 'pages', 'docs', 'credits-and-limits.astro'), 'utf8');
const webtools = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'webtools.ts'), 'utf8');
const retention = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'retention.ts'), 'utf8');

/** A numeric constant as the worker declares it, evaluated — or a hard failure saying it is gone. */
function constant(name) {
  const m = new RegExp(`export const ${name} = ([0-9*\\s]+);`).exec(webtools);
  assert.ok(m, `THIS TEST IS BROKEN, NOT THE PAGE: ${name} is no longer declared in apps/worker/src/webtools.ts`);
  const value = Function(`"use strict"; return (${m[1]});`)();
  assert.ok(Number.isFinite(value) && value > 0, `${name} did not evaluate to a usable number`);
  return value;
}

/**
 * A retention window, from the one table that now declares them all.
 *
 * `WORKSPACE_TRASH_TTL_SECONDS` used to be a literal in webtools.ts and this test read it from
 * there. It is now `seconds(RETENTION.workspaceTrashDays)` — every window in the worker moved into
 * apps/worker/src/retention.ts, because eight files each holding their own number is how the
 * privacy page came to quote a window the code did not keep. This follows it rather than being
 * deleted: the property is still "the page states the window the worker enforces", and the
 * harness-is-broken failure below is still a hard failure rather than a skip.
 */
function window_(name) {
  const m = new RegExp(`${name}: ([0-9_]+),`).exec(retention);
  assert.ok(m, `THIS TEST IS BROKEN, NOT THE PAGE: ${name} is no longer declared in apps/worker/src/retention.ts`);
  const value = Number(m[1].replace(/_/g, ''));
  assert.ok(Number.isFinite(value) && value > 0, `${name} did not read as a usable number`);
  return value;
}

const MAX_BYTES = constant('WORKSPACE_MAX_BYTES');
const MAX_VERSIONS = constant('WORKSPACE_MAX_VERSIONS');
const TRASH_DAYS = window_('workspaceTrashDays');

const EXTENSIONS = (() => {
  const m = /export const WORKSPACE_EXTENSIONS: readonly string\[\] = \[([^\]]+)\]/.exec(webtools);
  assert.ok(m, 'THIS TEST IS BROKEN, NOT THE PAGE: WORKSPACE_EXTENSIONS is no longer declared in webtools.ts');
  const list = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.ok(list.length > 0, 'the extension list parsed to nothing');
  return list;
})();

const section = (() => {
  const at = page.indexOf('Project files');
  assert.notEqual(at, -1, 'the docs page has no section about project files');
  return page.slice(at, at + 1600);
})();

test('THE PAGE STATES THE PER-FILE CEILING, and states the one the worker enforces', () => {
  const kb = Math.round(MAX_BYTES / 1024);
  assert.match(section, new RegExp(`\\b${kb}\\s?KB\\b`), `the page must say ${kb} KB — the limit webtools.ts actually applies`);
});

test('and how many earlier versions are kept, and for how long a deleted file comes back', () => {
  assert.match(section, new RegExp(`\\b${MAX_VERSIONS}\\b`), `the page must state that ${MAX_VERSIONS} versions are kept`);
  assert.match(section, new RegExp(`\\b${TRASH_DAYS}\\b`), `the page must state the ${TRASH_DAYS}-day recovery window`);
  assert.match(section, /recover|trash/i, 'a number with no sentence around it is not a retention promise');
});

test('THE CHECKPOINT CAP IS A NUMBER, AND THE PAGE SAYS WHICH ONE', () => {
  // "a rolling cap" is not a limit a person can plan around, and the sentence that followed it —
  // "the oldest automatic checkpoints are pruned first, manual checkpoints outlive automatic ones"
  // — was not true of any code. SessionDO's prune orders by `created_at desc` and deletes past an
  // offset; `kind` is not in the clause. So the page promised a protection nothing implemented.
  const session = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'do', 'session.ts'), 'utf8');
  const prune = /delete from checkpoints where id in \(select id from checkpoints[^`]*/.exec(session);
  assert.ok(prune, 'THIS TEST IS BROKEN, NOT THE PAGE: the checkpoint prune is no longer where this looks');
  const kept = window_('checkpointsKept');

  const cap = page.indexOf('Checkpoints:');
  assert.notEqual(cap, -1, 'the docs page no longer has a checkpoints limit at all');
  const sentence = page.slice(cap, cap + 400);
  assert.match(sentence, new RegExp(`\\b${kept}\\b`), `the page must state the cap the worker enforces (${kept})`);

  // And it may only claim manual checkpoints are privileged if the prune actually looks at `kind`.
  if (!/\bkind\b/.test(prune[0])) {
    assert.equal(
      /manual checkpoints outlive/i.test(sentence),
      false,
      'the page promises manual checkpoints survive longer, and the prune does not look at kind at all',
    );
  }
});

test('and which file types the workspace holds, every one of them', () => {
  // Every extension, because a list that omits three is the same defect as a wrong number: a user
  // with a .yaml file is told by its absence that it will not work.
  for (const ext of EXTENSIONS) {
    assert.ok(section.includes(ext), `${ext} is a workspace file type and the page does not mention it`);
  }
});

test('the page does not promise an upload the product does not have', () => {
  // The workspace is TEXT. Saying "files" without saying which kind invites somebody to try a PNG
  // and conclude the feature is broken.
  assert.match(section, /text/i, 'the page must say these are text files');
});
