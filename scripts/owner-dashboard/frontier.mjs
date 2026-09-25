// The Roblox frontier benchmark, per product lane: how close Apple MAX and Apple each are to 100%.
//
// Read at collection time from packages/training/runs/roblox-frontier-*.json, which
// packages/training/src/roblox-frontier-bench.mjs writes and rescore-roblox-frontier.mjs rewrites in
// place, so a re-scored run shows on the next collection with nothing to do here.
//
// WHAT THE PERCENTAGE IS. The bench's own number, not a formula of this page: `tally()` in
// score-roblox-frontier.mjs passes an item when its answer, RUN under frontier-harness.luau, passes
// every check, over the items whose verdict is the model's (checked, does_not_compile,
// no_code_block; a throw the harness may have caused is excluded). 100% = every item passes. It is
// not a comparison with another model: no frontier model has been run on this suite, and the
// hand-written pass controls in roblox-frontier-controls.mjs are "NOT reference answers" (their
// header); they only prove a correct answer reaches 100%. Replicates of one setting are pooled,
// passed over measured, as docs/frontier-for-roblox.md §9.5 reports them ("42/48 — 87.5%",
// per-sample 13/16 15/16 14/16).
//
// A FIGURE IS ONE JUDGE AND ONE REQUEST. Runs pool only when the same file versions judged them
// (the harness, scorer and tasks hashes the bench records in `provenance`) and the same request was
// sent (gateway, model, system prompt, requested tokens). A run judged by older files is labelled so
// and never folded into a current figure.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FRONTIER_ITEMS } from '../../packages/training/src/roblox-frontier-tasks.mjs';

export const LANES = ['apple-max', 'apple'];
// The owner's targets (2026-09-24): Apple MAX at 100% of the frontier, Apple at 70% or more.
export const TARGETS = { 'apple-max': 100, apple: 70 };
// ARMS['house-rules-plus'] in roblox-frontier-tasks.mjs: "production's written code rules TODAY".
export const PRODUCTION_ARM = 'house-rules-plus';
// The files that judge an answer, under the key the bench records each hash by. `controls` and
// `settingsMirror` are hashed too but judge nothing: the controls are read only by
// roblox-frontier.test.mjs, and the mirror decides what is sent, which the request key covers.
const JUDGE = { harness: 'frontier-harness.luau', scorer: 'score-roblox-frontier.mjs', tasks: 'roblox-frontier-tasks.mjs' };

const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16); // the bench's own `sha`
const round1 = (x) => Math.round(x * 10) / 10; // tally's rounding
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

