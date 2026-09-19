/**
 * WHETHER A FAILED STUDIO OP MAY BE TRIED AGAIN.
 *
 * Before this module, `OpResult` carried `{id, ok, data, error, durationMs}` and nothing else, so
 * the only thing separating "that path does not exist" from "Studio never answered" was an English
 * sentence. Anything deciding whether to retry had to read prose — an assertion on a spelling
 * rather than on a property, which is the failure mode this repo keeps a whole document about.
 *
 * THE CASE THAT MAKES THIS MORE THAN A LOOKUP TABLE. do/session.ts states that delivery to the
 * plugin is AT-MOST-ONCE: a plugin can apply a batch and die before reporting, and there is no
 * op-id idempotency cache to make redelivery safe. So a timed-out READ may be repeated for free
 * and a timed-out WRITE may not be repeated at all. A classifier that answered from the failure
 * kind alone would build the user's door twice.
 *
 * Run with:  node --test tests/op-failure.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const out = join(mkdtempSync(join(tmpdir(), 'opfail-')), 'op-failure.mjs');
execFileSync(join(HERE, '..', 'node_modules', '.bin', 'esbuild'),
  [join(HERE, '..', 'src', 'op-failure.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { retryEligibility, retryHint, remedyHint, replyWithRemedy, replacedFiction, mutates, MUTATING_OPS, asFailureKind, WORKER_FAILURES } = await import(out);

const fail = (failure) => ({ ok: false, failure });

// --------------------------------------------------------------- the distinction that matters

test('A TIMED-OUT MUTATION IS NOT RETRYABLE — it may already have been applied', () => {
  // Delivery is at-most-once with no op-id idempotency; retrying is how you get two doors.
  const v = retryEligibility({ op: 'create_instances' }, fail('timeout'));
  assert.equal(v.retryable, false);
  assert.match(v.reason, /already have been applied|twice/i);
});

test('a timed-out READ is retryable — repeating it changes nothing', () => {
  const v = retryEligibility({ op: 'get_tree' }, fail('timeout'));
  assert.equal(v.retryable, true, 'refusing to re-read would be the opposite bug');
});

test('the mutation/read split is the SAME failure kind answered two ways', () => {
  // If this ever collapses to one answer, one of the two halves above is a lie.
  const write = retryEligibility({ op: 'delete_instances' }, fail('timeout'));
  const read = retryEligibility({ op: 'read_script' }, fail('timeout'));
  assert.equal(write.kind, read.kind, 'same kind');
  assert.notEqual(write.retryable, read.retryable, 'different verdict');
});

// --------------------------------------------------------------- the rest of the table

test('a transport failure is retryable for a mutation too, because it provably never ran', () => {
  // "Studio is not connected" and "the run this change belonged to has ended" are both refusals
  // made BEFORE anything was delivered. Treating them like a timeout would strand real work.
  const v = retryEligibility({ op: 'create_instances' }, fail('transport'));
  assert.equal(v.retryable, true);
  assert.match(v.reason, /never reached Studio/i);
});

test('deterministic failures are not retryable — the same request gets the same answer', () => {
  for (const kind of ['not_found', 'conflict', 'refused', 'invalid', 'internal']) {
    const v = retryEligibility({ op: 'get_tree' }, fail(kind));
    assert.equal(v.retryable, false, `${kind} must not invite a retry`);
    assert.equal(v.kind, kind);
  }
});

// --------------------------------------------------------------- the default

test('AN UNCLASSIFIED FAILURE IS NOT RETRYABLE, and says so', () => {
  // A plugin too old to send a kind, or a kind from a build one version ahead. Optimism here
  // re-runs a mutation against somebody's place on a guess.
  for (const raw of [undefined, null, '', 'kaboom', 42, {}]) {
    const v = retryEligibility({ op: 'create_instances' }, { ok: false, failure: raw });
    assert.equal(v.retryable, false, `${JSON.stringify(raw)} must not be read as retryable`);
    assert.equal(v.kind, null, 'and it must not be reported as a kind we recognise');
    assert.match(v.reason, /not classified|unknown/i);
  }
});

test('asFailureKind admits only kinds this build knows', () => {
  assert.equal(asFailureKind('timeout'), 'timeout');
  assert.equal(asFailureKind('TIMEOUT'), null, 'the wire value is exact, not case-folded');
  assert.equal(asFailureKind('retryable'), null);
});

test('a SUCCESS is not a retry candidate, and does not fall into the unknown branch by accident', () => {
  const v = retryEligibility({ op: 'create_instances' }, { ok: true });
  assert.equal(v.retryable, false);
  assert.equal(v.kind, null);
  assert.match(v.reason, /succeeded/);
  assert.equal(retryHint({ op: 'create_instances' }, { ok: true }), null, 'nothing to tell the agent');
});

test('the hint the agent reads states the verdict rather than implying it', () => {
  assert.match(retryHint({ op: 'get_tree' }, fail('transport')), /^This can be retried:/);
  assert.match(retryHint({ op: 'create_instances' }, fail('timeout')), /^Do not retry this as-is:/);
});

// --------------------------------------------------------------- the two lists that must agree

test('the worker MUTATING set matches the plugin table that opens undo recordings', () => {
  // Two copies of one fact. The plugin's MUTATING table decides whether a ChangeHistory recording
  // is opened; this module's copy decides whether a timed-out op may be repeated. If they drift,
  // an op the plugin considers a mutation is one this module will happily re-send.
  const luau = readFileSync(join(ROOT, 'apps/plugin/src/Ops.luau'), 'utf8');
  const start = luau.indexOf('local MUTATING = {');
  assert.ok(start > 0, 'the plugin still has a MUTATING table — if it moved, re-aim this test');
  const table = luau.slice(start, luau.indexOf('\n}', start));
  const pluginSet = new Set([...table.matchAll(/(\w+)\s*=\s*true/g)].map((m) => m[1]));
  assert.ok(pluginSet.size >= 15, `parsed ${pluginSet.size} mutating ops from the plugin — parser check`);
  const here = new Set(MUTATING_OPS);
  assert.deepEqual([...pluginSet].filter((o) => !here.has(o)).sort(), [], 'the plugin mutates ops this module does not know about');
  assert.deepEqual([...here].filter((o) => !pluginSet.has(o)).sort(), [], 'this module believes ops mutate that the plugin does not record');
});

test('mutates() reads the op kind from every shape a caller has', () => {
  assert.equal(mutates('edit_script'), true);
  assert.equal(mutates({ op: 'edit_script', path: 'game.X' }), true);
  assert.equal(mutates({ op: 'get_tree' }), false);
  assert.equal(mutates(null), false);
  assert.equal(mutates(undefined), false);
  assert.equal(mutates({}), false);
});

test("every failure the worker itself produces has a declared kind, and none of them is 'internal'", () => {
  // The worker's own refusals are the ones it can name exactly. Leaving them unclassified would
  // put the product's most common failures into the "do not retry, we do not know" bucket.
  const kinds = Object.values(WORKER_FAILURES);
  assert.ok(kinds.length >= 4);
  for (const k of kinds) assert.ok(asFailureKind(k), `${k} must be a real kind`);
  assert.equal(kinds.includes('internal'), false);
  assert.equal(WORKER_FAILURES.notConnected, 'transport');
  assert.equal(WORKER_FAILURES.timeout, 'timeout');
});

// ------------------------------------------------- the refusal that got a fix invented for it

/**
 * OBSERVED IN THE LIVE PRODUCT, 2026-09-19. The plugin refused a write with "writes require
 * explicit edit consent". The model relayed that accurately, then told the user to open
 * "File > Project Settings > Security" and enable "Allow Scripted Updates" — no such menu, page or
 * setting exists in Roblox Studio — and never mentioned the real remedy, two clicks away in the
 * Apple panel.
 *
 * The model was handed a refusal with no remedy and a user who wanted one. Every silence in a tool
 * result gets filled; the only question is by whom.
 */

