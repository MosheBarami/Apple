/**
 * A run that fails must not read the provider's mail out loud.
 *
 * Three of the four ways a run can end badly already produce a real sentence — the dropped step,
 * the busy model, the exhausted capacity — and the fourth did this:
 *
 *     agent.finalText = agent.finalText || `Something went wrong: ${msg}`;
 *
 * `msg` is whatever the upstream threw. It is unredacted, it is written for a machine, and on the
 * path where nothing else classified the failure it became the whole of what the user was told.
 *
 * AND finishRun BROADCASTS ITS `error` ARGUMENT TO THE BROWSER, which the workspace renders as the
 * outcome line. So the raw string had a second route to the screen, and the call sites were feeding
 * it internal notes on every path: 'rate_limited', 'run interrupted', and twice the upstream's own
 * words. That is the same defect the client's error taxonomy exists to prevent, one process
 * upstream of it.
 *
 * The rule asserted here: what crosses the wire is a CODE from a closed set, and the provider's
 * words stay on this side of it — logged, where support can read them, and nowhere else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = readFileSync(join(HERE, '..', 'src', 'do', 'session.ts'), 'utf8');
const SHARED = readFileSync(join(HERE, '..', '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');

/** Every `finishRun(agent, 'error', X)` in the file, with X as written. */
function errorCallArgs() {
  return [...SESSION.matchAll(/finishRun\(\s*agent,\s*'error',\s*([^)]*)\)/g)].map((m) => m[1].trim());
}

test('the closed vocabulary exists and is shared, not retyped on each side', () => {
  assert.match(SHARED, /export const RUN_FAILURES/, 'the codes must be declared once, in @golem/shared');
  assert.match(SHARED, /export type RunFailure\b/);
  assert.match(SESSION, /RUN_FAILURES|RunFailure/, 'session.ts must use the shared vocabulary rather than string literals');
});

test('no finishRun error argument is a free variable — the upstream string never crosses the wire', () => {
  const args = errorCallArgs();
  // Transient provider failures intentionally no longer terminate the run, so the old requirement
  // for three error exits would re-introduce the behavior autonomy removed. Keep the guard
  // non-vacuous while asserting the property over every terminal error path that remains.
  assert.ok(args.length >= 1, `expected at least one terminal error call site, found ${args.length}`);
  for (const a of args) {
    assert.equal(
      /^msg$|^e\.message$|^String\(/.test(a),
      false,
      `finishRun(agent, 'error', ${a}) sends the provider's own words to the browser`,
    );
    assert.match(a, /^'[a-z_]+'$/, `finishRun(agent, 'error', ${a}) is not a code from the closed set`);
  }
});

test('every code sent from here is one the vocabulary declares', () => {
  const declared = new Set([...SHARED.matchAll(/^\s{2}([a-z_]+):\s*'/gm)].map((m) => m[1]));
  const block = SHARED.slice(SHARED.indexOf('RUN_FAILURES'), SHARED.indexOf('RUN_FAILURES') + 2000);
  const inBlock = new Set([...block.matchAll(/\n\s{2}([a-z_]+):/g)].map((m) => m[1]));
  for (const a of errorCallArgs()) {
    const code = a.slice(1, -1);
    assert.ok(inBlock.has(code) || declared.has(code), `'${code}' is broadcast but not declared in RUN_FAILURES`);
  }
});

test('the fallback stops interpolating the error into what the user reads', () => {
  assert.equal(
    /finalText\s*=\s*agent\.finalText \|\| `Something went wrong: \$\{msg\}`/.test(SESSION),
    false,
    'the upstream error string is still being rendered as the reply',
  );
  // And what replaces it answers the question the header of error-taxonomy.ts names first without
  // claiming that nothing was lost: only edits actually applied to Studio are known to be saved.
  assert.match(SESSION, /Work already applied to Studio is saved/, 'the fallback must still say what is known to be preserved');
});

test('the provider’s words survive on the server, for support', () => {
  // Redacting a message the user cannot act on is right; DISCARDING it would make the next
  // report of this failure unanswerable.
  const tail = SESSION.slice(SESSION.indexOf("if (msg === 'CAPACITY_EXHAUSTED')"));
  assert.match(tail, /console\.(warn|error)\([^)]*msg/, 'the raw failure must still be logged');
});
