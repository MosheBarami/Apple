/**
 * What a release IS, as functions of their inputs.
 *
 * WHY THESE ARE PURE. `scripts/release.mjs` points these rules at the real ledger, the real
 * CHANGELOG.md and the real site page, and the repository is supposed to stay clean — so a rule
 * that only ever sees a healthy repository walks its silent path forever and would be just as
 * green with its body deleted. That is the failure `scripts/lib/offer-rules.mjs` was split out to
 * stop, and it is recorded in docs/FAILURES.md as the house pattern: a rule can only be SHOWN to
 * fire by being handed something that violates it, and the violating input has to come from a
 * test rather than from the tree.
 *
 * Nothing here reads a file, runs git, spawns, or prints. That is the property that makes it
 * testable, and it is the reason `release.mjs` is thin.
 *
 * THE THREE THINGS A RELEASE HAS TO RECONCILE, and every rule below serves one of them:
 *
 *   1. The NUMBER agrees with the CONTENT. A release that removes a capability is not a patch,
 *      whatever the tag says. `bumpFor` derives the bump from the changes themselves, and
 *      `validateLedger` asserts the RELATIONSHIP between consecutive releases rather than the
 *      literal version string — "0.2.0 is what 0.1.0 plus these changes becomes", not "the
 *      version is 0.2.0", which is a claim any typo satisfies.
 *   2. The TAG agrees with the number, and the sequence never goes backwards or repeats. A reused
 *      tag is the one release defect that cannot be fixed after the fact.
 *   3. Every rendering of the release — CHANGELOG.md, the release notes, the marketing page —
 *      says the same thing as the ledger. Generated text that has been hand-edited is drift, and
 *      drift in a changelog is how a product ends up advertising a version it never shipped.
 */

/* ------------------------------------------------------------------- semver --- */

//[[ THE OFFICIAL GRAMMAR, NOT A LOOSE ONE.
//
//   `/(\d+)\.(\d+)\.(\d+)/` accepts `01.2.3` and `1.2.3.4`, and both compare in ways nobody
//   intends. Leading zeros are refused here for the same reason a tag may not be reused: two
//   spellings of one version is a second identity for a thing that must have exactly one. ]]
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * `'1.2.3-canary.4'` → a structure, or `null` for anything that is not a version.
 *
 * NULL RATHER THAN A DEFAULT. An unparseable version must never come back as `0.0.0`: every
 * comparison downstream would then succeed against a value that means "I could not read this",
 * which is the observation-failure shape — a failure to parse rendering as a parse.
 */
export function parseSemver(value) {
  if (typeof value !== 'string') return null;
  const m = SEMVER.exec(value);
  if (!m) return null;
  return {
    raw: value,
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] === undefined ? [] : m[4].split('.'),
    build: m[5] === undefined ? null : m[5],
  };
}

const isNumericIdentifier = (s) => /^(?:0|[1-9]\d*)$/.test(s);

/**
 * Precedence, to the semver spec: build metadata is ignored, and a prerelease sorts BEFORE the
 * release it precedes (`1.0.0-canary.1` < `1.0.0`).
 *
 * THROWS on an unparseable operand instead of answering. A comparator that returns 0 for garbage
 * makes "these two versions are the same" indistinguishable from "one of these is not a version",
 * and every caller here is deciding whether a release may proceed.
 */
export function compareSemver(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (x === null) throw new TypeError(`not a version: ${JSON.stringify(a)}`);
  if (y === null) throw new TypeError(`not a version: ${JSON.stringify(b)}`);
  for (const k of ['major', 'minor', 'patch']) {
    if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  }
  if (x.prerelease.length === 0 && y.prerelease.length === 0) return 0;
  if (x.prerelease.length === 0) return 1;   // a release outranks its own prereleases
  if (y.prerelease.length === 0) return -1;
  const n = Math.max(x.prerelease.length, y.prerelease.length);
  for (let i = 0; i < n; i += 1) {
    const ai = x.prerelease[i];
    const bi = y.prerelease[i];
    if (ai === undefined) return -1;          // a shorter set of identifiers sorts first
    if (bi === undefined) return 1;
    if (ai === bi) continue;
    const an = isNumericIdentifier(ai);
    const bn = isNumericIdentifier(bi);
    if (an && bn) return Number(ai) < Number(bi) ? -1 : 1;
    if (an !== bn) return an ? -1 : 1;        // numeric identifiers are lower than alphanumeric
    return ai < bi ? -1 : 1;
  }
  return 0;
}

