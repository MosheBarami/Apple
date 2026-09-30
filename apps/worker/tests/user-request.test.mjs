import test from 'node:test';
import assert from 'node:assert/strict';
import { lastUserText } from '../src/user-request.ts';

test('lastUserText: the run\'s pinned message is the request; the steers the run sends as the user are not', () => {
  const llm = [
    { role: 'system', content: 'rules' },
    { role: 'user', content: 'an earlier request' },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: '  Make me a Plants vs Brainrots game, but the brainrots are fruit.  ', pinned: true },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'Keep going: call judge_game now.' },
  ];
  assert.equal(lastUserText(llm), 'Make me a Plants vs Brainrots game, but the brainrots are fruit.');
  assert.equal(lastUserText([{ role: 'user', content: [{ type: 'text', text: 'a candy obby' }], pinned: true }]), 'a candy obby');
  assert.equal(lastUserText([{ role: 'user', content: 'steer only' }]), undefined);
});
