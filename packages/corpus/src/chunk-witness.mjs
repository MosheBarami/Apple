// chunk-witness.mjs — a TRACKED record of what data/chunks.jsonl says about the documents the
// shipped manifests cite.
//
// WHY THIS EXISTS. `genre-references.json` claims, for each of the official Roblox documents it
// links, a url, a kind, a title and the exact list of chunk ids it occupies in the local corpus.
// The test that made those claims true read `packages/corpus/data/chunks.jsonl` directly — and
// that file is a 10 MB gitignored BUILD ARTEFACT. It exists on a machine that has run `pnpm
// --filter @golem/corpus chunk`; it does not exist in a fresh checkout. So on the runner the test
// did not fail an assertion, it threw ENOENT, `pnpm -r test` bailed at @golem/corpus, and every
// package after it in the recursion never ran at all. CI had been red on this for days.
//
// THE TWO OBVIOUS FIXES ARE BOTH WRONG. Committing chunks.jsonl puts 10 MB of re-derivable cache
// in the history. Skipping the test when the file is missing is worse: it is the shape this
// repository keeps finding in a new costume — a check that reports clean precisely when it cannot
// see the thing it checks.
//
// WHAT THIS DOES INSTEAD. `data/chunks-witness.json` is small (25 documents, 359 chunk ids) and
// tracked, and it records what the corpus SAID on a date, alongside the sha256 and line count of
// the file it was read from. Two different things are then checked in two different places:
//
//   - everywhere, including a fresh checkout: the manifest's claims match the witness.
//   - wherever the corpus is actually present: the witness is RE-DERIVED from chunks.jsonl and
//     must come back byte-identical, hash and counts included.
//
// So the witness cannot quietly drift from the corpus — anyone who has the corpus checks it on
// every test run — and the claim the manifest makes is checked on machines that have never built
// the corpus at all. That is strictly more checking than the version that read the file directly,
// which checked nothing anywhere the file was absent.
//
// Regenerate with:  node scripts/build-chunk-witness.mjs
//
// The generator lives at the repository root because the witness now serves TWO readers with two
// different slug lists — `genre-references.json` here, and `CREATOR_SKILL_REFERENCES` in
// `apps/worker/src/creator-skills.ts`, which is TypeScript and needs esbuild to read. Neither
// package should have to know about the other, so the union is assembled one level up and this
// module stays a library.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CHUNKS_PATH = fileURLToPath(new URL('../data/chunks.jsonl', import.meta.url));
export const WITNESS_PATH = fileURLToPath(new URL('../data/chunks-witness.json', import.meta.url));
export const CHUNKS_REPO_PATH = 'packages/corpus/data/chunks.jsonl';

/** The corpus is a build artefact; a fresh checkout does not have it. */
export const hasChunks = () => existsSync(CHUNKS_PATH);

/**
 * Read chunks.jsonl and record what it says about `slugs`.
 *
 * `documentCount` is the number of documents in the WHOLE corpus, not the number witnessed — it is
 * what the "this is the real official corpus, not a fixture" assertion has always rested on.
 */
export function deriveWitness(slugs, { generatedAt } = {}) {
  const raw = readFileSync(CHUNKS_PATH, 'utf8');
  const lines = raw.trim().split('\n');
  const byDocument = new Map();
  for (const line of lines) {
    const row = JSON.parse(line);
    const rows = byDocument.get(row.docSlug) ?? [];
    // Only the four fields the manifest makes claims about. `text` and `embed` are the bulk of the
    // corpus and nothing asserts anything about them here; carrying them would make the witness as
    // large as the file it stands in for.
    rows.push({ vecId: row.vecId, title: row.title, url: row.url, kind: row.kind });
    byDocument.set(row.docSlug, rows);
  }

  const documents = {};
  const missing = [];
  for (const slug of [...slugs].sort()) {
    const rows = byDocument.get(slug);
    if (!rows) {
      missing.push(slug);
      continue;
    }
    documents[slug] = rows;
  }
  if (missing.length > 0) {
    throw new Error(`these documents are cited but are not in ${CHUNKS_REPO_PATH}: ${missing.join(', ')}`);
  }

  return {
    schemaVersion: 1,
    source: CHUNKS_REPO_PATH,
    generatedAt: generatedAt ?? new Date().toISOString().slice(0, 10),
    sourceSha256: createHash('sha256').update(raw).digest('hex'),
    sourceLines: lines.length,
    documentCount: byDocument.size,
    documents,
  };
}

export function readWitness() {
  const witness = JSON.parse(readFileSync(WITNESS_PATH, 'utf8'));
  if (witness?.schemaVersion !== 1) throw new Error('unsupported chunk witness schema version');
  if (witness.source !== CHUNKS_REPO_PATH) throw new Error('the chunk witness names the wrong source file');
  if (!/^[0-9a-f]{64}$/.test(witness.sourceSha256 ?? '')) throw new Error('the chunk witness has no source hash');
  if (!Number.isSafeInteger(witness.sourceLines) || witness.sourceLines < 1) {
    throw new Error('the chunk witness has no source line count');
  }
  if (!Number.isSafeInteger(witness.documentCount) || witness.documentCount < 1) {
    throw new Error('the chunk witness has no document count');
  }
  if (!witness.documents || Object.keys(witness.documents).length === 0) {
    throw new Error('the chunk witness records no documents, so it can only pass vacuously');
  }
  return witness;
}

/** The witness as the Map shape callers used to build straight out of chunks.jsonl. */
export function witnessedDocuments(witness) {
  return new Map(Object.entries(witness.documents));
}

/**
 * Re-derive a witness from the corpus using THE WITNESS'S OWN slug list.
 *
 * A caller checking that the witness still matches the corpus must not have to know which slugs
 * are in it — the file serves more than one reader, and a check that derived only its own reader's
 * slugs would report a clean match over a file it had read a fraction of. This takes the list from
 * the witness, so whoever runs it checks all of it.
 */
export function rederiveWitness(witness) {
  return deriveWitness(Object.keys(witness.documents), { generatedAt: witness.generatedAt });
}
