/**
 * THE RECEIPT NAMED A CATEGORY THE SWEEP NEVER TOUCHED.
 *
 * `eraseProjectData` opens with an R2 step labelled "generated images, audio and attachments" and
 * reports it `erased` — including when there is no bucket at all, because "nothing to delete here"
 * and "this store was not reachable" are both fine reasons for the bytes not to be there. What was
 * NOT fine is that no attachment has ever been written to R2. `putAttachment` puts the file in KV
 * under `att:<project>:<id>` (attachments.ts says why: there was no bucket when it shipped), and
 * the KV block in `eraseProjectData` listed `ws:`, `wsv:`, `wst:`, `image:`, `audio:` and the share
 * keys — and no `att:`. So a customer who attached a design doc to a message and then deleted the
 * project was handed a receipt saying their attachments were erased while the bytes sat in KV for
 * up to ATTACHMENT_TTL_SECONDS, reachable by nothing the product could still be asked to run: the
 * per-attachment DELETE route goes through `withOwnedProject`, and the project row is gone.
 *
 * That is the failure the header of erasure.ts calls worse than no deletion at all, so it is
 * measured against the store the bytes are really in rather than against the label on a step.
 *
 * THE SEEDING GOES THROUGH `putAttachment`, AND THAT IS THE WHOLE DESIGN OF THIS FILE.
 * tests/media-store.test.mjs already asserts that erasure "must cover images, audio AND
 * attachments" — after calling `putMedia(env, 'attachment', …)` itself to create the object. It
 * manufactures a row production has never written, so it stayed green for as long as the defect
 * existed. A test that seeds with the writer the product actually runs cannot do that.
 *
 * Run with:  node --test tests/erasure-attachments.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { attachmentKvKey, attachmentProjectPrefix, putAttachment } from '../src/attachments.ts';
import { d1 } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(mkdtempSync(join(tmpdir(), 'erasure-')), 'erasure.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'erasure.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out],
  { stdio: 'pipe' });
const E = await import(pathToFileURL(out).href);

/** KV with the operations both halves use. Prefix listing is the property under test, so it is real. */
function kv(seed = []) {
  const map = new Map(seed);
  return {
    map,
    async list({ prefix }) {
      return { keys: [...map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) };
    },
    async delete(key) { map.delete(key); },
    async put(key, value, opts) { map.set(key, { value, opts }); },
  };
}

const P1 = 'a1111111-1111-4111-8111-111111111111';
const P2 = 'b2222222-2222-4222-8222-222222222222';
const enc = new TextEncoder();

/** Upload a file the way the route does, and hand back the id the person would hold. */
async function upload(env, projectId, name, text) {
  const stored = await putAttachment(env, projectId, { name, declaredMime: 'text/plain', bytes: enc.encode(text) });
  assert.equal(stored.ok, true, `the fixture upload was refused: ${stored.ok ? '' : stored.verdict.reason}`);
  return stored.attachment.attachmentId;
}

test('the sweep prefix is the literal every attachment in the store was written under', () => {
  // Not a restatement of the implementation: keys are ALREADY in production KV under `att:`, and a
  // rename here would orphan every one of them while both halves of the code kept agreeing with
  // each other — a sweep going clean over data it can no longer see is this file's subject.
  assert.equal(attachmentProjectPrefix(P1), `att:${P1}:`);
});

test('DELETING A PROJECT DELETES THE FILES THE PERSON ATTACHED TO IT', async () => {
  const { CORPUS, close } = d1();
  const KV = kv();
  const env = { CORPUS, KV };
  try {
    const mine = await upload(env, P1, 'design.txt', 'the brief they uploaded');
    const alsoMine = await upload(env, P1, 'server.log', 'a log they pasted in');
    const neighbour = await upload(env, P2, 'design.txt', "another project's file");

    await E.eraseProjectData(env, P1);

    assert.equal(KV.map.has(attachmentKvKey(P1, mine)), false, 'an attachment survived the deletion that reported it erased');
    assert.equal(KV.map.has(attachmentKvKey(P1, alsoMine)), false, 'an attachment survived the deletion that reported it erased');
    assert.equal(KV.map.has(attachmentKvKey(P2, neighbour)), true, "another project's attachment was swept");
  } finally {
    close();
  }
});

test('the receipt counts attachments from the store that held them, not from the label on the R2 step', async () => {
  const { CORPUS, close } = d1();
  const KV = kv();
  const env = { CORPUS, KV };
  try {
    await upload(env, P1, 'design.txt', 'the brief they uploaded');
    await upload(env, P1, 'server.log', 'a log they pasted in');

    const steps = await E.eraseProjectData(env, P1);
    // Deliberately not "some step mentions attachments" — the R2 step has said so all along, over
    // a bucket prefix nothing writes to. The claim has to carry a count from the store that swept.
    const swept = steps.find((s) => s.store === 'kv' && s.target === 'chat attachments');
    assert.ok(swept, 'nothing swept the KV prefix attachments are actually stored under');
    assert.equal(swept.status, 'erased');
    assert.equal(swept.rows, 2, 'the count did not come from the store that performed the sweep');
  } finally {
    close();
  }
});
