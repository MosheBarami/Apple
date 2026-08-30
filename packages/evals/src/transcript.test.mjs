// Regression tests for the agent transcript trim.
//
// The defect these lock out shipped and ran in production undetected: the trim deleted the user's
// own request out of a long run, and orphaned tool results from the assistant turns that called
// them. Nothing errored. The agent just quietly stopped knowing what it had been asked to do.
//
// The first test reconstructs the exact production shape that triggered it — a 15,048-char system
// prompt against a 24,000-char cap, with steps appending capped 3,000-char tool results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

// One implementation: the production TypeScript, transpiled with the worker's own esbuild.
const dest = join(tmpdir(), `golem-transcript-${process.pid}.mjs`);
execFileSync(
  join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(REPO, 'apps', 'worker', 'src', 'transcript.ts'), '--format=esm', '--target=es2022', `--outfile=${dest}`],
  { stdio: 'pipe' },
);
const T = await import(`file://${dest}`);
rmSync(dest, { force: true });

const MAX = 24_000;
const SYSTEM_CHARS = 15_048; // measured: Stone system prompt carrying the world-building brief
const RESULT_CHARS = 3_000; // MAX_RESULT_CHARS in tools.ts

const sys = { role: 'system', content: 'S'.repeat(SYSTEM_CHARS) };
const request = { role: 'user', content: 'build me a town plaza with a monument', pinned: true };

/** One agent step: an assistant turn with N tool calls, then the N results answering it. */
function step(n, calls = 2) {
  const toolCalls = Array.from({ length: calls }, (_, k) => ({ id: `call_${n}_${k}`, name: 'run_luau', arguments: '{}' }));
  return [
    { role: 'assistant', content: '', toolCalls },
    ...toolCalls.map((c) => ({ role: 'tool', content: 'R'.repeat(RESULT_CHARS), toolCallId: c.id, name: c.name })),
  ];
}

function runFor(steps) {
  let llm = [sys, request];
  for (let i = 0; i < steps; i++) {
    llm = T.trimTranscript(llm, MAX);
    llm = [...llm, ...step(i)];
  }
  return T.trimTranscript(llm, MAX);
}

test('the user request survives a full 16-step Stone run — the bug that shipped', () => {
  const llm = runFor(16);
  const user = llm.filter((m) => m.role === 'user');
  assert.equal(user.length, 1, 'the pinned request must still be present exactly once');
  assert.equal(user[0].content, request.content);
  assert.equal(llm[0].role, 'system', 'the system prompt is never moved');
});

test('no tool message is ever orphaned from the call that produced it', () => {
  for (const steps of [2, 5, 16, 24]) {
    assert.deepEqual(T.orphanedToolMessages(runFor(steps)), [], `orphans appeared after ${steps} steps`);
  }
});

test('the old splice(1,1) behaviour is what this replaces — proven, not recalled', () => {
  // Reproduce the previous implementation so the justification for this module is checkable rather
  // than a story about the past.
  //
  // Three tool calls per step, not two, and that detail matters. The old loop stopped at
  // `llm.length > 4`, so it left exactly four messages. A step making two calls leaves
  // [system, assistant, tool, tool] — the request is gone but nothing is orphaned. At three calls
  // the surviving group is one message too long and the assistant turn goes too, leaving
  // [system, tool, tool, tool] with tool_call_ids pointing at nothing. The loop allowed up to four
  // calls per step (session.ts `res.toolCalls.slice(0, 4)`), so both failures were reachable, but
  // only the request deletion happened on every run.
  let llm = [sys, request];
  const oldTrim = (ms) => {
    let chars = ms.reduce((n, m) => n + m.content.length, 0);
    while (chars > MAX && ms.length > 4) chars -= ms.splice(1, 1)[0].content.length;
    return ms;
  };
  for (let i = 0; i < 6; i++) llm = [...oldTrim(llm), ...step(i, 3)];
  llm = oldTrim(llm);

  assert.equal(llm.filter((m) => m.role === 'user').length, 0, 'the old trim really did delete the request');
  assert.ok(T.orphanedToolMessages(llm).length > 0, 'the old trim really did orphan tool results');
});

test('a transcript already inside the budget is returned untouched', () => {
  const small = [sys, request, ...step(0, 1)];
  assert.equal(T.trimTranscript(small, 1_000_000), small);
});

test('the most recent turn groups are always kept whole', () => {
  const { groups } = T.turnGroups(runFor(16));
  assert.ok(groups.length >= T.KEEP_RECENT_GROUPS, `expected at least ${T.KEEP_RECENT_GROUPS} groups, got ${groups.length}`);
  const last = groups[groups.length - 1];
  assert.equal(last[0].role, 'assistant');
  assert.ok(last.slice(1).every((m) => m.role === 'tool'));
});

test('an unfittable transcript runs over budget rather than losing its task', () => {
  // A single step whose results exceed the whole budget cannot be trimmed to fit. The contract is
  // that it runs long, not that it forgets the request.
  const huge = [sys, request, ...step(0, 4).map((m) => (m.role === 'tool' ? { ...m, content: 'X'.repeat(20_000) } : m))];
  const out = T.trimTranscript(huge, MAX);
  assert.ok(T.transcriptChars(out) > MAX, 'this case genuinely cannot fit');
  assert.equal(out.filter((m) => m.pinned).length, 1, 'and the request is still there anyway');
  assert.deepEqual(T.orphanedToolMessages(out), []);
});

test('turnGroups keeps the head and groups the rest correctly', () => {
  const { head, groups } = T.turnGroups([sys, request, ...step(0, 2), ...step(1, 1)]);
  assert.deepEqual(head.map((m) => m.role), ['system', 'user']);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].map((m) => m.role), ['assistant', 'tool', 'tool']);
  assert.deepEqual(groups[1].map((m) => m.role), ['assistant', 'tool']);
});

test('carried-over history is droppable but the pinned request is not', () => {
  // A run starts as [system, ...up to 14 history messages, request]. History is what SHOULD go.
  const history = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'H'.repeat(4000) }));
  const llm = T.trimTranscript([sys, ...history, request, ...step(0, 2)], MAX);
  assert.equal(llm.filter((m) => m.pinned).length, 1);
  assert.ok(llm.filter((m) => m.content.startsWith('H')).length < history.length, 'history should have been evicted');
});