/** runs: [{ file, data }] as read from disk; current: the judge hashes of the files on disk now. */
export function summarizeFrontier(runs, current) {
  const groups = new Map();
  for (const { file, data: j } of runs) {
    const s = j?.settings;
    // A tag can say anything, so the recorded suite size decides whether a run is complete.
    // One-item diagnostics must never turn a 14/16 headline into a misleading 15/17.
    if (j.items !== FRONTIER_ITEMS.length || !LANES.includes(s?.lane)
      || !(j.measured > 0) || typeof j.passed !== 'number') continue;
    const judge = Object.fromEntries(Object.keys(JUDGE).map((k) => [k, j.provenance?.[k] ?? null]));
    // The body production posts, which is what replicate 1 sends (cacheBustTokens(settings, 1)); the
    // prompt itself is fixed by the tasks hash. Later replicates shave a few tokens off the effective
    // budget to get past the gateway's response cache. That shave is the bench's cache-bust, not
    // another request, so it does not split a figure; it is kept per run (`sent`) and reported.
    const request = { gateway: s.gateway ?? null, model: s.modelId ?? null, system: j.arm?.system ? sha16(j.arm.system) : null, maxTokens: s.requestedTokens ?? null };
    const key = JSON.stringify([s.lane, s.productMode, j.arm?.id, judge, request]);
    let g = groups.get(key);
    if (!g) {
      groups.set(key, (g = { lane: s.lane, mode: s.productMode ?? null, arm: j.arm?.id ?? null, judge, request,
        current: !!current && Object.keys(JUDGE).every((k) => judge[k] && judge[k] === current[k]), runs: [], passed: 0, measured: 0, asked: 0, axes: {} }));
    }
    g.runs.push({ file, at: Date.parse(j.measuredAt) || null, pct: typeof j.pct === 'number' ? j.pct : round1((j.passed / j.measured) * 100),
      passed: j.passed, measured: j.measured, replicate: j.replicate ?? null, sent: j.sentMaxTokens ?? null, rescoredAt: Date.parse(j.rescoredAt) || null });
    // asked - measured = answers the scorer left out (a runtime error the harness may have caused).
    g.passed += j.passed; g.measured += j.measured; g.asked += j.items || j.measured;
    for (const [ax, v] of Object.entries(j.byAxis || {})) {
      const e = (g.axes[ax] ||= { passed: 0, measured: 0 });
      e.passed += v.passed || 0; e.measured += v.measured || 0;
    }
  }
  const list = [...groups.values()].map((g) => {
    const pcts = g.runs.map((r) => r.pct), ats = g.runs.map((r) => r.at).filter(Boolean), res = g.runs.map((r) => r.rescoredAt).filter(Boolean);
    return { ...g, pct: round1((g.passed / g.measured) * 100), min: Math.min(...pcts), max: Math.max(...pcts),
      first: ats.length ? Math.min(...ats) : null, last: ats.length ? Math.max(...ats) : null, rescoredAt: res.length ? Math.max(...res) : null };
  }).sort((a, b) => (b.last ?? 0) - (a.last ?? 0));

  // Per lane and mode, the production arm's figure: a current one before an older one, then the newest.
  const headline = (lane, mode) => list.filter((g) => g.lane === lane && g.mode === mode && g.arm === PRODUCTION_ARM)
    .sort((a, b) => b.current - a.current || (b.last ?? 0) - (a.last ?? 0))[0] ?? null;
  // The decision is on the counts, so 69.96% (printed 70.0) is still below 70.
  const status = (g, target) => (!g.current ? 'old' : g.passed * 100 >= target * g.measured ? 'met' : 'below');
  const modes = [...new Set(list.filter((g) => g.arm === PRODUCTION_ARM).map((g) => g.mode))].sort((a, b) => (b === 'agent') - (a === 'agent'));
  const lanes = LANES.map((lane) => ({ lane, target: TARGETS[lane],
    headlines: modes.map((mode) => headline(lane, mode)).filter(Boolean).map((g) => ({ ...g, status: status(g, TARGETS[lane]) })) }));

  // Did the two lanes' figures come from the same request to the same model? A field either side
  // failed to record is a difference, because identity cannot be shown from it.
  const same = modes.map((mode) => {
    const a = headline('apple-max', mode), b = headline('apple', mode);
    if (!a || !b) return null;
    const differs = ['gateway', 'model', 'system', 'maxTokens'].filter((k) => a.request[k] == null || a.request[k] !== b.request[k]);
    if (!a.judge.tasks || a.judge.tasks !== b.judge.tasks) differs.push('tasks'); // the prompts live in the tasks file
    const sent = [...a.runs, ...b.runs].map((r) => r.sent).filter((t) => typeof t === 'number');
    return { mode, identical: !differs.length, sent: sent.length ? [Math.min(...sent), Math.max(...sent)] : null, model: differs.includes('model') ? null : a.request.model,
      models: { 'apple-max': a.request.model, apple: b.request.model }, gateways: { 'apple-max': a.request.gateway, apple: b.request.gateway }, differs };
  }).filter(Boolean);

  return { targets: TARGETS, productionArm: PRODUCTION_ARM, current: current ?? null, lanes, same, groups: list };
}

export function frontierOf(repo) {
  const dir = path.join(repo, 'packages/training/runs'), src = path.join(repo, 'packages/training/src');
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => /^roblox-frontier-.*\.json$/.test(n)); } catch { return null; }
  // A judge file that cannot be read leaves its hash null, and then no run can claim to be current.
  const current = Object.fromEntries(Object.entries(JUDGE).map(([k, f]) => {
    try { return [k, sha16(fs.readFileSync(path.join(src, f)))]; } catch { return [k, null]; }
  }));
  return summarizeFrontier(names.map((file) => ({ file, data: readJson(path.join(dir, file)) })).filter((r) => r.data), current);
}
