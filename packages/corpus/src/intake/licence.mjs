// licence.mjs — §3 of docs/SOURCE-INTELLIGENCE.md, made executable.
//
// Produces a LicenceVerdict per source, with `reuse` and `training` decided
// INDEPENDENTLY. Conflating them is the specific failure §0 exists to prevent:
// MIT grants reuse and says nothing about training; CC-BY grants reuse *if the
// credit survives* and cannot grant training for that same reason; a DevForum
// thread titled "[Open Source]" grants neither.
//
// THE DEFAULT IS UNCLEAR_QUARANTINE. Every path that cannot prove a licence
// must land there, because absence of evidence is not permission. Nothing in
// this file may return an `allowed` verdict without also naming the artefact
// the permission came from, in `evidence` + `evidencePath`, so a verdict is
// auditable rather than asserted.
//
// No network, no filesystem, no execution: the caller reads the checkout and
// passes strings in. That keeps this runnable in CI, which has no credentials.

/**
 * The seven classes of §3. Two of them are never produced here and that is
 * deliberate: UNSAFE_EXCLUDED belongs to the security scanner (§4), and
 * EVALUATION_ONLY is a curation decision (holdout sets), not a property of the
 * licence text. A licence classifier that could mark something unsafe would be
 * a licence classifier making a security claim it cannot support.
 */
export const LICENCE_CLASSES = Object.freeze([
  'COMMERCIAL_REUSABLE',
  'ATTRIBUTION_REQUIRED',
  'COPYLEFT',
  'REFERENCE_ONLY',
  'EVALUATION_ONLY',
  'UNCLEAR_QUARANTINE',
  'UNSAFE_EXCLUDED',
]);

/**
 * SPDX id → §3 class.
 *
 * Two entries are judgement calls rather than transcriptions of the §3 table,
 * so they are argued here rather than left for a reader to reverse-engineer:
 *
 * - MPL-2.0 is file-level copyleft. §3 names GPL/AGPL/CC-BY-SA as COPYLEFT and
 *   does not mention MPL, but reuse of an MPL file would carry a source-
 *   disclosure obligation into the user's own game, which is exactly the test
 *   §3 applies to COPYLEFT. PROVENANCE.md already excludes MPL-2.0 repos (rojo,
 *   StyLua, selene) from the corpus on the same reasoning. COPYLEFT it is.
 *
 * - LicenseRef-Roblox-Terms is REFERENCE_ONLY, not UNSAFE. Roblox's own terms
 *   grant no reuse and no training, but the material is legitimate to read and
 *   cite at retrieval time, which is precisely what REFERENCE_ONLY means.
 */
export const CLASS_BY_SPDX = Object.freeze({
  'MIT': 'COMMERCIAL_REUSABLE',
  'Apache-2.0': 'COMMERCIAL_REUSABLE',
  'BSD-2-Clause': 'COMMERCIAL_REUSABLE',
  'BSD-3-Clause': 'COMMERCIAL_REUSABLE',
  'ISC': 'COMMERCIAL_REUSABLE',
  'Unlicense': 'COMMERCIAL_REUSABLE',
  'CC0-1.0': 'COMMERCIAL_REUSABLE',
  'CC-BY-4.0': 'ATTRIBUTION_REQUIRED',
  'CC-BY-SA-4.0': 'COPYLEFT',
  'GPL-2.0': 'COPYLEFT',
  'GPL-3.0': 'COPYLEFT',
  'AGPL-3.0': 'COPYLEFT',
  'MPL-2.0': 'COPYLEFT',
  'LicenseRef-Roblox-Terms': 'REFERENCE_ONLY',
});

/**
 * Class → reuse verdict. COPYLEFT reads `forbidden` and that is not a slur on
 * it: §3 is explicit that copyleft is excellent reference material which simply
 * may not be reproduced into a user's commercial game. `forbidden` here means
 * "Golem must not emit derived code", never "this source is dangerous" — the
 * `security` verdict is a separate field on a separate axis.
 */
