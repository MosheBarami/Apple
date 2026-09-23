// F-040 / F-048, 2026-09-23: "Start building" needed two presses, and a greeting opened the question.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WS = readFileSync(join(ROOT, 'apps', 'web', 'src', 'routes', 'workspace.tsx'), 'utf8');
const { isSmallTalk } = await import(join(ROOT, 'packages', 'shared', 'src', 'index.ts'));

test('small talk is talk, and a request with a greeting in front of it is work', () => {
  for (const t of ['hi', 'Hi!', 'thanks', 'ok', 'what can you do', 'שלום']) assert.equal(isSmallTalk(t), true, t);
  for (const t of ['hi, build me a red tower', 'make a coin game', 'fix the lighting']) assert.equal(isSmallTalk(t), false, t);
});

test('the send released by a fresh answer skips the question once, then small talk, then the policy', () => {
  const body = WS.slice(WS.indexOf('const askFirst = ('), WS.indexOf('const send = (text: string'));
  assert.ok(body.length > 50, 'askFirst was not found — this checks nothing');
  const once = body.indexOf('justAnswered.current');
  const talk = body.indexOf('isSmallTalk(text)');
  const owes = body.indexOf('owesAnswer(sourcePolicy)');
  assert.ok(once >= 0 && talk >= 0 && owes >= 0, 'a gate is missing from askFirst');
  assert.ok(once < owes && talk < owes, 'the stale policy is consulted before the fresh answer or the small-talk check');
  assert.match(body, /justAnswered\.current = false/, 'the skip must be spent, or every later message skips the question');
  assert.match(WS, /if \(text\) \{\s*justAnswered\.current = true;[\s\S]{0,80}send\(text\b/, 'the dialog\'s onDone no longer marks its send as answered');
});

// F-052, 2026-09-23: after "Start building" the message went, but the box still held it, and any
// file attached to it was left behind — the held send carried the text only.
const COMPOSER = readFileSync(join(ROOT, 'apps', 'web', 'src', 'components', 'ws', 'composer.tsx'), 'utf8');

test('a held message leaves with its files, and the composer clears when it does', () => {
  assert.match(WS, /setSourceAsk\(\{ held: text, attachments \}\)/, 'the question holds the text without the files');
  assert.match(WS, /send\(text, sourceAsk\.attachments \?\? \[\]\)/, 'the released send drops the attached files');
  assert.match(WS, /if \(send\(text, [^)]*\)\) setSentLater\(/, 'the composer is told a message left only when it really did');
  assert.match(WS, /sentLater=\{sentLater\}/, 'the workspace never tells the composer');
  const effect = COMPOSER.slice(COMPOSER.indexOf('if (sentLater > 0)') - 80, COMPOSER.indexOf('if (sentLater > 0)') + 80);
  assert.match(effect, /afterSentRef\.current\(\)[\s\S]*\[sentLater\]/, 'a later send does not clear the composer');
  const clear = COMPOSER.slice(COMPOSER.indexOf('function afterSent()'), COMPOSER.indexOf('function afterSent()') + 900);
  assert.match(clear, /setText\(''\)/); assert.match(clear, /clearDraft\(draftKey\)/);
  assert.match(COMPOSER, /if \(!onSend\(message, readyAttachments\(staged\)\)\) return false;\s*afterSent\(\);/, 'an ordinary send no longer clears the same way');
});
