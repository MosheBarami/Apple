// The harness's `--agent studio` path: the flag, and one fresh conversation per piece inside the test project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOptions } from '../scripts/eval/run-piece.mjs';
import { evalConversationId } from '../scripts/eval/lib/studio-agent.mjs';

const P = '1ea443f2-6232-43c1-a8bd-f425e2df4f4d';

test('--agent is product by default, studio on request, and nothing else', () => {
  assert.equal(resolveOptions(['U01'], { env: {} }).agent, 'product');
  assert.equal(resolveOptions(['U01', '--agent', 'studio'], { env: {} }).agent, 'studio');
  assert.throws(() => resolveOptions(['U01', '--agent', 'other'], { env: {} }), /--agent is product/);
});

test('a piece gets its own conversation in the test project, in the form the Studio route accepts', () => {
  const id = evalConversationId(P, 'U01', '20261006120000');
  assert.equal(id, `${P}~eval-u01-20261006120000`);
  assert.match(id, /^[0-9a-f-]{36}~[a-z0-9][a-z0-9-]{0,47}$/);
  assert.notEqual(evalConversationId(P, 'U01', '20261006120001'), id);
});