const REUSE_BY_CLASS = Object.freeze({
  COMMERCIAL_REUSABLE: 'allowed',
  ATTRIBUTION_REQUIRED: 'allowed-with-attribution',
  COPYLEFT: 'forbidden',
  REFERENCE_ONLY: 'forbidden',
  EVALUATION_ONLY: 'forbidden',
  UNCLEAR_QUARANTINE: 'forbidden',
  UNSAFE_EXCLUDED: 'forbidden',
});

/**
 * TRAINING RIGHTS — the rule a lawyer-minded reader should be able to check
 * without reading the rest of the file.
 *
 *     training === 'allowed'  ⟺  class is COMMERCIAL_REUSABLE
 *                                AND evidence is not 'none'
 *     everything else         →   'forbidden'
 *
 * Why that shape, class by class:
 *
 * - COMMERCIAL_REUSABLE (MIT, Apache-2.0, BSD, ISC, Unlicense, CC0). These
 *   grant broad rights to use the work and impose only a notice-retention
 *   obligation, which a build pipeline can and does discharge by shipping the
 *   licence text. They are *silent* on training. The project's stated position
 *   is that silence plus a proven grant this broad is a permission; that is a
 *   policy choice, made here, once, and reviewable here.
 *
 * - ATTRIBUTION_REQUIRED (CC-BY). The grant is conditional on the credit
 *   surviving into the downstream work. Model weights cannot carry a credit
 *   line into every future output, so the condition cannot be met and the grant
 *   does not extend to training. Reuse-with-attribution stays allowed because
 *   there the condition *can* be met — see attributionText() below.
 *
 * - COPYLEFT (GPL, AGPL, CC-BY-SA, MPL). Same failure mode, worse: the
 *   obligations attach to derivative works, and a trained model cannot carry
 *   them. Forbidden for training, still fine to read and cite.
 *
 * - REFERENCE_ONLY / EVALUATION_ONLY. Forbidden by definition (§3).
 *
 * - UNCLEAR_QUARANTINE. Forbidden because nothing has been proven. The
 *   `evidence !== 'none'` half of the condition is redundant today — no path
 *   reaches COMMERCIAL_REUSABLE without evidence — and is kept as a standing
 *   invariant so that a future path which forgets to record its evidence fails
 *   closed rather than silently granting training rights.
 *
 * §3's last rule is out of scope here and is not weakened by anything above:
 * user projects are never training data without explicit opt-in, whatever this
 * function returns about a third-party repository.
 */
function trainingFor(cls, evidence) {
  /* Prose is the weakest tier the classifier accepts, and even sentence-scoped
     it is a regex reading English written by someone who was not thinking about
     a classifier. It is good enough to say "this looks reusable, a human should
     confirm"; it is not good enough to license model weights, because a wrong
     `allowed` here costs a licence violation baked into a model and cannot be
     withdrawn afterwards.

     So training requires evidence a machine can check unambiguously: a licence
     FILE or an SPDX identifier. `explicit-terms` clears reuse and never
     training. This is deliberately stricter than the class table alone implies
     — reverse it only with the owner's sign-off. */
  if (cls !== 'COMMERCIAL_REUSABLE') return 'forbidden';
  return evidence === 'license-file' || evidence === 'spdx-header' ? 'allowed' : 'forbidden';
}

