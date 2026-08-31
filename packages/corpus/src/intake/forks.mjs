// forks.mjs — discover a repository's fork network and resolve it to its true origin.
// Implements the DISCOVER / FIND UPSTREAM / ENUMERATE ALL FORKS rungs of SOURCE-INTELLIGENCE.md §1.
//
// ---------------------------------------------------------------------------------------------
// THIS FILE NEVER DROPS A FORK.
//
// Every fork it finds becomes its own ProvenanceRecord and every one of them is returned. There is
// no deduplication here, no "we already have that one", no filter that quietly shortens the list.
// §2 is explicit that provenance multiplicity and evidential weight are different quantities stored
// separately: one hundred identical forks produce one hundred ProvenanceRecords. The collapsing
// happens later and elsewhere, at the CONTENT layer — one ContentRecord per normalised content
// hash, weight 1 no matter how many provenance records observed it (see contenthash.mjs and
// dedupe.mjs). If you are reading this file looking for where duplicates get removed: it is not
// here, and adding it here would be a bug.
//
// The one thing that can shorten a returned list is the explicit `max` cap, and when it bites the
// result says so in `truncated` and `reason`. A partial list must never be returned looking
// complete — that is the difference between "this pattern appears in 40 repos" and "this pattern
// appears in the first 40 repos we happened to page through".
// ---------------------------------------------------------------------------------------------
//
// NO NETWORK IN THIS MODULE. Every function that needs HTTP takes an injected `fetchImpl`. CI has
// no credentials and must never make a network call; the tests drive a fake and so can you.
//
// NOTHING HERE EXECUTES ANYTHING IT DOWNLOADS (§4, standing rule 1). This module only reads JSON
// metadata; it does not clone, and it does not look at repository contents at all.

// The record shapes and the pessimistic defaults come from records.mjs and are NOT redefined here.
// A ProvenanceRecord assembled two different ways is two record types wearing one name, and the
// divergence would only show up as records that fail to join to their content months later.
import { UNSCANNED_SECURITY, UNVERIFIED_LICENCE, provenanceId, provenanceRecord } from './records.mjs';

export { UNSCANNED_SECURITY, UNVERIFIED_LICENCE, provenanceId };

/** GitHub's REST root. Overridable so a GitHub Enterprise host, or a fake, can be substituted. */
export const GITHUB_API = 'https://api.github.com';

/** Page size the forks endpoint accepts. */
const PER_PAGE = 100;

/** Default cap on enumeration. Some Roblox repos have five figures of forks; the cap keeps one
 *  discovery run bounded, and `truncated` keeps it honest about having been capped. */
export const DEFAULT_MAX_FORKS = 500;

/** Cycle/runaway guard for upstream walking. GitHub fork chains are shallow; 20 is far past real. */
const MAX_UPSTREAM_HOPS = 20;

// ------------------------------------------------------------------ record shaping

/**
 * The id for a repository discovered before any commit has been pinned.
 *
 * The forks endpoint does not return commit SHAs, and records.mjs `provenanceId` rightly refuses to
 * mint an id without one — an id whose SHA is missing is an id that will collide with the next
 * commit. So discovery uses a `ref:<branch>` sentinel in the SHA position: same grammar, one
 * implementation, and visibly not a SHA to anything that reads it.
 *
 * The id is PROVISIONAL. The fetch stage pins a real SHA (as `fetch.mjs` already does for the two
 * seed sources) and the record is re-keyed then; `shaResolved` says which of the two you hold.
 */
export function provisionalId({ host = 'github.com', owner, repo, ref = 'HEAD' }) {
  return provenanceId({ host, owner, repo, sha: `ref:${ref ?? 'HEAD'}` });
}

/**
 * Parse the several shapes a caller reasonably passes: 'owner/repo', a full URL, or an object.
 * Throws on garbage rather than guessing — a mis-parsed repo would be attributed to the wrong owner
 * for the life of the corpus.
 */
export function parseRepo(input) {
  if (input && typeof input === 'object' && input.owner && input.repo) {
    return { host: input.host ?? 'github.com', owner: String(input.owner), repo: String(input.repo) };
  }
  const s = String(input ?? '').trim();
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/);
  if (url && url[1].includes('.')) return { host: url[1], owner: url[2], repo: url[3] };
  const slug = s.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (slug) return { host: 'github.com', owner: slug[1], repo: slug[2] };
  throw new Error(`forks: cannot parse repository reference ${JSON.stringify(s)}`);
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Shape one GitHub repo JSON into a ProvenanceRecord, via records.mjs so the shape is the shape.
 *
 * Two things are deliberately NOT taken from the API payload:
 *
 * `licence` stays UNVERIFIED_LICENCE even when GitHub reports `license.spdx_id: "MIT"`. §3 requires
 * a verdict to name the evidence it rests on — a LICENSE file, an SPDX header, explicit terms — and
 * GitHub's field is a guess about a file this module has not opened. The licence classifier
 * re-derives it from the actual checkout; the API's guess is carried on `unverified`, where it can
 * inform that classifier without ever being mistaken for a verdict.
 *
 * `security` stays UNSCANNED_SECURITY, whose `safe` is false. §1 puts the security gate second,
 * immediately after provenance, so a record genuinely exists unscanned for a while — and during
 * that window it must not slip through a `if (record.security.safe)` written by someone who
 * assumed the optimistic default.
 *
 * `contentHash` stays null. No content has been fetched, so claiming a hash would be a claim about
 * something nobody has read.
 */
