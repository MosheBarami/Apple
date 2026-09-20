#!/usr/bin/env node
/**
 * PUT EVERY APPROACH INTO ONE UNIT: "does the customer get working Luau".
 *
 * Four workflows reported retrieval top-1 (61% -> 75% / 81% / 82.5% / 91%). This file reports the
 * generation arms in the only unit a customer can feel — a module that passes its own exhaustive
 * checks when EXECUTED — and then converts the retrieval numbers into that same unit, so the five
 * lines of work can be read off one table instead of four incomparable ones.
 *
 * THE CONVERSION IS EXACT, NOT A MODEL. Every one of the 80 verified modules passes the curriculum
 * checks for its own id — this file RUNS all eighty to establish that rather than citing the build
 * script — so a policy of "retrieve, and hand the top hit over" is correct exactly when retrieval's
 * top-1 is correct and wrong otherwise. Its end-to-end score therefore EQUALS top-1, with no
 * generation and no model call. That is what makes 61% and 67% comparable numbers: at 61% top-1 the
 * door is worse than the model it was meant to help.
 *
 * PAIRED, NOT INDEPENDENT. Every arm sees the same prompts, so an arm is compared to the baseline by
 * counting FLIPS (fixed / broken) and testing them with an exact McNemar, not by subtracting two
 * percentages that each carry their own binomial noise.
 *
 * Usage: node packages/training/src/compare-generation-arms.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { runSpecCase } from './tool-trajectory-verify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = resolve(HERE, '..', 'runs');
const CORPUS = resolve(HERE, '../../corpus/data/verified-modules.json');

const load = (f) => JSON.parse(readFileSync(resolve(RUNS, f), 'utf8'));

/** Two-sided exact McNemar over the discordant pairs. b fixed, c broken. */
export function mcnemarExact(b, c) {
  const n = b + c;
  if (n === 0) return { n: 0, p: 1 };
  const logFact = (k) => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  const pmf = (k) => Math.exp(logFact(n) - logFact(k) - logFact(n - k) + n * Math.log(0.5));
  let tail = 0;
  const lo = Math.min(b, c);
  for (let k = 0; k <= lo; k++) tail += pmf(k);
  return { n, p: Math.min(1, 2 * tail) };
}

/** Does the LIBRARY's module for this id pass the curriculum's own checks? Run it, do not assume. */
function libraryPassesItsOwnChecks() {
  const modules = new Map(JSON.parse(readFileSync(CORPUS, 'utf8')).modules.map((m) => [m.id, m]));
  let pass = 0, fail = 0, missing = 0;
  const failures = [];
  for (const e of ALL_GAME_LOGIC_CURRICULUM) {
    const m = modules.get(e.id);
    if (!m) { missing += 1; continue; }
    const outcome = runSpecCase(`local candidate = (function()\n${m.source}\nend)()\n${e.checks}`);
    if (outcome.ran && outcome.compiled && outcome.passed) pass += 1;
    else { fail += 1; failures.push({ id: e.id, detail: outcome.detail ?? outcome.reason }); }
  }
  return { n: ALL_GAME_LOGIC_CURRICULUM.length, pass, fail, missing, failures };
}