/**
 * Full-text detectors, one per licence we can identify from the licence file
 * itself. `all` must every match; `none` must not match at all.
 *
 * These are written to be MUTUALLY EXCLUSIVE, because a file matching two
 * detectors is treated as ambiguous and quarantined — so a sloppy regex does
 * not merely mis-label a source, it silently withdraws a good one. The pairs
 * that actually collide:
 *
 * - AGPL-3.0 vs GPL-3.0. Each licence's body references the other by name, so
 *   only the *title* form ("GNU [AFFERO] GENERAL PUBLIC LICENSE" immediately
 *   followed by its version) is diagnostic; in the cross-references the name
 *   and the version appear in the opposite order. GPL-3.0 additionally refuses
 *   to match a file whose title is AGPL's.
 * - CC-BY-4.0 vs CC-BY-SA-4.0. "Attribution-ShareAlike 4.0" has a hyphen where
 *   "Attribution 4.0" has a space, which already separates them; the explicit
 *   ShareAlike exclusion is belt-and-braces on a verdict worth being sure of.
 * - BSD-3-Clause vs BSD-2-Clause. Same opening paragraph; the third clause
 *   ("Neither the name of...") is the only difference, so 2-Clause is defined
 *   as the opener without it.
 *
 * Version suffixes: the GPL family is emitted as 'GPL-2.0'/'GPL-3.0'/
 * 'AGPL-3.0' rather than the modern '-only'/'-or-later' ids, because which one
 * applies lives in the per-file headers, not the licence text this function is
 * given. Both variants are COPYLEFT, so the missing suffix cannot change a
 * verdict — it would only be a false precision in the audit trail.
 */
const DETECTORS = Object.freeze([
  { spdx: 'MIT', all: [/Permission is hereby granted,\s*free of charge/i] },
  { spdx: 'Apache-2.0', all: [/Apache License\s+Version 2\.0/i] },
  { spdx: 'ISC', all: [/Permission to use, copy, modify,? and\/or distribute/i] },
  {
    spdx: 'BSD-3-Clause',
    all: [/Redistribution and use in source and binary forms/i, /Neither the name of/i],
  },
  {
    spdx: 'BSD-2-Clause',
    all: [/Redistribution and use in source and binary forms/i],
    none: [/Neither the name of/i],
  },
  { spdx: 'Unlicense', all: [/free and unencumbered software released into the public domain/i] },
  { spdx: 'CC0-1.0', all: [/\bCC0 1\.0\b|Creative Commons Zero/i] },
  { spdx: 'CC-BY-SA-4.0', all: [/Attribution-ShareAlike 4\.0/i] },
  { spdx: 'CC-BY-4.0', all: [/Attribution\s+4\.0\s+International/i], none: [/ShareAlike/i] },
  { spdx: 'MPL-2.0', all: [/Mozilla Public License\s+Version 2\.0/i] },
  { spdx: 'AGPL-3.0', all: [/GNU\s+AFFERO\s+GENERAL\s+PUBLIC\s+LICENSE\s+Version\s+3/i] },
  {
    spdx: 'GPL-3.0',
    all: [/GNU\s+GENERAL\s+PUBLIC\s+LICENSE\s+Version\s+3/i],
    none: [/AFFERO\s+GENERAL\s+PUBLIC\s+LICENSE\s+Version\s+3/i],
  },
  { spdx: 'GPL-2.0', all: [/GNU\s+GENERAL\s+PUBLIC\s+LICENSE\s+Version\s+2/i] },
  // Roblox's own terms, where a repository ships them in place of a licence.
  // Both halves are required: "Roblox" alone appears in the copyright line of
  // perfectly ordinary CC-BY and MIT files (creator-docs among them).
  {
    spdx: 'LicenseRef-Roblox-Terms',
    all: [/\bRoblox\b/i, /Terms of (Use|Service)/i],
  },
]);

/**
 * Short-name patterns, used only on prose (README / repo description) where the
 * licence is named rather than quoted. Deliberately narrower than DETECTORS:
 * prose is the weakest admissible evidence, so it must name a licence exactly,
 * not gesture at one.
 */
