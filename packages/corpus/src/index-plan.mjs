// index-plan.mjs — decide what a re-index actually has to do.
//
//[[ WHY THIS EXISTS. `upload.mjs` had exactly one strategy: send everything.
//
//   Its resume file keys on a hash of the WHOLE chunks.jsonl, so changing one guide page — one
//   line in an 8,326-line file — printed "chunks.jsonl changed since last run — restarting progress
//   from scratch" and re-uploaded all 8,326 passages, re-embedding the 8,000 that carry vectors.
//   The cost of a one-word documentation fix was the cost of a full corpus build, so in practice
//   the corpus was never refreshed at all, and the index quietly aged.
//
//   Worse, the local progress file describes what the UPLOADER believes it sent. What the index
//   actually holds is a different fact, and the two diverge on every interrupted run, every
//   database replacement and every machine that uploads a different corpus. A plan built from the
//   local file alone is a plan built from a belief.
//
//   So: hash every chunk, ask the index what it holds, and compute the difference. And when the
//   index cannot be asked, REFUSE — because "the manifest could not be read" and "the index is
//   empty" produce opposite plans, and defaulting to the second one is how you pay for a full
//   re-embed while believing you did an incremental update. ]]

import { createHash } from 'node:crypto';

/**
 * The identity of a chunk's CONTENT.
 *
 * `embed` is deliberately excluded: whether a passage carries a vector is a property of the index,
 * not of the text, and folding it in here would report a pure re-embed as a content change and
 * rewrite text that never moved. The two axes are tracked separately, which is what lets
 * `reembed` exist as its own outcome.
 */
export function chunkHash(chunk) {
  const parts = [chunk?.docSlug, chunk?.title, chunk?.url, chunk?.kind, chunk?.text].map((v) =>
    v === undefined || v === null ? '' : String(v),
  );
  // NUL, written as an escape so it is visible in source. Joining on a SPACE makes
  // `{docSlug:'a', title:'b'}` and `{docSlug:'a b', title:''}` hash identically, and two different
  // chunks that hash the same are two chunks one of which never gets re-indexed again.
  return createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 16);
}

/** @typedef {{vecId: string, contentHash: string|null, embedded: boolean}} IndexedEntry */

export const PLAN_REASONS = Object.freeze({
  new: 'not in the index',
  changed: 'content hash differs',
  unhashed: 'indexed without a content hash, so it cannot be proven unchanged',
  unembedded: 'content unchanged but the passage carries no vector',
});

/**
 * What must be done to make the index match `desired`.
 *
 * @param {{entries: IndexedEntry[]}|null} indexed  what the index reports it holds; null means the
 *   manifest could not be read, which is refused rather than guessed at.
 * @param {Array<object>} desired  the chunks that should be indexed.
 */