function main() {
  const files = readdirSync(RUNS).filter((f) => /^generation-arm-.*\.json$/.test(f) && !f.includes('pilot'));
  const arms = new Map();
  for (const f of files) {
    const d = load(f);
    arms.set(d.arm, { file: f, data: d, byId: new Map(d.rows.map((r) => [r.id, r])) });
  }
  const base = arms.get('baseline');
  if (!base) { console.error('no baseline arm on disk — run --arm baseline first'); process.exit(2); }

  const library = libraryPassesItsOwnChecks();

  const table = [];
  for (const [name, arm] of arms) {
    const d = arm.data;
    // Compare only on prompts BOTH arms measured. A prompt one arm never got an answer for is not a
    // prompt it got wrong, and dropping it from one side only would move the flips.
    const shared = [...arm.byId.keys()].filter((id) => base.byId.has(id));
    let fixed = 0, broken = 0, bothOk = 0, bothBad = 0;
    const fixedIds = [], brokenIds = [];
    for (const id of shared) {
      const a = arm.byId.get(id).ok, b = base.byId.get(id).ok;
      if (a && !b) { fixed += 1; fixedIds.push(id); }
      else if (!a && b) { broken += 1; brokenIds.push(id); }
      else if (a && b) bothOk += 1; else bothBad += 1;
    }
    const mc = mcnemarExact(fixed, broken);
    table.push({
      arm: name,
      n: d.n, ok: d.ok, pct: d.pct,
      notMeasured: d.notMeasured,
      pairedN: shared.length,
      vsBaseline: name === 'baseline' ? null : { fixed, broken, net: fixed - broken, bothOk, bothBad, mcnemarP: Number(mc.p.toFixed(4)), fixedIds, brokenIds },
      callsPerPrompt: d.callsPerPrompt,
      neuronsPerPrompt: d.neuronsPerPrompt,
      gatewayMsPerPrompt: d.gatewayMsPerPrompt,
      reasons: d.reasons,
      notShippable: d.notShippable ?? null,
    });
  }

  //[[ THE SELF-VERIFICATION CROSS-TAB. This is the number that decides whether a repair loop keyed
  //   on the model's OWN assertions can ever work, and it is the one a headline would hide: if the
  //   model's spec passes on modules the hidden checks fail, the model cannot see its own bug and
  //   the loop is a loop that never fires.
  let selfCheck = null;
  const spec = arms.get('specrepair');
  if (spec) {
    const rows = spec.data.rows;
    const t = { specRan: 0, specUnusable: 0, firedAndWasWrong: 0, firedButWasRight: 0, silentAndWasWrong: 0, silentAndWasRight: 0, repaired: 0, repairPassedOwnSpec: 0, keptDraft: 0 };
    for (const r of rows) {
      if (!r.specRan) { t.specUnusable += 1; continue; }
      t.specRan += 1;
      if (r.specFired) { if (r.ok) t.firedButWasRight += 1; else t.firedAndWasWrong += 1; }
      else { if (r.ok) t.silentAndWasRight += 1; else t.silentAndWasWrong += 1; }
      if (r.repaired) t.repaired += 1;
      if (r.repairPassesOwnSpec) t.repairPassedOwnSpec += 1;
      if (r.keptDraftBecauseRepairStillFails) t.keptDraft += 1;
    }
    //[[ The decisive ratio: of the prompts the arm still got WRONG, on how many did the model's own
    //   assertions stay silent? Those are the ones no amount of repair could ever have reached.
    const stillWrong = rows.filter((r) => !r.ok).length;
    selfCheck = {
      ...t,
      stillWrong,
      unreachableBySelfCheck: t.silentAndWasWrong,
      unreachablePctOfRemainingFailures: stillWrong ? Math.round((t.silentAndWasWrong / stillWrong) * 100) : 0,
    };
  }

  //[[ HOW CLOSE THE EXEMPLARS GET TO THE TARGET, COUNTED RATHER THAN WAVED AT.
  //
  //   Leave-one-out removes the target's own module. It does not remove a NEAR NEIGHBOUR: the
  //   library holds `route-cost` and `grid-route-cost`, and an arm that quietly hands one over while
  //   asking for the other is closer to copying than to learning. Families are unique per module so
  //   there is no same-family exemplar, and the crude id-token overlap below is what is left to
  //   report. It is a caveat on the few-shot arms, stated as a count, not an assurance.
  const exemplarProximity = {};
  for (const [name, arm] of arms) {
    if (!name.startsWith('fewshot')) continue;
    let shared = 0, total = 0;
    for (const r of arm.data.rows) {
      const want = new Set(r.id.split('-'));
      for (const id of r.exemplars ?? []) {
        total += 1;
        if (id.split('-').some((w) => want.has(w))) shared += 1;
      }
    }
    exemplarProximity[name] = { exemplars: total, sharingAnIdTokenWithTheTarget: shared };
  }

  //[[ RETRIEVAL, RESTATED IN THE SAME UNIT. Not a new measurement — the recorded top-1 counts,
  //   multiplied by the fact established above that a library module passes its own checks.
  const retrieval = [];
  const addRetrieval = (label, file, pick) => {
    try {
      const d = load(file);
      const top1 = pick(d);
      if (top1 == null) return;
      retrieval.push({
        policy: `retrieve-then-hand-over (${label})`,
        customerTop1: top1, of: 80,
        endToEndPct: Math.round((top1 / 80) * 1000) / 10,
        modelCalls: 0,
        note: 'correct exactly when top-1 is correct, because every library module passes its own checks',
      });
    } catch { /* a run that is not on disk is simply not listed */ }
  };
  //[[ THE 49/80 ROW IS HISTORY, NOT THE DOOR. knowledge-reach.json recorded the shipped scorer at
  //   11:23 on 2026-09-20; commit 21231d9 shipped need-index-search.ts later the same day and the
  //   same function now answers 73/80. Restating the recorded figure as "the shipped door" would
  //   put a number in this table that no live code produces — the exact substitution this file was
  //   written to stop. So the recorded row is LABELLED as recorded, and the live re-run of the same
  //   function, measured by measure-embedding-retrieval.mjs against the Worker's own bundle, is
  //   listed beside it. When the two agree the second row is a duplicate and costs nothing; when
  //   they disagree, the disagreement is the point.
  addRetrieval('shipped door AS RECORDED 11:23, superseded', 'knowledge-reach.json', (d) => d.customer?.top1 ?? null);
  addRetrieval('shipped door RE-RUN LIVE, searchVerifiedModules today', 'embedding-retrieval.json',
    (d) => d.harness?.rerunBaseline?.customerTop1 ?? null);
  addRetrieval('need-index BM25F, peer workflow', 'knowledge-reach-need-index.json', (d) => d.headline?.['bm25f+need']?.customerTop1 ?? null);
  addRetrieval('embedding index, int8 in the bundle', 'embedding-retrieval.json',
    (d) => d.modules?.shippedPath?.customer?.top1 ?? null);

  const out = {
    measuredAt: new Date().toISOString(),
    what: 'Every approach in ONE unit: the share of requests that end in Luau which passes its own exhaustive checks when executed.',
    slice: { from: base.data.settings.offset, n: base.data.settings.n, curriculum: ALL_GAME_LOGIC_CURRICULUM.length },
    settings: base.data.settings,
    libraryPassesItsOwnChecks: library,
    arms: table.sort((a, b) => b.pct - a.pct),
    selfCheck,
    exemplarProximity,
    retrievalInTheSameUnit: retrieval,
  };
  writeFileSync(resolve(RUNS, 'generation-arms-comparison.json'), JSON.stringify(out, null, 1) + '\n');

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\nlibrary sanity: ${library.pass}/${library.n} verified modules pass the curriculum's own checks when executed${library.fail ? ` — ${library.fail} FAIL` : ''}`);
  console.log(`\nslice: curriculum[${base.data.settings.offset}..${base.data.settings.offset + base.data.settings.n - 1}], gateway ${base.data.settings.gateway} @ ${base.data.settings.effectiveTokens} tokens, served ${base.data.settings.servedModel}\n`);
  console.log(`${pad('arm', 13)}${pad('pass', 12)}${pad('fixed', 7)}${pad('broke', 7)}${pad('McNemar p', 11)}${pad('calls', 7)}${pad('neurons', 9)}ms/prompt`);
  for (const r of out.arms) {
    const v = r.vsBaseline;
    console.log(
      pad(r.arm, 13) + pad(`${r.ok}/${r.n} (${r.pct}%)`, 12)
      + pad(v ? `+${v.fixed}` : '—', 7) + pad(v ? `-${v.broken}` : '—', 7)
      + pad(v ? v.mcnemarP : '—', 11)
      + pad(r.callsPerPrompt, 7) + pad(r.neuronsPerPrompt, 9) + r.gatewayMsPerPrompt
      + (r.notShippable ? '   [CEILING — NOT SHIPPABLE]' : ''),
    );
  }
  if (selfCheck) {
    console.log(`\nself-check cross-tab (specrepair): own assertions ran on ${selfCheck.specRan}/${selfCheck.specRan + selfCheck.specUnusable}`);
    console.log(`  fired and the answer really was wrong : ${selfCheck.firedAndWasWrong}`);
    console.log(`  fired though the answer was right     : ${selfCheck.firedButWasRight}`);
    console.log(`  SILENT though the answer was wrong    : ${selfCheck.silentAndWasWrong}  <- unreachable by this loop`);
    console.log(`  silent and the answer was right       : ${selfCheck.silentAndWasRight}`);
    console.log(`  of ${selfCheck.stillWrong} remaining failures, ${selfCheck.unreachablePctOfRemainingFailures}% were never seen by the model's own assertions`);
  }
  if (Object.keys(exemplarProximity).length) {
    console.log('\nexemplar proximity (leave-one-out removes the answer, not its neighbours):');
    for (const [k, v] of Object.entries(exemplarProximity)) console.log(`  ${pad(k, 18)}${v.sharingAnIdTokenWithTheTarget}/${v.exemplars} exemplars share an id token with the target`);
  }
  if (retrieval.length) {
    console.log('\nthe retrieval workflows, restated in this unit (0 model calls, hand the top hit over):');
    for (const r of retrieval) console.log(`  ${pad(r.policy, 52)}${r.customerTop1}/80 (${r.endToEndPct}%)`);
  }
  console.log(`\n-> ${resolve(RUNS, 'generation-arms-comparison.json')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
