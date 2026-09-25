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

test('a normal send carries files directly and clears only after success', () => {
  const send = WS.slice(WS.indexOf('const send = (text: string'), WS.indexOf('const lastAssistantId'));
  assert.match(send, /sendChat\(text, mode, attachments, productModel, autonomous\)/);
  assert.doesNotMatch(send, /askFirst|justAnswered|setSourceAsk/);
  const composer = readFileSync(join(ROOT, 'apps', 'web', 'src', 'components', 'ws', 'composer.tsx'), 'utf8');
  assert.match(composer, /if \(!onSend\(message, readyAttachments\(staged\)\)\) return false;\s*afterSent\(\);/);
});
