// What Apple believes about a project, and correcting it.
//
// Memory is written by a model, from the conversation, with nobody reading it first — and it then
// steers every later run. It is the one part of this product that can be confidently wrong about
// the user's own project and keep acting on it. Until now it was also invisible: the drawer showed
// the summary, never the facts, which are exactly the part most likely to be wrong in a way that
// matters.
//
// The normaliser is exercised for real. The routes are checked as source facts, and the property
// that matters most is that an edit reaches the copy the AGENT reads — an edit that only updated
// the dashboard's mirror would let the user delete a wrong fact, watch it vanish, and see the
// agent keep following it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-memory-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'memory.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const {
  normaliseMemory, isMemoryEmpty, SUMMARY_MAX, FACT_MAX, FACTS_MAX, SUGGESTED_MAX,
  MEMORY_MODES, isMemoryMode, memoryWritable, memoryReadable, memoryForPrompt,
  applyUserEdit, applyModelUpdate, addModelFact, decideSuggestedFact, decideSuggestedSummary,
  originOf, factFingerprint, normaliseFact,
} = await import(`file://${out}`);
process.on('exit', () => rmSync(out, { force: true }));

// ------------------------------------------------------------- normalisation ---

test('a well-formed memory passes through', () => {
  const m = normaliseMemory({ summary: 'An obby with lava.', facts: ['Checkpoints are BrickColor Lime green'] });
  assert.equal(m.summary, 'An obby with lava.');
  assert.deepEqual(m.facts, ['Checkpoints are BrickColor Lime green']);
});

test('the same fact twice becomes one', () => {
  // The model restates a fact in slightly different words across turns. A list holding the same
  // thing three times reads as broken rather than as thorough.
  const m = normaliseMemory({ facts: ['Doors use TweenService', 'doors use tweenservice', 'Doors use TweenService'] });
  assert.deepEqual(m.facts, ['Doors use TweenService'], 'the first spelling wins');
});

test('whitespace is collapsed before comparing, so a reflow is not a new fact', () => {
  const m = normaliseMemory({ facts: ['Doors  use\n  TweenService', 'Doors use TweenService'] });
  assert.equal(m.facts.length, 1);
});

test('blank facts are dropped rather than stored as empty rows', () => {
  const m = normaliseMemory({ facts: ['', '   ', '\n', 'real one'] });
  assert.deepEqual(m.facts, ['real one']);
});

test('a blank summary is null, not an empty string', () => {
  // The viewer branches on "is there a summary"; "" would render an empty paragraph where the
  // empty state belongs.
  for (const v of ['', '   ', '\n\t']) assert.equal(normaliseMemory({ summary: v }).summary, null, JSON.stringify(v));
});

test('non-strings are ignored rather than stringified', () => {
  // Otherwise a malformed model response puts "[object Object]" into memory and the agent reads it
  // back on the next run as though it meant something.
  const m = normaliseMemory({ summary: 42, facts: [null, undefined, {}, [], 7, 'kept'] });
  assert.equal(m.summary, null);
  assert.deepEqual(m.facts, ['kept']);
});

test('garbage in is an empty memory, not a crash', () => {
  for (const v of [null, undefined, 'a string', 42, [], { facts: 'not an array' }]) {
    const m = normaliseMemory(v);
    assert.equal(m.summary, null, JSON.stringify(v));
    assert.deepEqual(m.facts, [], JSON.stringify(v));
  }
});

test('both caps are enforced, because either one unbounded is a prompt the user cannot see', () => {
  const m = normaliseMemory({
    summary: 'x'.repeat(SUMMARY_MAX + 500),
    facts: Array.from({ length: FACTS_MAX + 10 }, (_, i) => `fact ${i} ${'y'.repeat(FACT_MAX + 50)}`),
  });
  assert.equal(m.summary.length, SUMMARY_MAX);
  assert.equal(m.facts.length, FACTS_MAX);
  for (const f of m.facts) assert.ok(f.length <= FACT_MAX, `a fact ran to ${f.length}`);
});