const NAME_PATTERNS = Object.freeze([
  { spdx: 'AGPL-3.0', re: /\bAGPL(?:[-\s]?v?3(?:\.0)?)?\b/i },
  { spdx: 'GPL-3.0', re: /\bGPL[-\s]?v?3(?:\.0)?\b/i, notRe: /\bAGPL\b|\bLGPL\b/i },
  { spdx: 'GPL-2.0', re: /\bGPL[-\s]?v?2(?:\.0)?\b/i, notRe: /\bAGPL\b|\bLGPL\b/i },
  { spdx: 'CC-BY-SA-4.0', re: /\bCC[-\s]?BY[-\s]?SA(?:[-\s]?4(?:\.0)?)?\b/i },
  { spdx: 'CC-BY-4.0', re: /\bCC[-\s]?BY(?:[-\s]?4(?:\.0)?)?\b/i, notRe: /\bCC[-\s]?BY[-\s]?SA\b/i },
  { spdx: 'CC0-1.0', re: /\bCC0(?:[-\s]?1(?:\.0)?)?\b/i },
  { spdx: 'MPL-2.0', re: /\bMPL[-\s]?2(?:\.0)?\b|\bMozilla Public License\b/i },
  { spdx: 'Apache-2.0', re: /\bApache[-\s]?(?:License[-\s]?)?2(?:\.0)?\b/i },
  { spdx: 'BSD-3-Clause', re: /\bBSD[-\s]?3[-\s]?Clause\b/i },
  { spdx: 'BSD-2-Clause', re: /\bBSD[-\s]?2[-\s]?Clause\b/i },
  { spdx: 'Unlicense', re: /\bUnlicense\b/i },
  { spdx: 'MIT', re: /\bMIT\b/ },
  { spdx: 'ISC', re: /\bISC\b/ },
]);

/**
 * The phrases that turn a licence *mention* into a licence *grant*. Without one
 * of these, a README that happens to contain the word "MIT" has said nothing.
 */
const GRANTING_PHRASE = /\b(?:licen[cs]ed|released|distributed|published|available)\s+under\b|\bSPDX-License-Identifier\s*:/i;

/**
 * Claims of openness that are NOT licences. §3 names these explicitly, and this
 * is the single easiest mistake the classifier could make, so the phrases are
 * enumerated rather than left to a reviewer's judgement. Matching one of these
 * changes nothing about the verdict — quarantine either way — but it is
 * recorded in `reason` so the human resolving the quarantine knows the owner
 * *intended* to be open and is worth asking.
 */
const HOLLOW_CLAIM = /\bopen[-\s]?source(?:d)?\b|\bfree to use\b|\bfeel free to use\b|\buse (?:it|this) (?:however|freely|as you like)\b|\bno licen[cs]e needed\b|\bpublic domain\b/i;

/** Canonical form for SPDX ids arriving from outside (GitHub detection, headers). */
const SPDX_ALIASES = Object.freeze({
  'gpl-2.0-only': 'GPL-2.0',
  'gpl-2.0-or-later': 'GPL-2.0',
  'gpl-2.0+': 'GPL-2.0',
  'gpl-3.0-only': 'GPL-3.0',
  'gpl-3.0-or-later': 'GPL-3.0',
  'gpl-3.0+': 'GPL-3.0',
  'agpl-3.0-only': 'AGPL-3.0',
  'agpl-3.0-or-later': 'AGPL-3.0',
  'bsd-3': 'BSD-3-Clause',
  'bsd-2': 'BSD-2-Clause',
  'cc-by-4.0': 'CC-BY-4.0',
  'cc-by-sa-4.0': 'CC-BY-SA-4.0',
  'cc0-1.0': 'CC0-1.0',
});

const CANONICAL_BY_LOWER = new Map(Object.keys(CLASS_BY_SPDX).map((id) => [id.toLowerCase(), id]));

function matches(text, detector) {
  if (detector.all.some((re) => !re.test(text))) return false;
  if (detector.none && detector.none.some((re) => re.test(text))) return false;
  return true;
}

/**
 * Every licence identifiable in a block of licence text, as canonical SPDX ids.
 *
 * Returns an array rather than a single id on purpose: a file carrying two
 * licences is a real and common thing (creator-docs is CC-BY-4.0 prose plus MIT
 * code samples), and the honest machine answer is "I found two", not a coin
 * flip. classify() then quarantines, because deciding which licence covers
 * which files is a human's job.
 */
export function detectLicences(text) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  return DETECTORS.filter((d) => matches(text, d)).map((d) => d.spdx);
}

