import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { encodePng } from '../src/png.ts';
import { validateAttachment, MAX_ATTACHMENT_BYTES, MAX_IMAGE_ATTACHMENT_BYTES } from '@studpilot/shared';
import { putAttachment, promptWithAttachments, readAttachment } from '../src/attachments.ts';

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

// RESTATED in M4 (there is no vision in the product): this test used to hand the stored pixels to a vision model through
// inspect_attachment_image. The live properties are that a private PNG stays inside its project and that the prompt DECLARES it
// unseen, so the agent cannot describe a picture nobody looked at.
test('a private PNG stays in its project and is declared NOT SEEN: its pixels reach no model', async () => {
  const env = envFor();
  const saved = await putAttachment(env, 'owner-project', { name: 'view.png', declaredMime: 'image/png', bytes: png });
  assert.equal(saved.ok, true);
  const id = saved.attachment.attachmentId;
  const prompt = await promptWithAttachments(env, 'owner-project', 'Review this', [saved.attachment]);
  assert.match(prompt, /Attached image view\.png: NOT SEEN/);
  assert.match(prompt, /StudPilot cannot look at pictures/);
  assert.doesNotMatch(prompt, /inspect_attachment_image|PIXELS AVAILABLE|NOT YET INSPECTED/, 'no tool is named that does not exist');
  assert.doesNotMatch(prompt, new RegExp(id), 'the attachment id is not handed to the agent: there is nothing to do with it');
  assert.equal(await readAttachment(env, 'other-project', id), null, 'another project cannot read it');
  const mine = await readAttachment(env, 'owner-project', id);
  assert.deepEqual(Buffer.from(mine.bytes), Buffer.from(png), 'the owner still gets the exact bytes back');
  assert.equal(mine.meta.mime, 'image/png');
});

// docs/evidence/owner-corpus-*/ is gitignored (D-V3-3, 9ababa90), so the screenshot exists only in the
// owner's own checkout; a clean clone or worktree skips this instead of failing on a missing file.
const NATIVE_SHOT = new URL('../../../docs/evidence/owner-corpus-20260926/lowpoly-lobby-native-studio.png', import.meta.url);
test('the actual native Studio screenshot passes the image rule above the text limit', { skip: !existsSync(NATIVE_SHOT) && 'private fixture is not in this checkout' }, () => {
  const bytes = new Uint8Array(readFileSync(NATIVE_SHOT));
  assert.ok(bytes.length > MAX_ATTACHMENT_BYTES);
  assert.equal(validateAttachment({ name: 'studio.png', declaredMime: 'image/png', bytes }).ok, true);
});
