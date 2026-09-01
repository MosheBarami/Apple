// seeds.mjs — the seed manifest, and the policy that decides what a KIND of source
// is even capable of proving about itself.
//
// Mission §J: "The source appendix at the end of this mission is a SEED MANIFEST,
// not the corpus ceiling." So this module deliberately does NOT treat the manifest
// as a closed set. It validates entries, assigns each a discovery strategy, and
// records where an entry came from so a later recursive-discovery pass can add
// siblings without the two becoming indistinguishable.
//
// The load-bearing rule is §H:
//
//     "'Open source' in a forum title is not a license."
//     "A source with no license is not training data by default."
//
// Those two sentences are why `capability` exists. A GitHub repo can carry a
// LICENSE file, so it is *capable* of proving COMMERCIAL_REUSABLE. A DevForum
// thread cannot — whatever its title says — so no amount of parsing a thread
// should ever be able to promote one. Encoding that as a property of the KIND
// makes the mistake unavailable rather than merely discouraged.
//
// No network in this file. Discovery transport lives in ../discover.mjs.

import { UNVERIFIED_LICENCE, UNSCANNED_SECURITY } from './records.mjs';

/** Every kind the manifest may declare, and what it can ever establish on its own. */
export const KIND_POLICY = Object.freeze({
  // A repository has a LICENSE file, an SPDX id and a commit SHA. It can prove
  // everything, and it is the only kind that can.
  repo: {
    canProveLicence: true,
    canContentHash: true,
    strategy: 'github-api',
    note: 'LICENSE file + SPDX + commit SHA are all reachable.',
  },
  // A forum post is a CLAIM about a licence, never the licence itself. §H is
  // explicit. These stay REFERENCE_ONLY at best until a human reads the thread,
  // and the attached asset is governed by Roblox's own terms regardless.
  devforum: {
    canProveLicence: false,
    canContentHash: false,
    strategy: 'manual-review',
    note: "A thread title is a claim, not a licence (§H). Cannot self-promote above REFERENCE_ONLY.",
  },
  // Model/dataset cards carry real licence metadata, but the card and the weights
  // can disagree, and a dataset's licence says nothing about the licences of what
  // was scraped into it. Treated as claim-bearing, not proof-bearing.
  huggingface: {
    canProveLicence: false,
    canContentHash: false,
    strategy: 'hub-api',
    note: "A card's licence field does not cover the provenance of its contents.",
  },
  // First-party Roblox documentation. Reference material we already ingest under a
  // verified licence elsewhere; listed so the manifest is complete, not re-fetched.
  'official-docs': {
    canProveLicence: true,
    canContentHash: false,
    strategy: 'already-ingested',
    note: 'Covered by the existing creator-docs / luau-site ingestion and PROVENANCE.md.',
  },
  // Package indexes. Valuable as a DISCOVERY surface — §J asks for Wally and Pesde
  // to be enumerated rather than searched — but an index is not itself a source.
  registry: {
    canProveLicence: false,
    canContentHash: false,
    strategy: 'enumerate',
    note: 'An index is a place to find sources, not a source.',
  },
  web: {
    canProveLicence: false,
    canContentHash: false,
    strategy: 'manual-review',
    note: 'Unstructured page; nothing can be adjudicated automatically.',
  },
});

export const SEED_KINDS = Object.freeze(Object.keys(KIND_POLICY));

/** Categories are descriptive, not permission-bearing. Kept closed so a typo fails loudly. */
export const SEED_CATEGORIES = Object.freeze([
  'official', 'ui-framework', 'ui-tooling', 'ui-kit', 'motion', 'ux-system',
  'studs', 'world-pack', 'full-game', 'engineering', 'generation', 'huggingface',
]);

const GITHUB_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i;

/** Split a GitHub seed URL into owner/repo. Returns null for anything else. */
export function parseGitHubUrl(url) {
  const m = GITHUB_RE.exec(String(url ?? ''));
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/i, '') };
}

