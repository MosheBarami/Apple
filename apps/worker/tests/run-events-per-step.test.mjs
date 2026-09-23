/**
 * A LIVE RUN'S EVENTS REACH THE LOG WHILE IT IS LIVE.
 *
 * session.ts flushed its buffered events only in finishRun. On 2026-09-23 the owner's Grow-a-Garden
 * run sat 422 s on one step, and `/api/admin/logs?kind=model_call` held nothing newer than 30 minutes
 * earlier: every call of that run was still in the object's memory, where an eviction would have
 * lost it and nobody could read why the step took seven minutes. The alarm is the one place every
 * step, wait and failure passes through, so it flushes there, awaited (waitUntil is a no-op in a DO).
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');

test('every alarm that ran a step flushes the events it recorded, awaited', () => {
  const start = SRC.indexOf('async alarm() {');
  assert.ok(start >= 0, 'alarm() not found');
  const end = SRC.indexOf('\n  }\n', start);
  const body = SRC.slice(start, end);
  const step = body.indexOf('this.runStep(agent)');
  assert.ok(step >= 0, 'the alarm runs the step');
  // A finally after the step covers success, waits and failures alike.
  const fin = body.indexOf('finally', step);
  assert.ok(fin > step, 'the flush sits in a finally after the step');
  assert.match(body.slice(fin), /await flushEvents\(this\.env\)/);
});
