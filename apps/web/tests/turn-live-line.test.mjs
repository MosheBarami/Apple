import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Owner, 2026-09-30: while Apple works the turn shows one live status line; the steps' narration does not stream in
// sections under it, and the reply appears once, settled by msg_end to the stored answer.
test('a working turn shows the live line only; the reply appears when the run ends', () => {
  const src = readFileSync(new URL('../src/components/ws/turn.tsx', import.meta.url), 'utf8');
  assert.match(src, /\{item\.content && !item\.streaming && \(/, 'no reply text while streaming');
  assert.ok(src.indexOf('<Thinking') < src.indexOf('item.content && !item.streaming'), 'the live line is the one thing drawn while working');
  const socket = readFileSync(new URL('../src/lib/use-project-socket.ts', import.meta.url), 'utf8');
  assert.match(socket, /content: typeof msg\.content === 'string' \? msg\.content : item\.content,/, 'msg_end settles the reply to the stored answer');
});
