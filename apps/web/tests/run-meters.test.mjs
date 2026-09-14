// What a run is costing must be visible while it runs.
//
// THE GAP: the worker tracked `sparksSpent` and `neuronsUsed` per run and sent neither. The only
// cost the client ever received was the `quota` message — whole-account state. So the figure a user
// watching a build can actually act on ("this run has spent 6 Sparks, step 9 of 16") was the one
// figure the server had and never transmitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const ROOT = join(WEB, '..', '..');

const SHARED = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
const SESSION = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'do', 'session.ts'), 'utf8');
const SOCKET = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
const THINKING = readFileSync(join(WEB, 'src', 'components', 'ws', 'thinking.tsx'), 'utf8');

test('the wire carries per-run cost, separately from account-wide quota', () => {
  const status = SHARED.slice(SHARED.indexOf("type: 'agent_status'"), SHARED.indexOf("| { type: 'quota'"));
  assert.match(status, /sparksSpent\?: number/);
  // The account-wide message must still exist and stay distinct — they answer different questions.
  assert.match(SHARED, /\{ type: 'quota'; quota: QuotaState \}/);
});

test('the worker actually sends it, not just declares it', () => {
  // A field on the type that nothing populates is the same as no field.
  const sends = [...SESSION.matchAll(/type: 'agent_status'[\s\S]{0,320}?\}\)/g)].map((m) => m[0]);
  assert.ok(sends.length >= 2, `expected several agent_status broadcasts, found ${sends.length}`);
  const withCost = sends.filter((s) => s.includes('sparksSpent'));
  assert.ok(withCost.length >= 2, 'the step-level broadcasts must carry the run cost');
});

test('the client carries it forward between settlements', () => {
  // Cost settles once per step while the phase changes several times within one. Without the
  // carry-forward the figure flickers back to nothing mid-step.
  assert.match(SOCKET, /sparksSpent: msg\.sparksSpent \?\? prev\?\.sparksSpent/);
  assert.match(SOCKET, /sparksSpent\?: number/, 'AgentStatus must declare it');
});

test('the UI shows it, and does not display a confident zero before anything is spent', () => {
  assert.match(THINKING, /status\.sparksSpent > 0/, 'an opening run must not render "0 Sparks"');
  // Matched on the fragment JSX actually produces: the plural expression splits the sentence, so
  // the literal "Sparks this run" never appears contiguously in the source.
  assert.match(THINKING, /'Sparks'\} this run/);
  // Singular and plural, because the string is shown verbatim.
  assert.match(THINKING, /status\.sparksSpent === 1 \? 'Spark' : 'Sparks'/);
});

test('step progress is shown as a real fraction, never invented', () => {
  // Only when BOTH numbers are known — a step count with no total is a progress bar with no end,
  // which reads as progress the product cannot actually promise.
  assert.match(THINKING, /status\?\.step != null && status\?\.totalSteps != null/);
});

test('the cost shown is the worker\'s settled figure, not a client-side estimate', () => {
  // The client must never compute Sparks itself: it does not see neurons, prices or the settlement,
  // and an estimate rendered beside real ones is indistinguishable from them.
  assert.equal(/NEURONS_PER_SPARK/.test(THINKING), false, 'the UI must not price anything itself');
  assert.equal(/sparksFor|Math\.ceil\([^)]*neuron/i.test(THINKING), false, 'no client-side Spark arithmetic');
});

/* ======================================================================================
 * AND WHAT IT COST ONCE IT HAS FINISHED.
 *
 * The header of this file says the cost must be visible WHILE a run runs, and that scope is
 * exactly what left the real defect open. Two facts about the shipping code combined:
 *
 *   1. `agent_status.sparksSpent` is broadcast at the TOP of each step, and that step settles its
 *      true neuron cost AFTERWARDS. So every figure the user ever saw was one settlement behind,
 *      and the final step's settlement — usually the largest, being the one that finishes the
 *      build — was never broadcast by anything.
 *   2. The client clears `agentStatus` on `msg_end`, so the display vanished at precisely the
 *      moment the number would have become correct.
 *
 * Between them, a user could not see what a run cost: not during, because it was stale, and not
 * after, because it was gone. The account-wide `quota` message is not a substitute — it answers
 * "what is left today", not "what did that build cost me".
 * ==================================================================================== */

