#!/usr/bin/env node
/**
 * WHEN THE LIBRARY DOES NOT HAVE THE ANSWER, DOES THE DOOR KNOW?
 *
 * ------------------------------------------------------------------------------------------------
 * THE NUMBER THIS EXISTS TO FILL IN
 * ------------------------------------------------------------------------------------------------
 * docs/frontier-for-roblox.md §6 names its own largest hole:
 *
 *     "Coverage. All eighty curriculum requests have a verified module, so retrieve-then-hand-over
 *      is measured only where it can win. Its score on a request the library does not cover is
 *      zero, and nothing here measures how often that happens in real traffic."
 *
 * The first half of that sentence is a measurement (73/80, the shipped door's top-1). The second
 * half — "its score on an uncovered request is zero" — is an ASSERTION. Nobody ran it. This file
 * runs it: it strikes the answer out of the ranking, hands over whatever the door returns instead,
 * and EXECUTES that module against the request's own exhaustive checks. Whatever comes back is the
 * number, and it is allowed to disagree with the assertion.
 *
 * The second thing it measures is the one that decides a shipping policy. `askVerifiedModule({need})`
 * returns up to five candidates and NO confidence of any kind, so on a request the library does not
 * cover it returns five confident wrong modules — which verified-modules.ts's own comment already
 * calls the worst outcome available:
 *
 *     "a plausible wrong module is worse than a miss here: nothing downstream checks what the model
 *      installs, so the customer gets logic that is silently wrong forever."
 *
 * So: is there a signal in the ranking that separates "I have this" from "I do not"? If there is,
 * the product can abstain, fall back to generation, and stop installing silent wrongness.
 *
 * ------------------------------------------------------------------------------------------------
 * THE THREE QUERY SETS, AND WHY EACH ONE IS HERE
 * ------------------------------------------------------------------------------------------------
 *   covered      the 80 customer phrasings in customer-queries.mjs against the full library. The
 *                positive class is the 73 where top-1 IS the right module; the other 7 are covered
 *                requests the door already gets wrong, and a policy should decline those too.
 *
 *   loo          the same 80 queries with the target STRUCK OUT of the ranking — "the library does
 *                not contain your answer, here is its best remaining guess". Same register, same
 *                words, so nothing about the query changed; only the availability of the answer.
 *                The other 79 scores are untouched by the strike, which is why this is done by
 *                filtering the ranking rather than by rebuilding the index: a rebuild would also
 *                move every IDF and the comparison would no longer be paired.
 *
 *   offCorpus    the 16 engine-facing tasks in roblox-frontier-tasks.mjs, verbatim. The library is
 *                eighty pure, engine-independent logic modules; not one of them saves to a
 *                DataStore, fires a RemoteEvent or tweens a part, so every one of these 16 is
 *                genuinely uncovered and none of them was written by this file for this purpose.
 *                They are in CONTRACT voice and they are long, which makes them the STRESS CASE:
 *                a long query accumulates BM25 evidence across more terms, so any policy that keys
 *                on the absolute score will wave these straight through. That is the point of
 *                including them, and it is what the results below show.
 *
 * ------------------------------------------------------------------------------------------------
 * WHAT IS NOT MEASURED HERE, SAID BEFORE THE NUMBERS RATHER THAN AFTER
 * ------------------------------------------------------------------------------------------------
 *   - The threshold is swept over the same 80 queries it is reported on. The best cell of a grid
 *     searched on the reported set is a measurement of the grid, which is the argument
 *     need-index-search.ts already makes about its own field weights. The defence is the same one:
 *     the whole sweep is printed, and the result is the PLATEAU, not the peak.
 *   - Real traffic. `customer-queries.mjs` says in its own header that its eighty lines are one
 *     session's judgement of how a person asks. Every percentage here inherits that.
 *   - The generation fallback is not re-run. It is read row by row out of the recorded arms in
 *     packages/training/runs/generation-arm-*-full80.json, so the hybrid score below is a real
 *     per-prompt join and not an average multiplied by a count.
 *
 * Usage:
 *   node packages/training/src/measure-library-abstention.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { CUSTOMER_QUERIES } from './customer-queries.mjs';
import { FRONTIER_ITEMS } from './roblox-frontier-tasks.mjs';
import { scoreGameLogic } from './score-eval.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(HERE, '..', 'runs');
const WORKER = resolve(HERE, '../../../apps/worker');

/** Arms whose per-prompt rows are joined in as the generation fallback. */
export const FALLBACK_ARMS = ['baseline', 'fewshot', 'fewshotcustomer', 'fewshotrandom', 'secondpass', 'specrepair', 'oracle'];

