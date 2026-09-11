// `cloneAt` against a real repository, with no network.
//
// planBootstrap decides WHAT to fetch and is well covered. cloneAt is what actually
// moves bytes onto disk, and the only evidence it worked was one manual clone in a
// session transcript. A local repo makes the real code path — including the fallback —
// testable and hermetic: real git, real fetch, real checkout, no GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cloneAt } from '../bootstrap.mjs';

const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();

/** A repository with two commits, so "the pinned one" is a real choice. */
function makeOrigin() {
  const dir = mkdtempSync(join(tmpdir(), 'origin-'));
  git(['init', '--quiet', '-b', 'main', dir]);
  git(['config', 'user.email', 'test@example.invalid'], dir);
  git(['config', 'user.name', 'Test'], dir);
  writeFileSync(join(dir, 'README.md'), 'first\n');
  git(['add', '.'], dir);
  git(['commit', '--quiet', '-m', 'first'], dir);
  const first = git(['rev-parse', 'HEAD'], dir);
  writeFileSync(join(dir, 'README.md'), 'second\n');
  writeFileSync(join(dir, 'extra.txt'), 'added later\n');
  git(['add', '.'], dir);
  git(['commit', '--quiet', '-m', 'second'], dir);
  const second = git(['rev-parse', 'HEAD'], dir);
  return { dir, first, second };
}

const origin = makeOrigin();
const work = mkdtempSync(join(tmpdir(), 'clone-at-'));
let n = 0;
const fresh = () => join(work, `c${(n += 1)}`);

test('it checks out the pinned commit, not the tip', () => {
  // The whole point. Fetching HEAD would give `second` and every downstream verdict
  // would be computed against different bytes than the ones that were classified.
  const dir = fresh();
  cloneAt(origin.dir, origin.first, dir);
  assert.equal(git(['rev-parse', 'HEAD'], dir), origin.first);
  assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), 'first\n');
  assert.equal(existsSync(join(dir, 'extra.txt')), false, 'a later commit leaked in');
});

test('it can also land on the tip when that is what is pinned', () => {
  const dir = fresh();
  cloneAt(origin.dir, origin.second, dir);
  assert.equal(git(['rev-parse', 'HEAD'], dir), origin.second);
  assert.equal(readFileSync(join(dir, 'extra.txt'), 'utf8'), 'added later\n');
});

test('the restored tree is a real checkout with the origin recorded', () => {
  // recordAll reads the remote url and HEAD back out of the checkout to rebuild the
  // lock, so a clone that lost its origin would silently drop out of the manifest.
  const dir = fresh();
  cloneAt(origin.dir, origin.first, dir);
  assert.equal(git(['config', '--get', 'remote.origin.url'], dir), origin.dir);
  assert.ok(existsSync(join(dir, '.git')));
});

//[[ THE FALLBACK IS NOT TESTED HERE, AND I TRIED.
//
//   cloneAt's second branch exists because some hosts refuse to serve an arbitrary SHA
//   to `fetch --depth 1`; it retries with a full fetch and checks the commit out of
//   that. Reproducing that refusal locally needs the server to enforce
//   uploadpack.allowAnySHA1InWant, and git does not apply those settings to local
//   transport — measured, in this repo, with a plain path AND with file://, with the
//   three allow* settings false, and against a DANGLING commit reachable from no ref.
//   The shallow fetch succeeded in all six combinations.
//
//   A test that set those flags and passed anyway would be the vacuous kind this suite
//   keeps catching elsewhere: green, and exercising the fast path every time. So it is
//   written down instead. Closing it needs a git server in the fixture, which is more
//   machinery than the branch is worth today.
//
//   What IS covered below is the outcome that matters either way: a commit the origin
//   cannot serve must FAIL rather than silently leave a tree at the wrong revision. ]]

test('an unreachable commit fails loudly rather than leaving a wrong tree', () => {
  // Silently ending up on the default branch would be the worst outcome: a corpus
  // that looks restored and is not.
  const dir = fresh();
  assert.throws(() => cloneAt(origin.dir, 'f'.repeat(40), dir));
  if (existsSync(dir)) {
    const head = (() => { try { return git(['rev-parse', 'HEAD'], dir); } catch { return null; } })();
    assert.notEqual(head, origin.second, 'it fell back to the tip instead of failing');
  }
});

test.after(() => {
  rmSync(origin.dir, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});
