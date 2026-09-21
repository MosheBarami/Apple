#!/usr/bin/env node
/**
 * The 4,269 repositories the v2 sweep found and never opened.
 *
 * discovery/v2/github.jsonl holds 4,851 rows. 577 were probed; the rest carry
 * `probe_status: "search_metadata_only"` and `license_class: "unverified_no_file_read"` — seen in a
 * search result and never looked at. A lead with an unknown licence cannot enter a training corpus,
 * so four fifths of the discovery was unusable.
 *
 * It stayed that way because `gh auth status` fails on this machine (keyring), and unauthenticated
 * GitHub is 60 requests an hour against a job that needs thousands. With a token it is 5,000/hour
 * and the licence comes back on the repository object itself, so this is ONE request per repo.
 *
 *   GH_TOKEN=... node packages/training/src/probe-github-leads.mjs [--limit N]
 *
 * THE TOKEN IS READ FROM THE ENVIRONMENT AND NEVER WRITTEN ANYWHERE. It is not echoed, not stored
 * in the output, and not committed. Every request here is a read.
 *
 * WHAT THIS DOES NOT DO. It records the licence GitHub reports, which is GitHub's own detection from
 * the LICENSE file and is not a legal opinion. `NOASSERTION` and a missing licence are written as
 * exactly that rather than being rounded to "permissive", because the whole failure this replaces
 * was a field that said something it had not checked. Admission to a corpus stays a separate
 * decision made against these values, not by this file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const IN = resolve(HERE, '..', 'discovery', 'v2', 'github.jsonl');
const OUT = resolve(HERE, '..', 'discovery', 'v2', 'github-probed.jsonl');

/** Permissive by SPDX id. Anything not on this list is NOT rounded up to permissive. */
const PERMISSIVE = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', '0BSD', 'Zlib', 'MIT-0']);
const COPYLEFT = new Set(['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-2.0', 'OSL-3.0']);

/**
 * Why a repository is not an admit candidate — and it has to be the REASON THAT APPLIED.
 *
 * The first ladder read:
 *
 *   permissive && !archived ? 'admit_candidate'
 *     : none_declared ? 'reject_no_licence_grant'
 *       : copyleft ? 'hold_copyleft_review'
 *         : 'hold_licence_unmapped'
 *
 * An ARCHIVED repository with a perfectly ordinary MIT licence fails the first clause, is not
 * none_declared and is not copyleft, and falls off the end onto `hold_licence_unmapped` — "the
 * licence could not be mapped". Sixty repositories were filed under that sentence. Fifty-three are
 * MIT, five Apache-2.0, one CC0-1.0, one Unlicense; every one of those ids is in the permit policy
 * and none of them was unmapped. What they are is archived.
 *
 * A wrong reason is worse than no reason, because a reason gets believed and never re-opened. It is
 * the same defect as "NO licence file found at the repository root" written over eleven roots that
 * had one: a fall-through rendering as a finding.
 *
 * `hold_archived` is a HOLD, not a rejection. Archiving a repository makes it read-only; it does
 * not withdraw the licence, and MIT does not expire. Whether archived source belongs in a corpus
 * that asks for CURRENT Luau is a separate judgement, which is why this says archived and stops.
 */
export function dispositionFor(row) {
  const spdx = row?.api_license_guess ?? null;
  const cls = row?.license_class
    ?? (spdx && PERMISSIVE.has(spdx) ? 'permissive_osi'
      : spdx && COPYLEFT.has(spdx) ? 'copyleft_strong'
        : spdx === null ? 'none_declared' : 'custom_needs_read');
  if (cls === 'none_declared') return 'reject_no_licence_grant';
  if (cls === 'copyleft_strong') return 'hold_copyleft_review';
  if (cls === 'permissive_osi') return row?.archived === true ? 'hold_archived' : 'admit_candidate';
  return 'hold_licence_unmapped';
}

/* c8 ignore start -- network driver; the pure ladder above is what the guard exercises */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (!isMain) { /* imported for dispositionFor; the driver below does not run */ }

const TOKEN = isMain ? process.env.GH_TOKEN : 'not-a-driver-run';
if (isMain && !TOKEN) {
  console.error('GH_TOKEN is not set. Unauthenticated GitHub allows 60 requests an hour and this job '
    + 'needs thousands, so it would not finish for days — refusing rather than starting something '
    + 'that cannot end.');
  process.exit(2);
}

