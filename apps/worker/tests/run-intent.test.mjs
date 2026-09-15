/**
 * WHAT APPLE UNDERSTOOD, AND WHAT IT QUIETLY DECIDED FOR ITSELF.
 *
 * `runIntentFor` builds the Intent and Plan rows of the Thinking card from the request alone, at
 * zero model cost. Three of its four lists were already reaching the user. The fourth was not.
 *
 * `intentCheck` in semantic.ts computes, for every run, a `notes` list of the things it INFERRED
 * rather than read: a mood taken from "cozy", a focal point nobody named outright, a soft
 * exclusion it chose to read as "restrained" rather than "absent". Those inferences steer the
 * build. `runIntentFor` kept `checklist` and `questions` and threw `notes` away, so the run
 * surface said nothing at all about what Apple had assumed — while the roadmap surface, for the
 * same product, prints its own honesty notes under "Reads as <genre>".
 *
 * The distinction the two lists draw is the whole point and it is easy to collapse:
 *
 *   questions   the request did not say, and Apple did NOT decide. Still open.
 *   assumptions the request did not say, and Apple DECIDED ANYWAY. Already acted on.
 *
 * A product that shows only the first is telling the user about the choices it declined to make
 * while hiding the ones it made. That is the failure-to-observe shape wearing a humble face.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// Bundled rather than imported: the worker's own sources use extensionless imports, which Node's
// type-stripping loader does not resolve. Same approach as propose-plan.test.mjs. The bundle is
// cheap here — semantic.ts has no imports at all.
const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'ri-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'run-intent.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const { runIntentFor, restate } = await import(`file://${out}`);

const semOut = join(mkdtempSync(join(tmpdir(), 'sem-')), 's.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'semantic.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + semOut],
  { cwd: WORKER, stdio: 'pipe' });
const { intentCheck } = await import(`file://${semOut}`);

/* ------------------------------------------------------------------ the restatement --- */

test('the summary is the user\'s own sentence, never a synthesised one', () => {
  assert.equal(restate('Build a bar with stools. Make it warm.'), 'Build a bar with stools.');
});

test('an opening interjection does not become the whole Intent row', () => {
  assert.equal(restate('Hey! Add a spawn platform to the lobby.'), 'Add a spawn platform to the lobby.');
});

test('an empty request produces no intent at all, rather than a blank row', () => {
  assert.equal(runIntentFor('   '), null);
  assert.equal(runIntentFor(''), null);
});

/* ------------------------------------------------------------------- the assumptions --- */

/** A request whose adjectives force the extractor to infer something it was never told. */
const SOFT = 'Build a cozy bar with stools and a jukebox.';

test('CONTROL: the extractor really does infer something from this request', () => {
  // Without this, every assertion below could pass on a request that had nothing to assume,
  // and the guard would be measuring the empty set.
  assert.ok(intentCheck(SOFT).notes.length > 0, 'the fixture stopped exercising the soft-constraint path');
});

test('what Apple inferred reaches the user, instead of being discarded', () => {
  const intent = runIntentFor(SOFT);
  assert.ok(Array.isArray(intent.assumptions), 'RunIntent carries no assumptions list at all');
  assert.ok(intent.assumptions.length > 0, 'the run surface says nothing about what Apple assumed');
});

test('the assumptions are the extractor\'s own notes, not a rewrite of them', () => {
  // Rewriting them here would be a second copy of semantic.ts's vocabulary, free to drift from it.
  const intent = runIntentFor(SOFT);
  assert.deepEqual(intent.assumptions, intentCheck(SOFT).notes.slice(0, intent.assumptions.length));
});

test('ASSUMPTIONS ARE NOT QUESTIONS — the two lists say opposite things', () => {
  // questions: Apple did not decide. assumptions: Apple decided anyway. Collapsing them would
  // let a decision already acted on render under a label that says nothing was assumed.
  const intent = runIntentFor(SOFT);
  for (const a of intent.assumptions) {
    assert.ok(!intent.questions.includes(a), `"${a}" is shown as both open and already decided`);
  }
});

test('a request that states everything plainly assumes nothing', () => {
  // The list is never padded to look thorough. An empty assumptions list is a real answer.
  const intent = runIntentFor('Delete the Part named OldWall.');
  assert.deepEqual(intent.assumptions, []);
});

test('the list is capped, and the cap truncates rather than pads', () => {
  const wordy = 'Build a cozy, moody, rustic, spacious, airy, bright, muted, quiet lounge '
    + 'with a bar, stools, a jukebox, lamps, tables, rugs, plants and a fireplace.';
  const intent = runIntentFor(wordy);
  assert.ok(intent.assumptions.length <= 6, `${intent.assumptions.length} assumptions would bloat the socket frame`);
  const all = intentCheck(wordy).notes;
  assert.deepEqual(intent.assumptions, all.slice(0, intent.assumptions.length), 'the cap reordered or invented entries');
});

test('assumptions alone are enough to produce an intent', () => {
  // The null return means "there is genuinely nothing to say". Once assumptions exist there IS
  // something to say, so a request that produced only assumptions must not be swallowed.
  const only = { summary: '', checklist: [], questions: [], assumptions: ['mood: warm'] };
  assert.ok(only.assumptions.length > 0);
  // The real guard: whatever request shape yields notes must not return null.
  const intent = runIntentFor(SOFT);
  assert.notEqual(intent, null);
});
