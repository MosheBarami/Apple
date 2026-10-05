// The pass rule of plan section 4.3, as a pure function. No file or network access: everything it
// needs arrives as arguments, so every clause can be shown to fail by a unit test
// (tests/eval-verdict.test.mjs).
//
// A piece PASSES when all of these hold:
//   1. the LOWER of the two critic scores is >= 8 in every applicable area (an area is N/A only if
//      BOTH critics mark it N/A; if one scores it, that score is used);
//   2. neither critic lists a severe flaw;
//   3. the play test shows 0 errors;
//   4. every scripted functional check passes;
//   5. the claim audit finds 0 unsupported claims.
// Two clauses are this harness's own additions, both of which can only make a piece harder to pass:
//   - the run itself ended normally (a run stopped by the 15 minute limit, or that errored, is not a
//     finished piece);
//   - each critic looked at every screenshot it was given (a verdict from half the pictures is not one).
//
// FUNCTIONAL CHECKS THAT ARE NOT DEFINED. The block engine brings per-request scripted checks in
// M5, so in M3 every request records `functionalChecks: { defined: false }`. "Every check passes" is
// vacuously true of an empty list, and reading it that way would let every piece pass clause 4 for
// free and inflate the pass rate. So the rule here is: no checks defined means clause 4 is NOT
// ESTABLISHED, the verdict's status is `unevaluable` and `pass` is false, and the reason says so in
// plain words. The harness reports the strict rate (what the plan's bar measures) and, beside it and
// labelled, `passIgnoringFunctionalChecks` (the other four clauses only), so the baseline still says
// something about quality without pretending a clause was satisfied that was never run.

export const AREAS = ['delivers', 'visual', 'layout', 'ui', 'life', 'polish'];
export const AREA_LABELS = {
  delivers: 'Delivers the request',
  visual: 'Visual quality and art direction',
  layout: 'Layout, composition and scale',
  ui: 'UI/UX clarity',
  life: 'Feedback and life',
  polish: 'Polish',
};
/** Only the UI area may be N/A (plan 4.3: "N/A for non-UI"). */
export const NA_ALLOWED = ['ui'];
export const PASS_THRESHOLD = 8;
export const SEVERE_FLAW_NUMBERS = [1, 2, 3, 4, 5, 6];

const isScore = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10;

/**
 * Is this critic output the shape the rubric asks for, and did the critic look at every picture?
 * Returns { ok, problems: string[] }. A critic that is not ok cannot be counted.
 */
export function validateCritic(critic, { shotsGiven = [] } = {}) {
  const problems = [];
  if (!critic || typeof critic !== 'object') return { ok: false, problems: ['no critic output'] };
  const scores = critic.scores;
  const na = Array.isArray(critic.na) ? critic.na : [];
  if (!scores || typeof scores !== 'object') problems.push('scores is missing');
  for (const a of na) if (!NA_ALLOWED.includes(a)) problems.push(`"${a}" may not be marked N/A (only ui may)`);
  for (const area of AREAS) {
    const v = scores?.[area];
    if (na.includes(area)) {
      if (v !== null && v !== undefined) problems.push(`${area} is in na but has a score`);
    } else if (!isScore(v)) {
      problems.push(`${area} has no score from 0 to 10`);
    }
  }
  if (!Array.isArray(critic.severeFlaws)) problems.push('severeFlaws is not a list');
  else {
    for (const f of critic.severeFlaws) {
      if (!f || !SEVERE_FLAW_NUMBERS.includes(Number(f.flaw))) problems.push(`a severe flaw has no valid number: ${JSON.stringify(f)}`);
      else if (typeof f.evidence !== 'string' || !f.evidence.trim()) problems.push(`severe flaw ${f.flaw} cites no evidence`);
    }
  }
  const viewed = new Set(Array.isArray(critic.shotsViewed) ? critic.shotsViewed.map(String) : []);
  const missing = shotsGiven.filter((s) => !viewed.has(s));
  if (missing.length) problems.push(`did not view ${missing.length} of ${shotsGiven.length} screenshots: ${missing.join(', ')}`);
  return { ok: problems.length === 0, problems };
}

