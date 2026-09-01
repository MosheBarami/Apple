// quality.mjs — the QUALITY SCORE stage of §1's pipeline.
//
// WHAT THIS SCORES, STATED FIRST BECAUSE IT IS THE EASIEST THING TO MISREAD.
//
// This measures ENGINEERING HYGIENE — is the artifact tested, typed, documented,
// licensed, maintained, current — and it does NOT measure whether the patterns
// inside it are good ones. A thoroughly tested, strictly typed, CI-gated repository
// full of terrible UI decisions scores high here and should. Judging the patterns is
// what `packages/design`'s extraction and `packages/evals`' checks are for, and
// conflating the two would produce a number that means neither thing.
//
// So the score answers one question: **how much should an unreviewed pattern from
// this source be trusted before a human has looked at it?** It orders a queue. It
// does not certify anything.
//
// TWO PROPERTIES IT HAS TO HAVE.
//
// Attributable. `retrieve.mjs` says of its own ranking that "every point a rule
// earns is attributable to one clause of the brief", and the reason given there is
// that an unauditable score "will quietly start returning the wrong grammar". A
// quality score is more dangerous, not less, because it is a single number attached
// to a whole source. So `scoreQuality` returns the components, and the score is
// derived from them rather than reported alone.
//
// Not a popularity proxy. Stars and forks are deliberately absent. They already
// enter ranking through `retrievalRank`'s popularity term, and letting them in here
// too would count them twice while dressing the second count up as quality.

/**
 * Each component is a checkable fact about the checkout, with the weight it carries.
 * Weights are relative and sum is irrelevant — the score normalises by the weight of
 * the components that could actually be DECIDED, so a source whose security scan
 * never ran is not punished for a fact nobody established.
 */
export const QUALITY_COMPONENTS = Object.freeze({
  licensed: { weight: 3, why: 'a source that cannot prove a licence cannot lawfully teach anything, whatever else is true of it' },
  clean: { weight: 3, why: 'the security gate is §1\'s second stage; a flagged source is out of every use regardless of craft' },
  tested: { weight: 2, why: 'tests are the only evidence in a checkout that its own claims were ever executed' },
  documented: { weight: 2, why: 'an undocumented source can be read but its intent has to be guessed, and a guessed intent is what produces a mis-extracted pattern' },
  currentEra: { weight: 2, why: 'a legacy-era source teaches APIs that no longer behave the way the code assumes' },
  typed: { weight: 1, why: 'a --!strict directive turns a class of extraction mistakes into errors at the source' },
  maintained: { weight: 1, why: 'CI configuration is evidence that the tests are run rather than merely present' },
});

export const QUALITY_KEYS = Object.freeze(Object.keys(QUALITY_COMPONENTS));

/** README prose below this many characters is a stub, not documentation. */
export const DOC_MIN_CHARS = 500;

const TEST_PATH = /(?:^|\/)(?:tests?|spec|__tests__)\/|\.(?:spec|test)\.(?:lua|luau|js|mjs|ts)$|\.spec\.lua$/i;
const CI_PATH = /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$|(?:^|\/)\.(?:gitlab-ci\.yml|travis\.yml|circleci\/config\.yml)$/i;
const DOC_PATH = /(?:^|\/)readme(?:\.md|\.rst|\.txt)?$/i;
const TYPED = /^\s*--!\s*(?:strict|native)/m;

/**
 * Decide each component from evidence, leaving it `null` where the evidence is
 * absent rather than guessing.
 *
 * @param {object} evidence
 * @param {{path: string, source?: string}[]} evidence.files  every file in the checkout
 * @param {string|null} [evidence.licenceClass]  from licence.mjs; null if never classified
 * @param {boolean|null} [evidence.securitySafe]  from scan.mjs; null if never scanned
 * @param {string} [evidence.engineEra]  from domain.mjs
 */
export function assessQuality({ files = [], licenceClass = null, securitySafe = null, engineEra = 'unknown' } = {}) {
  const paths = files.map((f) => String(f?.path ?? ''));

  const readme = files.find((f) => DOC_PATH.test(String(f?.path ?? '')));
  const readmeChars = readme?.source ? String(readme.source).trim().length : 0;

  return {
    // A licence that exists and permits reuse. `UNCLEAR_QUARANTINE` is a decided
    // fact — we looked and found no evidence — so it scores 0 rather than null.
    licensed: licenceClass === null ? null : licenceClass !== 'UNCLEAR_QUARANTINE',
    clean: securitySafe === null ? null : securitySafe === true,
    tested: paths.some((p) => TEST_PATH.test(p)),
    documented: readme ? readmeChars >= DOC_MIN_CHARS : false,
    // `unknown` is not a failure and not a pass. There was no evidence of era, and
    // scoring it 0 would punish a data-only source for containing no code.
    currentEra: engineEra === 'unknown' ? null : engineEra === 'modern',
    typed: files.some((f) => TYPED.test(String(f?.source ?? ''))),
    maintained: paths.some((p) => CI_PATH.test(p)),
  };
}

/**
 * @returns {{score: number|null, components: object, decided: string[], undecided: string[]}}
 *   `score` is null when nothing could be decided — which is different from 0, and
 *   `retrievalRank` treats a null score as the 0.5 midpoint rather than as worthless.
 */
export function scoreQuality(evidence = {}) {
  const components = assessQuality(evidence);

  let earned = 0;
  let possible = 0;
  const decided = [];
  const undecided = [];
  const detail = {};

  for (const key of QUALITY_KEYS) {
    const { weight, why } = QUALITY_COMPONENTS[key];
    const value = components[key];
    if (value === null) {
      undecided.push(key);
      detail[key] = { value: null, weight, contributed: 0, why };
      continue;
    }
    decided.push(key);
    possible += weight;
    if (value) earned += weight;
    detail[key] = { value, weight, contributed: value ? weight : 0, why };
  }

  return {
    score: possible > 0 ? Number((earned / possible).toFixed(4)) : null,
    components: detail,
    decided,
    undecided,
    earned,
    possible,
  };
}
