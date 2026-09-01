// discover.mjs — resolve the seed manifest into real, adjudicated source records.
//
// This is the TRANSPORT half of intake. Everything it learns is handed straight to
// the pure modules that already exist — `licence.classify`, `forks.toProvenanceRecord`,
// `seeds.capKind` — because those are the parts that carry the policy and they are
// the parts under test. Nothing here decides anything; it fetches, and it records.
//
// WHY `gh` AND NOT `fetch`. The GitHub REST API allows 60 unauthenticated requests
// per hour and 5000 authenticated. Resolving 118 repositories takes ~240 calls, so
// unauthenticated is not merely slower, it cannot finish. `gh` is already
// authenticated in this environment and costs nothing, which matters: §J says
// "Do not spend money."
//
// RESUMABLE ON PURPOSE. Results are written after every repo, and a re-run skips
// anything already resolved unless --force. A discovery pass that loses 100 repos
// because the 101st rate-limited is a pass nobody will re-run.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSeeds, parseGitHubUrl, seedRecord, capKind, validateSeed } from './intake/seeds.mjs';
import { classify } from './intake/licence.mjs';
import { toProvenanceRecord } from './intake/forks.mjs';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const MANIFEST = join(PKG, 'seeds', 'manifest.json');
const OUT = join(PKG, 'data', 'sources.json');

/** One `gh api` call. Returns {ok,data} or {ok:false,error} — never throws, so one
 *  dead repo cannot end the pass. A 404 here is a real finding (deleted/renamed),
 *  not an error to retry. */
async function gh(path) {
  try {
    const { stdout } = await execFileAsync('gh', ['api', path, '-H', 'Accept: application/vnd.github+json'], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true, data: JSON.parse(stdout) };
  } catch (err) {
    const msg = String(err?.stderr ?? err?.message ?? err);
    const status = /HTTP (\d{3})/.exec(msg)?.[1] ?? null;
    return { ok: false, status, error: msg.trim().slice(0, 300) };
  }
}