/**
 * Validate one manifest entry. Throws on anything malformed rather than skipping:
 * a seed silently dropped is a source that looks considered and was never looked at.
 */
export function validateSeed(entry) {
  for (const field of ['id', 'url', 'category', 'kind']) {
    if (typeof entry?.[field] !== 'string' || entry[field] === '') {
      throw new Error(`seeds: entry is missing ${field}: ${JSON.stringify(entry)}`);
    }
  }
  if (!SEED_KINDS.includes(entry.kind)) {
    throw new Error(`seeds: unknown kind "${entry.kind}" on ${entry.id}`);
  }
  if (!SEED_CATEGORIES.includes(entry.category)) {
    throw new Error(`seeds: unknown category "${entry.category}" on ${entry.id}`);
  }
  if (entry.kind === 'repo' && !parseGitHubUrl(entry.url)) {
    throw new Error(`seeds: ${entry.id} is kind "repo" but ${entry.url} is not a GitHub repo URL`);
  }
  return entry;
}

/** Validate the whole manifest and index it. Duplicate ids are an error, not a merge. */
export function loadSeeds(manifest) {
  const entries = manifest?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('seeds: manifest has no entries');
  }
  const byId = new Map();
  for (const e of entries) {
    validateSeed(e);
    if (byId.has(e.id)) throw new Error(`seeds: duplicate id ${e.id}`);
    byId.set(e.id, e);
  }
  return {
    entries,
    byId,
    count: entries.length,
    byKind: tally(entries, (e) => e.kind),
    byCategory: tally(entries, (e) => e.category),
  };
}

function tally(items, keyOf) {
  const out = {};
  for (const it of items) out[keyOf(it)] = (out[keyOf(it)] ?? 0) + 1;
  return out;
}

/**
 * The record a seed starts life as, BEFORE any evidence has been examined.
 *
 * Every field that could be mistaken for a verdict is set to the refusing value:
 * §3's default is UNCLEAR_QUARANTINE, and §1 puts the security gate before anything
 * reads the source, so `safe` starts false. A record in this state is a to-do item,
 * not a usable source, and it should be impossible to read it as one.
 */
export function seedRecord(entry, { discoveredAt = null } = {}) {
  validateSeed(entry);
  const policy = KIND_POLICY[entry.kind];
  return {
    id: entry.id,
    url: entry.url,
    category: entry.category,
    kind: entry.kind,
    origin: 'seed-manifest',
    strategy: policy.strategy,
    canProveLicence: policy.canProveLicence,
    canContentHash: policy.canContentHash,
    discoveredAt,
    resolved: false,
    licence: UNVERIFIED_LICENCE,
    security: UNSCANNED_SECURITY,
    provenance: null,
    notes: [policy.note],
  };
}

/**
 * The ceiling a kind may reach on its own evidence.
 *
 * Applied AFTER the licence classifier, never instead of it: the classifier decides
 * what the evidence says, and this decides whether that kind of evidence is allowed
 * to mean it. A DevForum thread claiming MIT is demoted here, with the reason kept,
 * which is the difference between "we refused" and "we failed to notice".
 */
export function capKind(verdict, kind) {
  const policy = KIND_POLICY[kind];
  if (!policy) throw new Error(`seeds: unknown kind ${kind}`);
  if (policy.canProveLicence) return verdict;
  if (verdict.class === 'UNSAFE_EXCLUDED' || verdict.class === 'UNCLEAR_QUARANTINE') return verdict;
  return {
    ...verdict,
    class: 'REFERENCE_ONLY',
    reuse: 'forbidden',
    training: 'forbidden',
    cappedFrom: verdict.class,
    reason:
      `${verdict.reason} — capped to REFERENCE_ONLY because a "${kind}" source cannot prove a ` +
      `licence about itself (§H: a claim in a thread title is not a licence).`,
  };
}
