// Tests for fork discovery — SOURCE-INTELLIGENCE.md §1 (FIND UPSTREAM, ENUMERATE ALL FORKS) and §2.
//
// NO NETWORK, PROVEN NOT PROMISED. Every test drives an injected `fetchImpl` over a fake GitHub.
// `globalThis.fetch` is replaced by a tripwire that fails the run if anything reaches for it, so
// "this module never opens its own connections" is a behavioural assertion and not a comment. CI
// has no credentials and must never make a network call.
//
// THE TWO THINGS THAT WOULD BE WORST TO GET WRONG, and which therefore get named tests:
//   1. A fork silently disappearing. §2 requires every fork preserved as provenance forever; the
//      cost of losing one is that a pattern's real spread becomes unknowable after the fact.
//   2. A partial list being returned as if complete. "40 repos use this" and "the first 40 repos
//      we paged through use this" are different claims and only one of them is true.
//
// Run: node --test packages/corpus/src/intake/forks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_MAX_FORKS, enumerateForks, parseRepo, provisionalId, resolveUpstream, toProvenanceRecord } from './forks.mjs';
import { UNSCANNED_SECURITY, UNVERIFIED_LICENCE, provenanceId } from './records.mjs';

// A tripwire, not a mock: if any code path under test reaches for the real network, the process
// throws with a message naming the URL rather than quietly making a request from CI.
globalThis.fetch = (url) => {
  throw new Error(`forks.test: a module reached for the real network (${url}) — every fetch must be injected`);
};

// ---------------------------------------------------------------- fake GitHub

const response = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
  json: async () => body,
});

/** One GitHub repo payload, in the shape the REST API actually returns. */
const repoJson = (fullName, extra = {}) => {
  const [owner, name] = fullName.split('/');
  return {
    full_name: fullName,
    name,
    owner: { login: owner },
    html_url: `https://github.com/${fullName}`,
    default_branch: 'main',
    fork: false,
    forks_count: 0,
    stargazers_count: 0,
    license: null,
    archived: false,
    private: false,
    pushed_at: '2026-08-01T00:00:00Z',
    size: 128,
    ...extra,
  };
};

/**
 * `routes` maps a path (or a path+query) to a handler or a literal response. Every request is
 * recorded so a test can assert how many hops a walk actually took.
 */
function fakeGitHub(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const path = url.replace('https://api.github.com', '');
    const bare = path.split('?')[0];
    const handler = routes[path] ?? routes[bare];
    if (handler === undefined) return response(404, { message: 'Not Found' });
    return typeof handler === 'function' ? handler(url) : handler;
  };
  return { fetchImpl, calls };
}

const forkPage = (names, { next = null, parent = 'a/root' } = {}) =>
  response(
    200,
    names.map((n) => repoJson(n, { fork: true, parent: repoJson(parent) })),
    next ? { link: `<${next}>; rel="next"` } : {},
  );

// ---------------------------------------------------------------- upstream resolution

test('a fork of a fork of a fork resolves to the ORIGINAL, not one level up', () => {
  const { fetchImpl, calls } = fakeGitHub({
    '/repos/d/leaf': response(200, repoJson('d/leaf', { fork: true, parent: repoJson('c/mid2'), source: repoJson('a/root') })),
    '/repos/c/mid2': response(200, repoJson('c/mid2', { fork: true, parent: repoJson('b/mid1'), source: repoJson('a/root') })),
    '/repos/b/mid1': response(200, repoJson('b/mid1', { fork: true, parent: repoJson('a/root'), source: repoJson('a/root') })),
    '/repos/a/root': response(200, repoJson('a/root', { fork: false, forks_count: 3 })),
  });

  return resolveUpstream('d/leaf', { fetchImpl, discoveredAt: '2026-08-31' }).then((r) => {
    assert.equal(r.resolved, true);
    assert.equal(r.degraded, false);
    assert.equal(r.root.owner, 'a');
    assert.equal(r.root.repo, 'root');
    assert.equal(r.root.isFork, false);
    assert.equal(r.hops, 3);
    assert.deepEqual(
      r.chain.map((id) => id.split('@')[0]),
      ['github.com/d/leaf', 'github.com/c/mid2', 'github.com/b/mid1', 'github.com/a/root'],
      'the chain must record every intermediate mirror, not just the endpoints',
    );
    // Every hop is a real fetch: GitHub's embedded `parent` object does not carry its own parent,
    // so a one-request answer would have been a one-level answer.
    assert.equal(calls.length, 4);
    assert.equal(r.start.upstream, r.chain[1]);
  });
});

