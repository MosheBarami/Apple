#!/usr/bin/env node
/**
 * Scores an owner-bench run (README.md): per-criterion and per-category means, and the meter's domain values by the
 * fixed formula in the owner's memory (frontier-meter-every-turn). Only judged items count; an item that did not run
 * is listed as unmeasured, never as zero and never as a pass.
 *
 * Usage: node packages/evals/owner-bench/score.mjs results/<run>.json [--md]
 */
import { readFileSync } from 'node:fs';

export const CRITERIA = ['works', 'professional', 'matches', 'polished', 'noErrors', 'performance', 'sound', 'animation', 'fx'];
/** Fixed weights of the whole-product meter (memory frontier-meter-every-turn, set 2026-10-02). */
export const WEIGHTS = { agent: 25, library: 20, visual: 15, ui: 10, sensory: 10, website: 20 };

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** The run's numbers. `rows` is the results array; `estimates` fills domains the bench cannot measure. Pure. */
export function scoreRun(rows, estimates = { library: 15, website: 10, ui: 25 }) {
  const judged = rows.filter((r) => r && r.scores && CRITERIA.every((k) => Number.isFinite(r.scores[k])));
  const unmeasured = rows.filter((r) => !judged.includes(r)).map((r) => r.id);
  const per = Object.fromEntries(CRITERIA.map((k) => [k, mean(judged.map((r) => r.scores[k]))]));
  const categories = {};
  for (const r of judged) (categories[r.category] ??= []).push(r);
  const byCategory = Object.fromEntries(Object.entries(categories).map(([c, rs]) => [c, { n: rs.length, total: mean(rs.map((r) => r.total)), matches: mean(rs.map((r) => r.scores.matches)), professional: mean(rs.map((r) => r.scores.professional)) }]));
  const pct = (v) => (v === null ? null : Math.round((v / 2) * 1000) / 10);
  const visualCats = new Set(['object', 'silly', 'modify', 'map', 'game']);
  const uiRows = judged.filter((r) => r.category === 'ui' || r.category === 'game');
  const domains = {
    agent: { value: pct(mean(judged.map((r) => (r.scores.works + r.scores.matches + r.scores.noErrors) / 3))), measured: judged.length > 0 },
    visual: { value: pct(mean(judged.filter((r) => visualCats.has(r.category)).map((r) => r.scores.professional))), measured: judged.some((r) => visualCats.has(r.category)) },
    ui: uiRows.length ? { value: pct(mean(uiRows.map((r) => r.scores.polished))), measured: true } : { value: estimates.ui, measured: false },
    sensory: { value: pct(mean(judged.map((r) => (r.scores.sound + r.scores.animation + r.scores.fx) / 3))), measured: judged.length > 0 },
    library: { value: estimates.library, measured: false },
    website: { value: estimates.website, measured: false },
  };
  const total = Object.entries(WEIGHTS).reduce((a, [k, w]) => a + (w * (domains[k].value ?? 0)) / 100, 0);
  return {
    items: rows.length, judged: judged.length, unmeasured, per, byCategory, domains, total: Math.round(total * 10) / 10,
    meanTotal: mean(judged.map((r) => r.total)), credits: judged.reduce((a, r) => a + (r.credits || 0), 0),
  };
}

/** The run as Markdown, for BASELINE.md. Pure. */
export function scoreMarkdown(run, rows) {
  const f = (v, d = 2) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(d));
  const lines = [
    `Judged ${run.judged} of ${run.items}; mean total ${f(run.meanTotal)}/18; ${run.credits} credits.${run.unmeasured.length ? ` Unmeasured: ${run.unmeasured.join(', ')}.` : ''}`,
    '',
    '| criterion | mean (0-2) |', '|---|---|',
    ...CRITERIA.map((k) => `| ${k} | ${f(run.per[k])} |`),
    '',
    '| category | n | mean total /18 | matches | professional |', '|---|---|---|---|---|',
    ...Object.entries(run.byCategory).map(([c, v]) => `| ${c} | ${v.n} | ${f(v.total)} | ${f(v.matches)} | ${f(v.professional)} |`),
    '',
    `| domain | weight | value | measured |`, '|---|---|---|---|',
    ...Object.entries(WEIGHTS).map(([k, w]) => `| ${k} | ${w}% | ${f(run.domains[k].value, 1)}% | ${run.domains[k].measured ? 'yes' : 'estimate'} |`),
    `| **total** | 100% | **${f(run.total, 1)}%** | |`,
    '',
    '| id | request | total | works,prof,matches,polish,noErr,perf,sound,anim,fx | credits | s | top critique |', '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.id} | ${(r.turns || []).join(' → ').replace(/\|/g, '/')} | ${r.total ?? '—'} | ${r.scores ? CRITERIA.map((k) => r.scores[k]).join('') : '—'} | ${r.credits ?? '—'} | ${r.seconds ?? '—'} | ${((r.critique || [])[0] || r.error || '').replace(/\|/g, '/').slice(0, 160)} |`),
  ];
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error('usage: score.mjs <results.json> [--md]'); process.exit(2); }
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  const run = scoreRun(rows);
  console.log(process.argv.includes('--md') ? scoreMarkdown(run, rows) : JSON.stringify(run, null, 2));
}
