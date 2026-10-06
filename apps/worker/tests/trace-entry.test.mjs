/**
 * A FAILED TOOL CALL KEEPS ITS REASON ON THE STORED TRACE ROW (F6).
 *
 * Measured 2026-10-04 (t1 round 1): compose_game failed three times as "Could not build the game" with `detail: null`, and
 * nothing on the row said why. The reason was the `error` of the result the model had read; two of the three places that
 * write a row copied it, one did not, and a result whose `error` was not a string kept "[object Object]". One builder now
 * makes the row (trace-entry.ts) and every place that records a call that ran uses it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { failureText, toolTraceEntry, TRACE_ERROR_CHARS } from '../src/trace-entry.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');

test('a failed row always carries error, and a successful row never does', () => {
  const failed = toolTraceEntry({ tool: 't', summary: 'Could not do it', ok: false, resultForLlm: JSON.stringify({ error: 'the map is missing' }) }, 5);
  assert.equal(failed.error, 'the map is missing');
  const ok = toolTraceEntry({ tool: 't', summary: 'Did it', ok: true, resultForLlm: JSON.stringify({ done: true }) }, 5);
  assert.equal('error' in ok, false);
});

test('an empty or unreadable result falls back to the row summary, never to no reason', () => {
  for (const resultForLlm of [undefined, '', '{}', JSON.stringify({ error: '' }), JSON.stringify({ error: null })]) {
    const row = toolTraceEntry({ tool: 't', summary: 'Could not build the game', ok: false, resultForLlm }, 1);
    assert.equal(row.error, 'Could not build the game', JSON.stringify(resultForLlm));
  }
});

test('an error that is not a string is written out, not "[object Object]"', () => {
  const text = failureText(JSON.stringify({ error: { code: 'E_LIBRARY', hint: 'owner context' } }));
  assert.match(text, /E_LIBRARY/);
  assert.doesNotMatch(text, /\[object Object\]/);
});

test('the short lists a composite tool reports beside its error survive, bounded', () => {
  const text = failureText(JSON.stringify({ error: 'tycoon needs more', missing: ['tycoon.item', 'tycoon.seller', 'a', 'b', 'c', 'd'], problems: ['x'] }));
  assert.match(text, /^tycoon needs more \[missing: tycoon\.item; tycoon\.seller; a; b \(\+2 more\) \| problems: x\]$/);
});

test('a result cut off by the size cap still gives its start as the reason, and the text is capped and scrubbed', () => {
  const cut = '{"error":"the build stopped because ' + 'x'.repeat(2000);
  const text = failureText(cut);
  assert.ok(text.startsWith('{"error":"the build stopped'));
  assert.ok(text.length <= TRACE_ERROR_CHARS);
  assert.equal(failureText(JSON.stringify({ error: 'model glm-9 refused' }), (s) => s.replace(/glm-9/g, 'the engine')), 'model the engine refused');
});

test('every place that records a call that ran builds the row with the shared builder', () => {
  // RESTATED in M4: the self-check look (the second user of the builder) is gone, so the tool loop is the one place that records a call that ran.
  assert.equal((SESSION.match(/toolTraceEntry\(/g) ?? []).length, 1, 'the tool loop uses it');
  assert.doesNotMatch(SESSION, /function failureText\(/, 'a second failureText would drift from the shared one');
  // The one remaining hand-written row is the search-limit refusal, which is not a tool result: it states its own reason.
  const hand = [...SESSION.matchAll(/agent\.trace\.push\(\{ tool: [^\n]*ok: false[^\n]*\}\);/g)].map((m) => m[0]);
  assert.equal(hand.length, 1);
  assert.match(hand[0], /error: summary/);
});

// RESTATED in M4: the example was compose_game (removed); a composite tool that fails on its own arguments shows the same property.
test('a composite tool failing on its arguments: the summary is fixed, the row says why', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'trace-entry-')), 'tools.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
  const T = await import(`file://${out}`);
  const ctx = { env: {}, studioConnected: () => true, addMemoryFact: async () => {}, execStudioOp: async () => ({ ok: true, data: {} }) };
  const res = await T.runTool(ctx, 'build_object', JSON.stringify({ name: 'Chest', parts: [] }));
  assert.equal(res.ok, false);
  assert.equal(res.summary, 'Could not build it', 'the summary is the person-facing sentence and carries no reason');
  assert.equal(res.detail, undefined, 'a failed tool has no panel: the reason cannot live in detail');
  const row = toolTraceEntry({ tool: 'build_object', summary: res.summary, ok: res.ok, resultForLlm: res.resultForLlm, detail: res.detail }, 3, T.scrubEngineIdentity);
  assert.match(row.error, /parts is empty: list what the object is made of/);
});