test('a repo that is not a fork is its own root, in one request and without degrading', async () => {
  const { fetchImpl, calls } = fakeGitHub({ '/repos/a/root': response(200, repoJson('a/root', { fork: false })) });
  const r = await resolveUpstream('a/root', { fetchImpl });
  assert.equal(r.hops, 0);
  assert.equal(r.resolved, true);
  assert.equal(r.degraded, false);
  assert.equal(r.start.upstream, null);
  assert.equal(calls.length, 1);
});

test('a DELETED upstream degrades without throwing, keeping the chain it did walk', async () => {
  const { fetchImpl } = fakeGitHub({
    '/repos/c/leaf': response(200, repoJson('c/leaf', { fork: true, parent: repoJson('b/gone') })),
    // b/gone is absent from the routes: a 404, exactly as a deleted repo returns.
  });

  const r = await resolveUpstream('c/leaf', { fetchImpl });
  assert.equal(r.resolved, false);
  assert.equal(r.degraded, true);
  assert.equal(r.root.repo, 'leaf', 'the deepest repo actually confirmed is still real provenance and must survive');
  assert.equal(r.chain.length, 1);
  assert.match(r.reason, /b\/gone/);
  assert.match(r.reason, /HTTP 404/);
});

test("a PRIVATE upstream 404s the same way and is reported as such, not guessed at", async () => {
  const { fetchImpl } = fakeGitHub({
    '/repos/c/leaf': response(200, repoJson('c/leaf', { fork: true, parent: repoJson('b/private') })),
    '/repos/b/private': response(404, { message: 'Not Found' }),
  });
  const r = await resolveUpstream('c/leaf', { fetchImpl });
  assert.equal(r.degraded, true);
  assert.equal(r.resolved, false);
  assert.match(r.reason, /deleted, private, or rate limited/);
});

test('a broken parent chain still lands on the root when GitHub still reports a source', async () => {
  const { fetchImpl } = fakeGitHub({
    '/repos/c/leaf': response(200, repoJson('c/leaf', { fork: true, parent: repoJson('b/gone'), source: repoJson('a/root') })),
    '/repos/b/gone': response(404, { message: 'Not Found' }),
    '/repos/a/root': response(200, repoJson('a/root', { fork: false })),
  });

  const r = await resolveUpstream('c/leaf', { fetchImpl });
  assert.equal(r.root.repo, 'root');
  assert.equal(r.resolved, true);
  assert.equal(r.degraded, true, 'recovering via source is a degraded answer and must say so');
  assert.match(r.reason, /source field/);
});

test('a repo flagged as a fork with no parent at all degrades instead of crashing', async () => {
  const { fetchImpl } = fakeGitHub({ '/repos/c/orphan': response(200, repoJson('c/orphan', { fork: true })) });
  const r = await resolveUpstream('c/orphan', { fetchImpl });
  assert.equal(r.resolved, false);
  assert.equal(r.degraded, true);
  assert.match(r.reason, /names no parent/);
});

test('a cycle in the fork chain terminates instead of looping forever', async () => {
  const { fetchImpl } = fakeGitHub({
    '/repos/a/one': response(200, repoJson('a/one', { fork: true, parent: repoJson('b/two') })),
    '/repos/b/two': response(200, repoJson('b/two', { fork: true, parent: repoJson('a/one') })),
  });
  const r = await resolveUpstream('a/one', { fetchImpl });
  assert.equal(r.degraded, true);
  assert.match(r.reason, /cycles back to a\/one/);
});

test('an unreadable starting repo degrades to a stated non-answer, never an exception', async () => {
  const { fetchImpl } = fakeGitHub({});
  const r = await resolveUpstream('nobody/nothing', { fetchImpl });
  assert.equal(r.root, null);
  assert.equal(r.start, null);
  assert.equal(r.degraded, true);
  assert.match(r.reason, /deleted, private, or the token may lack access/);
});

