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
 *   GH_TOKEN=... node packages/training/src/read-github-trees.mjs [--limit=N] [--relicence]
 *                                                                  [--disposition=X --out=PATH]
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
 * Licence files as they are actually named at a repository root.
 *
 * WHY THIS IS NOT `/^(LICEN[CS]E|COPYING)(\.[A-Za-z0-9]+)?$/`. That was the first matcher, and it
 * missed two whole families, in both cases writing "NO licence file found at the repository root"
 * over a root that had one:
 *
 *   `UNLICENSE`          — the canonical filename of the Unlicense, which does not begin with
 *                          LICEN[CS]E at all. Seven repositories in this corpus.
 *   `LICENSE-APACHE.md`  — the dual-licence convention. The old pattern allowed a dot extension
 *   `LICENSE-MIT.txt`      and nothing else, so a `-APACHE` stem was not a licence file.
 *
 * Eleven licence-verified repositories holding 310 Luau files were excluded from the corpus by
 * that, and the exclusion read as a rights fact rather than as the string-matching defect it was.
 *
 * A hyphen or underscore suffix must NAME A LICENCE FAMILY; a dot extension may be anything. That
 * one distinction is what separates `LICENSE-APACHE.md` (in) from `license-checker.luau` (out, a
 * script about licences) while keeping `LICENSE.luau` in — the corpus really does contain a
 * repository that saved the MIT text under a `.luau` extension, and that file is its licence.
 *
 * NOTICE is deliberately absent. An Apache NOTICE file sits beside the grant and is not one.
 */
const LICENCE_FAMILY = 'APACHE|MIT|BSD|GPL|LGPL|AGPL|MPL|ISC|ZLIB|CC0|CC-BY|CC|UNLICENSE|EPL|BSL|WTFPL|BOOST|ARTISTIC';
const LICENCE_AT_ROOT = new RegExp(
  `^(LICEN[CS]E|UNLICEN[CS]E|COPYING|COPYRIGHT|OFL)([-_](${LICENCE_FAMILY})[A-Za-z0-9.-]*)?(\\.[A-Za-z0-9]+)*$`,
  'i',
);

/** A word in a licence filename that names the licence family, e.g. LICENSE-APACHE.md -> apache. */
const SPDX_FILENAME_HINT = {
  'apache-2.0': 'apache',
  mit: 'mit',
  'mit-0': 'mit',
  unlicense: 'unlicen',
  'bsd-3-clause': 'bsd',
  'bsd-2-clause': 'bsd',
  '0bsd': 'bsd',
  isc: 'isc',
  'cc0-1.0': 'cc0',
  zlib: 'zlib',
};

/**
 * Which of a root's licence files is THE one, when there is more than one.
 *
 * A dual-licensed repository ships `LICENSE-APACHE` and `LICENSE-MIT` side by side. Picking the
 * first in tree order is picking at random, and picking wrong is not cosmetic: `acquire-github-luau.mjs`
 * fetches exactly this file and rejects the repository when its text does not corroborate the SPDX
 * id GitHub detected. An Apache-2.0 repository whose MIT file was fetched is recorded
 * `licence_text_mismatch` and contributes nothing — a false rejection wearing the costume of a
 * rights finding.
 *
 * So: prefer the file whose NAME names the detected licence; otherwise the shortest name, which is
 * the bare `LICENSE` when one exists; ties broken by sort so the choice is reproducible.
 */
export function preferredLicenceFile(names, spdx) {
  if (names.length === 0) return null;
  const hint = SPDX_FILENAME_HINT[String(spdx ?? '').toLowerCase()];
  const sorted = [...names].sort((a, b) => a.length - b.length || a.localeCompare(b));
  if (hint) {
    const named = sorted.find((n) => n.toLowerCase().includes(hint));
    if (named) return named;
  }
  return sorted[0];
}

/**
 * Fold one GitHub tree response into the count fields the probed schema left null.
 *
 * `spdx` is the licence GitHub detected on the repository object. It is used ONLY to choose
 * between several licence files at the root, never to decide whether one is there.
 *
 * Pure, so the guard can drive it with a truncated tree and a complete one and watch the basis
 * string change, without a network call.
 */
