// Re-indexing must be a difference, not a repetition.
//
// WHAT THIS IS ABOUT. `upload.mjs` resumed from a hash of the WHOLE chunks.jsonl, so changing one
// guide page re-uploaded all 8,326 passages and re-embedded ~8,000 of them. A one-word fix cost a
// full corpus build, which is the real reason the corpus was never refreshed: the cheapest
// available action was to leave it alone.
//
// And the plan was built from a LOCAL file recording what the uploader believed it had sent. What
// the index holds is a different fact. The two diverge on every interrupted run and every replaced
// database, and the difference is invisible: both produce a plan, both look like progress.
//
// Every function here is pure, so the test supplies the manifest — including the one that could not
// be read, which is the case that decides whether an incremental update quietly becomes a full
// re-embed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { batchWork, changedDocs, chunkHash, planFullIndex, planIndex, PLAN_REASONS } from './index-plan.mjs';

const chunk = (vecId, over = {}) => ({
  vecId,
  docSlug: `doc-${vecId.split('-')[0]}`,
  title: `Title ${vecId}`,
  url: `https://create.roblox.com/docs/${vecId}`,
  kind: 'guide',
  text: `The body of ${vecId}.`,
  embed: true,
  ...over,
});

/** A manifest that agrees with these chunks exactly. */
const manifestFor = (chunks, over = {}) => ({
  entries: chunks.map((c) => ({ vecId: c.vecId, contentHash: chunkHash(c), embedded: c.embed === true, ...over })),
});

/* ================================== the content hash ======================================== */

test('the hash tracks CONTENT and ignores whether a vector exists', () => {
  const c = chunk('a-1');
  assert.equal(chunkHash({ ...c, embed: false }), chunkHash(c), 'the embed flag is a property of the index, not of the text');
  assert.notEqual(chunkHash({ ...c, text: 'changed' }), chunkHash(c));
  assert.notEqual(chunkHash({ ...c, title: 'changed' }), chunkHash(c));
  assert.notEqual(chunkHash({ ...c, url: 'https://elsewhere' }), chunkHash(c));
});

test('two different chunks cannot hash the same by sliding a field boundary', () => {
  // Joining the fields on a space makes these two identical — both flatten to `a b c` followed by
  // the same trailing separators — and two different chunks with one hash means one of them is
  // never re-indexed again, ever.
  //
  //[[ THE FIRST VERSION OF THIS TEST WAS VACUOUS, and the falsification is what said so. It used
  //   `{docSlug:'a', title:'b'}` against `{docSlug:'a b', title:''}`, which do NOT collide under a
  //   space join: moving a word also moves which field is empty, and the trailing separators then
  //   differ ("a b   " vs "a b    "). Swapping the join to a space turned nothing red. F-58's rule
  //   — a break that reports 0 red usually means the break or the fixture is mis-aimed — applied
  //   to the fixture. A collision needs the moved word to land in a field that is NOT empty. ]]
  const a = { docSlug: 'a', title: 'b c', url: '', kind: '', text: '' };
  const b = { docSlug: 'a b', title: 'c', url: '', kind: '', text: '' };
  assert.notEqual(chunkHash(a), chunkHash(b), 'two different chunks hash the same');
});

/* ================================== the unknown manifest ==================================== */

test('A MANIFEST THAT COULD NOT BE READ IS REFUSED, not treated as an empty index', () => {
  // THE DEFECT THIS GUARD EXISTS FOR. `null` and `{entries: []}` produce opposite plans — "I do not
  // know" and "the index is empty" — and the second one silently re-embeds the whole corpus at real
  // cost while the log says "incremental update".
  assert.throws(() => planIndex(null, [chunk('a-1')]), /unknown|manifest/i);
  assert.throws(() => planIndex(undefined, [chunk('a-1')]), /unknown|manifest/i);

  // And the two cases it is being told apart from are genuinely different plans.
  const genuinelyEmpty = planIndex({ entries: [] }, [chunk('a-1')]);
  assert.equal(genuinelyEmpty.summary.add, 1);
  assert.equal(genuinelyEmpty.manifestKnown, true);

  const deliberate = planFullIndex([chunk('a-1')], 'operator asked for it');
  assert.equal(deliberate.summary.add, 1);
  assert.equal(deliberate.manifestKnown, false, 'a full index must record that it was not based on a manifest');
  assert.equal(deliberate.full, true);
  assert.deepEqual(deliberate.remove, [], 'without a manifest, nothing may be deleted — there is nothing to compare against');
});

/* ================================== the incremental claim =================================== */

test('EDITING ONE PAGE RE-INDEXES ONE PAGE', () => {
  // The whole point. 100 chunks indexed, one changed: the plan must touch one.
  const indexedChunks = Array.from({ length: 100 }, (_, i) => chunk(`c-${i}`));
  const manifest = manifestFor(indexedChunks);
  const desired = indexedChunks.map((c, i) => (i === 42 ? { ...c, text: 'a sentence was corrected here' } : c));

  const plan = planIndex(manifest, desired);
  assert.equal(plan.summary.update, 1, `${plan.summary.update} chunks planned for re-upload instead of 1`);
  assert.equal(plan.summary.unchanged, 99);
  assert.equal(plan.summary.add, 0);
  assert.equal(plan.summary.remove, 0);
  assert.equal(plan.update[0].chunk.vecId, 'c-42', 'the wrong chunk was selected');
  assert.equal(plan.update[0].reason, PLAN_REASONS.changed);
});