// ---------------------------------------------------------------- enumeration

test('pagination assembles every page into one complete list', async () => {
  const p2 = 'https://api.github.com/repos/a/root/forks?per_page=100&sort=oldest&page=2';
  const p3 = 'https://api.github.com/repos/a/root/forks?per_page=100&sort=oldest&page=3';
  const { fetchImpl } = fakeGitHub({
    '/repos/a/root': response(200, repoJson('a/root', { forks_count: 7 })),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=1': forkPage(['f/one', 'f/two', 'f/three'], { next: p2 }),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=2': forkPage(['f/four', 'f/five', 'f/six'], { next: p3 }),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=3': forkPage(['f/seven']),
  });

  const r = await enumerateForks('a/root', { fetchImpl, discoveredAt: '2026-08-31' });
  assert.equal(r.pages, 3);
  assert.equal(r.collected, 7);
  assert.equal(r.expected, 7);
  assert.equal(r.truncated, false);
  assert.equal(r.degraded, false);
  assert.deepEqual(r.forks.map((f) => `${f.owner}/${f.repo}`), ['f/one', 'f/two', 'f/three', 'f/four', 'f/five', 'f/six', 'f/seven']);
  assert.match(r.reason, /collected all 7 forks/);
  for (const f of r.forks) assert.equal(f.upstream, r.repo.id, 'every fork must point back at what it forked');
});

test('truncation by `max` is RECORDED — a partial list never comes back looking complete', async () => {
  const p2 = 'https://api.github.com/repos/a/root/forks?per_page=100&sort=oldest&page=2';
  const { fetchImpl } = fakeGitHub({
    '/repos/a/root': response(200, repoJson('a/root', { forks_count: 4000 })),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=1': forkPage(['f/one', 'f/two', 'f/three'], { next: p2 }),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=2': forkPage(['f/four', 'f/five']),
  });

  const r = await enumerateForks('a/root', { fetchImpl, max: 2 });
  assert.equal(r.collected, 2);
  assert.equal(r.expected, 4000);
  assert.equal(r.truncated, true);
  assert.match(r.reason, /^PARTIAL: collected 2 of 4000 forks/);
  assert.match(r.reason, /treat this list as incomplete/);
});

test('a listing shorter than the reported fork count is flagged, not accepted', async () => {
  // The subtle failure: pagination ends early (a flaky page, a missing Link header) and the list
  // looks finished. Comparing against forks_count is the only check available, so it is made.
  const { fetchImpl } = fakeGitHub({
    '/repos/a/root': response(200, repoJson('a/root', { forks_count: 9 })),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=1': forkPage(['f/one', 'f/two']),
  });
  const r = await enumerateForks('a/root', { fetchImpl });
  assert.equal(r.collected, 2);
  assert.equal(r.expected, 9);
  assert.equal(r.truncated, true);
  assert.match(r.reason, /short-listing/);
});

test('rate limiting mid-pagination keeps what it has, stops, and says why — it never sleeps', async () => {
  const p2 = 'https://api.github.com/repos/a/root/forks?per_page=100&sort=oldest&page=2';
  const { fetchImpl } = fakeGitHub({
    '/repos/a/root': response(200, repoJson('a/root', { forks_count: 5 })),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=1': forkPage(['f/one', 'f/two'], { next: p2 }),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=2': response(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' }),
  });

  const started = Date.now();
  const r = await enumerateForks('a/root', { fetchImpl });
  assert.ok(Date.now() - started < 1000, 'the module must not block waiting for a rate-limit reset');
  assert.equal(r.collected, 2);
  assert.equal(r.rateLimited, true);
  assert.equal(r.truncated, true);
  assert.equal(r.degraded, true);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].rateLimited, true);
  assert.match(r.reason, /rate-limit/);
});

test('a secondary rate limit (Retry-After, budget not exhausted) is recognised too', async () => {
  const { fetchImpl } = fakeGitHub({
    '/repos/a/root': response(200, repoJson('a/root', { forks_count: 5 })),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=1': response(403, { message: 'secondary rate limit' }, { 'retry-after': '60', 'x-ratelimit-remaining': '42' }),
  });
  const r = await enumerateForks('a/root', { fetchImpl });
  assert.equal(r.rateLimited, true);
  assert.equal(r.errors[0].retryAfterSeconds, 60);
  assert.equal(r.collected, 0);
});