/**
 * The sweep. Printed whole; no cell is privileged in the output.
 *
 * Both ends are anchors rather than candidates. 0 is the door exactly as it ships — hand over
 * whatever ranks first, always — and 1 is unreachable, because no query in these sets has a single
 * scoring module, so it abstains on everything and each arm's hybrid must collapse to that arm's
 * own recorded total. Those two rows are what make the middle of the table readable as a policy
 * rather than as a list of numbers, and the test pins both.
 */
export const THRESHOLDS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 1];

/**
 * Bundle one worker source file and import it, so this measures the SHIPPED code.
 *
 * A retyped copy would measure a fiction that resembles production — the same reason
 * generation-arms.mjs and measure-embedding-retrieval.mjs both do this instead of importing a
 * mirror.
 */
async function loadWorker(file) {
  const dir = mkdtempSync(join(tmpdir(), 'abstain-'));
  const out = join(dir, 'm.mjs');
  try {
    execFileSync(
      join(WORKER, 'node_modules', '.bin', 'esbuild'),
      [join(WORKER, 'src', file), '--bundle', '--format=esm', '--target=es2022', '--loader:.json=json', '--outfile=' + out],
      { stdio: 'pipe', cwd: WORKER },
    );
    return await import(pathToFileURL(out).href + '?t=' + Date.now());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The confidence statistic: how far ahead of the runner-up the top hit is, as a fraction of itself.
 *
 * RELATIVE, not absolute, and that is the whole finding. An absolute BM25 total is a function of
 * how many words the query has, so a long uncovered request outscores a short covered one and any
 * absolute floor lets exactly the wrong things through. A ratio divides that out. 0 means the top
 * two are tied; 1 means nothing else scored at all.
 */
export function confidence(ranked) {
  const top1 = ranked[0]?.score ?? 0;
  const top2 = ranked[1]?.score ?? 0;
  if (!(top1 > 0)) return 0;
  return (top1 - top2) / top1;
}

const fenced = (source) => '```luau\n' + source + '\n```';

export async function measure() {
  const ni = await loadWorker('need-index-search.ts');
  const vm = await loadWorker('verified-modules.ts');

  //[[ THE HARNESS IS CHECKED BEFORE IT IS BELIEVED. Every claim below rests on "a library module
  //   passes the curriculum's own checks for its own id", which is what makes a retrieval number
  //   and a generation number the same unit. compare-generation-arms.mjs establishes it by running
  //   all eighty; if it does not reproduce here, this file's numbers mean nothing and it says so.
  let sanity = 0;
  for (const ex of ALL_GAME_LOGIC_CURRICULUM) {
    const m = vm.getVerifiedModule(ex.id);
    if (m && scoreGameLogic(ex, fenced(m.source)).ok) sanity += 1;
  }
  if (sanity !== ALL_GAME_LOGIC_CURRICULUM.length) {
    throw new Error(`library sanity ${sanity}/${ALL_GAME_LOGIC_CURRICULUM.length}: a module no longer passes its own checks, so nothing below is commensurable`);
  }

  const covered = [];
  const loo = [];
  for (const ex of ALL_GAME_LOGIC_CURRICULUM) {
    const query = CUSTOMER_QUERIES[ex.id];
    if (!query) throw new Error(`no customer phrasing for ${ex.id} — the covered set would be a biased slice`);
    const ranked = ni.rankByNeed(query);
    covered.push({
      id: ex.id,
      top1: ranked[0]?.m.id ?? null,
      correct: ranked[0]?.m.id === ex.id,
      confidence: confidence(ranked),
      hits: ranked.length,
    });

    const struck = ranked.filter((r) => r.m.id !== ex.id);
    const handed = struck[0]?.m ?? null;
    // The measurement the assertion in §6 stood in for: RUN the wrong module against the checks.
    const outcome = handed ? scoreGameLogic(ex, fenced(handed.source)) : { ok: false, reason: 'nothing_returned' };
    loo.push({
      id: ex.id,
      handedOver: handed?.id ?? null,
      confidence: confidence(struck),
      passedAnyway: outcome.ok,
      reason: outcome.ok ? null : outcome.reason,
    });
  }

  const offCorpus = FRONTIER_ITEMS.map((item) => {
    const ranked = ni.rankByNeed(item.prompt);
    return { id: item.id, top1: ranked[0]?.m.id ?? null, confidence: confidence(ranked), hits: ranked.length };
  });

  //[[ The generation fallback is joined PER PROMPT out of the recorded arms, so a row that the arm
  //   actually got right counts once and a row it got wrong counts zero. Multiplying an arm's
  //   average by the number of abstentions would assume the abstained prompts are of average
  //   difficulty, and they are exactly the prompts selected for being ambiguous.
  const arms = {};
  for (const arm of FALLBACK_ARMS) {
    const file = resolve(RUNS_DIR, `generation-arm-${arm}-full80.json`);
    const run = JSON.parse(readFileSync(file, 'utf8'));
    if (run.notMeasured) throw new Error(`${arm} has ${run.notMeasured} unmeasured prompts — a run with holes is a biased slice`);
    arms[arm] = new Map(run.rows.map((r) => [r.id, Boolean(r.ok)]));
  }
  //[[ Each arm's own total, counted from the SAME rows the hybrid joins against and by a different
  //   expression. It exists so the t=1 row can be checked against something: abstain on everything
  //   and the hybrid must BE the arm. A join that quietly credited every abstention as a success
  //   would inflate every cell in the table and no assertion here noticed until this was added —
  //   measured, by a mutation that turned nothing red.
  const armTotals = Object.fromEntries(
    Object.entries(arms).map(([arm, rows]) => [arm, [...rows.values()].filter(Boolean).length]),
  );

  const sweep = THRESHOLDS.map((t) => {
    const handed = covered.filter((r) => r.confidence >= t);
    const right = handed.filter((r) => r.correct).length;
    const abstained = covered.filter((r) => r.confidence < t);
    const hybrid = {};
    for (const [arm, rows] of Object.entries(arms)) {
      hybrid[arm] = right + abstained.filter((r) => rows.get(r.id)).length;
    }
    return {
      threshold: t,
      covered: { handedOver: handed.length, handedOverAndRight: right, abstained: abstained.length },
      uncoveredLoo: { handedOver: loo.filter((r) => r.confidence >= t).length, of: loo.length },
      offCorpus: { handedOver: offCorpus.filter((r) => r.confidence >= t).length, of: offCorpus.length },
      hybridOutOf80: hybrid,
    };
  });

  return {
    measuredAt: new Date().toISOString(),
    what: 'Can the verified-module door tell a request it covers from one it does not? Zero model calls; every hand-over is EXECUTED against the request\'s own checks.',
    modelCalls: 0,
    librarySanity: `${sanity}/${ALL_GAME_LOGIC_CURRICULUM.length} verified modules pass the curriculum\'s own checks when executed`,
    statistic: 'relative margin (top1 - top2) / top1 over rankByNeed()',
    shippedDoorTop1: `${covered.filter((r) => r.correct).length}/${covered.length}`,
    armTotals,
    uncoveredHandOverPassedAnyway: `${loo.filter((r) => r.passedAnyway).length}/${loo.length}`,
    caveats: [
      'The threshold is swept over the same 80 queries it is reported on; the plateau is the result, not the peak cell.',
      'The 80 customer phrasings are one session\'s judgement of how a person asks (customer-queries.mjs), not sampled traffic.',
      'offCorpus is in contract voice and is long, which is the stress case for any absolute-score policy, not a register-matched sample.',
      'The generation fallback is read from the recorded arms; those were measured at effectiveTokens 5500 and production now sends 6500.',
    ],
    sweep,
    covered,
    loo,
    offCorpus,
  };
}

function print(out) {
  console.log(out.what);
  console.log(`library sanity: ${out.librarySanity}`);
  console.log(`shipped door top-1 on the covered set: ${out.shippedDoorTop1}`);
  console.log(`an UNCOVERED hand-over that passed the request's own checks anyway: ${out.uncoveredHandOverPassedAnyway}`);
  console.log('');
  console.log('t      covered hand/right  loo handed  offcorpus handed   hybrid /80 (fallback arm)');
  for (const row of out.sweep) {
    const h = Object.entries(row.hybridOutOf80).map(([arm, n]) => `${arm}=${n}`).join(' ');
    console.log(
      String(row.threshold.toFixed(2)).padEnd(6),
      String(`${row.covered.handedOver}/${row.covered.handedOverAndRight}`).padEnd(18),
      String(`${row.uncoveredLoo.handedOver}/${row.uncoveredLoo.of}`).padEnd(11),
      String(`${row.offCorpus.handedOver}/${row.offCorpus.of}`).padEnd(18),
      h,
    );
  }
  console.log('\nt=0.00 is the shipped door: hand over whatever ranks first, always.');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const out = await measure();
  mkdirSync(RUNS_DIR, { recursive: true });
  const path = resolve(RUNS_DIR, 'library-abstention.json');
  writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
  print(out);
  console.log(`\nwrote ${path}`);
}