test('an index already in step plans NOTHING', () => {
  const chunks = Array.from({ length: 20 }, (_, i) => chunk(`c-${i}`));
  const plan = planIndex(manifestFor(chunks), chunks);
  assert.deepEqual([plan.summary.add, plan.summary.update, plan.summary.reembed, plan.summary.remove], [0, 0, 0, 0]);
  assert.equal(plan.summary.unchanged, 20);
  assert.deepEqual(batchWork(plan), [], 'nothing to do must mean no batches, not one empty one');
});

test('a passage indexed WITHOUT a hash cannot be declared unchanged', () => {
  // The index predates content hashing, or the row was written by an older uploader. An unknown
  // hash must never compare equal to a computed one — that is how an "unchanged" verdict gets
  // issued about a passage nobody looked at.
  const c = chunk('a-1');
  for (const missing of [null, undefined, '', 0, {}]) {
    const plan = planIndex({ entries: [{ vecId: 'a-1', contentHash: missing, embedded: true }] }, [c]);
    assert.equal(plan.summary.unchanged, 0, `contentHash ${JSON.stringify(missing)} was accepted as proof of sameness`);
    assert.equal(plan.summary.update, 1);
    assert.equal(plan.update[0].reason, PLAN_REASONS.unhashed);
  }
  // The control: a real matching hash IS proof.
  assert.equal(planIndex({ entries: [{ vecId: 'a-1', contentHash: chunkHash(c), embedded: true }] }, [c]).summary.unchanged, 1);
});

test('unchanged text with a missing VECTOR is a re-embed, not a rewrite and not a shrug', () => {
  // This is the source-side half of the `unembedded-index` outcome: an index full of rows and
  // empty of vectors answers keyword-only and looks healthy.
  const c = chunk('a-1', { embed: true });
  const plan = planIndex({ entries: [{ vecId: 'a-1', contentHash: chunkHash(c), embedded: false }] }, [c]);
  assert.equal(plan.summary.reembed, 1);
  assert.equal(plan.summary.unchanged, 0, 'a passage with no vector is not "already indexed"');
  assert.equal(plan.summary.update, 0, 'and its text does not need rewriting');
  assert.equal(plan.reembed[0].reason, PLAN_REASONS.unembedded);

  // The control: an FTS-only chunk does not want a vector, so its absence is not a defect.
  const ftsOnly = chunk('b-1', { embed: false });
  const ok = planIndex({ entries: [{ vecId: 'b-1', contentHash: chunkHash(ftsOnly), embedded: false }] }, [ftsOnly]);
  assert.equal(ok.summary.unchanged, 1);
  assert.equal(ok.summary.reembed, 0);
});

test('a passage deleted upstream is planned for removal', () => {
  // A page removed from the documentation keeps answering questions forever otherwise — the most
  // confident kind of stale, because it is retrieved and cited exactly like a live one.
  const gone = chunk('gone-1');
  const kept = chunk('kept-1');
  const plan = planIndex(manifestFor([gone, kept]), [kept]);
  assert.deepEqual(plan.remove, ['gone-1']);
  assert.equal(plan.summary.unchanged, 1);
});

test('two chunks under one id are refused rather than resolved by whichever came last', () => {
  // F-48: one provenance id, two records, and last-write-wins decided which verdict survived.
  assert.throws(() => planIndex({ entries: [] }, [chunk('a-1'), chunk('a-1', { text: 'different' })]), /duplicate/i);
});

test('a chunk with no id is refused', () => {
  assert.throws(() => planIndex({ entries: [] }, [{ text: 'orphan' }]), /vecId/);
});

/* ================================== reporting and batching ================================== */

test('the plan rolls up to the documents a human can check', () => {
  const plan = planIndex({ entries: [] }, [chunk('a-1'), chunk('a-2'), chunk('b-1')]);
  const docs = changedDocs(plan);
  assert.deepEqual(docs.map((d) => d.docSlug), ['doc-a', 'doc-b']);
  assert.equal(docs[0].added, 2);
  assert.equal(docs[1].added, 1);
});

test('batches are homogeneous and carry the hash that was sent', () => {
  // `/api/admin/embed-batch` takes one `skipVectors` for a whole batch, so a batch that mixes the
  // two either pays for embeddings nobody wanted or skips ones somebody did.
  const desired = [
    ...Array.from({ length: 7 }, (_, i) => chunk(`e-${i}`, { embed: true })),
    ...Array.from({ length: 5 }, (_, i) => chunk(`f-${i}`, { embed: false })),
  ];
  const plan = planIndex({ entries: [] }, desired);
  const batches = batchWork(plan, 3);
  assert.ok(batches.length >= 5);
  for (const b of batches) {
    const flags = new Set(b.chunks.map((c) => c.embed === true));
    assert.equal(flags.size, 1, 'a batch mixed embed and fts-only chunks');
    assert.equal([...flags][0], b.allEmbed, 'the batch flag disagrees with its own contents');
    assert.ok(b.chunks.length <= 3, `batch of ${b.chunks.length} exceeds the size`);
    for (const c of b.chunks) assert.equal(typeof c.contentHash, 'string', 'a chunk was sent without the hash the index will store');
  }
  assert.equal(batches.reduce((n, b) => n + b.chunks.length, 0), 12, 'every planned chunk must end up in exactly one batch');
});

test('the hash a batch carries is the hash of what it carries', () => {
  // If the index stored a hash that did not describe the bytes it was sent, every chunk would look
  // changed on the next run, forever, and the incremental plan would be a full plan wearing a
  // different name.
  const c = chunk('a-1');
  const [batch] = batchWork(planIndex({ entries: [] }, [c]), 50);
  const sent = batch.chunks[0];
  assert.equal(sent.contentHash, chunkHash(sent), 'the stored hash does not match the chunk that was stored');
});
