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
const { normaliseMemory, isMemoryEmpty, SUMMARY_MAX, FACT_MAX, FACTS_MAX } = await import(`file://${out}`);
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
  assert.match(WS, /\{drawer === 'memory' && <MemoryPanel projectId=\{projectId\} \/>\}/);
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