export function toProvenanceRecord(api, { host = 'github.com', discoveredAt = today(), sha = null, upstream = null } = {}) {
  const owner = api?.owner?.login ?? String(api?.full_name ?? '/').split('/')[0];
  const repo = api?.name ?? String(api?.full_name ?? '/').split('/')[1];
  const ref = api?.default_branch ?? 'HEAD';

  const record = provenanceRecord({
    host,
    owner,
    repo,
    ref,
    // The id grammar needs something in the SHA position; the `sha` FIELD must not claim a commit
    // that was never read, so it is put back to null below.
    sha: sha ?? `ref:${ref}`,
    url: api?.html_url ?? undefined,
    discoveredAt,
    isFork: api?.fork === true,
    upstream,
    // Popularity signal ONLY. §2: a high fork count is evidence a pattern is widespread, never
    // evidence it is correct, and it must never multiply training weight.
    forkCount: api?.forks_count ?? 0,
    stars: api?.stargazers_count ?? 0,
    licence: UNVERIFIED_LICENCE,
    security: UNSCANNED_SECURITY,
    contentHash: null,
  });

  record.sha = sha;
  record.shaResolved = sha !== null;
  // Un-adjudicated API metadata. Named to be impossible to mistake for a verdict; the licence and
  // engine-era classifiers may read it, nothing may gate on it.
  record.unverified = {
    spdxId: api?.license?.spdx_id ?? null,
    archived: api?.archived ?? null,
    disabled: api?.disabled ?? null,
    private: api?.private ?? null,
    pushedAt: api?.pushed_at ?? null,
    sizeKb: api?.size ?? null,
  };
  return record;
}

// ------------------------------------------------------------------ transport

/**
 * One GitHub request through the injected fetch. Never throws and never sleeps: it returns a
 * verdict object, so a caller mid-pagination can decide to stop and *say why* rather than losing
 * the pages it already has to an exception.
 *
 * Rate limiting is detected, reported and obeyed by stopping — not by waiting. A module that sleeps
 * turns a bounded CI run into an unbounded one, and the caller is better placed to decide whether
 * waiting eleven minutes for a reset is worth it.
 */
async function request(url, { fetchImpl, token = null, userAgent = 'golem-corpus-intake' }) {
  if (typeof fetchImpl !== 'function') throw new Error('forks: fetchImpl is required — this module never opens its own connections');
  const headers = { accept: 'application/vnd.github+json', 'user-agent': userAgent };
  if (token) headers.authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetchImpl(url, { headers });
  } catch (err) {
    return { ok: false, status: 0, body: null, link: null, rateLimited: false, error: `network: ${err?.message ?? err}` };
  }

  const header = (name) => res?.headers?.get?.(name) ?? null;
  const status = res?.status ?? 0;
  const remaining = header('x-ratelimit-remaining');
  const retryAfter = Number(header('retry-after'));
  // Primary limit: 403/429 with the budget at zero. Secondary limit: 403 plus a Retry-After.
  const rateLimited = (status === 403 || status === 429) && (remaining === '0' || Number.isFinite(retryAfter));

  if (!res?.ok) {
    return {
      ok: false,
      status,
      body: null,
      link: null,
      rateLimited,
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : null,
      resetAt: header('x-ratelimit-reset'),
      error: rateLimited ? `rate limited (HTTP ${status})` : `HTTP ${status}`,
    };
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    // A 200 that is not JSON is a proxy or an outage page, not data. Treat it as failure.
    return { ok: false, status, body: null, link: null, rateLimited: false, error: `malformed JSON: ${err?.message ?? err}` };
  }
  return { ok: true, status, body, link: header('link'), rateLimited: false, error: null };
}

/** `rel="next"` out of a Link header, or null. Presence of a next link is how we know a truncated
 *  list was truncated rather than simply finished. */
