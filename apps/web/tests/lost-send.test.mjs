// F-031, measured twice in production on 2026-09-23: a prompt sent just after a page load or a worker
// deploy vanished from the box, nothing ran, and nothing said so. The socket still read OPEN while the
// server end was already gone, so ws.send accepted the frame and it never arrived.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVisible } from '../src/lib/run-visibility.ts';

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

// Live Studio run, 2026-09-25: the worker was still running and the assistant card still
// showed its active step, but the local running flag had fallen false and Stop vanished.
// The active assistant turn is a second piece of run evidence until msg_end or run_state
// settles it. In that state Stop must remain available through its HTTP path.
test('an active assistant turn keeps Stop available when the local running flag drifts', () => {
  assert.equal(runVisible(false, [{ role: 'assistant', streaming: true }]), true);
  assert.equal(runVisible(true, []), true);
  assert.equal(runVisible(false, [{ role: 'assistant', streaming: false }]), false);
  assert.equal(runVisible(false, [{ role: 'user', streaming: true }]), false);
  const result = between(HOOK, '  return {\n    conn,', '\n  };\n}');
  assert.match(result, /running:\s*runVisible\(running, messages\)/, 'the workspace must receive the reconciled run state');
  const end = between(HOOK, "case 'msg_end':", "case 'run_state':");
  assert.match(end, /streaming:\s*false/);
  const noRun = between(HOOK, "if (!msg.run) {", 'const run = msg.run;');
  assert.match(noRun, /m\.streaming\s*\?\s*\{\s*\.\.\.m,\s*streaming:\s*false/);
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
  assert.match(send, /setTimeout\(\(\) => \{[\s\S]*?unackedChat\.current\?\.localId === id[\s\S]*?wsRef\.current === sentOn[\s\S]*?(\.close\(|abandon\(sentOn)/);
  assert.match(send, /\}, CHAT_ACK_DEADLINE_MS\);/);
});

// Measured 2026-09-23 on the owner's Grow-a-Garden build: the run went on to step 23 in Studio while the
// page sat on step 11 for six minutes. The socket never closed, so nothing reconnected; the pings kept
// going out every 25 s and nobody checked that a pong ever came back.
test('a socket that stops answering pings is closed so it reconnects and resumes', () => {
  const onOpen = between(HOOK, 'ws.onopen = () => {', 'ws.onmessage');
  const onMessage = between(HOOK, 'ws.onmessage = (ev) => {', 'ws.onclose');
  const m = HOOK.match(/const SOCKET_SILENCE_MS = ([\d_]+);/);
  assert.ok(m, 'the silence limit is a named constant');
  const ms = Number(m[1].replace(/_/g, ''));
  assert.ok(ms > 25_000 && ms <= 90_000, `limit ${ms}ms: longer than one ping interval, short enough to notice`);
  // Any frame is proof of life; the ping tick compares against it and closes a silent socket.
  const heard = onMessage.match(/(\w+)\.current = Date\.now\(\);/);
  assert.ok(heard, 'every received frame is timestamped');
  assert.ok(onMessage.indexOf(heard[0]) < onMessage.indexOf('JSON.parse'), 'stamped before parsing, so any frame counts');
  assert.match(onOpen, new RegExp(`${heard[1]}\\.current = Date\\.now\\(\\);`), 'the clock starts at open');
  assert.match(onOpen, new RegExp(`Date\\.now\\(\\) - ${heard[1]}\\.current > SOCKET_SILENCE_MS[\\s\\S]*?(ws\\.close\\(|abandon\\(ws)`));
  // close() alone waits on a handshake a dead peer never sends; the handover must run now.
  const abandonFn = between(HOOK, 'function abandon(', '\n}');
  assert.match(abandonFn, /\.close\(/);
  assert.match(abandonFn, /onclose\?\.call\(/);
});

test('F-037: a socket stuck in CLOSING is handed over promptly without extra pings', () => {
  const onOpen = between(HOOK, 'ws.onopen = () => {', 'ws.onmessage');
  const tick = HOOK.match(/const SOCKET_WATCH_TICK_MS = ([\d_]+);/);
  assert.ok(tick, 'the connection-state watch has a named interval');
  assert.ok(Number(tick[1].replace(/_/g, '')) <= 5_000, 'a closing socket is noticed within five seconds');
  assert.match(onOpen, /ws\.readyState !== WebSocket\.OPEN[\s\S]*?abandon\(ws, 'closing'\)/,
    'CLOSING hands over to reconnect even if the browser never fires onclose');
  assert.match(onOpen, /Date\.now\(\) - lastPing >= 25_000[\s\S]*?ws\.send\(/,
    'the faster state watch must not send pings more often');
});