/* --------------------------------------------------------------- the changes --- */

//[[ AN EXPLICIT ALLOWLIST, BECAUSE A LOOKUP TABLE IS NOT A GUARD.
//
//   `BUMP[kind]` over an object typed `Record<Kind, Bump>` is a compile-time promise and nothing
//   at runtime: a ledger written by hand — or by a generator, or by a merge — can carry
//   `"kind": "feat"`, get `undefined` back, and be ranked below `patch` by any `>` comparison,
//   so the release that ADDS a feature ships as a patch. Every kind crossing into these rules is
//   checked against this set by name, and an unknown one is a stated problem rather than a
//   silently weaker bump. ]]
export const CHANGE_KINDS = Object.freeze({
  added: { bump: 'minor', heading: 'Added' },
  changed: { bump: 'minor', heading: 'Changed' },
  deprecated: { bump: 'minor', heading: 'Deprecated' },
  removed: { bump: 'major', heading: 'Removed' },
  fixed: { bump: 'patch', heading: 'Fixed' },
  security: { bump: 'patch', heading: 'Security' },
  performance: { bump: 'patch', heading: 'Performance' },
  internal: { bump: 'patch', heading: 'Internal' },
});

/** The order headings appear in a rendering. Derived from the table so the two cannot disagree. */
export const KIND_ORDER = Object.freeze(Object.keys(CHANGE_KINDS));

const BUMP_RANK = Object.freeze({ patch: 1, minor: 2, major: 3 });

export const isChangeKind = (k) => typeof k === 'string' && Object.hasOwn(CHANGE_KINDS, k);

/**
 * The bump a set of changes FORCES, or null when the set contains something unrecognised.
 *
 * Null rather than "patch": the whole point is that the number follows the content, so a set this
 * cannot read must stop a release rather than be assigned the cheapest bump in the table.
 */
export function bumpFor(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return null;
  let rank = 0;
  for (const c of changes) {
    if (c === null || typeof c !== 'object') return null;
    if (!isChangeKind(c.kind)) return null;
    if (c.breaking !== undefined && typeof c.breaking !== 'boolean') return null;
    const bump = c.breaking === true ? 'major' : CHANGE_KINDS[c.kind].bump;
    if (BUMP_RANK[bump] > rank) rank = BUMP_RANK[bump];
  }
  if (rank === 0) return null;
  return Object.keys(BUMP_RANK).find((k) => BUMP_RANK[k] === rank) ?? null;
}

/**
 * The version `current` becomes when `changes` ship.
 *
 * THE 0.x CLAUSE. Semver §4 leaves anything below 1.0.0 unstable, and the convention every
 * ecosystem settled on is that a pre-1.0 project spends its major bumps as minors — which is what
 * this project actually did: v0.1 → v0.2 removed multi-model routing, a breaking change, and the
 * major stayed 0. Encoding the convention means `validateLedger` can assert the real history
 * rather than being told to ignore it.
 */
export function nextVersion(current, changes) {
  const cur = parseSemver(current);
  if (cur === null) return null;
  if (cur.prerelease.length > 0) return null;  // promoting a prerelease is `promote`, not a bump
  const bump = bumpFor(changes);
  if (bump === null) return null;
  const effective = cur.major === 0 && bump === 'major' ? 'minor' : bump;
  if (effective === 'major') return `${cur.major + 1}.0.0`;
  if (effective === 'minor') return `${cur.major}.${cur.minor + 1}.0`;
  return `${cur.major}.${cur.minor}.${cur.patch + 1}`;
}

/* ---------------------------------------------------------------- the tag --- */

export const tagFor = (version) => (parseSemver(version) === null ? null : `v${version}`);