test('the consent refusal now carries the remedy that exists, not a silence', () => {
  const fix = remedyHint({ ok: false, failure: 'refused', remedy: 'edit_consent' });
  assert.match(fix, /Enable edits/);
  assert.match(fix, /Allow edits for this connection/);
  // The invented one must not be reachable from the product's own vocabulary.
  assert.doesNotMatch(fix, /Project Settings|Allow Scripted Updates/i);
});

test("a refusal with no remedy SAYS there is none, and forbids inventing one", () => {
  const fix = remedyHint({ ok: false, failure: 'refused', remedy: 'none' });
  assert.match(fix, /no setting that enables this/i);
  assert.match(fix, /[Dd]o not suggest one/);
});

test('an unclassified refusal admits ignorance rather than claiming there is nothing to do', () => {
  // "Unknown" and "there is nothing to do" are different facts. A build too old to send a code
  // must not have its silence read as the second one — that is this module's own original sin,
  // committed one level up.
  const fix = remedyHint({ ok: false, failure: 'refused' });
  assert.match(fix, /does not report/i);
  assert.doesNotMatch(fix, /no setting that enables this/i);
  assert.equal(remedyHint({ ok: false, failure: 'refused', remedy: 'not_a_real_code' }), fix,
    'an unknown code must be treated as absent, never guessed at');
});

