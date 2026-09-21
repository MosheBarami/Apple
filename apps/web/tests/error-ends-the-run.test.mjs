/**
 * A REFUSED RUN MUST STOP THE UI SAYING IT IS THINKING.
 *
 * Reproduced end to end against the deployed product on 2026-09-20 by infra/e2e.mjs. A free account
 * asking for Apple MAX gets `product_model_unavailable`. session.ts sends that through `refuseOne`,
 * which sends ONE message and returns — no msg_end, no run_state, no terminal event at all. The
 * harness waited 150 seconds for one and gave up:
 *
 *   ws error msg: product_model_unavailable Apple MAX requires a paid subscription.
 *   Error: chat timeout after 150s; events: presence,hello,studio_status,error
 *
 * The workspace's handler was `toast(message, 'error')` and nothing else, so `running` stayed true
 * and the composer went on showing the agent thinking, underneath a red toast, indefinitely. That
 * is the owner's own description of the product: "the agent always in the thinking fails at
 * something".
 *
 * THIS IS A SOURCE ASSERTION, and it is scoped to the one switch case rather than the file, because
 * a whole-file grep for `setRunning(false)` passes on the six other branches that already call it.
 * The repository uses this shape deliberately for React wiring that cannot be executed here — see
 * the header of customer-journey-state.test.mjs — and its weakness is worth stating: it proves the
 * call is written in that branch, not that React re-rendered. What it does catch is the branch
 * being edited back to a toast and nothing else, which is how this shipped.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'use-project-socket.ts'),
  'utf8',
);

/** The body of one `case '<name>':` in the message switch, up to its `break`/`return`. */
function switchCase(name) {
  const start = SRC.indexOf(`case '${name}':`);
  assert.ok(start > 0, `there is no \`case '${name}':\` in use-project-socket.ts — this test knows `
    + 'no branch, so it has verified nothing. Do not read a pass here as a pass.');
  const rest = SRC.slice(start);
  const end = rest.search(/\n\s*(break;|return;|case '|\})/);
  assert.ok(end > 0, `the \`case '${name}':\` branch could not be bounded`);
  return rest.slice(0, end);
}

test('a terminal server error ends the run, while the informational role-change path is excluded', () => {
  const body = switchCase('error');
  assert.match(body, /msg\.terminal === true/,
    'the branch no longer reads the protocol terminal bit');
  assert.match(body, /msg\.code !== 'role_changed'/,
    'legacy role_changed frames must not terminate a live run');
  assert.match(body, /setRunning\(false\)/,
    'a terminal refusal no longer clears `running`');
  assert.match(body, /setAgentStatus\(null\)/,
    'a terminal refusal clears `running` but leaves a live-looking agent status');
});

test('a notice does NOT end the run, because the run is still going', () => {
  //[[ THE CONTROL, and it is the reason clearing above is correct rather than merely convenient.
  //   The worker has two channels. `notice` is the one for something it spotted while the run
  //   CONTINUES — the comment on that branch says so in as many words. If clearing ever leaks into
  //   it, a live run starts rendering as finished, which is the same defect pointing the other
  //   way. ]]
  const body = switchCase('notice');
  assert.doesNotMatch(body, /setRunning\(false\)/,
    'the notice branch now ends the run. A notice is sent about a run that has NOT failed, so this '
    + 'would render a live run as finished.');
});

test('the terminal branches still clear it, so this is not the only thing holding the state', () => {
  assert.match(switchCase('msg_end'), /setRunning\(false\)/,
    'msg_end no longer clears `running` — the normal ending is broken, and the error branch is now '
    + 'carrying the whole behaviour');
});