test('a page that 200s with non-JSON is treated as failure, not as an empty fork list', async () => {
  const { fetchImpl } = fakeGitHub({
    '/repos/a/root': response(200, repoJson('a/root', { forks_count: 3 })),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=1': {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    },
  });
  const r = await enumerateForks('a/root', { fetchImpl });
  assert.equal(r.collected, 0);
  assert.equal(r.truncated, true);
  assert.equal(r.degraded, true);
  assert.match(r.errors[0].error, /malformed JSON/);
});

test('a transport exception is caught and reported rather than escaping the module', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNRESET');
  };
  const r = await enumerateForks('a/root', { fetchImpl });
  assert.equal(r.degraded, true);
  assert.ok(r.errors.some((e) => /ECONNRESET/.test(e.error)));
  const u = await resolveUpstream('a/root', { fetchImpl });
  assert.equal(u.degraded, true);
  assert.match(u.reason, /ECONNRESET/);
});

// ---------------------------------------------------------------- §2: nothing is dropped

test('one hundred byte-identical forks come back as ONE HUNDRED provenance records', async () => {
  // The §2 invariant, tested at the layer that would be tempted to break it. These forks are
  // indistinguishable by everything this module can see; collapsing them here would destroy the
  // provenance permanently. They collapse downstream, at the content layer, to one weight-1 record.
  const names = Array.from({ length: 100 }, (_, i) => `user${String(i).padStart(3, '0')}/root`);
  const { fetchImpl } = fakeGitHub({
    '/repos/a/root': response(200, repoJson('a/root', { forks_count: 100 })),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=1': forkPage(names),
    // A page that is exactly full and carries no Link header could be the last page or could not
    // be. One extra probe is cheaper than a list that is short and does not know it.
    '/repos/a/root/forks?per_page=100&sort=oldest&page=2': response(200, []),
  });

  const r = await enumerateForks('a/root', { fetchImpl, max: 1000 });
  assert.equal(r.pages, 2);
  assert.equal(r.collected, 100);
  assert.equal(r.truncated, false);
  assert.equal(new Set(r.forks.map((f) => f.id)).size, 100, 'every fork needs its own id or provenance records will overwrite each other');
  for (const f of r.forks) {
    assert.equal(f.isFork, true);
    assert.equal(f.contentHash, null, 'no content has been read, so no hash may be claimed');
  }
});

test('fork count is carried as a popularity signal and never as anything weight-like', async () => {
  const { fetchImpl } = fakeGitHub({
    '/repos/a/root': response(200, repoJson('a/root', { forks_count: 4000, stargazers_count: 12000 })),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=1': forkPage(['f/one']),
  });
  const r = await enumerateForks('a/root', { fetchImpl });
  assert.equal(r.repo.forkCount, 4000);
  assert.equal(r.repo.stars, 12000);
  // §2: popularity may rank retrieval; it may never multiply weight. Nothing in a ProvenanceRecord
  // is allowed to look like a weight, so there must be no such field to misuse.
  assert.equal('weight' in r.repo, false);
  assert.equal('weight' in r.forks[0], false);
});

// ---------------------------------------------------------------- §3 and §4: pessimistic defaults

test('a discovered repo defaults to UNCLEAR_QUARANTINE even when GitHub swears it is MIT', async () => {
  // §3: "Absence of evidence is not permission." GitHub's spdx_id is a guess about a file this
  // module has not opened, so it may inform the licence classifier and may not stand in for it.
  const { fetchImpl } = fakeGitHub({
    '/repos/a/root': response(200, repoJson('a/root', { license: { spdx_id: 'MIT' }, forks_count: 0 })),
    '/repos/a/root/forks?per_page=100&sort=oldest&page=1': response(200, []),
  });

  const r = await enumerateForks('a/root', { fetchImpl });
  assert.equal(r.repo.licence.class, 'UNCLEAR_QUARANTINE');
  assert.equal(r.repo.licence.reuse, 'forbidden');
  assert.equal(r.repo.licence.training, 'forbidden');
  assert.equal(r.repo.licence.spdx, null);
  assert.equal(r.repo.licence.evidence, 'none');
  assert.equal(r.repo.unverified.spdxId, 'MIT', 'the API guess is kept where it cannot be mistaken for a verdict');
});