/** The lower of the two critics' scores per area, and which areas are N/A (both critics marked them). */
export function lowerScores(a, b) {
  const lower = {};
  const na = [];
  for (const area of AREAS) {
    const values = [a?.scores?.[area], b?.scores?.[area]].filter(isScore);
    if (values.length === 0) {
      lower[area] = null;
      na.push(area);
    } else {
      lower[area] = Math.min(...values);
    }
  }
  return { lower, na };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Apply the pass rule.
 *
 * @param {object} i
 * @param {string} [i.requestId]
 * @param {object|null} i.criticA                    parsed critic JSON (rubric shape) or null
 * @param {object|null} i.criticB
 * @param {string[]} [i.shotsGiven]                  the screenshot file names each critic was handed
 * @param {{errors:number, warnings?:number}|null} i.playTest   null when no play test ran
 * @param {{defined:false}|{defined:true, results:{id:string, pass:boolean}[]}} i.functionalChecks
 * @param {{unsupported:{claim:string}[]}|null} i.claims         null when the claim audit did not run
 * @param {{endedBy?:string}} [i.run]                'done' is the only normal ending
 */
export function computeVerdict(i) {
  const failed = []; // clauses that decidedly failed
  const unestablished = []; // clauses that could not be established
  const shotsGiven = i.shotsGiven ?? [];

  // ---- the critics
  const checkA = validateCritic(i.criticA, { shotsGiven });
  const checkB = validateCritic(i.criticB, { shotsGiven });
  const criticsUsable = checkA.ok && checkB.ok;
  if (!checkA.ok) unestablished.push(`critic A is not usable: ${checkA.problems.join('; ')}`);
  if (!checkB.ok) unestablished.push(`critic B is not usable: ${checkB.problems.join('; ')}`);

  let lower = {};
  let na = [];
  const severe = { a: [], b: [] };
  if (criticsUsable) {
    ({ lower, na } = lowerScores(i.criticA, i.criticB));
    for (const area of AREAS) {
      if (na.includes(area)) continue;
      const a = i.criticA.scores[area];
      const b = i.criticB.scores[area];
      if (lower[area] < PASS_THRESHOLD) {
        failed.push(`${area}: the lower score ${lower[area]} is below ${PASS_THRESHOLD} (A ${a ?? 'N/A'}, B ${b ?? 'N/A'})`);
      }
    }
    severe.a = i.criticA.severeFlaws;
    severe.b = i.criticB.severeFlaws;
    for (const [who, flaws] of [['A', severe.a], ['B', severe.b]]) {
      for (const f of flaws) failed.push(`severe flaw ${f.flaw} (critic ${who}): ${f.evidence}`);
    }
  }

  // ---- the play test
  const play = i.playTest ?? null;
  if (!play || !Number.isFinite(play.errors)) unestablished.push('play test: it did not run, so its errors were not counted');
  else if (play.errors > 0) failed.push(`play test: ${plural(play.errors, 'error')}`);

  // ---- the scripted functional checks
  const fc = i.functionalChecks ?? { defined: false };
  let functionalChecksEstablished = true;
  if (!fc.defined) {
    functionalChecksEstablished = false;
    unestablished.push('functional checks: none are defined for this request yet (the block engine adds them in M5), so this clause cannot be established and the piece cannot pass');
  } else {
    const results = Array.isArray(fc.results) ? fc.results : [];
    if (results.length === 0) {
      functionalChecksEstablished = false;
      unestablished.push('functional checks: marked defined but no result was recorded');
    }
    for (const r of results) if (!r.pass) failed.push(`functional check "${r.id}" failed`);
  }

  // ---- the claim audit
  const claims = i.claims ?? null;
  if (!claims || !Array.isArray(claims.unsupported)) unestablished.push('claim audit: it did not run, so the reply was not checked');
  else if (claims.unsupported.length > 0) failed.push(`claim audit: ${plural(claims.unsupported.length, 'unsupported claim')}`);

  // ---- the run itself
  const endedBy = i.run?.endedBy ?? 'done';
  if (endedBy !== 'done') failed.push(`the run did not end normally (${endedBy})`);

  const status = failed.length ? 'fail' : unestablished.length ? 'unevaluable' : 'pass';

  // The same rule with clause 4 waived: what the other four clauses say. Never the headline.
  const onlyFunctionalUnestablished =
    failed.length === 0 && unestablished.length === 1 && unestablished[0].startsWith('functional checks: none are defined');
  const passIgnoringFunctionalChecks = status === 'pass' || onlyFunctionalUnestablished;

  return {
    requestId: i.requestId ?? null,
    pass: status === 'pass',
    status,
    passIgnoringFunctionalChecks,
    reasons: [...failed, ...unestablished],
    threshold: PASS_THRESHOLD,
    lower: criticsUsable ? lower : null,
    na: criticsUsable ? na : null,
    critics: {
      a: i.criticA ? { scores: i.criticA.scores ?? null, na: i.criticA.na ?? [], severeFlaws: i.criticA.severeFlaws ?? [] } : null,
      b: i.criticB ? { scores: i.criticB.scores ?? null, na: i.criticB.na ?? [], severeFlaws: i.criticB.severeFlaws ?? [] } : null,
    },
    nonCritic: {
      playTest: play ? { errors: play.errors, warnings: play.warnings ?? null } : null,
      functionalChecks: fc.defined ? { defined: true, results: fc.results ?? [] } : { defined: false },
      claimAudit: claims ? { unsupported: claims.unsupported.length } : null,
      runEndedBy: endedBy,
    },
    functionalChecksEstablished,
  };
}
