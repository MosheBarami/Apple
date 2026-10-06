#!/usr/bin/env node
// Aggregate every piece folder of a milestone into planning/proof/<milestone>/baseline.md (handoff 3.4's report).
//
//   node scripts/eval/baseline.mjs <milestone> [--proof-root planning/proof] [--out file]
//
// Reads, per folder: manifest.json (a run, a dry run, an abort), verdict.json (written by write-verdicts.mjs),
// credits.json and timing.json. Measures only; it computes nothing a model said.
//
// THE NUMBERS AND WHAT THEY MEAN
//   attempted      pieces whose agent run was made (a dry run is not an attempt; a piece whose harness stopped before
//                  the run is not an attempt either, and is listed as not run).
//   pass rate      passing / attempted, shown as a count and as a percentage that is rounded DOWN, never up.
//                  Plan 4.3 asks for every scripted functional check to pass; none is defined before M5, so in M3
//                  nothing can pass and this strict number is 0 by construction (lib/verdict.mjs says why).
//   ...ignoring    the same count with only the functional-check clause waived. It is labelled as what it is and is
//                  never the headline: it says how many pieces would pass if the checks existed and passed.
//   conversation   whether each attempted piece ran in a fresh conversation (the project's chat, memory and build ledger cleared
//                  just before the run). A piece that did not (an older manifest, a harness that could not clear it) shared the
//                  chat of the pieces before it, and the report says so beside the numbers.
//   area means     the mean of the LOWER of the two critics' scores per area, per category, over the pieces that were
//                  scored by both critics (an area both critics marked N/A is left out of that mean).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AREAS, AREA_LABELS } from './lib/verdict.mjs';
import { REPO_ROOT } from './lib/dev-set.mjs';

export const CATEGORY_ORDER = ['ui', 'systems', 'props', 'zones'];
export const CATEGORY_LABELS = { ui: 'UI', systems: 'Systems', props: 'Props', zones: 'Zones' };

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const max = (xs) => (xs.length ? Math.max(...xs) : null);
const fmt = (v, digits = 2) => (v === null || v === undefined ? 'n/a' : (Math.round(v * 10 ** digits) / 10 ** digits).toFixed(digits));
/** A percentage of `part` in `whole`, rounded DOWN to one decimal so a rate is never shown higher than it is. */
export const pctDown = (part, whole) => (whole === 0 ? 'n/a' : `${(Math.floor((1000 * part) / whole) / 10).toFixed(1)}%`);

/** Read every piece folder under <proofRoot>/<milestone>. Returns the raw per-piece records and the milestone folder. */
export function collect(milestone, proofRoot = join(REPO_ROOT, 'planning', 'proof')) {
  const dir = join(proofRoot, milestone);
  if (!existsSync(dir)) throw new Error(`no folder ${dir}`);
  const pieces = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory() || name.name.includes('.prev-')) continue;
    const d = join(dir, name.name);
    const manifest = readJson(join(d, 'manifest.json'));
    if (!manifest) continue;
    pieces.push({
      id: manifest.request?.id ?? name.name,
      category: manifest.request?.category ?? null,
      dir: d,
      manifest,
      verdict: readJson(join(d, 'verdict.json')),
      credits: readJson(join(d, 'credits.json')),
      timing: readJson(join(d, 'timing.json')),
    });
  }
  pieces.sort((a, b) => a.id.localeCompare(b.id));
  return { dir, pieces };
}

