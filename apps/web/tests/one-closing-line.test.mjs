/**
 * F-045, 2026-09-23 (Coin Rush 03:10 IDT): a young customer's reply ended with five closings stacked
 * on each other, the last of them this app's own "That run finished without changing anything",
 * and "Stopped." sat directly under "Stopped.". A turn says one thing once (D-UX-2): the outcome
 * row may END the turn — its tone and "Try again" stay — but it must not restate the reply's own
 * closing sentence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'one-closing-')), 'o.mjs');
execFileSync(
  join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'components', 'ws', 'outcome-model.ts'), '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
  { stdio: 'pipe' },
);
const { outcomeLine } = await import(out);

const STALL_REPLY =
  'Apple stopped because it kept re-reading your place instead of building, and nothing in your place was changed. Ask again to continue.' +
  '\n\nYou have not been charged for this run: the 63 Credits it used have been put back.';

test('an incomplete reply that carries the worker\'s closing gets no second sentence — the row and its retry stay', () => {
  const line = outcomeLine('incomplete', undefined, STALL_REPLY);
  assert.ok(line, 'the run still ended incomplete: the row (tone, "Try again") must remain');
  assert.equal(line.tone, 'note');
  assert.equal(line.text, null, `the outcome restated the reply: ${line.text}`);
});

test('CONTROL: an incomplete turn with no reply text still says what happened', () => {
  for (const reply of [undefined, '', '   ']) {
    assert.match(outcomeLine('incomplete', undefined, reply).text, /stopped before it finished/);
  }
});

test('"Stopped." is not drawn under a reply that already ends "Stopped."', () => {
  assert.equal(outcomeLine('stopped', undefined, 'Stopped.').text, null);
  assert.equal(outcomeLine('stopped', undefined, 'I added the coins.\n\nStopped.').text, null);
});

// F-013, 2026-09-23: a failed run read "That step failed on our side. Work already applied to Studio
// is saved." in the reply and "That step failed on our side. Everything up to there is saved…" on
// the outcome row directly beneath it — the refund paragraph after the worker's sentence meant the
// last-paragraph comparison above never matched.
test('a failure the reply already announces is not announced again under it', () => {
  const reply = 'That step failed on our side. Work already applied to Studio is saved.' +
    '\n\nYou have not been charged for this run: the 6 Credits it used have been put back.';
  const line = outcomeLine('error', 'model_failed', reply);
  assert.ok(line, 'the run still ended in a failure: the row (tone, "Try again") must remain');
  assert.equal(line.tone, 'bad');
  assert.equal(line.text, null, `the failure sentence was printed twice: ${line.text}`);
});

test('CONTROL: a stop under the model\'s own prose, and a failure under any reply, keep their sentence', () => {
  assert.match(outcomeLine('stopped', undefined, 'I added three coins so far.').text, /Stopped/);
  assert.ok(outcomeLine('error', 'busy', 'I added three coins so far.').text.length > 20);
  assert.ok(outcomeLine('quota', undefined, 'I added three coins so far.').text.length > 20);
  assert.equal(outcomeLine('done', undefined, 'Done.'), null);
});

test('the turn hands the reply to the model and draws no empty sentence', () => {
  const TURN = readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8');
  assert.match(TURN, /outcomeLine\(item\.stopReason, item\.error, item\.content\)/, 'the turn does not pass its reply to the outcome model');
  assert.match(TURN, /\{outcome\.text && <p className="gx-outcome__text">/, 'a null sentence would render as an empty paragraph');
});

test('the live turn settles on the stored reply msg_end carries, so live and reload read the same', () => {
  const SOCKET = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
  const branch = SOCKET.slice(SOCKET.indexOf("case 'msg_end':"), SOCKET.indexOf("case 'run_intent':"));
  assert.ok(branch.length > 0, 'the msg_end branch was not found — this checks nothing');
  assert.match(branch, /content:[^\n]*msg\.content/, 'msg_end no longer replaces the streamed text with the stored reply');
  const SHARED = readFileSync(join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const member = SHARED.slice(SHARED.indexOf("type: 'msg_end'"), SHARED.indexOf("| { type: 'quota'"));
  assert.match(member, /content\?: string/, 'msg_end.content must stay optional so an older worker still works');
});