test('the cap keeps the FIRST facts, so the list is stable across saves', () => {
  const m = normaliseMemory({ facts: Array.from({ length: FACTS_MAX + 5 }, (_, i) => `f${i}`) });
  assert.equal(m.facts[0], 'f0');
  assert.equal(m.facts[FACTS_MAX - 1], `f${FACTS_MAX - 1}`);
});

test('emptiness is a question with one answer', () => {
  assert.equal(isMemoryEmpty({ summary: null, facts: [] }), true);
  assert.equal(isMemoryEmpty({ summary: 'something', facts: [] }), false);
  assert.equal(isMemoryEmpty({ summary: null, facts: ['something'] }), false);
});

// ------------------------------------------------------------------ the DO ---

const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
const get = SESSION.slice(SESSION.indexOf("path === '/memory' && req.method === 'GET'"), SESSION.indexOf("path === '/memory' && req.method === 'PUT'"));
const put = SESSION.slice(SESSION.indexOf("path === '/memory' && req.method === 'PUT'"), SESSION.indexOf("path === '/search'"));

test('the read comes from DO storage, not the Supabase mirror', () => {
  // The columns are written best-effort at the tail of a run with whatever JWT was live, so they
  // lag. Showing the lagging copy tells the user something the agent is not using.
  assert.match(get, /this\.ctx\.storage\.get<unknown>\('memory'\)/);
  assert.equal(/SUPABASE_URL|rest\/v1/.test(get), false, 'the viewer must not read the mirror');
});

test('what is read is normalised, so the viewer never meets a shape the editor cannot produce', () => {
  assert.match(get, /normaliseMemory\(stored\)/);
});

