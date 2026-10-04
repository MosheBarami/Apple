#!/usr/bin/env node
/**
 * The review step of the owner's benchmark: the judge's scores are a first pass, and a human (or Claude, harshly)
 * looks at the photos and may LOWER a score with a reason, never raise one.
 *
 *   node review.mjs sheet results/<run>.json [--offline] [--out <file.md>]
 *       Makes sure every evaluated item's photos are on disk (downloads the missing ones; the server keeps them one
 *       hour, run.mjs already saved them) and writes a review sheet: per item the request, scores, critique, census,
 *       play test and photo paths. Default sheet: results/<run>/review.md.
 *   node review.mjs apply results/<run>.json adjustments.json [--out <results.json>] [--dry-run]
 *       Records lowered scores. adjustments.json is
 *         [{ "id": "o03", "scores": { "professional": 0, "fx": 1 }, "reason": "photo 2 shows a flat grey disc" }]
 *       A score is lowered only when the new value is below the current one; anything else is reported and ignored.
 *       The row keeps originalScores/originalTotal and an `adjustments` list (when, criterion, from, to, reason),
 *       and its scores and total change, so score.mjs reads the reviewed numbers. The results file is rewritten in
 *       place unless --out is given.
 *
 * `sheet` downloads (free, authenticated like run.mjs); `apply` never touches the network.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CRITERIA, createAuth, downloadPhotos, findUp, loadEnvFile, readRows, safeName as safe, writeRows } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---------------------------------------------------------------- sheet */

const isJudged = (r) => r?.scores && CRITERIA.every((k) => Number.isFinite(r.scores[k]));

/**
 * Brings every row's photos onto disk and returns `Map<id, [{name, file|null, error?}]>` with absolute files.
 * A photo already on disk is kept; a missing one is fetched when `fetchPhotos` is given, else listed as missing.
 */
export async function ensurePhotos({ rows, resultsFile, base, getToken, fetch: fetchFn }) {
  const resultsDir = dirname(resultsFile);
  const out = new Map();
  for (const r of rows) {
    const wanted = r.eval?.images || [];
    if (!wanted.length) continue;
    const missing = wanted.filter((img) => !existsSync(photoFile(resultsFile, r.id, img.name)));
    let fresh = [];
    if (missing.length && getToken) fresh = await downloadPhotos({ images: missing, dir: dirname(photoFile(resultsFile, r.id, 'x')), relTo: resultsDir, base, getToken, fetch: fetchFn });
    out.set(r.id, wanted.map((img) => {
      const file = photoFile(resultsFile, r.id, img.name);
      if (existsSync(file)) return { name: safe(img.name), file };
      return { name: safe(img.name), file: null, error: fresh.find((p) => p.name === safe(img.name))?.error ?? (getToken ? 'not available' : 'not on disk (offline)') };
    }));
  }
  return out;
}

/** Where run.mjs (and this step) keep a photo: <results dir>/<run>/<item id>/<name>.png. */
const photoFile = (resultsFile, id, name) => join(dirname(resultsFile), basename(resultsFile, '.json'), id, `${safe(name)}.png`);