// Comments are blanked before slicing. Five source-text checks in this repository have matched
// their own explanatory prose, and the comments added for THIS change name `sparksSpent` and
// `msg_end` repeatedly — so an unblanked match here would be self-satisfying by construction.
function blankComments(src) {
  let out = '';
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i += 1; }
      out += '\n';
    } else if (src[i] === '/' && src[i + 1] === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i += 1; }
      out += '  '; i += 1;
    } else {
      out += src[i];
    }
  }
  return out;
}

const SHARED_CODE = blankComments(SHARED);
const SESSION_CODE = blankComments(SESSION);
const SOCKET_CODE = blankComments(SOCKET);
const TURN_CODE = blankComments(readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8'));

test('blankComments really does erase prose — the control for every check below', () => {
  // Without this, each assertion beneath could be satisfied by the paragraph above it.
  assert.match(SHARED, /agent_status\.sparksSpent/, 'the prose naming the field must exist');
  assert.equal(/agent_status\.sparksSpent/.test(SHARED_CODE), false, 'and must not survive blanking');
  assert.match(SHARED_CODE, /msg_end/, 'while the code itself survives');
});

test('THE DEFECT: msg_end carries the settled cost, because nothing else can', () => {
  const msgEnd = SHARED_CODE.slice(SHARED_CODE.indexOf("type: 'msg_end'"), SHARED_CODE.indexOf("| { type: 'quota'"));
  // Measured with whitespace collapsed: blanking a comment leaves its bytes behind as spaces, so
  // a raw length bound would be measuring the prose it just erased rather than the declaration.
  const dense = msgEnd.replace(/\s+/g, ' ').trim();
  assert.ok(dense.length > 0 && dense.length < 600, `the msg_end member must be found and bounded, got ${dense.length}`);
  assert.match(msgEnd, /sparksSpent\?: number/, 'msg_end must declare the settled run cost');
});

test('the worker populates it on the run-ending broadcast, not just declares it', () => {
  const sends = [...SESSION_CODE.matchAll(/type: 'msg_end'[\s\S]{0,240}?\}\)/g)].map((m) => m[0]);
  assert.ok(sends.length >= 1, 'the worker must broadcast msg_end at all');
  assert.ok(
    sends.every((s) => /sparksSpent/.test(s)),
    'EVERY msg_end broadcast must carry the settled cost — a run that ends by error or quota cost the user just as much as one that ends cleanly',
  );
});

test('the cost is kept on the MESSAGE, because msg_end destroys the status that held it', () => {
  // This pairing is the whole fix. Asserting the carry alone would still pass if someone moved the
  // figure back onto AgentStatus, where the very next line deletes it.
  const handler = SOCKET_CODE.slice(SOCKET_CODE.indexOf("case 'msg_end'"), SOCKET_CODE.indexOf("case 'run_intent'"));
  const denseHandler = handler.replace(/\s+/g, ' ').trim();
  assert.ok(denseHandler.length > 0 && denseHandler.length < 1200, `the msg_end handler must be found and bounded, got ${denseHandler.length}`);
  assert.match(handler, /setAgentStatus\(null\)/, 'the status is cleared here — this is why the cost cannot live there');
  assert.match(handler, /sparksSpent: msg\.sparksSpent \?\? item\.sparksSpent/, 'and the settled figure must be written onto the message');
  assert.match(SOCKET_CODE, /sparksSpent\?: number/, 'ChatItem must declare it');
});

test('the finished turn renders it, and never renders a zero', () => {
  assert.match(TURN_CODE, /item\.sparksSpent != null && item\.sparksSpent > 0/, 'absent and zero must both render nothing');
  assert.match(TURN_CODE, /item\.sparksSpent === 1 \? 'Spark' : 'Sparks'/, 'singular and plural are both shown verbatim');
});

test('the finished turn does not price anything itself either', () => {
  // Same rule as the in-flight card: the client never sees neurons or the settlement, so any
  // arithmetic here would be an estimate rendered indistinguishably beside real figures.
  assert.equal(/NEURONS_PER_SPARK/.test(TURN_CODE), false, 'the turn must not price anything itself');
  assert.equal(/sparksFor|Math\.ceil\([^)]*neuron/i.test(TURN_CODE), false, 'no client-side Spark arithmetic');
});