/**
 * Normalise an SPDX id supplied by the caller. Returns the canonical id when we
 * recognise it, otherwise the trimmed input with `known: false` — an id we
 * cannot map is reported back verbatim so the quarantine reason can name it.
 */
export function normaliseSpdx(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const id = SPDX_ALIASES[lower] ?? CANONICAL_BY_LOWER.get(lower) ?? null;
  return id ? { id, known: true } : { id: trimmed, known: false };
}

/**
 * Licences *named with granting language* in prose. §3 admits "explicit terms"
 * as evidence alongside a licence file and an SPDX id, and this is what that
 * category can honestly mean: "Licensed under the MIT License" names a licence
 * and grants under it. "This is open source, feel free to use" does neither.
 *
 * This is the weakest evidence the classifier accepts. Tightening it to require
 * a file is a one-line change here, and the tests pin the boundary so the
 * change would be visible.
 */
function namedInProse(prose) {
  if (!prose) return [];

  /* SENTENCE-SCOPED, and this is the whole point of the function.

     This used to test GRANTING_PHRASE and the licence-name patterns
     INDEPENDENTLY over the entire concatenated README + description. Nothing
     required them to be about the same thing, so mere co-occurrence anywhere in
     the document produced a full COMMERCIAL_REUSABLE verdict. The adversarial
     pass demonstrated three false grants, the worst of which was:

       "This code is NOT available under any open licence.
        It was inspired by an MIT project."

     -> COMMERCIAL_REUSABLE. A README that states the OPPOSITE of a grant was
     read as one, because "available under" appeared in the refusal and "MIT"
     appeared in the next sentence. The others were a vendored dependency's
     licence being read as the repo's, and a game dump crediting an unrelated
     "MIT-licensed rewrite".

     Requiring both halves inside ONE sentence is what makes this evidence at
     all: "Licensed under the MIT License" is a grant; a refusal followed by an
     unrelated mention is not. Splitting on sentence terminators AND newlines,
     because README prose is usually line-broken rather than punctuated. */
  /* An explicit reservation anywhere in the document beats every grant-shaped
     sentence in it. "All rights reserved" next to a mention of MIT is a refusal
     with a citation, not a licence, and reading it as a grant is the single most
     expensive mistake available here. */
  if (RESERVATION_PHRASE.test(prose)) return [];

  const sentences = prose.split(/(?:[.!?](?:\s|$)|\n+)/);
  const found = new Set();
  for (const sentence of sentences) {
    if (!GRANTING_PHRASE.test(sentence)) continue;
    /* The grant has to be about THIS repository. "bundles a vendored copy of
       Promise, which is released under MIT" is a single sentence containing a
       real grant — for someone else's code. Sentence scoping alone cannot tell
       those apart, so a third-party qualifier disqualifies the sentence. */
    if (THIRD_PARTY_QUALIFIER.test(sentence)) continue;
    for (const p of NAME_PATTERNS) {
      if (p.re.test(sentence) && !(p.notRe && p.notRe.test(sentence))) found.add(p.spdx);
    }
  }
  return [...found];
}

/** Phrases that withdraw a grant. Checked over the whole document, not a sentence. */
const RESERVATION_PHRASE =
  /\ball rights reserved\b|\bnot\s+(?:available|licen[cs]ed|open[- ]source|free)\b|\bno\s+licen[cs]e\b|\bproprietary\b|\bunlicensed\b/i;

/** A grant in a sentence about someone else's code is not a grant for this repo. */
const THIRD_PARTY_QUALIFIER =
  /\b(?:vendor(?:ed|s)?|bundle[sd]?|bundling|includes?|including|dependenc(?:y|ies)|third[- ]party|submodule|upstream|fork(?:ed)? from|based on|inspired by|rewrite|port of)\b/i;

