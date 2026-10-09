// Handoff 2026-10-09 section 9: prove the model RECEIVES pixels, from the serialized request the provider sends to the
// Workers AI binding, not from a message saying a screenshot was taken.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { EVIDENCE_MARK, withEvidence } from '../src/evidence.ts';

// A 1x1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const img = { mediaType: 'image/png', base64: PNG, width: 1, height: 1, label: 'studio_viewport' };

test('the pictures go into the next step once, and are dropped on the step after', () => {
  const start = [{ role: 'user', content: 'build a tower' }];
  const withPics = withEvidence(start, [img]);
  assert.equal(withPics.length, 2);
  assert.equal(withPics[1].content[1].type, 'file');
  assert.match(withPics[1].content[0].text, /not a message from the person/);
  assert.equal(withEvidence(start, []), undefined, 'nothing to add or remove: no override');
  const later = withEvidence([...withPics, { role: 'assistant', content: 'ok' }], []);
  assert.deepEqual(later.map((m) => m.role), ['user', 'assistant'], 'the evidence message is gone');
});

test('the serialized Workers AI request carries the image as an image_url data URL', async () => {
  const sent = [];
  const binding = {
    run: async (model, inputs) => {
      sent.push({ model, inputs });
      return { response: 'I see a grey tower.', usage: { prompt_tokens: 10, completion_tokens: 5 } };
    },
  };
  const workersai = createWorkersAI({ binding });
  const messages = withEvidence([{ role: 'user', content: 'build a tower' }], [img]);
  await generateText({ model: workersai('@cf/moonshotai/kimi-k2.7-code'), messages });
  assert.equal(sent.length, 1);
  const user = sent[0].inputs.messages.filter((m) => m.role === 'user').at(-1);
  assert.ok(Array.isArray(user.content), 'a multi-part user message');
  assert.ok(user.content.some((p) => p.type === 'text' && p.text.startsWith(EVIDENCE_MARK)));
  const image = user.content.find((p) => p.type === 'image_url');
  assert.equal(image.image_url.url, `data:image/png;base64,${PNG}`, 'the exact pixels reach the binding');
});