function decodeContent(payload) {
  if (!payload?.content) return null;
  const enc = payload.encoding ?? 'base64';
  if (enc !== 'base64') return null;
  try {
    return Buffer.from(payload.content, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/** Resolve ONE GitHub repository into an adjudicated record. */
export async function resolveRepo(seed, { discoveredAt }) {
  const parsed = parseGitHubUrl(seed.url);
  const rec = seedRecord(seed, { discoveredAt });
  if (!parsed) {
    rec.notes.push('not a GitHub repo url');
    return rec;
  }
  const { owner, repo } = parsed;

  const repoRes = await gh(`repos/${owner}/${repo}`);
  if (!repoRes.ok) {
    rec.resolved = false;
    rec.error = { stage: 'repo', status: repoRes.status, detail: repoRes.error };
    rec.notes.push(
      repoRes.status === '404'
        ? 'Repository is gone, renamed, or private. Recorded rather than dropped: a source that vanished is a finding.'
        : 'Repository metadata could not be read.',
    );
    return rec;
  }
  const api = repoRes.data;

  // The commit the licence verdict actually describes. Without it the record would
  // claim a licence about "the repo", which is not a thing that has a licence.
  const shaRes = await gh(`repos/${owner}/${repo}/commits/${api.default_branch}`);
  const sha = shaRes.ok ? (shaRes.data?.sha ?? null) : null;

  // LICENSE file text is the strongest evidence the classifier accepts.
  const licRes = await gh(`repos/${owner}/${repo}/license`);
  const licenseFileText = licRes.ok ? decodeContent(licRes.data) : null;
  const licenseFilePath = licRes.ok ? (licRes.data?.path ?? 'LICENSE') : 'LICENSE';

  const verdict = classify({
    licenseFileText,
    spdxId: api?.license?.spdx_id ?? null,
    repoDescription: api?.description ?? null,
    licenseFilePath,
  });

  const provenance = toProvenanceRecord(api, { discoveredAt, sha });
  provenance.licence = capKind(verdict, seed.kind);

  rec.resolved = true;
  rec.licence = provenance.licence;
  rec.provenance = provenance;
  rec.repo = `${owner}/${repo}`;
  if (seed.path) rec.path = seed.path;
  rec.signals = {
    stars: api?.stargazers_count ?? 0,
    forks: api?.forks_count ?? 0,
    archived: api?.archived ?? false,
    isFork: api?.fork === true,
    parent: api?.parent?.full_name ?? null,
    pushedAt: api?.pushed_at ?? null,
    defaultBranch: api?.default_branch ?? null,
    licenceFilePresent: licenseFileText !== null,
  };
  // §J asks for meaningful divergence to be detectable. A fork whose upstream is
  // also in the manifest is a dedupe candidate the next pass must consider.
  if (rec.signals.isFork && rec.signals.parent) {
    rec.notes.push(`Fork of ${rec.signals.parent}; content-hash before granting it independent weight (§J).`);
  }
  if (rec.signals.archived) rec.notes.push('Archived upstream — treat as frozen, not maintained.');
  return rec;
}

// ------------------------------------------------------------------------ runner
/**
 * Candidates enumerated from the package registries, if `enumerate.mjs` has produced any.
 *
 * THE HANDOFF THAT WAS MISSING. §J asked for the Wally and Pesde indexes to be enumerated, and
 * they were — once, by hand, into a set of aggregate counts. The 6,588 packages were counted and
 * discarded: no list, no re-runnable enumerator, and nothing feeding intake, so every record in
 * the corpus still carried `origin: "seed-manifest"` and the corpus was exactly the seed floor.
 *
 * A registry candidate arrives with the licence its PUBLISHER DECLARED, which §H is explicit is
 * a claim rather than evidence. It is dropped on the floor here on purpose: resolution reads the
 * repository's actual LICENSE file and `classify` decides, exactly as it does for a hand-picked
 * seed. An index saying MIT buys a candidate nothing except the right to be checked.
 */
function loadRegistrySeeds() {
  const file = join(PKG, 'data', 'registry-seeds.json');
  if (!existsSync(file)) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  return (parsed.seeds ?? []).map((s) => ({
    id: `reg-${s.registryName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    url: s.url,
    category: 'registry-package',
    kind: 'repo',
    origin: s.origin,
  }));
}

export async function run({ force = false, limit = Infinity, includeRegistry = false } = {}) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const seeds = loadSeeds(manifest);
  if (includeRegistry) {
    const extra = loadRegistrySeeds().filter((s) => !seeds.byId.has(s.id));
    // Deduplicate by URL as well as by id: a registry package whose repository is already a
    // hand-picked seed is the same source twice, and counting it twice is the failure §2 names.
    const knownUrls = new Set(seeds.entries.map((e) => e.url.replace(/\.git$/, '').toLowerCase()));
    const novel = extra.filter((s) => !knownUrls.has(s.url.replace(/\.git$/, '').toLowerCase()));
    //[[ A MALFORMED REGISTRY CANDIDATE IS SKIPPED; A MALFORMED HAND-WRITTEN SEED THROWS.
    //
    //   `loadSeeds` is deliberately unforgiving because the manifest is written by a person and
    //   a typo there is a mistake that should stop the run. This input is different in kind:
    //   1,082 URLs typed by 1,082 strangers into a package index, where a handful of oddities is
    //   the expected condition rather than a defect in this repository. One bad row must not
    //   halt a bulk import — but it must be COUNTED, because silently dropping candidates is how
    //   a corpus quietly stops growing. ]]
    let rejected = 0;
    for (const s of novel) {
      try {
        validateSeed(s);
      } catch {
        rejected += 1;
        continue;
      }
      seeds.entries.push(s);
      seeds.byId.set(s.id, s);
    }
    console.log(
      `[discover] +${novel.length - rejected} registry candidates ` +
        `(${extra.length - novel.length} already known, ${rejected} unusable)`,
    );
  }
  const discoveredAt = new Date().toISOString().slice(0, 10);

  let store = { generatedAt: null, counts: {}, records: {} };
  if (existsSync(OUT) && !force) {
    try { store = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* start clean */ }
  }
  store.records ??= {};

  const repoSeeds = seeds.entries.filter((e) => e.kind === 'repo');
  const other = seeds.entries.filter((e) => e.kind !== 'repo');

  // Non-repo kinds cannot prove anything about themselves (§H). They are recorded
  // in their refusing state so the manifest is complete and the to-do is visible.
  for (const seed of other) {
    if (store.records[seed.id] && !force) continue;
    store.records[seed.id] = seedRecord(seed, { discoveredAt });
  }

  let done = 0;
  for (const seed of repoSeeds) {
    if (done >= limit) break;
    if (store.records[seed.id]?.resolved && !force) continue;
    const rec = await resolveRepo(seed, { discoveredAt });
    store.records[seed.id] = rec;
    done += 1;
    const cls = rec.licence?.class ?? '?';
    process.stdout.write(`${String(done).padStart(3)} ${seed.id.padEnd(46)} ${cls}\n`);
    mkdirSync(dirname(OUT), { recursive: true });
    store.generatedAt = new Date().toISOString();
    store.counts = tally(store.records);
    writeFileSync(OUT, JSON.stringify(store, null, 2));
  }

  store.generatedAt = new Date().toISOString();
  store.counts = tally(store.records);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(store, null, 2));
  return store;
}

function tally(records) {
  const byClass = {}, byKind = {}, byCategory = {};
  let resolved = 0, errored = 0;
  for (const r of Object.values(records)) {
    byClass[r.licence?.class ?? 'NONE'] = (byClass[r.licence?.class ?? 'NONE'] ?? 0) + 1;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    if (r.resolved) resolved += 1;
    if (r.error) errored += 1;
  }
  return { total: Object.keys(records).length, resolved, errored, byClass, byKind, byCategory };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  const limArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limArg ? Number(limArg.split('=')[1]) : Infinity;
  run({ force, limit }).then((s) => {
    console.log('\n=== counts ===');
    console.log(JSON.stringify(s.counts, null, 2));
  });
}