const REASON_BY_CLASS = {
  COMMERCIAL_REUSABLE: (spdx, where) =>
    `${spdx} is permissive: reuse is allowed subject to keeping the licence notice, and because the grant is proven by ${where} the source is also cleared for training.`,
  ATTRIBUTION_REQUIRED: (spdx, where) =>
    `${spdx} (proven by ${where}) allows reuse only while the credit survives into the user's shipped project, and a credit line cannot survive into model weights, so training is forbidden.`,
  COPYLEFT: (spdx, where) =>
    `${spdx} (proven by ${where}) is copyleft: reuse would impose its obligations on the user's own game, so Golem may read and cite this but must not emit derived code — legitimate reference material, not unsafe.`,
  REFERENCE_ONLY: (spdx, where) =>
    `${spdx} (proven by ${where}) grants neither reuse nor training rights; the source may be read and cited at retrieval time only.`,
};

function verdict(spdx, evidence, evidencePath) {
  const cls = CLASS_BY_SPDX[spdx];
  const where = evidencePath ?? (evidence === 'spdx-header' ? 'a declared SPDX identifier' : 'explicit terms in the repository prose');
  return {
    class: cls,
    reuse: REUSE_BY_CLASS[cls],
    training: trainingFor(cls, evidence),
    spdx,
    evidence,
    evidencePath: evidencePath ?? null,
    reason: REASON_BY_CLASS[cls](spdx, where),
  };
}

function quarantine(evidence, evidencePath, reason) {
  return {
    class: 'UNCLEAR_QUARANTINE',
    reuse: 'forbidden',
    training: 'forbidden',
    spdx: null,
    evidence,
    evidencePath: evidencePath ?? null,
    reason,
  };
}

/**
 * Classify one source's licence into a LicenceVerdict.
 *
 * @param {object} input
 * @param {string|null} [input.licenseFileText]  contents of LICENSE/COPYING, if any
 * @param {string|null} [input.spdxId]           SPDX id from host detection or a file header
 * @param {string|null} [input.readmeText]       README prose
 * @param {string|null} [input.repoDescription]  the one-line repo description
 * @param {string|object|null} [input.forumClaim] a DevForum/thread claim about the source
 * @param {string} [input.licenseFilePath]       where licenseFileText came from (default 'LICENSE')
 * @param {string|null} [input.spdxPath]         where spdxId came from, if it was a file header
 * @returns {{class:string,reuse:string,training:string,spdx:string|null,evidence:string,evidencePath:string|null,reason:string}}
 *
 * Evidence precedence is licence file → SPDX id → prose, strongest first, and
 * every disagreement between two sources of evidence quarantines rather than
 * picking a winner. §3 says a quarantined source is "unused until a human
 * resolves it", which makes quarantine cheap: it costs one review, whereas a
 * wrong `allowed` costs a licence violation baked into a model.
 */