/** `'v1.2.3'` → `'1.2.3'`; anything else, including a bare `1.2.3`, → null. */
export function versionOfTag(tag) {
  if (typeof tag !== 'string' || !tag.startsWith('v')) return null;
  const v = tag.slice(1);
  return parseSemver(v) === null ? null : v;
}

/**
 * A release history's tags, oldest first: every one parses, none repeats, and each is strictly
 * greater than the one before.
 *
 * A REUSED TAG IS THE UNFIXABLE ONE. Everything else about a release can be corrected by shipping
 * another; a tag that pointed at two different builds makes every earlier report ambiguous
 * forever, including this repository's own FALSIFIED records, which cite a sha and a tag.
 */
export function validateTagSequence(tags) {
  const problems = [];
  if (!Array.isArray(tags)) return ['tags is not a list'];
  const seen = new Set();
  let previous = null;
  for (const [i, tag] of tags.entries()) {
    const v = versionOfTag(tag);
    if (v === null) { problems.push(`tag ${i + 1} is not a version tag: ${JSON.stringify(tag)}`); continue; }
    if (seen.has(tag)) { problems.push(`${tag} appears twice — a tag addresses exactly one build`); continue; }
    seen.add(tag);
    if (previous !== null && compareSemver(v, previous) <= 0) {
      problems.push(`${tag} does not come after v${previous} — the sequence goes backwards`);
    }
    previous = v;
  }
  return problems;
}

/* ------------------------------------------------------------- the channel --- */

//[[ CHANNELS ARE AN ALLOWLIST FOR THE SAME REASON KINDS ARE.
//
//   `1.0.0-canry.1` is a valid semver prerelease and a typo. Read as "some prerelease" it would
//   be routed as a canary by anything doing `version.includes('canary')` and as stable by
//   anything checking an exact channel name, and the two halves of a promotion pipeline would
//   disagree about what is in front of them. An unrecognised prerelease is `unknown`, which is a
//   value callers must handle rather than a channel they can ship. ]]
export const CHANNELS = Object.freeze(['stable', 'rc', 'beta', 'canary']);

export function channelOf(version) {
  const v = parseSemver(version);
  if (v === null) return null;
  if (v.prerelease.length === 0) return 'stable';
  const head = v.prerelease[0];
  return CHANNELS.includes(head) && head !== 'stable' ? head : 'unknown';
}

/* -------------------------------------------------------------- the ledger --- */

/** `2026` or `2026-08-30`. Both sort correctly against each other as plain strings. */
const DATE = /^\d{4}(?:-\d{2}-\d{2})?$/;

/**
 * Every way `docs/RELEASES.json` can be wrong, as a list of sentences.
 *
 * NEWEST FIRST, which is the order a changelog is read in. The bump rule therefore looks at each
 * release and the one BELOW it.
 */
