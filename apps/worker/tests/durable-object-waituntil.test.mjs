/**
 * A DURABLE OBJECT MAY NOT HAND WORK TO `waitUntil` — IT DOES NOTHING THERE.
 *
 * Cloudflare's documentation for `DurableObjectState`, verbatim:
 *
 *     "Unlike in Workers, `waitUntil` has no effect in Durable Objects. It does not extend the
 *      lifetime of a Durable Object or affect when a request or RPC completes. [It] is available
 *      on DurableObjectState for API compatibility with Workers Runtime APIs."
 *
 * It exists, so it is truthy, so it is silently a no-op. That is the worst possible shape for a
 * feature detect, and this file exists because session.ts contained four of them:
 *
 *     if (this.ctx.waitUntil) this.ctx.waitUntil(promise);
 *     else await promise;
 *
 * The first branch always ran and did nothing. The second — the one that is actually correct — was
 * dead code that looked like a careful fallback.
 *
 * WHAT IT COST, measured on production before the fix rather than reasoned about after it.
 * `GET /api/admin/logs` by kind:
 *
 *     request     2,499 rows      recorded in the WORKER
 *     audit       2,501 rows      recorded in the WORKER
 *     build           0 rows      recorded in the session Durable Object
 *     model_call      0 rows      recorded in the session Durable Object
 *     error           0 rows      recorded in the session Durable Object
 *
 * A clean split along the isolate boundary, with an un-awaited flush on one side of it. The product
 * had never recorded a single build, and the admin surface reported that as a measurement of zero
 * rather than as an absence. The same pattern also carried the two notifications a user is most
 * likely to want — "Your build finished" and the Credits-exhausted notice.
 *
 * Awaiting costs nothing. A Durable Object stays alive precisely while it has pending I/O, and an
 * await IS pending I/O.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WORKER, 'src');

/** Every Durable Object source file, found by walking — never a hand-written list. */
function doFiles(dir = 'do') {
  const out = [];
  for (const entry of readdirSync(join(SRC, dir)).sort()) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(SRC, rel)).isDirectory()) out.push(...doFiles(rel));
    else if (/\.ts$/.test(entry)) out.push(rel);
  }
  return out;
}

/** Comments are stripped: this file's own explanation quotes the call it forbids. */
const decomment = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = doFiles();

test('the Durable Object sources are being read', () => {
  assert.ok(files.length >= 2, `only ${files.length} DO files found — this test would check nothing`);
  const total = files.reduce((n, f) => n + readFileSync(join(SRC, f), 'utf8').length, 0);
  assert.ok(total > 50_000, 'the DO sources read short — the walk is not reaching the real files');
});

test('no Durable Object hands work to waitUntil', () => {
  const offenders = [];
  for (const file of files) {
    const code = decomment(readFileSync(join(SRC, file), 'utf8'));
    for (const m of code.matchAll(/\bwaitUntil\s*(\?\.)?\s*\(/g)) {
      offenders.push(`${file}:${code.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'waitUntil has no effect in a Durable Object — the work is simply dropped. Await it instead; the '
      + 'object stays alive while it has pending I/O:\n  ' + offenders.join('\n  '),
  );
});

test('the events a run records are flushed before the run method returns', () => {
  // The specific thing that was lost. `finishRun` records the build event and then flushes; the
  // flush has to be awaited, or the object can go idle with the write in flight.
  const code = decomment(readFileSync(join(SRC, 'do', 'session.ts'), 'utf8'));
  const recorded = code.indexOf("kind: 'build'");
  assert.notEqual(recorded, -1, 'the build event is gone — the product records nothing about its own builds');
  // The first awaited flush AFTER the event: the alarm also flushes each step, earlier in the file.
  const flushed = code.indexOf('await flushEvents(this.env)', recorded);
  assert.notEqual(flushed, -1, 'no awaited flush follows the build event — DO-recorded events are dropped, which is how build sat at 0 rows');
});
