import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { encodePng } from '../src/png.ts';
import { validateAttachment, MAX_ATTACHMENT_BYTES, MAX_IMAGE_ATTACHMENT_BYTES } from '@apple/shared';
import { putAttachment, promptWithAttachments } from '../src/attachments.ts';
import { inspectAttachmentImage } from '../src/attachment-vision.ts';

function envFor() {
  const rows = new Map();
  return { KV: {
    put: async (key, value, options) => rows.set(key, { value, metadata: options.metadata }),
    getWithMetadata: async key => rows.get(key) ?? { value: null, metadata: null },
  } };
}
const png = await encodePng(new Uint8Array([255, 20, 30, 0, 255, 0]), 2, 1);

test('PNG framing accepts pixels and refuses corrupt, disguised, or oversized bytes', () => {
  assert.equal(validateAttachment({ name: 'view.png', bytes: png }).ok, true);
  const corrupt = png.slice(); corrupt[corrupt.length - 1] ^= 1;
  assert.equal(validateAttachment({ name: 'view.png', bytes: corrupt }).reason, 'invalid_image');
  assert.equal(validateAttachment({ name: 'notes.txt', declaredMime: 'text/plain', bytes: png }).reason, 'not_text');
  assert.equal(validateAttachment({ name: 'view.png', size: MAX_IMAGE_ATTACHMENT_BYTES + 1 }).reason, 'too_large');
  assert.equal(validateAttachment({ name: 'notes.txt', size: MAX_ATTACHMENT_BYTES + 1 }).reason, 'too_large');
});

test('private PNG availability is honest and exact pixels reach vision, with project isolation', async () => {
  const env = envFor();
  const saved = await putAttachment(env, 'owner-project', { name: 'view.png', declaredMime: 'image/png', bytes: png });
  assert.equal(saved.ok, true);
  const id = saved.attachment.attachmentId;
  const prompt = await promptWithAttachments(env, 'owner-project', 'Review this', [saved.attachment]);
  assert.match(prompt, /PIXELS AVAILABLE, NOT YET INSPECTED/);
  assert.match(prompt, new RegExp(id));
  let calls = 0;
  const infer = async (_env, request, options) => {
    calls++;
    assert.equal(request.model, 'vision');
    assert.equal(options.cacheTtl, 0);
    const url = request.messages[1].content.find(x => x.type === 'image_url').image_url.url;
    assert.deepEqual(Buffer.from(url.split(',')[1], 'base64'), Buffer.from(png));
    return { text: 'Visible red and green pixels. Gameplay is unknown.', neurons: 7 };
  };
  const denied = await inspectAttachmentImage(env, 'other-project', { attachmentId: id }, infer);
  assert.equal(denied.inspected, false); assert.equal(calls, 0);
  const result = await inspectAttachmentImage(env, 'owner-project', { attachmentId: id }, infer);
  assert.equal(result.inspected, true); assert.equal(calls, 1);
  assert.equal(result.images[0].sha256, createHash('sha256').update(png).digest('hex'));
  assert.equal(result.neurons, 7); assert.equal(result.gameplayVerified, false);
  const unavailable = await inspectAttachmentImage(env, 'owner-project', { attachmentId: id }, async () => ({ text: '', neurons: 2 }));
  assert.equal(unavailable.inspected, false);
});

// docs/evidence/owner-corpus-*/ is gitignored (D-V3-3, 9ababa90), so the screenshot exists only in the
// owner's own checkout; a clean clone or worktree skips this instead of failing on a missing file.
const NATIVE_SHOT = new URL('../../../docs/evidence/owner-corpus-20260926/lowpoly-lobby-native-studio.png', import.meta.url);
test('the actual native Studio screenshot passes the image rule above the text limit', { skip: !existsSync(NATIVE_SHOT) && 'private fixture is not in this checkout' }, () => {
  const bytes = new Uint8Array(readFileSync(NATIVE_SHOT));
  assert.ok(bytes.length > MAX_ATTACHMENT_BYTES);
  assert.equal(validateAttachment({ name: 'studio.png', declaredMime: 'image/png', bytes }).ok, true);
});