test('a discovered repo is NOT safe until it has been scanned', async () => {
  // §1 puts the security scan immediately after provenance so nothing unscanned reaches a chunker.
  // An optimistic default would let `if (record.security.safe)` wave an unscanned repo straight
  // through, which is the whole failure that ordering exists to prevent.
  assert.equal(UNSCANNED_SECURITY.safe, false);
  assert.equal(UNSCANNED_SECURITY.class, 'unscanned');
  assert.deepEqual(UNSCANNED_SECURITY.signals, []);

  const rec = toProvenanceRecord(repoJson('a/root'), { discoveredAt: '2026-08-31' });
  assert.equal(rec.security.safe, false);
  assert.equal(rec.licence.class, UNVERIFIED_LICENCE.class);
});

// ---------------------------------------------------------------- ids and parsing

test('discovery builds the SAME record shape as records.mjs, not a second one wearing its name', () => {
  // The failure this catches: forks.mjs growing its own quietly-different ProvenanceRecord, so that
  // records built by discovery and records built anywhere else stop joining up.
  const rec = toProvenanceRecord(repoJson('a/root'), { discoveredAt: '2026-08-31', sha: 'abc123' });
  assert.equal(rec.id, provenanceId({ host: 'github.com', owner: 'a', repo: 'root', sha: 'abc123' }));
  assert.equal(rec.licence, UNVERIFIED_LICENCE);
  assert.equal(rec.security, UNSCANNED_SECURITY);
  for (const field of ['id', 'host', 'owner', 'repo', 'ref', 'sha', 'url', 'discoveredAt', 'isFork', 'upstream', 'forkCount', 'stars', 'licence', 'security', 'contentHash']) {
    assert.ok(field in rec, `the pinned ProvenanceRecord field ${field} is missing`);
  }
});

test('a SHA-less discovery id declares itself provisional and never fakes a commit', () => {
  assert.equal(provisionalId({ owner: 'a', repo: 'root', ref: 'main' }), 'github.com/a/root@ref:main');
  assert.equal(provisionalId({ host: 'git.example.com', owner: 'a', repo: 'root', ref: 'trunk' }), 'git.example.com/a/root@ref:trunk');

  const unpinned = toProvenanceRecord(repoJson('a/root'), { discoveredAt: '2026-08-31' });
  assert.equal(unpinned.shaResolved, false);
  assert.equal(unpinned.sha, null, 'the sha FIELD must stay null; only the id carries the ref sentinel');
  assert.equal(unpinned.id, 'github.com/a/root@ref:main');

  const pinned = toProvenanceRecord(repoJson('a/root'), { discoveredAt: '2026-08-31', sha: 'abc123' });
  assert.equal(pinned.shaResolved, true);
  assert.equal(pinned.id, 'github.com/a/root@abc123');
});

test('repository references parse from a slug, a URL or an object — and garbage throws', () => {
  const expected = { host: 'github.com', owner: 'Roblox', repo: 'creator-docs' };
  assert.deepEqual(parseRepo('Roblox/creator-docs'), expected);
  assert.deepEqual(parseRepo('https://github.com/Roblox/creator-docs'), expected);
  assert.deepEqual(parseRepo('https://github.com/Roblox/creator-docs.git'), expected);
  assert.deepEqual(parseRepo({ owner: 'Roblox', repo: 'creator-docs' }), expected);
  assert.throws(() => parseRepo('not a repo at all'), /cannot parse repository reference/);
  assert.throws(() => parseRepo(''), /cannot parse repository reference/);
});

// ---------------------------------------------------------------- the no-network contract

test('both entry points refuse to run without an injected fetchImpl', async () => {
  await assert.rejects(() => resolveUpstream('a/root', {}), /never opens its own connections/);
  await assert.rejects(() => enumerateForks('a/root', {}), /never opens its own connections/);
});

test('the default cap is a real number, so an unbounded repo cannot produce an unbounded run', () => {
  assert.ok(Number.isInteger(DEFAULT_MAX_FORKS) && DEFAULT_MAX_FORKS > 0 && DEFAULT_MAX_FORKS <= 5000);
});