function nextLink(link) {
  if (!link) return null;
  for (const part of String(link).split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

// ------------------------------------------------------------------ upstream resolution

/**
 * Walk a repository to the true root of its fork network.
 *
 * Not one level. A fork of a fork of a fork resolves to the original, because the corpus's claim
 * "this pattern originated here" is only worth anything if it names the origin and not an
 * intermediate mirror. The walk follows `parent` one hop at a time — each hop is a real fetch,
 * because GitHub's embedded `parent` object does not carry its own `parent` — and falls back to the
 * network's `source` field if the parent chain breaks.
 *
 * The awkward realities, all of which degrade instead of throwing:
 *   - the upstream was deleted        → 404 on a parent. Return the deepest ancestor confirmed,
 *                                       `resolved: false`, and name the repo that vanished.
 *   - the upstream went private       → also a 404, and indistinguishable from deletion by design;
 *                                       reported the same way rather than guessed at.
 *   - the upstream is itself a fork   → keep walking. This is the normal case, not an error.
 *   - a cycle, or a pathological depth→ visited-set and MAX_UPSTREAM_HOPS; stop and say so.
 *   - rate limited mid-walk           → stop, keep the chain so far, `degraded: true`.
 *
 * @returns {Promise<{start: object|null, root: object|null, chain: string[], hops: number,
 *   resolved: boolean, degraded: boolean, reason: string}>}
 */
export async function resolveUpstream(repo, { fetchImpl, token = null, host, discoveredAt = today(), maxHops = MAX_UPSTREAM_HOPS } = {}) {
  const ref = parseRepo(repo);
  const apiHost = host ?? ref.host;

  const fetchRepo = (owner, name) => request(`${GITHUB_API}/repos/${owner}/${name}`, { fetchImpl, token });

  const first = await fetchRepo(ref.owner, ref.repo);
  if (!first.ok) {
    return {
      start: null,
      root: null,
      chain: [],
      hops: 0,
      resolved: false,
      degraded: true,
      reason: `${ref.owner}/${ref.repo} could not be read (${first.error}) — it may be deleted, private, or the token may lack access`,
    };
  }

  const start = toProvenanceRecord(first.body, { host: apiHost, discoveredAt });
  const chain = [start.id];
  const visited = new Set([`${ref.owner}/${ref.repo}`.toLowerCase()]);
  let current = first.body;
  let record = start;
  let hops = 0;

  while (current?.fork === true) {
    if (hops >= maxHops) {
      return { start, root: record, chain, hops, resolved: false, degraded: true, reason: `stopped after ${maxHops} hops without reaching a non-fork root` };
    }

    // Prefer `parent` (one true hop). `source` is GitHub's own answer for the network root and is
    // the fallback when the parent has gone: it lets a broken chain still land on the original.
    const step = current.parent ?? current.source;
    if (!step?.full_name) {
      return { start, root: record, chain, hops, resolved: false, degraded: true, reason: `${record.owner}/${record.repo} is marked as a fork but names no parent — its upstream has probably been deleted` };
    }

    const [pOwner, pRepo] = String(step.full_name).split('/');
    const key = `${pOwner}/${pRepo}`.toLowerCase();
    if (visited.has(key)) {
      return { start, root: record, chain, hops, resolved: false, degraded: true, reason: `fork chain cycles back to ${pOwner}/${pRepo}` };
    }
    visited.add(key);

    const up = await fetchRepo(pOwner, pRepo);
    if (!up.ok) {
      // The upstream is gone or unreadable. Everything already walked stays — a partial chain is
      // real provenance, and losing it to an exception would lose the only record of what existed.
      const viaSource = current.source?.full_name && current.source.full_name !== step.full_name ? current.source.full_name : null;
      if (viaSource) {
        const [sOwner, sRepo] = String(viaSource).split('/');
        const src = await fetchRepo(sOwner, sRepo);
        if (src.ok) {
          const rootRecord = toProvenanceRecord(src.body, { host: apiHost, discoveredAt });
          chain.push(rootRecord.id);
          return { start, root: rootRecord, chain, hops: hops + 1, resolved: src.body?.fork !== true, degraded: true, reason: `parent ${pOwner}/${pRepo} unreadable (${up.error}); recovered the network root from GitHub's source field` };
        }
      }
      return { start, root: record, chain, hops, resolved: false, degraded: true, reason: `upstream ${pOwner}/${pRepo} unreadable (${up.error}) — deleted, private, or rate limited; chain truncated at ${record.owner}/${record.repo}` };
    }

    current = up.body;
    record = toProvenanceRecord(current, { host: apiHost, discoveredAt });
    chain.push(record.id);
    hops++;
  }

  start.upstream = chain.length > 1 ? chain[1] : null;
  return { start, root: record, chain, hops, resolved: true, degraded: false, reason: hops === 0 ? `${record.owner}/${record.repo} is not a fork; it is its own root` : `resolved to ${record.owner}/${record.repo} in ${hops} hop${hops === 1 ? '' : 's'}` };
}

// ------------------------------------------------------------------ fork enumeration

/**
 * Every fork of a repository, as ProvenanceRecords.
 *
 * Again, and it bears repeating in the place someone would come looking to "optimise": nothing is
 * deduplicated here. A hundred byte-identical forks come back as a hundred records. They collapse
 * to one ContentRecord of weight 1 downstream, and that collapse is what stops a hundred copies of
 * one idea from looking like a hundred independent endorsements of it.
 *
 * Truncation is a first-class result, not a silence:
 *   - hitting `max`                     → truncated, and `reason` says the cap did it.
 *   - a `next` link we chose not to walk → truncated.
 *   - a rate limit or a failed page      → truncated AND degraded, with the failure in `errors`.
 *   - GitHub reports more forks than we collected → truncated, with both counts, which also catches
 *     the case where pagination silently ended early.
 *
 * Private forks never appear in this listing at all — GitHub omits them from an unauthenticated or
 * under-scoped view. That is not something this module can detect per-fork; the `forks_count` vs
 * collected comparison is the only signal available, and it is reported rather than reconciled.
 *
 * @returns {Promise<{repo: object, source: object|null, forks: object[], collected: number,
 *   expected: number|null, pages: number, truncated: boolean, degraded: boolean,
 *   rateLimited: boolean, errors: object[], reason: string}>}
 */
export async function enumerateForks(repo, { fetchImpl, token = null, host, max = DEFAULT_MAX_FORKS, discoveredAt = today(), repoInfo = null } = {}) {
  const ref = parseRepo(repo);
  const apiHost = host ?? ref.host;
  const errors = [];

  // One extra request for the parent repo, so `forks_count` can be compared against what we
  // actually collected. Without it "complete" is an assumption; with it, it is a check.
  let info = repoInfo;
  if (!info) {
    const head = await request(`${GITHUB_API}/repos/${ref.owner}/${ref.repo}`, { fetchImpl, token });
    if (head.ok) info = head.body;
    else errors.push({ stage: 'repo', url: `${ref.owner}/${ref.repo}`, error: head.error, rateLimited: head.rateLimited });
  }

  const parent = info ? toProvenanceRecord(info, { host: apiHost, discoveredAt }) : null;
  const expected = info?.forks_count ?? null;

  const forks = [];
  const seen = new Set(); // guards against a paginating API repeating a page, NOT against duplicates
  const base = `${GITHUB_API}/repos/${ref.owner}/${ref.repo}/forks?per_page=${PER_PAGE}&sort=oldest`;
  let url = `${base}&page=1`;
  let pageNo = 1;
  let pages = 0;
  let truncated = false;
  let rateLimited = false;
  let cappedBy = null;

  while (url) {
    const page = await request(url, { fetchImpl, token });
    if (!page.ok) {
      errors.push({ stage: 'forks', url, error: page.error, rateLimited: page.rateLimited, retryAfterSeconds: page.retryAfterSeconds ?? null });
      rateLimited = rateLimited || page.rateLimited;
      truncated = true;
      cappedBy = page.rateLimited ? 'rate-limit' : 'page-failure';
      break;
    }
    pages++;

    const batch = Array.isArray(page.body) ? page.body : [];
    let hitCap = false;
    for (const api of batch) {
      if (forks.length >= max) {
        hitCap = true;
        break;
      }
      const key = String(api?.full_name ?? '').toLowerCase();
      if (key && seen.has(key)) continue; // same page served twice; not deduplication of content
      if (key) seen.add(key);
      forks.push(toProvenanceRecord(api, { host: apiHost, discoveredAt, upstream: parent?.id ?? null }));
    }

    // A Link header is authoritative about whether more exist. Without one (a fake, or a
    // single-page response) a full page is the only remaining evidence that more might follow.
    const next = nextLink(page.link) ?? (batch.length === PER_PAGE ? `${base}&page=${pageNo + 1}` : null);
    if (hitCap || forks.length >= max) {
      // The cap only *truncates* if something was actually left behind.
      if (hitCap || next) {
        truncated = true;
        cappedBy = cappedBy ?? 'max';
      }
      break;
    }
    pageNo++;
    url = next;
  }

  if (expected !== null && forks.length < expected) {
    truncated = true;
    cappedBy = cappedBy ?? 'short-listing';
  }

  const degraded = errors.length > 0;
  const reason = !truncated
    ? `collected all ${forks.length} fork${forks.length === 1 ? '' : 's'} of ${ref.owner}/${ref.repo}`
    : `PARTIAL: collected ${forks.length}${expected === null ? '' : ` of ${expected}`} fork${forks.length === 1 ? '' : 's'} of ${ref.owner}/${ref.repo} (${cappedBy ?? 'unknown'}) — treat this list as incomplete`;

  return { repo: parent, source: info ?? null, forks, collected: forks.length, expected, pages, truncated, degraded, rateLimited, errors, reason };
}
