#!/usr/bin/env node
/**
 * The second pass: open the file tree of every licence-verified, Roblox-relevant repository.
 *
 * `probe-github-leads.mjs` read the repository OBJECT — which carries the licence — for all 4,269
 * unopened leads. It did not read the file TREE, so `docs/github-corpus-licences.md` had to say, in
 * its own words: "Not a file count. The leads were never tree-read, so `luau_lua_file_count` is 0
 * across all of them and the 5.45 GB is repository size, not Luau."
 *
 * A number that is repository size standing in for Luau volume is exactly the defect this codebase
 * is built against: a quantity that was never measured, rendered as though it had been. 1,063
 * repositories with a verified licence are worth nothing to a corpus until somebody knows whether
 * they contain ten Luau files or ten thousand.
 *
 *   GH_TOKEN=... node packages/training/src/read-github-trees.mjs [--limit=N]
 *
 * ONE request per repository: `GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=1`. The response
 * carries every path, its blob sha and its byte size, so the count, the byte total and a
 * content-addressed handle for later retrieval all come from the same read.
 *
 * WHAT IS RECORDED HONESTLY AND MUST STAY THAT WAY.
 *
 *   `tree_truncated`. GitHub truncates a recursive tree above roughly 100k entries or 7MB of
 *   response. When it does, the file count is a FLOOR, not a total, and `estimated_rows_basis`
 *   says so in those words. Writing a truncated count as a total is how "5.45 GB" became a Luau
 *   figure in the first place.
 *
 *   `license_file_name` / `license_file_sha`. Taken from the tree, so this is evidence that a
 *   licence FILE exists at the root and its content-addressed identity — one tier better than the
 *   API's `license.spdx_id` guess, one tier short of having read the text. `clear-rights.mjs`
 *   draws that line and this file does not blur it: the tier stays `tree_listing`, and
 *   `fetch-github-licences.mjs` is what lifts a repository to `licence_text`.
 *
 * THE TOKEN IS READ FROM THE ENVIRONMENT AND NEVER WRITTEN ANYWHERE. Every request here is a read.
 * Nothing in this file admits a repository to anything; `admitted_to_training` is carried through
 * untouched and stays false.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const IN = resolve(HERE, '..', 'discovery', 'v2', 'github-probed.jsonl');
const OUT = resolve(HERE, '..', 'discovery', 'v2', 'github-trees.jsonl');

/**
 * Roblox-relevant, by the same rule `docs/github-corpus-licences.md` used to get 1,063.
 *
 * The original search sweep pulled in `sindresorhus/awesome` and `public-apis/public-apis`, which
 * are licence-clean and have nothing to do with Roblox. Primary language Lua or Luau, OR the
 * owner/name naming roblox/rbx/luau. Exported so the guard can check the partition is non-empty
 * rather than silently measuring nothing.
 */
export function isRobloxRelevant(row) {
  const lang = String(row.primary_language ?? '').toLowerCase();
  const id = String(row.source_id ?? '').toLowerCase();
  return lang === 'lua' || lang === 'luau' || /roblox|rbx|luau/.test(id);
}

/** A Luau/Lua source blob. `.lua` counts: most Roblox repositories predate the `.luau` extension. */
export function isLuauPath(path) {
  return /\.luau$/i.test(path) || /\.lua$/i.test(path);
}

/**
 * Fold one GitHub tree response into the count fields the probed schema left null.
 *
 * Pure, so the guard can drive it with a truncated tree and a complete one and watch the basis
 * string change, without a network call.
 */
export function summariseTree(body) {
  const entries = Array.isArray(body?.tree) ? body.tree : [];
  const blobs = entries.filter((e) => e.type === 'blob');
  const luau = blobs.filter((e) => /\.luau$/i.test(e.path));
  const lua = blobs.filter((e) => /\.lua$/i.test(e.path));
  const both = [...luau, ...lua];
  const truncated = body?.truncated === true;
  const root = (p) => !p.includes('/');
  const licenceBlob = blobs.find((e) => root(e.path) && /^(LICEN[CS]E|COPYING)(\.[A-Za-z0-9]+)?$/i.test(e.path));
  return {
    tree_sha: body?.sha ?? null,
    tree_truncated: truncated,
    file_count_total: blobs.length,
    file_count_luau_ext: luau.length,
    file_count_lua_ext: lua.length,
    luau_lua_file_count: both.length,
    luau_lua_bytes: both.reduce((n, e) => n + (Number(e.size) || 0), 0),
    has_rojo_project: blobs.some((e) => /(^|\/)[^/]*\.project\.json$/i.test(e.path)),
    has_wally_toml: blobs.some((e) => /(^|\/)wally\.toml$/i.test(e.path)),
    license_file_name: licenceBlob?.path ?? null,
    license_file_sha: licenceBlob?.sha ?? null,
    sample_luau_paths: both.slice(0, 5).map((e) => e.path),
    estimated_rows_one_file_per_row: both.length,
    // The whole point of the field. A truncated tree yields a floor and must never read as a total.
    estimated_rows_basis: truncated
      ? 'FLOOR ONLY: GitHub truncated the recursive tree, so this count is a lower bound, not a total'
      : 'one row per .luau/.lua blob in the complete recursive tree at tree_sha',
  };
}