test('only refusals get a remedy — a timeout or a success gets none', () => {
  assert.equal(remedyHint({ ok: true }), null);
  assert.equal(remedyHint({ ok: false, failure: 'timeout' }), null, 'a timeout is not something the user can fix by clicking');
  assert.equal(remedyHint({ ok: false, failure: 'transport' }), null);
  assert.equal(remedyHint({ ok: false }), null, 'an unclassified failure is not known to be a refusal');
});

test('every remedy in the vocabulary is an instruction, and none of them invents Studio UI', async () => {
  const { REFUSAL_REMEDIES } = await import('../../../packages/shared/src/index.ts');
  const codes = Object.keys(REFUSAL_REMEDIES);
  assert.ok(codes.length >= 5, 'the vocabulary shrank — this check would be vacuous');
  for (const [code, text] of Object.entries(REFUSAL_REMEDIES)) {
    assert.ok(text.length > 40, `${code}: a remedy too short to act on is a silence with extra steps`);
    // The exact fiction the model produced. If it ever appears in the product's OWN advice, the
    // guard has to fail rather than bless it.
    assert.doesNotMatch(text, /Project Settings|Allow Scripted Updates/i, `${code} repeats the invented setting`);
  }
  // Every code the plugin can send must be one the worker can answer.
  for (const code of ['edit_consent', 'leave_test_mode', 'none']) {
    assert.ok(codes.includes(code), `the plugin sends ${code} and the vocabulary does not define it`);
  }
});

test('THE PLUGIN ACTUALLY SENDS THE CODE — the vocabulary is not a table nothing populates', () => {
  const src = readFileSync(join(ROOT, 'apps/apple-plugin/src/Commands.luau'), 'utf8');
  // Read at the refusal sites, not by counting the word: a remedy defined and never attached is
  // exactly the shape of a guard that cannot fail.
  // Matched as a SHAPE, not as the message's exact wording — the message deliberately changed once
  // already, to carry the remedy inside the sentence the model quotes verbatim.
  assert.match(src, /writes require explicit edit consent[^\n]*?, started, "edit_consent"/,
    'the consent refusal no longer carries its remedy code');
  // And the sentence itself must name the button and deny the fiction, because the model repeats
  // `error` and demonstrably ignored a separate field.
  assert.match(src, /not a Roblox Studio setting/, 'the refusal no longer says whose gate it is');
  assert.match(src, /Enable edits/, 'the refusal no longer names the control that lifts it');
  assert.match(src, /writes require Studio edit mode", started, "leave_test_mode"/,
    'the edit-mode refusal no longer carries its remedy code');
  assert.match(src, /UNSUPPORTED\[name\], started, "none"/,
    'a deliberately unsupported op no longer says that nothing enables it');
});

// ------------------------------------------- the sentence the model is no longer trusted to write