export function validateLedger(releases) {
  const problems = [];
  if (!Array.isArray(releases)) return ['the ledger is not a list of releases'];
  if (releases.length === 0) return ['the ledger holds no releases — an empty history is not a history'];

  const seen = new Set();
  for (const [i, r] of releases.entries()) {
    const at = `entry ${i + 1}`;
    if (r === null || typeof r !== 'object' || Array.isArray(r)) { problems.push(`${at} is not a release object`); continue; }
    const v = parseSemver(r.version);
    if (v === null) { problems.push(`${at} has no readable version: ${JSON.stringify(r.version)}`); continue; }
    if (seen.has(r.version)) problems.push(`${r.version} appears twice in the ledger`);
    seen.add(r.version);
    if (typeof r.title !== 'string' || r.title.trim() === '') problems.push(`v${r.version} has no title`);
    if (typeof r.date !== 'string' || !DATE.test(r.date)) problems.push(`v${r.version} has no usable date: ${JSON.stringify(r.date)}`);
    if (r.tag !== undefined && r.tag !== tagFor(r.version)) {
      problems.push(`v${r.version} carries the tag ${JSON.stringify(r.tag)}, which is not ${tagFor(r.version)}`);
    }
    if (!Array.isArray(r.changes) || r.changes.length === 0) {
      problems.push(`v${r.version} lists no changes — a release with nothing in it is not a release`);
      continue;
    }
    for (const [j, c] of r.changes.entries()) {
      const where = `v${r.version} change ${j + 1}`;
      if (c === null || typeof c !== 'object' || Array.isArray(c)) { problems.push(`${where} is not a change object`); continue; }
      if (!isChangeKind(c.kind)) {
        problems.push(`${where} has an unknown kind ${JSON.stringify(c.kind)} — known: ${KIND_ORDER.join(', ')}`);
      }
      if (typeof c.text !== 'string' || c.text.trim() === '') problems.push(`${where} has no text`);
      if (c.breaking !== undefined && typeof c.breaking !== 'boolean') {
        problems.push(`${where} has a non-boolean "breaking": ${JSON.stringify(c.breaking)}`);
      }
    }
  }

  // Ordering and the bump relationship. Both need two readable neighbours, so entries that failed
  // above are skipped here rather than producing a second, less informative problem.
  for (let i = 0; i + 1 < releases.length; i += 1) {
    const newer = releases[i];
    const older = releases[i + 1];
    if (parseSemver(newer?.version) === null || parseSemver(older?.version) === null) continue;
    if (compareSemver(newer.version, older.version) <= 0) {
      problems.push(`v${newer.version} is listed above v${older.version} but does not come after it — the ledger is newest-first`);
    }
    if (typeof newer.date === 'string' && typeof older.date === 'string' && DATE.test(newer.date) && DATE.test(older.date)
      && newer.date < older.date) {
      problems.push(`v${newer.version} is dated ${newer.date}, before v${older.version} at ${older.date}`);
    }
    // THE NUMBER FOLLOWS THE CONTENT. This is the assertion that a literal version string cannot
    // satisfy: v0.2.0 is correct only because v0.1.0 plus a removal becomes v0.2.0.
    const expected = nextVersion(older.version, newer.changes);
    if (expected === null) continue;   // unreadable changes are already reported above
    if (expected !== newer.version) {
      const bump = bumpFor(newer.changes);
      problems.push(
        `v${newer.version} does not follow from v${older.version}: these changes are a ${bump} bump, `
        + `which makes it v${expected}`,
      );
    }
  }
  return problems;
}

/* ------------------------------------------------------------- rendering --- */

const bullet = (c) => `- ${c.breaking === true ? '**BREAKING** ' : ''}${c.text.trim()}`;

