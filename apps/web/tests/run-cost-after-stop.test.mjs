/**
 * THE COST A RUN SETTLED TO AFTER ITS `msg_end` (review cycle 3, finding 3).
 *
 * Stop while a model step is in flight ends the run at once; the abandoned step is paid for when the provider call
 * resolves, and the worker then sends `run_cost` for that message. Without a client that applies it, the live turn
 * footer kept the msg_end figure (the 1-unit admission) while the stored row and the balance said what the step cost.
 * The worker's side is executed in apps/worker/tests/run-refund.test.mjs; this file is the client's.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withRunCost } from '../src/lib/project-socket-state.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..', '..');

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

const turn = (id, creditsSpent) => ({ id, role: 'assistant', mode: 'agent', content: 'Stopped.', tools: [], streaming: false, createdAt: 1, stopReason: 'stopped', creditsSpent });

test('run_cost puts the settled figure on its own message and nowhere else', () => {
  const list = [turn('a', 1), turn('b', 1)];
  const next = withRunCost(list, 'b', 10);
  assert.equal(next.find((m) => m.id === 'b').creditsSpent, 10);
  assert.equal(next.find((m) => m.id === 'a').creditsSpent, 1, 'another message is untouched');
  assert.equal(list.find((m) => m.id === 'b').creditsSpent, 1, 'the input list is not mutated');
  assert.equal(next.find((m) => m.id === 'b').stopReason, 'stopped', 'nothing else on the message changes');
});

test('run_cost for a message that is not in the list, or a figure that is not a number, changes nothing', () => {
  const list = [turn('a', 1)];
  assert.equal(withRunCost(list, 'missing', 10), list);
  for (const bad of [NaN, Infinity, -1, '10', null, undefined]) {
    assert.equal(withRunCost(list, 'a', bad), list, `a figure of ${String(bad)} must not be shown as a cost`);
  }
});

test('a row loaded from history and a live row agree once run_cost arrives', async () => {
  const { mergeHistoryWithLive } = await import('../src/lib/project-socket-state.ts');
  const live = withRunCost([turn('a', 1)], 'a', 10);
  const history = [{ ...turn('a', 10) }];
  assert.equal(mergeHistoryWithLive(history, live)[0].creditsSpent, 10);
});

test('the hook applies run_cost to the message only: it must not end, pause or clear anything', () => {
  const src = blankComments(readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8'));
  const at = src.indexOf("case 'run_cost':");
  assert.ok(at !== -1, "the hook has no case 'run_cost'");
  const branch = src.slice(at, src.indexOf('break;', at));
  assert.match(branch, /withRunCost\(list, msg\.msgId, msg\.creditsSpent\)/);
  assert.doesNotMatch(branch, /setRunning|setPaused|setAgentStatus/, 'run_cost arrives after msg_end, possibly during the NEXT run: it must not touch run state');
});

test('the wire declares run_cost, and the worker sends it from the abandoned-step settlement', () => {
  const shared = blankComments(readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8'));
  assert.match(shared, /\{ type: 'run_cost'; msgId: string; creditsSpent: number \}/);
  const session = blankComments(readFileSync(join(ROOT, 'apps', 'worker', 'src', 'do', 'session.ts'), 'utf8'));
  const at = session.indexOf('private settleAbandonedStep');
  assert.ok(at !== -1);
  assert.match(session.slice(at, at + 900), /type: 'run_cost', msgId: agent\.msgId, creditsSpent: agent\.creditsSpent/);
});