export function planIndex(indexed, desired) {
  //[[ A MANIFEST THAT COULD NOT BE READ IS NOT AN EMPTY MANIFEST.
  //
  //   Treating null as `{entries: []}` plans "add all 8,326", which is indistinguishable from the
  //   correct plan for a genuinely empty index — and costs a full re-embed every time the manifest
  //   endpoint hiccups. The caller has to decide, out loud, with planFullIndex(). ]]
  if (indexed === null || indexed === undefined) {
    throw new Error(
      'planIndex: the index manifest is unknown — call planFullIndex() to deliberately index everything, or fix the manifest read',
    );
  }
  if (!Array.isArray(indexed.entries)) throw new Error('planIndex: manifest.entries must be an array');
  if (!Array.isArray(desired)) throw new Error('planIndex: desired must be an array of chunks');

  const known = new Map();
  for (const e of indexed.entries) {
    if (!e || typeof e.vecId !== 'string' || !e.vecId) continue;
    known.set(e.vecId, {
      // Only a non-empty string is a hash. `null`, `''` and anything else mean "unknown", and an
      // unknown hash must never compare equal to a computed one — that is how an unchanged verdict
      // gets issued about a passage nobody looked at.
      contentHash: typeof e.contentHash === 'string' && e.contentHash.length > 0 ? e.contentHash : null,
      embedded: e.embedded === true,
    });
  }

  const add = [];
  const update = [];
  const reembed = [];
  const unchanged = [];
  const seen = new Set();

  for (const chunk of desired) {
    const id = chunk?.vecId;
    if (typeof id !== 'string' || !id) throw new Error('planIndex: every desired chunk needs a string vecId');
    //[[ F-48: two records under one id, and last-write-wins decided which one survived. An index
    //   keyed by vecId cannot hold both, so a collision is refused here rather than resolved by
    //   whichever line came last in the file. ]]
    if (seen.has(id)) throw new Error(`planIndex: duplicate vecId in desired chunks: ${id}`);
    seen.add(id);

    const hash = chunkHash(chunk);
    const entry = known.get(id);
    const wantsVector = chunk?.embed === true;

    if (!entry) {
      add.push({ chunk, hash, reason: PLAN_REASONS.new });
    } else if (entry.contentHash === null) {
      update.push({ chunk, hash, reason: PLAN_REASONS.unhashed });
    } else if (entry.contentHash !== hash) {
      update.push({ chunk, hash, reason: PLAN_REASONS.changed });
    } else if (wantsVector && !entry.embedded) {
      reembed.push({ chunk, hash, reason: PLAN_REASONS.unembedded });
    } else {
      unchanged.push({ chunk, hash });
    }
  }

  const remove = [...known.keys()].filter((id) => !seen.has(id));

  return {
    add,
    update,
    reembed,
    unchanged,
    remove,
    manifestKnown: true,
    summary: {
      desired: desired.length,
      indexed: known.size,
      add: add.length,
      update: update.length,
      reembed: reembed.length,
      unchanged: unchanged.length,
      remove: remove.length,
    },
  };
}

/**
 * Index everything, deliberately. The only way to get a full plan without a manifest, and it says
 * so in the result so a log can tell the two apart afterwards.
 */
export function planFullIndex(desired, why = 'explicitly requested') {
  const plan = planIndex({ entries: [] }, desired);
  return { ...plan, manifestKnown: false, full: true, why, remove: [] };
}

/**
 * Which DOCUMENTS changed — the chunk plan, rolled up to the page a reader would recognise.
 *
 * A chunk id is an implementation detail (`g-3f21ab90-7`); a docSlug is the page. Rolling up is
 * what makes a refresh reportable ("14 pages changed") rather than a number nobody can check.
 */
export function changedDocs(plan) {
  const touched = new Map();
  const note = (entry, how) => {
    const slug = entry.chunk?.docSlug;
    if (typeof slug !== 'string' || !slug) return;
    const rec = touched.get(slug) ?? { docSlug: slug, added: 0, updated: 0, reembedded: 0 };
    rec[how] += 1;
    touched.set(slug, rec);
  };
  for (const e of plan.add) note(e, 'added');
  for (const e of plan.update) note(e, 'updated');
  for (const e of plan.reembed) note(e, 'reembedded');
  return [...touched.values()].sort((a, b) => (a.docSlug < b.docSlug ? -1 : a.docSlug > b.docSlug ? 1 : 0));
}

/**
 * Group the work into upload batches, each one entirely embed or entirely skip-vectors, because
 * that is the only shape `/api/admin/embed-batch` accepts.
 *
 * The hash travels WITH the chunk, so the index stores the hash of exactly the bytes it was sent.
 * Recomputing it worker-side would let a serialisation difference make every chunk look changed on
 * the next run, forever.
 */
export function batchWork(plan, batchSize = 50) {
  const work = [...plan.add, ...plan.update, ...plan.reembed].map((e) => ({ ...e.chunk, contentHash: e.hash }));
  const embed = work.filter((c) => c.embed === true);
  const fts = work.filter((c) => c.embed !== true);
  const batches = [];
  for (const [list, allEmbed] of [
    [embed, true],
    [fts, false],
  ]) {
    for (let i = 0; i < list.length; i += batchSize) batches.push({ chunks: list.slice(i, i + batchSize), allEmbed });
  }
  return batches;
}