export function summariseTree(body, spdx = null) {
  const entries = Array.isArray(body?.tree) ? body.tree : [];
  const blobs = entries.filter((e) => e.type === 'blob');
  const luau = blobs.filter((e) => /\.luau$/i.test(e.path));
  const lua = blobs.filter((e) => /\.lua$/i.test(e.path));
  const both = [...luau, ...lua];
  const truncated = body?.truncated === true;
  const root = (p) => !p.includes('/');
  const licenceBlobs = blobs.filter((e) => root(e.path) && LICENCE_AT_ROOT.test(e.path));
  const preferred = preferredLicenceFile(licenceBlobs.map((e) => e.path), spdx);
  const licenceBlob = licenceBlobs.find((e) => e.path === preferred) ?? null;
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

  // --disposition/--out measure a bucket OTHER than admit_candidate into its own artifact.
  //
  // Sixty repositories are held `hold_archived`: permissive licence, archived, never opened. That
  // is the same shape as the 923 the relevance filter rejected and the 4,269 nobody probed — a
  // bucket with a word on it and no number in it. A hold whose volume is unknown is indistinguishable
  // from a hold that is empty, and the two get treated the same way, which is to say not at all.
  const DISPOSITION = (process.argv.find((a) => a.startsWith('--disposition=')) ?? '').split('=')[1] || 'admit_candidate';
  const OUT_PATH = (process.argv.find((a) => a.startsWith('--out=')) ?? '').split('=')[1] || OUT;

  const probed = readFileSync(IN, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const targets = probed
    .filter((r) => r.disposition === DISPOSITION && isRobloxRelevant(r))
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));

  if (targets.length === 0) {
    console.error(`the ${DISPOSITION} partition is empty — this run would measure nothing. Refusing.`);
    process.exit(3);
  }
  console.error(`${targets.length} licence-verified Roblox-relevant ${DISPOSITION} repositories to tree-read`);

  // --relicence re-reads ONLY the rows whose licence file came back null.
  //
  // The matcher that produced those nulls missed UNLICENSE and LICENSE-APACHE, so a null is the
  // one verdict it could get wrong in the direction that costs rows. A row where a licence file
  // WAS found needs no re-read: the widened matcher can only add siblings beside it, and the
  // preference order can only move the pick to a file that better matches the detected SPDX id —
  // which cannot change a repository whose text already corroborated, and all 1,022 acquired ones
  // did (`repositories_rejected_for_licence_text_mismatch: 0`). Re-reading the whole set would
  // re-measure 1,052 trees at a later HEAD and move every figure in the corpus for no finding.
  const RELICENCE = process.argv.includes('--relicence');

  const done = new Map();
  if (existsSync(OUT_PATH)) {
    for (const line of readFileSync(OUT_PATH, 'utf8').trim().split('\n')) {
      if (!line) continue;
      try { const o = JSON.parse(line); done.set(o.source_id, o); } catch { /* partial line from a kill */ }
    }
    console.error(`resuming: ${done.size} already tree-read`);
  }

  if (RELICENCE) {
    const stale = [...done.values()].filter((o) => o.tree_status === 'ok' && !o.license_file_name);
    for (const o of stale) done.delete(o.source_id);
    console.error(`--relicence: re-reading ${stale.length} repositories recorded as having no licence file at their root`);
    if (stale.length === 0) { console.error('nothing to re-read; refusing to make a pass that measures nothing look like a pass that found nothing'); process.exit(4); }
  }

  const out = [];
  let n = 0; let ok = 0; let empty = 0; let gone = 0; let errors = 0; let truncated = 0;
  const flush = () => writeFileSync(OUT_PATH, out.map((o) => JSON.stringify(o)).join('\n') + '\n');

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
      const summary = summariseTree(body, repo.api_license_guess);
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
  console.error(`\nwrote ${out.length} rows to ${OUT_PATH}`);
  console.error(`tree-read ok ${ok}, truncated ${truncated}, empty ${empty}, not-found ${gone}, errors ${errors}`);
  console.error(`Luau/Lua files across repositories whose tree was read: ${files}`);
  console.error(`Luau/Lua bytes: ${bytes} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
  console.error(`repositories with a licence FILE seen in the tree: ${measured.filter((o) => o.license_file_name).length}`);
}
/* c8 ignore stop */
