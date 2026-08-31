// contenthash.mjs — the identity primitive the whole intake pipeline rests on.
//
// SOURCE-INTELLIGENCE.md §2 splits one requirement into two quantities: a fork is
// preserved forever as provenance, but a hundred content-identical forks are one
// piece of evidence. This module answers the identity half — it makes "identical"
// a decidable question instead of a judgement call, so that records.mjs can
// collapse on it without ever having to guess.
//
// No network, no filesystem: callers hand in bytes they already have. CI has no
// credentials and must never make a network call, and nothing downloaded is ever
// executed — this is static analysis of a byte stream and nothing more.

import { createHash } from 'node:crypto';

// Every digest is domain-separated. Without this a file hash could be replayed as
// a merkle leaf, and two different trees could be made to agree.
const DOMAIN = {
  file: 'golem/intake/file/v1\n',
  leaf: 'golem/intake/leaf/v1\n',
  node: 'golem/intake/node/v1\n',
  empty: 'golem/intake/empty/v1\n',
};

function sha256(...parts) {
  const h = createHash('sha256');
  for (const part of parts) h.update(part);
  return h.digest('hex');
}

// String `<` compares UTF-16 code units. That is not lexicographic Unicode order,
// but it *is* the same order on every machine, which is the property the merkle
// root needs. localeCompare is not, and would make the root locale-dependent.
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Normalise a file's bytes to the stream that gets hashed.
 *
 * §2 lists exactly what a fork changes without changing the code — line endings,
 * trailing whitespace, the final newline — and that list is the whole mandate.
 *
 * Everything NOT on it stays in the hash. A fork that edits only comments, or only
 * indentation, or only adds a blank line, therefore produces a DIFFERENT hash and
 * is recorded as divergent. That looks like a bug and is not: recording a
 * difference and rewarding it are separate decisions, and the near-duplicate stage
 * makes the second one, where it will score such a fork as trivially divergent and
 * award it no extra weight. Widening normalisation here to "fix" it would destroy
 * the evidence that stage needs.
 */
export function normaliseFile(input) {
  const text = typeof input === 'string' ? input : Buffer.from(input).toString('utf8');
  const lines = text
    .replace(/\r\n?/g, '\n') // CRLF and lone-CR checkouts are the same file
    .split('\n')
    // Horizontal whitespace only — the newlines are already gone, and stripping
    // leading whitespace would be an indentation rewrite, which §2 does not permit.
    .map((line) => line.replace(/[^\S\n]+$/, ''));

  // A final newline is an editor preference, not content: drop the empty element a
  // trailing newline leaves behind, then re-add exactly one. A trailing BLANK line
  // survives this — that is a whitespace diff *inside* the file, and §2 keeps those.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const body = lines.join('\n');
  return body === '' ? '' : `${body}\n`;
}

/**
 * sha256 over the normalised stream of one file.
 *
 * `path` is deliberately NOT mixed into the digest. §2 wants partial reuse to be
 * measurable — "a fork that adds one file diverges only in that file and still
 * shares every other file's hash" — and that stays true across a rename or a moved
 * directory only when the file hash is content alone. The path binds to the hash
 * one level up, in the merkle leaf, so a move still changes the root.
 */
export function hashFile(path, content) {
  return sha256(DOMAIN.file, normaliseFile(content));
}

/**
 * Merkle root over `{ path: hash }`.
 *
 * Deterministic over the SORTED path list, so neither the order the caller
 * discovered files in nor the order the filesystem happened to iterate them can
 * change the root. Two runs over the same tree must agree or the whole collapse is
 * unsound.
 */
export function merkleRoot(fileHashes) {
  const paths = Object.keys(fileHashes).sort(byCodeUnit);
  if (paths.length === 0) return sha256(DOMAIN.empty);

  // The leaf binds path to content: a file that moves keeps its own hash (that is
  // what makes the move visible as a move) but changes the root.
  let level = paths.map((p) => sha256(DOMAIN.leaf, p, ' ', fileHashes[p]));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      // An odd node is PROMOTED, never duplicated. Duplicating the last node is the
      // classic merkle ambiguity: it lets two different file lists produce one root.
      next.push(i + 1 < level.length ? sha256(DOMAIN.node, level[i], level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0];
}

/** Syntactic tidy of a single path. Layout is preserved; only spelling is normalised. */
export function normalisePath(p) {
  return String(p)
    .replace(/\\/g, '/') // a Windows checkout is the same layout, spelled differently
    .replace(/\/{2,}/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '');
}

// §2 normalises away "the fork's own .git metadata". File mode bits never reach
// this module at all — the input is a path-to-bytes map, so there is nothing to strip.
const isVcsMetadata = (p) => /(^|\/)\.git(\/|$)/.test(p);

/**
 * The single leading directory component to strip, or null.
 *
 * §2: normalise away "the repository's own name where it appears only in a path".
 * In practice a fork renames the archive's top-level directory and nothing else, so
 * stripping that one component is what makes a renamed fork hash identically.
 *
 * The dangerous implementation strips any segment matching the repo name, and then
 * silently rewrites `src/rodux/init.luau` for a repo called `rodux`. The reliable
 * signal is not the name: it is that EVERY path shares one leading directory. That
 * is a wrapper, not layout — genuine source layouts have files at the root (README,
 * LICENSE, default.project.json). The repo name is only used to confirm what the
 * shared component is, never to go hunting for that name deeper in the path.
 */
export function repoPrefix(paths, repoName) {
  if (!repoName || paths.length === 0) return null;

  let head = null;
  for (const p of paths) {
    const slash = p.indexOf('/');
    if (slash <= 0) return null; // a file sits at the archive root: there is no wrapper
    const segment = p.slice(0, slash);
    if (head === null) head = segment;
    else if (segment !== head) return null; // not shared by every path
  }

  // `repo`, plus the archive conventions `repo-<ref>` and `<owner>-<repo>-<sha>`.
  const repo = repoName.toLowerCase();
  const segment = head.toLowerCase();
  const named =
    segment === repo ||
    segment.startsWith(`${repo}-`) ||
    segment.endsWith(`-${repo}`) ||
    segment.includes(`-${repo}-`);
  return named ? head : null;
}

/**
 * `{ path: bytes|string }` becomes `{ normalisedPath: fileHash }`.
 *
 * This is the map ContentRecord.fileHashes carries, and the input to merkleRoot.
 */
export function fileHashes(files, { repo = null } = {}) {
  const kept = [];
  for (const raw of Object.keys(files)) {
    const p = normalisePath(raw);
    if (isVcsMetadata(p)) continue;
    kept.push([p, raw]);
  }

  const prefix = repoPrefix(kept.map(([p]) => p), repo);
  const out = {};
  for (const [p, raw] of kept) {
    const key = prefix ? p.slice(prefix.length + 1) : p;
    // Two inputs collapsing onto one path would silently drop a file from the root.
    // Fail loudly instead: a wrong hash is worse than a failed intake.
    if (Object.hasOwn(out, key)) throw new Error(`intake: two files normalise to the same path: ${key}`);
    out[key] = hashFile(key, files[raw]);
  }
  return out;
}

/** The value that becomes ProvenanceRecord.contentHash and ContentRecord.contentHash. */
export function contentHash(files, options) {
  return merkleRoot(fileHashes(files, options));
}