test('a run that hit a refusal ends with the PRODUCT saying whose limit it is', () => {
  // NOTE: this used a FABRICATED reply when written for w34 and asserted the model text survived.
  // w35 changed that on purpose — a reply naming an invented settings page is now replaced, and
  // that assertion moved to the w35 block below. This case was always about whether the product's
  // sentence gets added at all, so the sample is now a truthful reply.
  const modelText = 'I could not create that part — the write was refused.';
  const out = replyWithRemedy(modelText, 'edit_consent');
  // The model's own account is kept — it usually contains something true about what it attempted,
  // and the user should see both and believe the signed one.
  assert.ok(out.startsWith(modelText), 'the model text was replaced rather than answered');
  assert.match(out, /Apple's own limit, not a Roblox Studio setting/);
  assert.match(out, /Enable edits/);
  assert.match(out, /Allow edits for this connection/);
});

test('a run with no refusal is left exactly alone', () => {
  const text = 'Built the platform.';
  assert.equal(replyWithRemedy(text, undefined), text);
  assert.equal(replyWithRemedy(text, null), text);
  // An unknown code is not a remedy. Appending a blank correction would be worse than none.
  assert.equal(replyWithRemedy(text, 'not_a_code'), text);
});

test('the correction cannot be an empty flourish', () => {
  // Falsification: if REFUSAL_REMEDIES[code] were ever blank, this would ship a bold heading with
  // nothing after it — a product-authored sentence that says less than the silence it replaced.
  for (const code of ['edit_consent', 'leave_test_mode', 'take_asset_first', 'none']) {
    const out = replyWithRemedy('x', code);
    const after = out.split('Roblox Studio setting.**')[1] ?? '';
    assert.ok(after.trim().length > 30, `${code}: the correction adds a heading and no instruction`);
  }
});

// ------------------------------------------------------ w35: two accounts, one of them false

/**
 * Appending the truth under a fabrication is not enough. A user reading
 *
 *   "Go to File > Place Settings > Security. Uncheck 'Require explicit edit consent for scripts'."
 *   "Actually this is Apple's own limit; press Enable edits… in the Apple panel."
 *
 * does not average them. They go looking for the settings page, because it is the instruction that
 * sounds like it was written by someone who checked. So a reply containing a named fiction is
 * REPLACED, not annotated.
 */

const FICTION = 'I cannot create RemedyProbe4 due to the "explicit edit consent" restriction. Go to File > Place Settings > Security. Uncheck "Require explicit edit consent for scripts".';
const HONEST = 'I could not create RemedyProbe4 — writes are refused right now.';

test('a reply that invents a Studio settings page is REPLACED, not annotated', () => {
  const out = replyWithRemedy(FICTION, 'edit_consent');
  assert.doesNotMatch(out, /Place Settings/i, 'the fabricated settings page survived into the reply');
  assert.doesNotMatch(out, /Require explicit edit consent for scripts/i);
  assert.match(out, /Apple's own limit/);
  assert.match(out, /Enable edits/);
  // The user still needs to know the state of their place.
  assert.match(out, /nothing to undo/i);
});

test('a reply with no fiction keeps the model\'s account and gains the correction', () => {
  const out = replyWithRemedy(HONEST, 'edit_consent');
  assert.ok(out.startsWith(HONEST), 'a truthful reply was thrown away');
  assert.match(out, /Apple's own limit/);
});

test('the replacement needs BOTH a refusal and a fiction — neither alone', () => {
  // A fiction with no explainable refusal is not this function's business: it has no remedy to
  // offer and silently deleting the model's reply would be worse than leaving it.
  assert.equal(replyWithRemedy(FICTION, undefined), FICTION);
  assert.equal(replyWithRemedy(FICTION, 'not_a_code'), FICTION);
  // And a refusal with no fiction appends, per the test above.
  assert.notEqual(replyWithRemedy(HONEST, 'edit_consent'), HONEST);
});

test('every fiction carries a real sample, and that sample triggers replacement', async () => {
  const { STUDIO_FICTIONS, studioFictionIn } = await import('../../../packages/shared/src/index.ts');
  assert.ok(STUDIO_FICTIONS.length >= 4, 'the fiction list shrank — this guard would be vacuous');
  for (const entry of STUDIO_FICTIONS) {
    // A row must carry a sentence from the run it was seen in. A pattern with no observed sample is
    // a speculative filter on a model's vocabulary, which is a false positive waiting for a
    // legitimate sentence.
    assert.ok(entry.seen, `${entry.pattern}: no observation date`);
    assert.ok(entry.sample && entry.sample.length > 20, `${entry.pattern}: no observed sample`);
    assert.ok(entry.pattern.test(entry.sample), `${entry.pattern} does not match its own recorded sample`);
    assert.ok(studioFictionIn(entry.sample), `${entry.pattern}: studioFictionIn misses its own sample`);
    const out = replyWithRemedy(entry.sample, 'edit_consent');
    assert.doesNotMatch(out, entry.pattern, `${entry.pattern}: the fabrication survived into the reply`);
    assert.match(out, /Apple's own limit/, `${entry.pattern}: replaced with nothing useful`);
  }
});

test('replacedFiction names what was removed, for the record and not for the reply', () => {
  assert.equal(replacedFiction(FICTION, 'edit_consent'), 'Place Settings');
  assert.equal(replacedFiction(HONEST, 'edit_consent'), null);
  assert.equal(replacedFiction(FICTION, undefined), null);
  // It must NOT leak into the user-facing text: telling a user "your assistant made something up"
  // mid-answer is confusing, and the correction already says what is true.
  assert.doesNotMatch(replyWithRemedy(FICTION, 'edit_consent'), /Place Settings/i);
});