export function classify(input = {}) {
  const {
    licenseFileText = null,
    spdxId = null,
    readmeText = null,
    repoDescription = null,
    forumClaim = null,
    licenseFilePath = 'LICENSE',
    spdxPath = null,
  } = input ?? {};

  const declared = normaliseSpdx(spdxId);
  const hasFile = typeof licenseFileText === 'string' && licenseFileText.trim() !== '';
  const found = detectLicences(licenseFileText);

  // ---- Strongest evidence: the licence file itself. -------------------------
  if (found.length > 1) {
    return quarantine(
      'license-file',
      licenseFilePath,
      `${licenseFilePath} carries ${found.length} licences (${found.join(', ')}) and nothing in the file says which covers which paths, so the split is a human's call.`,
    );
  }
  if (found.length === 1) {
    if (declared && declared.id !== found[0]) {
      return quarantine(
        'license-file',
        licenseFilePath,
        `${licenseFilePath} reads as ${found[0]} but the declared SPDX id is ${declared.id}; a licence disagreeing with its own declaration is exactly the ambiguity §3 quarantines.`,
      );
    }
    return verdict(found[0], 'license-file', licenseFilePath);
  }
  if (hasFile) {
    // A file exists and we could not read it. Trusting the host's SPDX guess
    // here would mean granting rights on evidence this module cannot itself
    // check, so it quarantines and names the guess for the reviewer instead.
    const guess = declared ? ` The host reports ${declared.id}, which a reviewer can confirm.` : '';
    return quarantine(
      'license-file',
      licenseFilePath,
      `${licenseFilePath} is present but its terms match no licence this classifier recognises.${guess}`,
    );
  }

  // ---- Next: a declared SPDX id with no file to check it against. -----------
  if (declared) {
    if (declared.known) return verdict(declared.id, 'spdx-header', spdxPath);
    return quarantine(
      'spdx-header',
      spdxPath,
      `The declared SPDX id "${declared.id}" is not one this classifier recognises, and an unrecognised identifier is not a grant.`,
    );
  }

  // ---- Weakest: prose. ------------------------------------------------------
  const prose = [readmeText, repoDescription].filter((s) => typeof s === 'string' && s.trim() !== '').join('\n\n');
  const named = namedInProse(prose);
  if (named.length === 1) return verdict(named[0], 'explicit-terms', null);
  if (named.length > 1) {
    return quarantine(
      'explicit-terms',
      null,
      `The repository prose grants under ${named.length} different licences (${named.join(', ')}) with no licence file to settle it.`,
    );
  }

  // ---- Nothing. This is the default and it is the point. --------------------
  // A forum claim is recorded, never counted: §3 is explicit that a thread
  // title is not a licence, and this is the branch where that rule bites.
  const claimText = typeof forumClaim === 'string' ? forumClaim : (forumClaim?.text ?? forumClaim?.title ?? null);
  const notes = [];
  if (HOLLOW_CLAIM.test(prose)) notes.push('the README claims openness without naming a licence');
  if (claimText) notes.push(`a forum post claims ${JSON.stringify(claimText.trim().slice(0, 120))}`);
  const tail = notes.length
    ? ` ${notes.join(' and ')} — a claim of openness is not a grant, so it is recorded for the reviewer and counted as nothing.`
    : '';
  return quarantine(
    'none',
    null,
    `No licence file, no SPDX identifier and no explicit terms were found; absence of evidence is not permission.${tail}`,
  );
}

/**
 * The credit line an ATTRIBUTION_REQUIRED source needs in a shipped project.
 *
 * Returns null for every other class, and that is not an oversight:
 * COMMERCIAL_REUSABLE licences (MIT, Apache-2.0, BSD) do impose an obligation,
 * but it is notice RETENTION — ship the licence text — which is a different
 * artefact from a credit line and is discharged by the build, not by the
 * credits screen. Emitting a credit line for them would misdescribe the
 * obligation while leaving the real one undone. COPYLEFT and REFERENCE_ONLY
 * return null because nothing derived from them ships at all.
 *
 * The format mirrors apps/worker/src/provenance.ts's asset credit lines so a
 * source credit and an asset credit read as one list once they land in the same
 * plain-text credits panel.
 *
 * @param {object} verdict            a LicenceVerdict from classify()
 * @param {object} provenanceRecord   the ProvenanceRecord the verdict belongs to
 * @returns {string|null}
 */
export function attributionText(verdict, provenanceRecord) {
  if (!verdict || verdict.class !== 'ATTRIBUTION_REQUIRED') return null;
  const p = provenanceRecord ?? {};

  const name = p.repo ? (p.owner ? `${p.owner}/${p.repo}` : p.repo) : (p.id ?? 'unidentified source');
  const author = p.owner ?? 'unknown author';
  const url = p.url ?? (p.host && p.owner && p.repo ? `https://${p.host}/${p.owner}/${p.repo}` : null);
  const licence = verdict.spdx ?? 'licence recorded as attribution-required';

  // The commit is part of the credit, not decoration: CC-BY's modification
  // notice is only meaningful if a reader can tell which revision was used.
  const at = p.sha ? ` at ${String(p.sha).slice(0, 12)}` : p.ref ? ` at ${p.ref}` : '';

  return `"${name}" by ${author} — ${licence} — ${url ?? 'source URL unrecorded'}${at}`;
}