const argLimit = Number((process.argv.find((a) => a.startsWith('--limit=')) ?? '').split('=')[1]);
const LIMIT = Number.isSafeInteger(argLimit) && argLimit > 0 ? argLimit : Infinity;

const rows = isMain ? readFileSync(IN, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const leads = rows.filter((r) => r.probe_status === 'search_metadata_only').slice(0, LIMIT === Infinity ? undefined : LIMIT);

const done = new Map();
if (isMain && existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').trim().split('\n')) {
    if (!line) continue;
    try { const o = JSON.parse(line); done.set(o.source_id, o); } catch { /* partial line from a kill */ }
  }
  console.error(`resuming: ${done.size} already probed`);
}

const out = [];
let n = 0, ok = 0, gone = 0, errors = 0;

for (const lead of leads) {
  if (done.has(lead.source_id)) { out.push(done.get(lead.source_id)); continue; }
  const path = String(lead.source_url).replace(/^https:\/\/github\.com\//, '');
  let res, body;
  try {
    res = await fetch(`https://api.github.com/repos/${path}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'apple-corpus-probe' },
    });
    body = res.status === 200 ? await res.json() : null;
  } catch (e) {
    errors++;
    out.push({ ...lead, probe_status: 'probe_failed', probe_error: e.message });
    continue;
  }

  if (res.status === 404) {
    gone++;
    out.push({ ...lead, probe_status: 'not_found_404', exists: false, disposition: 'dead_not_found' });
  } else if (res.status === 403 || res.status === 429) {
    // Rate limited. Stop rather than writing a wall of failures that look like findings.
    const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
    console.error(`rate limited after ${n} probes; resets ${reset ? new Date(reset).toISOString() : 'unknown'}. `
      + 'Re-run to resume — progress is written as it goes.');
    break;
  } else if (!body) {
    errors++;
    out.push({ ...lead, probe_status: 'probe_failed', probe_error: `http ${res.status}` });
  } else {
    ok++;
    const spdx = body.license?.spdx_id ?? null;
    const cls = spdx === null || spdx === 'NOASSERTION' ? 'none_declared'
      : PERMISSIVE.has(spdx) ? 'permissive_osi'
        : COPYLEFT.has(spdx) ? 'copyleft_strong'
          : 'custom_needs_read';
    out.push({
      ...lead,
      probe_status: 'ok',
      evidence_depth: 'api_repo_object',
      exists: true,
      archived: body.archived === true,
      fork: body.fork === true,
      stars: body.stargazers_count ?? 0,
      size_kb: body.size ?? 0,
      primary_language: body.language ?? null,
      pushed_at: body.pushed_at ?? null,
      api_license_guess: spdx,
      license_class: cls,
      // GitHub's own detection from the LICENSE file. Not a legal opinion, and said so here.
      license_verified: spdx !== null && spdx !== 'NOASSERTION' ? 'github_api_detection' : false,
      disposition: dispositionFor({ license_class: cls, archived: body.archived === true, api_license_guess: spdx }),
    });
  }

  if (++n % 100 === 0) {
    writeFileSync(OUT, out.map((o) => JSON.stringify(o)).join('\n') + '\n');
    const rem = res.headers.get('x-ratelimit-remaining');
    console.error(`  ${n}/${leads.length}  ok=${ok} 404=${gone} err=${errors}  rate-remaining=${rem}`);
  }
}

if (isMain) {
  writeFileSync(OUT, out.map((o) => JSON.stringify(o)).join('\n') + '\n');
  const admit = out.filter((o) => o.disposition === 'admit_candidate');
  const tally = {};
  for (const o of out) tally[o.disposition] = (tally[o.disposition] ?? 0) + 1;
  console.error(`\nprobed ${n} this run; ${out.length} rows in ${OUT}`);
  console.error(`  ok ${ok} | not found ${gone} | errors ${errors}`);
  // Every bucket, by name. A summary that prints only the admits leaves the holds to be discovered
  // by whoever subtracts, which for `hold_licence_unmapped` was nobody for a day.
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.error(`  ${k}: ${v}`);
  console.error(`  luau/lua files across admit candidates: ${admit.reduce((s2, o) => s2 + (Number(o.luau_lua_file_count) || 0), 0)}`);
}
/* c8 ignore stop */