/** A verdict reason, reduced to what it is about, so reasons can be counted across pieces. */
export function reasonKey(reason) {
  let m;
  if ((m = /^(\w+): the lower score/.exec(reason))) return `${m[1]}: lower score below 8`;
  if ((m = /^severe flaw (\d)/.exec(reason))) return `severe flaw ${m[1]}`;
  if (/^play test: \d+ error/.test(reason)) return 'play test errors';
  if (/^play test: (it did not run|not established)/.test(reason)) return 'play test not established';
  if (/^screenshots: /.test(reason)) return 'planned pictures missing';
  if (/^ui: both critics marked UI\/UX N\/A/.test(reason)) return 'UI area marked N/A on a UI piece';
  if (/^claim audit: \d+ unsupported/.test(reason)) return 'unsupported claims';
  if (/^claim audit: it did not run/.test(reason)) return 'claim audit did not run';
  if (/^functional checks: none are defined/.test(reason)) return 'functional checks not defined (they arrive in M5)';
  if (/^functional check "/.test(reason)) return 'a functional check failed';
  if ((m = /^the run did not end normally \(([\w-]+)\)/.exec(reason))) return `run did not end normally (${m[1]})`;
  if (/^critic [AB] is not usable/.test(reason)) return 'a critic was not usable';
  return reason.slice(0, 70);
}

/** Pure aggregation over the records `collect` returns. */
export function aggregate(pieces) {
  const dry = pieces.filter((p) => p.manifest.harness?.dryRun === true);
  const real = pieces.filter((p) => p.manifest.harness?.dryRun !== true);
  const attempted = real.filter((p) => p.manifest.run && p.manifest.run.startedAt);
  const notRun = real.filter((p) => !(p.manifest.run && p.manifest.run.startedAt));
  const scored = attempted.filter((p) => p.verdict);
  const awaiting = attempted.filter((p) => !p.verdict);
  const passing = scored.filter((p) => p.verdict.status === 'pass');
  const failing = scored.filter((p) => p.verdict.status === 'fail');
  const unevaluable = scored.filter((p) => p.verdict.status === 'unevaluable');
  const passingIgnoringFunctional = scored.filter((p) => p.verdict.passIgnoringFunctionalChecks === true);

  const byCategory = {};
  for (const cat of CATEGORY_ORDER) {
    const inCat = scored.filter((p) => (p.verdict.piece?.category ?? p.category) === cat && p.verdict.lower);
    const areas = {};
    for (const area of AREAS) {
      const values = inCat.map((p) => num(p.verdict.lower[area])).filter((v) => v !== null);
      areas[area] = { mean: mean(values), n: values.length };
    }
    byCategory[cat] = { pieces: inCat.length, areas };
  }
  const allScored = scored.filter((p) => p.verdict.lower);
  const overall = { pieces: allScored.length, areas: {} };
  for (const area of AREAS) {
    const values = allScored.map((p) => num(p.verdict.lower[area])).filter((v) => v !== null);
    overall.areas[area] = { mean: mean(values), n: values.length };
  }

  const creditsOf = (p) => num(p.credits?.spentCredits) ?? (num(p.credits?.balanceDeltaLedger) !== null ? num(p.credits.balanceDeltaLedger) / (num(p.credits.ledgerPerCredit) ?? 150) : null);
  const credits = attempted.map(creditsOf).filter((v) => v !== null);
  const runMinutes = attempted.map((p) => num(p.manifest.run?.minutes)).filter((v) => v !== null);
  const totalMinutes = attempted.map((p) => (num(p.timing?.totalMs) !== null ? p.timing.totalMs / 60_000 : null)).filter((v) => v !== null);

  const byStart = [...attempted].sort((a, b) => String(a.manifest.harness?.startedAt).localeCompare(String(b.manifest.harness?.startedAt)));
  const byEnd = [...attempted].sort((a, b) => String(a.manifest.harness?.finishedAt).localeCompare(String(b.manifest.harness?.finishedAt)));
  const spend = {
    before: byStart[0]?.manifest.spend?.before ?? null,
    after: byEnd.at(-1)?.manifest.spend?.after ?? null,
  };

  const fresh = attempted.filter((p) => p.manifest.conversation?.cleared === true);
  const sharedChat = attempted.filter((p) => p.manifest.conversation?.cleared !== true);

  const reasonCounts = {};
  for (const p of scored) for (const r of p.verdict.reasons ?? []) {
    const key = reasonKey(r);
    reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
  }

  const distinct = (fn) => [...new Set(attempted.map(fn).filter(Boolean))];
  return {
    counts: { devSetFolders: pieces.length, dryRuns: dry.length, attempted: attempted.length, scored: scored.length, awaiting: awaiting.length, passing: passing.length, failing: failing.length, unevaluable: unevaluable.length, passingIgnoringFunctional: passingIgnoringFunctional.length, notRun: notRun.length },
    conversation: { freshChat: fresh.length, attempted: attempted.length, sharedChat: sharedChat.map((p) => p.id) },
    singleCritic: scored.filter((p) => p.verdict.singleCritic === true).map((p) => p.id),
    ids: { awaiting: awaiting.map((p) => p.id), notRun: notRun.map((p) => `${p.id} (${p.manifest.aborted?.step ?? 'no run'})`), passing: passing.map((p) => p.id) },
    byCategory,
    overall,
    credits: { n: credits.length, mean: mean(credits), max: max(credits), total: credits.reduce((a, b) => a + b, 0) },
    runMinutes: { n: runMinutes.length, mean: mean(runMinutes), max: max(runMinutes), total: runMinutes.reduce((a, b) => a + b, 0) },
    totalMinutes: { n: totalMinutes.length, mean: mean(totalMinutes), max: max(totalMinutes) },
    spend,
    playTestErrors: attempted.filter((p) => num(p.manifest.playTest?.errors) > 0).map((p) => `${p.id} (${p.manifest.playTest.errors})`),
    reasonCounts,
    provenance: {
      rubric: [...new Set(scored.map((p) => p.verdict.rubric?.sha256).filter(Boolean))],
      rubricVersions: [...new Set(scored.map((p) => p.verdict.rubric?.version).filter(Boolean))],
      devSetSha256: distinct((p) => p.manifest.request?.devSetSha256),
      buildSha: distinct((p) => p.manifest.deploy?.buildSha),
      baseline: distinct((p) => p.manifest.baseline?.sha256),
      apiBase: distinct((p) => p.manifest.deploy?.apiBase),
    },
    rows: attempted.map((p) => ({
      id: p.id,
      category: p.category,
      status: p.verdict?.status ?? 'awaiting critics',
      lower: p.verdict?.lower ?? null,
      severe: p.verdict?.critics ? (p.verdict.critics.a?.severeFlaws?.length ?? 0) + (p.verdict.critics.b?.severeFlaws?.length ?? 0) : null,
      playErrors: num(p.manifest.playTest?.errors),
      unsupported: p.verdict?.nonCritic?.claimAudit?.unsupported ?? null,
      credits: creditsOf(p),
      minutes: num(p.manifest.run?.minutes),
      endedBy: p.manifest.run?.endedBy ?? null,
    })),
  };
}

const spendLine = (s) => (s ? `month $${fmt(Number(s.estimatedMonthUsd), 2)} (${s.monthBillableNeurons ?? '?'} billable neurons), today ${s.dayNeurons ?? '?'} neurons` : 'not recorded');

export function renderMarkdown(milestone, agg) {
  const c = agg.counts;
  const L = [];
  L.push(`# ${milestone} baseline`, '');
  L.push('Measured numbers only, written by `scripts/eval/baseline.mjs` from the piece folders in this directory. Nothing here is rounded up.', '');
  L.push('## Pass rate (plan 4.3)', '');
  L.push(`- **Passing / attempted: ${c.passing} / ${c.attempted} (${pctDown(c.passing, c.attempted)})**`);
  L.push(`- failing ${c.failing}, not evaluable ${c.unevaluable}, awaiting critics ${c.awaiting}`);
  if (agg.singleCritic?.length) {
    L.push(`- **One critic, not two:** ${agg.singleCritic.length} of ${c.scored} scored pieces were scored by a single critic (owner token rule, 2026-10-05), so "the lower of the two critics" is that critic's score. That is a weaker test than the plan's two independent critics.`);
  }
  L.push(`- attempted = pieces whose agent run was made. Dry runs not counted: ${c.dryRuns}. Not run (harness stopped first): ${c.notRun}${agg.ids.notRun.length ? ` (${agg.ids.notRun.join(', ')})` : ''}.`);
  L.push(`- Conversation: ${agg.conversation.freshChat} of ${c.attempted} attempted pieces ran in a FRESH conversation (the project's chat, the memory it produced and the build ledger were cleared just before the run, by POST /api/admin/conversation-reset).`);
  if (agg.conversation.sharedChat.length) {
    L.push(`- **${agg.conversation.sharedChat.length} attempted piece(s) SHARED THE PROJECT'S EARLIER CONVERSATION (it was not cleared before them): ${agg.conversation.sharedChat.join(', ')}.** The agent saw the earlier requests and replies as history, which can change its cost and behaviour, so their scores are not comparable with a fresh-chat piece's.`);
  }
  L.push(`- **Passing, with the functional-check clause waived: ${c.passingIgnoringFunctional} / ${c.attempted} (${pctDown(c.passingIgnoringFunctional, c.attempted)})**. This is NOT the plan's pass rate. Per-request scripted functional checks do not exist before M5, so the strict rate above cannot be above 0 by construction; this line says how many pieces satisfy the other four clauses (critics, severe flaws, play test, claim audit).`);
  if (Object.keys(agg.reasonCounts).length) {
    L.push('', 'Why pieces did not pass (a piece can have several reasons):', '');
    for (const [r, n] of Object.entries(agg.reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)) L.push(`- ${n} x ${r}`);
  }
  if (c.awaiting) L.push('', `Awaiting critics (run write-verdicts): ${agg.ids.awaiting.join(', ')}`);
  L.push('', '## Mean of the lower critic score, per area and category', '');
  L.push('Scores are 0 to 10. Each cell is the mean over the pieces that both critics scored in that area (an area both marked N/A is left out); the count of pieces is in brackets.', '');
  L.push(`| Category | ${AREAS.map((a) => AREA_LABELS[a]).join(' | ')} | Pieces |`, `|---|${AREAS.map(() => '---').join('|')}|---|`);
  for (const cat of CATEGORY_ORDER) {
    const row = agg.byCategory[cat];
    L.push(`| ${CATEGORY_LABELS[cat]} | ${AREAS.map((a) => (row.areas[a].n ? `${fmt(row.areas[a].mean)} (${row.areas[a].n})` : 'n/a')).join(' | ')} | ${row.pieces} |`);
  }
  L.push(`| **All** | ${AREAS.map((a) => (agg.overall.areas[a].n ? `${fmt(agg.overall.areas[a].mean)} (${agg.overall.areas[a].n})` : 'n/a')).join(' | ')} | ${agg.overall.pieces} |`);
  L.push('', '## Cost and time per piece', '');
  L.push(`- Credits per piece (as the app shows them, ${agg.credits.n} pieces measured): mean ${fmt(agg.credits.mean)}, max ${fmt(agg.credits.max)}, total ${fmt(agg.credits.total)}.`);
  L.push(`- Agent-run minutes per piece (${agg.runMinutes.n} measured): mean ${fmt(agg.runMinutes.mean)}, max ${fmt(agg.runMinutes.max)}, total ${fmt(agg.runMinutes.total)}.`);
  L.push(`- Whole-harness minutes per piece (run plus reset, captures and play test, ${agg.totalMinutes.n} measured): mean ${fmt(agg.totalMinutes.mean)}, max ${fmt(agg.totalMinutes.max)}.`);
  L.push('', '## Workers AI spend', '');
  L.push(`- Before the first run: ${spendLine(agg.spend.before)}`);
  L.push(`- After the last run: ${spendLine(agg.spend.after)}`);
  if (agg.spend.before && agg.spend.after) L.push(`- Change in the month's estimate: $${fmt(Number(agg.spend.after.estimatedMonthUsd) - Number(agg.spend.before.estimatedMonthUsd), 4)} (the figure counts every caller, not only these runs).`);
  L.push('', '## Play test', '');
  L.push(agg.playTestErrors.length ? `Pieces with play-test errors: ${agg.playTestErrors.join(', ')}.` : 'No piece had a play-test error.');
  L.push('', '## Pieces', '');
  L.push(`| Id | Category | Status | ${AREAS.map((a) => a).join(' | ')} | Severe | Play errors | Unsupported claims | Credits | Run min | Ended |`, `|---|---|---|${AREAS.map(() => '---').join('|')}|---|---|---|---|---|---|`);
  for (const r of agg.rows) {
    L.push(`| ${r.id} | ${r.category ?? '?'} | ${r.status} | ${AREAS.map((a) => (r.lower ? fmt(r.lower[a], 1) : 'n/a')).join(' | ')} | ${r.severe ?? 'n/a'} | ${r.playErrors ?? 'n/a'} | ${r.unsupported ?? 'n/a'} | ${fmt(r.credits)} | ${fmt(r.minutes)} | ${r.endedBy ?? 'n/a'} |`);
  }
  L.push('', '## Provenance', '');
  const list = (xs) => (xs.length ? xs.join(', ') : 'none recorded');
  L.push(`- Rubric: version ${list(agg.provenance.rubricVersions)}, sha256 ${list(agg.provenance.rubric.map((s) => s.slice(0, 12)))}${agg.provenance.rubric.length > 1 ? ' (MORE THAN ONE RUBRIC WAS USED: these scores are not comparable)' : ''}`);
  L.push(`- Dev set sha256: ${list(agg.provenance.devSetSha256.map((s) => s.slice(0, 12)))}${agg.provenance.devSetSha256.length > 1 ? ' (THE DEV SET CHANGED BETWEEN RUNS)' : ''}`);
  L.push(`- Deployed build (from /api/health at each run): ${list(agg.provenance.buildSha)}${agg.provenance.buildSha.length > 1 ? ' (the build changed during the batch)' : ''}`);
  L.push(`- Place baseline sha256: ${list(agg.provenance.baseline.map((s) => s.slice(0, 12)))}${agg.provenance.baseline.length > 1 ? ' (MORE THAN ONE BASELINE)' : ''}`);
  L.push(`- API base: ${list(agg.provenance.apiBase)}`, '');
  return L.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  let milestone = null;
  let proofRoot = join(REPO_ROOT, 'planning', 'proof');
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--proof-root') proofRoot = argv[++i];
    else if (argv[i] === '--out') out = argv[++i];
    else if (argv[i].startsWith('--')) {
      console.error(`unknown flag ${argv[i]}`);
      process.exit(1);
    } else milestone = argv[i];
  }
  if (!milestone) {
    console.error('usage: baseline.mjs <milestone> [--proof-root dir] [--out file]');
    process.exit(1);
  }
  const { dir, pieces } = collect(milestone, proofRoot);
  const agg = aggregate(pieces);
  const file = out ?? join(dir, 'baseline.md');
  writeFileSync(file, renderMarkdown(milestone, agg));
  console.log(`wrote ${file}: ${agg.counts.passing} / ${agg.counts.attempted} passing (${pctDown(agg.counts.passing, agg.counts.attempted)}), ${agg.counts.unevaluable} not evaluable, ${agg.counts.awaiting} awaiting critics`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