/* c8 ignore start -- network driver; the pure folds above are what the guard exercises */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const TOKEN = process.env.GH_TOKEN;
  if (!TOKEN) {
    console.error('GH_TOKEN is not set. Unauthenticated GitHub allows 60 requests an hour against a job '
      + 'needing 1,063 — refusing rather than starting something that cannot end.');
    process.exit(2);
  }

  const argLimit = Number((process.argv.find((a) => a.startsWith('--limit=')) ?? '').split('=')[1]);
  const LIMIT = Number.isSafeInteger(argLimit) && argLimit > 0 ? argLimit : Infinity;

  const probed = readFileSync(IN, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const targets = probed
    .filter((r) => r.disposition === 'admit_candidate' && isRobloxRelevant(r))
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));

  if (targets.length === 0) {
    console.error('the admit-candidate partition is empty — this run would measure nothing. Refusing.');
    process.exit(3);
  }
  console.error(`${targets.length} licence-verified Roblox-relevant repositories to tree-read`);

  const done = new Map();
  if (existsSync(OUT)) {
    for (const line of readFileSync(OUT, 'utf8').trim().split('\n')) {
      if (!line) continue;
      try { const o = JSON.parse(line); done.set(o.source_id, o); } catch { /* partial line from a kill */ }
    }
    console.error(`resuming: ${done.size} already tree-read`);
  }

  const out = [];
  let n = 0; let ok = 0; let empty = 0; let gone = 0; let errors = 0; let truncated = 0;
  const flush = () => writeFileSync(OUT, out.map((o) => JSON.stringify(o)).join('\n') + '\n');

  for (const repo of targets.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
    if (done.has(repo.source_id)) { out.push(done.get(repo.source_id)); continue; }
    const path = String(repo.source_url).replace(/^https:\/\/github\.com\//, '');
    let res; let body;
    try {
      res = await fetch(`https://api.github.com/repos/${path}/git/trees/HEAD?recursive=1`, {
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'apple-corpus-tree' },
      });
      body = res.status === 200 ? await res.json() : null;
    } catch (e) {
      errors++;
      out.push({ ...repo, tree_status: 'tree_failed', tree_error: e.message });
      continue;
    }

    if (res.status === 404 || res.status === 409) {
      // 409 is an empty repository: it exists, it has no commits, so it has no tree.
      if (res.status === 404) gone++; else empty++;
      out.push({
        ...repo,
        tree_status: res.status === 404 ? 'not_found_404' : 'empty_repository_409',
        file_count_total: 0,
        luau_lua_file_count: 0,
        luau_lua_bytes: 0,
        estimated_rows_one_file_per_row: 0,
        estimated_rows_basis: res.status === 404 ? 'repository not found at tree-read time' : 'repository has no commits',
      });
    } else if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
      console.error(`rate limited after ${n} tree reads; resets ${reset ? new Date(reset).toISOString() : 'unknown'}. `
        + 'Re-run to resume — progress is written as it goes.');
      break;
    } else if (!body) {
      errors++;
      out.push({ ...repo, tree_status: 'tree_failed', tree_error: `http ${res.status}` });
    } else {
      ok++;
      const summary = summariseTree(body);
      if (summary.tree_truncated) truncated++;
      out.push({
        ...repo,
        ...summary,
        tree_status: 'ok',
        evidence_depth: 'api_repo_object+git_tree',
        license_evidence: summary.license_file_name
          ? `GitHub API licence detection, plus a licence file seen in the tree at ${summary.license_file_name} (text NOT read)`
          : 'GitHub API licence detection; NO licence file found at the repository root',
        // Still not licence_text. Seeing the file is not reading it, and the tier must say so.
        license_verified: summary.license_file_name ? 'github_api_detection+licence_file_present' : 'github_api_detection',
      });
    }

    if (++n % 100 === 0) {
      flush();
      console.error(`${n}/${targets.length} — ok ${ok}, truncated ${truncated}, empty ${empty}, 404 ${gone}, errors ${errors}, `
        + `rate remaining ${res.headers.get('x-ratelimit-remaining')}`);
    }
  }

  flush();
  const measured = out.filter((o) => o.tree_status === 'ok');
  const files = measured.reduce((n2, o) => n2 + (o.luau_lua_file_count || 0), 0);
  const bytes = measured.reduce((n2, o) => n2 + (o.luau_lua_bytes || 0), 0);
  console.error(`\nwrote ${out.length} rows to ${OUT}`);
  console.error(`tree-read ok ${ok}, truncated ${truncated}, empty ${empty}, not-found ${gone}, errors ${errors}`);
  console.error(`Luau/Lua files across repositories whose tree was read: ${files}`);
  console.error(`Luau/Lua bytes: ${bytes} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
  console.error(`repositories with a licence FILE seen in the tree: ${measured.filter((o) => o.license_file_name).length}`);
}
/* c8 ignore stop */
