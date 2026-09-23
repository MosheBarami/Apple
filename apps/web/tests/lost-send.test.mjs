// F-031, measured twice in production on 2026-09-23: a prompt sent just after a page load or a worker
// deploy vanished from the box, nothing ran, and nothing said so. The socket still read OPEN while the
// server end was already gone, so ws.send accepted the frame and it never arrived.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const HOOK = readFileSync(join(SRC, 'lib', 'use-project-socket.ts'), 'utf8');
const WS = readFileSync(join(SRC, 'routes', 'workspace.tsx'), 'utf8');
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `${a} not found`); return src.slice(i, src.indexOf(b, i + a.length)); };

test('a sent prompt is remembered until the server answers anything', () => {
  const send = between(HOOK, 'const sendChat = useCallback(', 'const signalPresence');
  assert.match(send, /unackedChat\.current = \{ text, localId: id \};/);
  const onMessage = between(HOOK, 'ws.onmessage = (ev) => {', 'ws.onclose');
  const cleared = onMessage.indexOf('unackedChat.current = null;');
  assert.ok(cleared >= 0 && cleared < onMessage.indexOf('handleServerMsg(msg);'), 'an answering frame clears it');
  // Presence is broadcast constantly and says nothing about this prompt; only an answer counts.
  assert.match(onMessage, /if \(msg\.type === 'msg_start' \|\| msg\.type === 'error'[^)]*\) \{\s*unackedChat\.current = null;/);
  assert.doesNotMatch(onMessage, /presence[^\n]*unackedChat\.current = null/);
});

test('if the socket closes first, the prompt is handed back and its bubble removed', () => {
  const onClose = between(HOOK, 'ws.onclose = () => {', 'setConn(');
  assert.match(onClose, /const lost = unackedChat\.current;/);
  assert.match(onClose, /setMessages\(\(list\) => list\.filter\(\(m\) => m\.id !== lost\.localId\)\);/);
  assert.match(onClose, /setLostChat\(\{ text: lost\.text/);
});

test('the workspace puts it back in the box and says so, and never resends it by itself', () => {
  const effect = between(WS, 'useEffect(() => {\n    if (!lostChat) return;', '}, [lostChat, clearLostChat]);');
  assert.match(effect, /setSeed\(lostChat\.text\);/);
  assert.match(effect, /didn't reach Apple/);
  assert.doesNotMatch(effect, /sendChat\(/, 'a resend could double-run a prompt that did arrive');
});

// Measured 2026-09-23 on the owner's first build: the socket was OPEN at both ends, the hello arrived,
// and the server then answered nothing — not the prompt, not a ping. No close ever fired, so the
// handover above never ran and the page said "working" for as long as it stayed open.
test('a prompt nobody answers is handed back after a deadline, not left running forever', () => {
  const send = between(HOOK, 'const sendChat = useCallback(', 'const signalPresence');
  const m = HOOK.match(/const CHAT_ACK_DEADLINE_MS = ([\d_]+);/);
  assert.ok(m, 'the deadline is a named constant');
  const ms = Number(m[1].replace(/_/g, ''));
  assert.ok(ms >= 10_000 && ms <= 60_000, `deadline ${ms}ms: long enough for a slow start, short enough to notice`);
  // Only THIS prompt, still unanswered, on the socket it was sent on: an answered one, or one whose
  // socket was already replaced, must not close a healthy connection.
  assert.match(send, /setTimeout\(\(\) => \{[\s\S]*?unackedChat\.current\?\.localId === id[\s\S]*?wsRef\.current === sentOn[\s\S]*?\.close\(/);
  assert.match(send, /\}, CHAT_ACK_DEADLINE_MS\);/);
});