test('a write normalises before storing', () => {
  // The client is untrusted in the same way the model is: both can post twenty facts or a novel.
  assert.match(put, /normaliseMemory\(/);
  assert.ok(put.indexOf('normaliseMemory') < put.indexOf("storage.put('memory'"), 'normalise, then store');
});

test('a malformed body is refused rather than stored', () => {
  assert.match(put, /if \(!body \|\| typeof body !== 'object'\) return json\(\{ error: '[^']+' \}, 400\)/);
});

test('the write records when the user corrected it', () => {
  // A memory the user has curated and one the model wrote unattended are different things, and
  // only the timestamp tells them apart.
  assert.match(put, /storage\.put\('memoryEditedAt', editedAt\)/);
  assert.match(get, /memoryEditedAt/);
});

test('the response is what was STORED, not what was sent', () => {
  // The server trims, dedupes and caps. Echoing the request back would leave the panel showing a
  // fact the agent will never read.
  assert.match(put, /return json\(\{ memory, editedAt \}\)/);
});

// --------------------------------------------------------------- the routes ---

const INDEX = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
const readRoute = INDEX.slice(INDEX.indexOf("app.get('/api/projects/:id/memory'"), INDEX.indexOf("app.put('/api/projects/:id/memory'"));
const writeRoute = INDEX.slice(INDEX.indexOf("app.put('/api/projects/:id/memory'"), INDEX.indexOf("app.get('/api/projects/:id/search'"));

test('both routes are scoped to a project the caller owns', () => {
  for (const [name, route] of [['read', readRoute], ['write', writeRoute]]) {
    assert.match(route, /withOwnedProject\(c, c\.req\.param\('id'\)\)/, name);
    assert.match(route, /if \(!ctx\) return c\.json\(\{ error: 'not found' \}, 404\)/, name);
    assert.ok(route.indexOf('withOwnedProject') < route.indexOf('stub.fetch'), `${name}: own before read`);
  }
});

test('an edit reaches the copy the AGENT reads, not only the dashboard mirror', () => {
  // This is the whole point. An edit that only touched Supabase would let the user delete a wrong
  // fact, watch it disappear from the screen, and see the agent keep following it.
  assert.ok(
    writeRoute.indexOf("stub.fetch('https://do/memory'") < writeRoute.indexOf('rest/v1/projects'),
    'the DO is written first, and it is what the next run reads',
  );
});

test('the mirror is updated too, with the caller\'s own JWT under RLS', () => {
  assert.match(writeRoute, /Authorization: `Bearer \$\{ctx\.user\.jwt\}`/);
  assert.match(writeRoute, /memory_summary: out\.memory\.summary, memory_facts: out\.memory\.facts/);
});

test('a failed mirror write does not fail the edit', () => {
  // The edit has already taken effect where it counts. Refusing it over a stale mirror would tell
  // the user their correction did not happen when it did.
  assert.match(writeRoute, /\}\)\.catch\(\(\) => \{\}\);/);
});

test('a DO error is passed through rather than reported as success', () => {
  assert.match(writeRoute, /if \(!res\.ok\) return res;/);
});

// ---------------------------------------------------------------- the panel ---

const WEB = join(WORKER, '..', 'web');
const PANEL = readFileSync(join(WEB, 'src', 'components', 'ws', 'memory-panel.tsx'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');

test('the panel shows the facts, not only the summary', () => {
  // The old drawer showed `memory_summary` alone, so the part most likely to be wrong was the part
  // nobody could see.
  assert.match(PANEL, /facts\.map\(\(fact, i\)/);
  assert.match(PANEL, /Facts it keeps/);
});

test('every part of it can be corrected', () => {
  assert.match(PANEL, /aria-label=\{`Forget: \$\{fact\}`\}/);
  assert.match(PANEL, /New fact/);
  assert.match(PANEL, /className="mem__summary"/);
});

test('an unsaved edit is not overwritten by a refetch', () => {
  // React Query refetches on reconnect and on interval. Adopting the server copy while the user is
  // typing deletes what they were writing.
  assert.match(PANEL, /if \(dirty \|\| !state\.data\) return;/);
});

test('the panel is unmounted when the drawer closes, so abandoning an edit abandons it', () => {
  // Closing the drawer is the gesture people use to walk away from an edit. Keeping the component
  // mounted would preserve a half-finished change and re-present it later as if it were saved.
  // Restated 2026-09-22: the web lane lazy-loads the panel inside <Suspense>; still mounted only while open.
  assert.match(WS, new RegExp(`\\{drawer === 'memory' && \\(?\\s*(?:<Suspense[\\s\\S]{0,160}?)?<MemoryPanel projectId=\\{projectId\\} \\/>`));
});

test('loading and failure are both named', () => {
  assert.match(PANEL, /state\.isPending/);
  assert.match(PANEL, /state\.isError/);
  assert.match(PANEL, /role="alert"/);
});

test('the panel says that forgetting is not permanent', () => {
  // Apple keeps noticing things. Someone who deletes a fact and sees it return needs to have been
  // told that is how it works, rather than concluding the control is broken.
  assert.match(PANEL, /can\s*\n?\s*come back/);
});

test('the panel says an edit does not change what was already built', () => {
  assert.match(PANEL, /do not alter anything\s*\n?\s*already built/);
});

test('saving refreshes the places that render the summary', () => {
  assert.match(PANEL, /queryKey: \['project', projectId\]/);
  assert.match(PANEL, /queryKey: \['projects'\]/);
});

// ==========================================================================================
// CREDENTIALS MUST NOT BECOME MEMORY
//
// A transcript that contained an API key used to put that key into the system prompt of every
// later run, forever, where nobody looks. Every fixture below carries ONE credential inside
// ordinary prose, and every assertion is a pair: the secret is gone AND the prose survived. The
// second half is what stops a normaliser that drops the whole field from passing as a redactor.
// ==========================================================================================

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const OPENAI = 'sk-proj-AbCdEfGhIjKlMnOpQrStUv';

test('a secret in a model-written fact is redacted, and the sentence around it survives', () => {
  const m = normaliseMemory({ facts: [`the shop calls the API with ${JWT} on every purchase`] });
  assert.equal(m.facts.length, 1, 'the fact is kept — redaction is not deletion');
  assert.ok(!m.facts[0].includes(JWT), 'the token must not be stored');
  assert.match(m.facts[0], /the shop calls the API with/, 'the prose around it is still there');
  assert.match(m.facts[0], /\[redacted:jwt\]/, 'and it says what was removed');
});

test('a secret in the summary is redacted too — both fields, not just the one that was noticed', () => {
  const m = normaliseMemory({ summary: `A tycoon. The owner's key is ${OPENAI} and it is used server-side.` });
  assert.ok(!m.summary.includes(OPENAI));
  assert.match(m.summary, /A tycoon\./);
});

test('redaction is on the WRITE, so neither writer can get a credential in', () => {
  // The user's own editor and the model's distiller are different code paths into the same field.
  // A redactor wired to one of them is a redactor for the case that happens to be tested.
  const byUser = applyUserEdit(null, { facts: [`my key is ${OPENAI}`] });
  const byModel = applyModelUpdate(null, { summary: 'x', facts: [`the key is ${OPENAI}`] }, 'auto');
  const bySuggestion = applyModelUpdate(null, { summary: 's', facts: [`the key is ${OPENAI}`] }, 'review');
  assert.ok(!byUser.facts[0].includes(OPENAI), 'user edit');
  assert.ok(!byModel.facts[0].includes(OPENAI), 'model update');
  assert.ok(!bySuggestion.suggested.facts[0].includes(OPENAI), 'a proposal is stored too, so it is scanned too');
});

test('the credential is cut before the length cap, not after', () => {
  // Truncating first leaves half a token behind: still enough to identify the account, no longer
  // recognisable as a secret by anything downstream.
  const padded = `${'x'.repeat(FACT_MAX - 10)} ${JWT}`;
  const m = normaliseMemory({ facts: [padded] });
  assert.ok(!m.facts[0].includes(JWT.slice(0, 8)), 'no prefix of the token survives the cap');
  assert.ok(m.facts[0].length <= FACT_MAX);
});

// ==========================================================================================
// THE OFF SWITCH
// ==========================================================================================

test('the three modes are a checked vocabulary, not a cast', () => {
  for (const bad of ['Auto', 'OFF', '', null, undefined, 0, {}, '__proto__']) assert.equal(isMemoryMode(bad), false, JSON.stringify(bad));
  for (const good of MEMORY_MODES) assert.equal(isMemoryMode(good), true, good);
  assert.deepEqual([...MEMORY_MODES].sort(), ['auto', 'off', 'review']);
});

test('with memory off the model writes nothing — and the SAME input under auto does write', () => {
  // The second half is the point. "Nothing changed" is only evidence about the mode if the fixture
  // is one that changes something when the mode is different.
  const stored = { summary: 'a tycoon', facts: ['doors use TweenService'] };
  const off = applyModelUpdate(stored, { summary: 'a racer', facts: ['lava kills'] }, 'off');
  const auto = applyModelUpdate(stored, { summary: 'a racer', facts: ['lava kills'] }, 'auto');
  // The WHOLE memory, not just the fact list: an off switch that diverted the write into the
  // review queue instead of dropping it would satisfy "the facts did not change" and would still
  // be keeping everything the user asked it to stop keeping.
  assert.deepEqual(off, normaliseMemory(stored), 'off changed nothing at all, including the queue');
  assert.deepEqual(auto.facts, ['lava kills'], 'the same fixture under auto is a real write');
  assert.equal(auto.summary, 'a racer');
});

test('with memory off the remember tool refuses rather than reporting a save', () => {
  const off = addModelFact({ facts: [] }, 'the map is 512 studs', 'off');
  assert.equal(off.outcome, 'refused');
  assert.deepEqual(off.memory.facts, []);
  assert.deepEqual(off.memory.suggested.facts, [], 'and it was not quietly queued for later either');
  const on = addModelFact({ facts: [] }, 'the map is 512 studs', 'auto');
  assert.equal(on.outcome, 'saved');
  assert.deepEqual(on.memory.facts, ['the map is 512 studs']);
});

test('with memory off nothing stored reaches the prompt either', () => {
  // An off switch that only stops new writes leaves the agent acting on everything it already
  // knows — which is not what the person who turned it off asked for.
  const stored = { summary: 'a tycoon', facts: ['doors use TweenService'] };
  assert.deepEqual(memoryForPrompt(stored, 'off'), { summary: null, facts: [] });
  assert.deepEqual(memoryForPrompt(stored, 'auto'), { summary: 'a tycoon', facts: ['doors use TweenService'] });
  assert.equal(memoryWritable('off'), false);
  assert.equal(memoryReadable('off'), false);
});

// ==========================================================================================
// REVIEW: THE MODEL MAY PROPOSE, NOT DECIDE
// ==========================================================================================

test('under review a distilled fact is proposed and active memory is untouched', () => {
  const stored = { summary: 'a tycoon', facts: ['doors use TweenService'] };
  const after = applyModelUpdate(stored, { summary: 'a racing game', facts: ['lava kills', 'doors use TweenService'] }, 'review');
  assert.deepEqual(after.facts, ['doors use TweenService'], 'what was already remembered is unchanged');
  assert.equal(after.summary, 'a tycoon', 'and so is the summary');
  assert.deepEqual(after.suggested.facts, ['lava kills'], 'only the NEW fact is a proposal');
  assert.equal(after.suggested.summary, 'a racing game');
});

test('a proposal for something already remembered is not a question anyone needs to answer', () => {
  const after = applyModelUpdate({ facts: ['lava kills'] }, { facts: ['Lava Kills'] }, 'review');
  assert.deepEqual(after.suggested.facts, [], 'case-insensitively the same fact');
});

test('a pending proposal never reaches the prompt', () => {
  const m = applyModelUpdate({ facts: ['a'] }, { facts: ['b'] }, 'review');
  assert.deepEqual(memoryForPrompt(m, 'review').facts, ['a'], 'b is proposed, not in force');
});

test('accepting a proposal moves it into memory and records that the MODEL said it', () => {
  const proposed = applyModelUpdate({ facts: [] }, { facts: ['lava kills'] }, 'review');
  const { memory, matched } = decideSuggestedFact(proposed, 'lava kills', 'accept');
  assert.equal(matched, true);
  assert.deepEqual(memory.facts, ['lava kills']);
  assert.deepEqual(memory.suggested.facts, [], 'and it leaves the queue');
  assert.equal(originOf(memory, 'lava kills'), 'model', 'approving is not authoring');
});

test('discarding a proposal removes it WITHOUT remembering it', () => {
  const proposed = applyModelUpdate({ facts: [] }, { facts: ['lava kills'] }, 'review');
  const { memory, matched } = decideSuggestedFact(proposed, 'lava kills', 'discard');
  assert.equal(matched, true);
  assert.deepEqual(memory.facts, [], 'the whole point');
  assert.deepEqual(memory.suggested.facts, []);
});

test('a decision about something that was never proposed is reported as unmatched', () => {
  // Same 200 for "done" and "there was nothing there" would let a stale panel report a decision
  // that was never recorded.
  const { matched, memory } = decideSuggestedFact({ facts: ['a'], suggested: { facts: ['b'] } }, 'c', 'accept');
  assert.equal(matched, false);
  assert.deepEqual(memory.facts, ['a']);
  assert.deepEqual(memory.suggested.facts, ['b'], 'and nothing else was disturbed');
});

test('the proposed summary is decided separately from the facts', () => {
  const m = { summary: 'old', facts: [], suggested: { summary: 'new', facts: ['x'] } };
  const accepted = decideSuggestedSummary(m, 'accept');
  assert.equal(accepted.memory.summary, 'new');
  assert.equal(accepted.memory.suggested.summary, null);
  assert.deepEqual(accepted.memory.suggested.facts, ['x'], 'the fact queue is untouched');
  const discarded = decideSuggestedSummary(m, 'discard');
  assert.equal(discarded.memory.summary, 'old');
  assert.equal(discarded.memory.suggested.summary, null);
});

test('under review the remember tool queues instead of saving, and says so', () => {
  const r = addModelFact({ facts: [] }, 'the map is 512 studs', 'review');
  assert.equal(r.outcome, 'suggested');
  assert.deepEqual(r.memory.facts, []);
  assert.deepEqual(r.memory.suggested.facts, ['the map is 512 studs']);
});

test('the proposal queue is bounded', () => {
  const many = Array.from({ length: SUGGESTED_MAX + 6 }, (_, i) => `proposal ${i}`);
  const m = applyModelUpdate({ facts: [] }, { facts: many }, 'review');
  assert.ok(m.suggested.facts.length <= SUGGESTED_MAX, `queue ran to ${m.suggested.facts.length}`);
});

// ==========================================================================================
// WHO SAID IT
// ==========================================================================================

test('a fact the person wrote, a fact the model wrote and a fact nobody attributed are three different answers', () => {
  const legacy = normaliseMemory({ facts: ['written by an older deploy'] });
  assert.equal(originOf(legacy, 'written by an older deploy'), null, 'unrecorded is null, never a default');

  const mine = applyUserEdit(legacy, { facts: ['written by an older deploy', 'I added this one'] });
  assert.equal(originOf(mine, 'I added this one'), 'user');
  assert.equal(originOf(mine, 'written by an older deploy'), 'user', 'a fact present in a save is one the user stands behind');

  const theirs = applyModelUpdate({ facts: [] }, { facts: ['the model noticed this'] }, 'auto');
  assert.equal(originOf(theirs, 'the model noticed this'), 'model');
});

test('correcting one fact does not claim authorship of the model fact next to it', () => {
  const stored = applyModelUpdate({ facts: [] }, { facts: ['doors use TweenService', 'lava kills'] }, 'auto');
  const edited = applyUserEdit(stored, { facts: ['doors use TweenService', 'lava kills instantly'] });
  assert.equal(originOf(edited, 'doors use TweenService'), 'model', 'untouched, so still theirs');
  assert.equal(originOf(edited, 'lava kills instantly'), 'user', 'rewritten, so now yours');
});

test('an origin for a fact that is gone is dropped, and one for a fact that is not there is never adopted', () => {
  const m = normaliseMemory({
    facts: ['still here'],
    origins: { 'still here': 'model', 'deleted long ago': 'model', __proto__: 'user', 'still here ': 'user' },
  });
  assert.deepEqual(Object.keys(m.origins), ['still here']);
  assert.equal(originOf(m, 'still here'), 'model');
  assert.equal(Object.getPrototypeOf(m.origins), Object.prototype, 'the map is a plain object, not a polluted one');
  assert.equal(({}).toString(), '[object Object]', 'and nothing global was touched');
});

test('an origin value nobody defined is dropped rather than trusted', () => {
  const m = normaliseMemory({ facts: ['x'], origins: { x: 'anthropic' } });
  assert.equal(originOf(m, 'x'), null, 'an unknown author is an unknown author');
});

test('a user edit does not silently answer the review queue', () => {
  const pending = applyModelUpdate({ facts: ['a'] }, { facts: ['b'] }, 'review');
  const edited = applyUserEdit(pending, { facts: ['a', 'c'] });
  assert.deepEqual(edited.suggested.facts, ['b'], 'the proposal still needs a decision');
});

test('a user edit that writes the proposed fact by hand takes it out of the queue', () => {
  // Otherwise the panel asks you to decide about a fact that is already on the screen above it.
  const pending = applyModelUpdate({ facts: ['a'] }, { facts: ['b'] }, 'review');
  const edited = applyUserEdit(pending, { facts: ['a', 'B'] });
  assert.deepEqual(edited.suggested.facts, []);
  assert.equal(originOf(edited, 'B'), 'user');
});

test('the fingerprint is the identity used everywhere, and it ignores case and reflow', () => {
  assert.equal(factFingerprint('Doors  use\n TweenService'), factFingerprint('doors use tweenservice'));
  assert.equal(normaliseFact('  spaced   out  '), 'spaced out');
  assert.equal(normaliseFact(42), null);
});

test('emptiness counts a pending proposal — it is waiting on the user', () => {
  assert.equal(isMemoryEmpty({ summary: null, facts: [] }), true);
  assert.equal(isMemoryEmpty({ summary: null, facts: [], suggested: { summary: null, facts: ['x'] } }), false);
});

test('storage written before any of this existed reads back as a complete memory', () => {
  // The DO holds `{ summary, facts }` rows written by an older deploy. A reader that assumed the
  // new fields would throw on the first project anyone opens.
  const m = normaliseMemory({ summary: 'old shape', facts: ['a'] });
  assert.deepEqual(m.suggested, { summary: null, facts: [] });
  assert.deepEqual(m.origins, {});
});