/** The one release, as the body of a release note. Groups in `KIND_ORDER`, empty groups omitted. */
export function renderReleaseNotes(release) {
  // A one-entry ledger has no adjacent pair, so this is every rule about the release ITSELF and
  // none of the rules about its relationship to the one before it.
  const problems = validateLedger([release]);
  if (problems.length) throw new TypeError(`cannot render an invalid release: ${problems[0]}`);
  const lines = [`## ${tagFor(release.version)} — ${release.title.trim()}`, '', `_${release.date}_`, ''];
  if (typeof release.lede === 'string' && release.lede.trim() !== '') lines.push(release.lede.trim(), '');
  for (const kind of KIND_ORDER) {
    const group = release.changes.filter((c) => c.kind === kind);
    if (group.length === 0) continue;
    lines.push(`### ${CHANGE_KINDS[kind].heading}`, '');
    for (const c of group) lines.push(bullet(c));
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

/**
 * The whole CHANGELOG.md, byte for byte.
 *
 * IT SAYS IT IS GENERATED, and names the ledger and the generator. `release.mjs --check`
 * regenerates and compares, so a hand-edit here is drift the check reports rather than a change
 * that quietly becomes the truth — the changelog is the one document whose job is to be trusted
 * about the past.
 */
export function renderChangelog(releases, { generator = 'scripts/release.mjs', ledger = 'docs/RELEASES.json' } = {}) {
  const problems = validateLedger(releases);
  if (problems.length) throw new TypeError(`cannot render an invalid ledger: ${problems[0]}`);
  const head = [
    '# Changelog',
    '',
    `<!-- GENERATED by ${generator} from ${ledger}. Edit the ledger, not this file. -->`,
    '',
  ];
  const body = releases.map((r) => renderReleaseNotes(r).trimEnd());
  return `${[...head, body.join('\n\n')].join('\n')}\n`;
}

/**
 * The versions a hand-written page claims, from its `v0.2`-style tags.
 *
 * WHY A PAGE IS CHECKED AT ALL. apps/site/src/pages/changelog.astro is marketing prose and is not
 * generated from the ledger — that is a deliberate difference, because the page is written for a
 * reader and the ledger is written for a machine. What must NOT differ is WHICH releases exist:
 * a page advertising a version the ledger has never heard of is the product claiming to have
 * shipped something, and that claim has to be attached to a real release.
 *
 * Tolerates the two-part spelling the page uses (`v0.2` for 0.2.0), because a marketing heading
 * legitimately drops a zero patch. The comparison is therefore on the (major, minor) pair, which
 * is stated rather than implied so nobody reads this as a full-version check.
 */
export function pageVersions(html) {
  if (typeof html !== 'string') return [];
  const out = [];
  for (const m of html.matchAll(/\bv(\d+)\.(\d+)(?:\.(\d+))?\b/g)) {
    out.push(`${m[1]}.${m[2]}${m[3] === undefined ? '' : `.${m[3]}`}`);
  }
  return [...new Set(out)];
}

/** `'0.2.0'` and `'0.2'` both → `'0.2'`. The precision a marketing heading is allowed to keep. */
export const minorOf = (version) => {
  const v = parseSemver(version);
  if (v !== null) return `${v.major}.${v.minor}`;
  const m = /^(\d+)\.(\d+)$/.exec(String(version));
  return m === null ? null : `${m[1]}.${m[2]}`;
};

/**
 * Both directions between the ledger and a published page.
 *
 * ONE DIRECTION IS NOT ENOUGH, and which one you pick decides which defect you can see. "Every
 * ledger release appears on the page" catches a release nobody announced; "every page version is
 * in the ledger" catches an announcement with no release behind it. The second is the one that
 * lets a product advertise a version it never shipped, which is the defect this repository
 * currently has an instance of, so both are checked and reported separately.
 */
export function ledgerPageAgreement(releases, html) {
  const ledger = new Set(releases.map((r) => minorOf(r.version)).filter((x) => x !== null));
  const page = new Set(pageVersions(html).map(minorOf).filter((x) => x !== null));
  return {
    missingFromPage: [...ledger].filter((v) => !page.has(v)),
    missingFromLedger: [...page].filter((v) => !ledger.has(v)),
  };
}

/**
 * A version a build declares (package.json, a worker constant) against the ledger's head.
 *
 * TWO DIFFERENT FAULTS, NAMED SEPARATELY, because they have opposite causes and opposite fixes:
 *
 *   `unknown` — the build declares a version that was never released. Nothing can be said about
 *   what is in it, and no changelog entry describes it. This is a hard problem.
 *   `behind`  — the build declares an older release than the ledger's head. Real, and reported,
 *   and NOT a failure on its own: between a release being written down and a package being
 *   bumped, this is the true state of the tree, and a check that failed on it would be red for
 *   the whole window in which it is describing reality correctly.
 *
 * `ahead` is a third: a build claiming a version the ledger has not reached. That is the same
 * defect as `unknown` wearing a plausible number, and it is a failure.
 */
export function versionSourceVerdict(declared, releases) {
  if (parseSemver(declared) === null) return { state: 'unreadable', declared, head: null };
  const known = releases.map((r) => r.version).filter((v) => parseSemver(v) !== null);
  if (known.length === 0) return { state: 'unreadable', declared, head: null };
  const head = known.reduce((a, b) => (compareSemver(a, b) >= 0 ? a : b));
  if (compareSemver(declared, head) > 0) return { state: 'ahead', declared, head };
  if (!known.includes(declared)) return { state: 'unknown', declared, head };
  if (declared !== head) return { state: 'behind', declared, head, releasesBehind: known.filter((v) => compareSemver(v, declared) > 0).length };
  return { state: 'current', declared, head };
}