/** The review sheet as Markdown. Pure. `photos` is ensurePhotos' map. */
export function reviewSheet({ rows, photos, runName }) {
  const judged = rows.filter(isJudged);
  const lines = [
    `# Review sheet: ${runName}`,
    '',
    `${judged.length} of ${rows.length} items judged. Look at each item's photos, then write adjustments.json and run \`review.mjs apply\`.`,
    'Scores may only be LOWERED (0-2 integers), each with a reason that cites the photo. Judge harshly: the first pass is generous.',
    '',
    '```json',
    '[{ "id": "o01", "scores": { "professional": 0 }, "reason": "photo 2: the chest is one grey box, no lid or hinge" }]',
    '```',
    '',
    `Criteria: ${CRITERIA.join(', ')}.`,
  ];
  for (const r of rows) {
    lines.push('', `## ${r.id} (${r.category}) status: ${r.status ?? 'unknown'}`, '', `Request: ${(r.turns || []).join(' → then: ')}`);
    if (r.error) lines.push(`Error: ${r.error}`);
    if (isJudged(r)) {
      lines.push(`Scores (${r.total}/18): ${CRITERIA.map((k) => `${k}=${r.scores[k]}`).join(' ')}`);
      if (r.originalScores) lines.push(`Judge's original: ${CRITERIA.map((k) => `${k}=${r.originalScores[k]}`).join(' ')} (${r.originalTotal}/18); already lowered ${r.adjustments?.length ?? 0} time(s)`);
    } else lines.push('Scores: none (unmeasured, not zero)');
    lines.push(`Credits: ${r.credits ?? 'n/a'}; seconds: ${r.seconds ?? 'n/a'}; steps: ${r.steps ?? 'n/a'}`);
    const c = r.eval?.census;
    if (c) lines.push(`Census: ${Object.entries(c).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    const p = r.eval?.play;
    if (p) lines.push(`Play test: ${p.verdict ?? (p.ok ? 'ok' : 'failed')}${p.errors?.length ? `; errors: ${p.errors.slice(0, 3).join(' | ')}` : ''}`);
    if (r.eval?.problems?.length) lines.push(`Problems: ${r.eval.problems.join(' | ')}`);
    if (r.critique?.length) lines.push('Critique:', ...r.critique.map((x) => `- ${x}`));
    const ph = photos.get(r.id);
    if (ph?.length) lines.push('Photos:', ...ph.map((x) => `- ${x.name}: ${x.file ?? `MISSING (${x.error})`}`));
    else if (r.status) lines.push('Photos: none recorded');
    if (r.adjustments?.length) lines.push('Adjustments so far:', ...r.adjustments.map((a) => `- ${a.criterion} ${a.from} -> ${a.to}: ${a.reason}`));
  }
  return lines.join('\n') + '\n';
}

/* ---------------------------------------------------------------- apply */

/**
 * Lowers scores on `rows` (mutates them) from `adjustments`. Never raises. Returns
 * `{applied:[{id,criterion,from,to}], ignored:[{id,criterion?,why}]}`.
 */
export function applyAdjustments(rows, adjustments, { now = Date.now } = {}) {
  const applied = [], ignored = [];
  if (!Array.isArray(adjustments)) throw new Error('adjustments must be an array');
  for (const adj of adjustments) {
    const id = adj?.id;
    const reason = typeof adj?.reason === 'string' ? adj.reason.trim() : '';
    if (!reason) { ignored.push({ id, why: 'a reason is required' }); continue; }
    const row = rows.find((r) => r.id === id);
    if (!row) { ignored.push({ id, why: 'no such item in the results' }); continue; }
    if (!isJudged(row)) { ignored.push({ id, why: 'item has no scores to lower' }); continue; }
    if (!adj.scores || typeof adj.scores !== 'object') { ignored.push({ id, why: 'no scores given' }); continue; }
    let lowered = false;
    for (const [criterion, to] of Object.entries(adj.scores)) {
      const from = row.scores[criterion];
      if (!CRITERIA.includes(criterion)) { ignored.push({ id, criterion, why: 'unknown criterion' }); continue; }
      if (!Number.isInteger(to) || to < 0 || to > 2) { ignored.push({ id, criterion, why: 'a score is an integer 0-2' }); continue; }
      if (to >= from) { ignored.push({ id, criterion, why: `not lower than the current ${from}; scores are never raised` }); continue; }
      row.originalScores ??= { ...row.scores };
      row.originalTotal ??= row.total;
      row.scores[criterion] = to;
      (row.adjustments ??= []).push({ at: new Date(now()).toISOString(), criterion, from, to, reason });
      applied.push({ id, criterion, from, to });
      lowered = true;
    }
    if (lowered) row.total = CRITERIA.reduce((a, k) => a + row.scores[k], 0);
  }
  return { applied, ignored };
}

/* ---------------------------------------------------------------- CLI */

export async function main(argv, deps = {}) {
  const log = deps.log ?? console.log;
  const [command, resultsArg, third, ...rest] = argv;
  const flags = (list) => ({ offline: list.includes('--offline'), dryRun: list.includes('--dry-run'), out: list.includes('--out') ? list[list.indexOf('--out') + 1] : undefined });
  if (command === 'sheet' && resultsArg) {
    const f = flags([third, ...rest].filter(Boolean));
    const resultsFile = resolve(resultsArg);
    const rows = readRows(resultsFile);
    const runName = basename(resultsFile, '.json');
    let getToken = null, base = null, fetchFn = deps.fetch ?? fetch;
    if (!f.offline) {
      const env = deps.env ?? (loadEnvFile(findUp(HERE, '.env')), process.env);
      const wrangler = findUp(HERE, 'apps/worker/wrangler.studpilot.jsonc');
      const wr = wrangler ? readFileSync(wrangler, 'utf8') : '';
      const anonKey = deps.anonKey ?? wr.match(/"SUPABASE_ANON_KEY":\s*"([^"]+)"/)?.[1];
      base = (env.API_BASE ?? 'https://apple.moshe-barami111.workers.dev').replace(/\/$/, '');
      // Sign in only when some photo is actually missing: a sheet over saved photos needs no network.
      const photosMissing = rows.some((r) => (r.eval?.images || []).some((img) => !existsSync(photoFile(resultsFile, r.id, img.name))));
      if (photosMissing) {
        if (!anonKey) throw new Error('SUPABASE_ANON_KEY not found in apps/worker/wrangler.studpilot.jsonc');
        getToken = createAuth({ fetch: fetchFn, env, now: deps.now, anonKey });
      }
    }
    const photos = await ensurePhotos({ rows, resultsFile, base, getToken, fetch: fetchFn });
    const sheet = reviewSheet({ rows, photos, runName });
    const out = f.out ? resolve(f.out) : join(dirname(resultsFile), runName, 'review.md');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, sheet);
    log(`review sheet: ${out}`);
    return { out, sheet };
  }
  if (command === 'apply' && resultsArg && third) {
    const f = flags(rest);
    const resultsFile = resolve(resultsArg);
    const rows = readRows(resultsFile);
    const { applied, ignored } = applyAdjustments(rows, JSON.parse(readFileSync(resolve(third), 'utf8')), { now: deps.now });
    for (const a of applied) log(`lowered ${a.id} ${a.criterion}: ${a.from} -> ${a.to}`);
    for (const i of ignored) log(`ignored ${i.id ?? '?'}${i.criterion ? ' ' + i.criterion : ''}: ${i.why}`);
    if (applied.length && !f.dryRun) writeRows(f.out ? resolve(f.out) : resultsFile, rows);
    log(`${applied.length} lowered, ${ignored.length} ignored${f.dryRun ? ' (dry run, nothing written)' : ''}`);
    return { applied, ignored };
  }
  throw new Error('usage: review.mjs sheet <results.json> [--offline] [--out f.md] | review.mjs apply <results.json> <adjustments.json> [--out f.json] [--dry-run]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(`review.mjs: ${e.message}`); process.exit(2); });
}
