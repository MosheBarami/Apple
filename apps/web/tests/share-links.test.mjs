/**
 * SHARE LINKS, AT THE END THE PERSON TOUCHES.
 *
 * The worker half has been complete for a long time: mint, redeem, revoke, a scope that survives
 * redemption, an expiry refused at both ends of the link's life, and tests driving every refusal.
 * NONE OF IT WAS REACHABLE. There was no share-link function in apps/web/src/lib/api.ts at all,
 * the members panel mentioned links only in a comment, and there was no page in the app for a link
 * to land on — so a link could only be minted with curl, and could only be revoked by whoever had
 * kept the mint response open in a terminal.
 *
 * Three claims are pinned here, and each one was false before this change:
 *
 *   1. THE URL AND THE ROUTE AGREE. `shareLinkUrl` builds a path; app.tsx registers one. A copy
 *      button that produces an address the router does not serve is the defect this repository
 *      keeps finding — a control wired to nothing — and it would look perfect in review.
 *   2. THE ROLES OFFERED ARE ROLES THE SERVER WILL MINT, derived from the worker's own ceiling
 *      rather than from a list typed twice.
 *   3. EVERY REFUSAL THE WORKER CAN RETURN HAS WORDS. A refusal with no sentence renders as
 *      "something went wrong", which is the answer that sends somebody to ask for a replacement
 *      for a link that was only expired.
 *
 * apps/web has no DOM renderer, so nothing here mounts a component: the decidable half is a REAL
 * import of the module the app uses, and the wiring half reads the source that ships.
 *
 * Run with:  node --test tests/share-links.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..', '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const TMP = mkdtempSync(join(tmpdir(), 'share-links-'));

const bundle = async (entry, name) => {
  const out = join(TMP, `${name}.mjs`);
  execFileSync(ESBUILD, [entry, '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', `--outfile=${out}`], {
    stdio: 'pipe',
  });
  return import(`file://${out}`);
};

const client = await bundle(join(WEB, 'src', 'lib', 'share-links.ts'), 'client');
const server = await bundle(join(ROOT, 'apps', 'worker', 'src', 'collab.ts'), 'server');

/** Source with comments stripped, so a name discussed in prose is not mistaken for one in use. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (...p) => readFileSync(join(...p), 'utf8');
const appCode = code(read(WEB, 'src', 'app.tsx'));
const panelCode = code(read(WEB, 'src', 'components', 'ws', 'members-panel.tsx'));
const authCode = code(read(WEB, 'src', 'lib', 'auth.tsx'));
const apiCode = code(read(WEB, 'src', 'lib', 'api.ts'));
const workerCollab = read(ROOT, 'apps', 'worker', 'src', 'collab.ts');

// ============================================================ the link points at a page that exists

test('THE COPY BUTTON PRODUCES AN ADDRESS THIS APP ACTUALLY SERVES', () => {
  const url = client.shareLinkUrl('https://apple.test', 'tok-123');
  assert.equal(url, 'https://apple.test/app/join?token=tok-123');

  // The two halves that must agree: the basename and the route. Both are read from app.tsx, so
  // renaming either without renaming the other turns this red instead of shipping a dead link.
  const path = new URL(url).pathname;
  const basename = appCode.match(/basename="([^"]+)"/)?.[1];
  assert.ok(basename, 'app.tsx must declare a router basename');
  assert.ok(path.startsWith(basename + '/'), `the link path ${path} is not under the router basename ${basename}`);
  const route = path.slice(basename.length);
  assert.match(appCode, new RegExp(`<Route\\s+path="${route}"`), `no route is registered at ${route}`);
  assert.match(appCode, /<Route path="\/join" element={<JoinPage \/>} \/>/);
});

test('a token with URL-hostile characters survives the round trip', () => {
  const url = client.shareLinkUrl('https://apple.test/', 'a b&c=d#e');
  assert.equal(new URL(url).searchParams.get('token'), 'a b&c=d#e');
  assert.equal(url.includes('#'), false, 'an unescaped # would truncate the token at the fragment');
});

test('THE SIGNED-OUT VISITOR KEEPS THEIR TOKEN through the login bounce', () => {
  // The whole content of a share link is its query string. AuthGuard stashed `location.pathname`
  // alone, so a signed-out person clicking a link reached /join with nothing in it — the link
  // losing its payload at the moment the person is least able to tell what happened.
  assert.match(authCode, /from: `\$\{location\.pathname\}\$\{location\.search\}`/, 'AuthGuard must remember the query string');
  // And /join is behind the guard, or an anonymous visitor would redeem as nobody.
  const guarded = appCode.slice(appCode.indexOf('<AuthGuard>'));
  assert.ok(guarded.includes('path="/join"'), '/join must sit inside the AuthGuard');
});

// ============================================================ the roles offered are mintable

test('the roles offered are exactly the roles a LINK may carry, derived from the server', () => {
  const allowed = server.COLLAB_ROLES.filter((r) => server.roleRank(r) <= server.SHARE_LINK_MAX_RANK);
  assert.deepEqual([...client.LINKABLE_ROLES], allowed);
  assert.equal(client.LINKABLE_ROLES.includes('admin'), false, 'a link that can add members is account takeover');
  assert.equal(client.LINKABLE_ROLES.includes('owner'), false);

  // CONTROL: every offered role really is mintable, asked of the function that mints.
  for (const role of client.LINKABLE_ROLES) {
    const out = server.redeemShareLink(
      { token: 't', project_id: 'p-1', scope: 'project', resource_id: null, role, expires_at: null, revoked_at: null },
      { projectId: 'p-1', scope: 'project' },
      Date.now(),
    );
    assert.equal(out.ok, true, `${role} is offered in the UI and refused by the server`);
  }
});

// ============================================================ the expiry

test('the expiry choices are real instants, and "never" is the last one rather than the default', () => {
  const now = Date.parse('2026-09-15T12:00:00.000Z');
  assert.equal(client.expiryIso('24h', now), new Date(now + 864e5).toISOString());
  assert.equal(client.expiryIso('7d', now), new Date(now + 7 * 864e5).toISOString());
  assert.equal(client.expiryIso('30d', now), new Date(now + 30 * 864e5).toISOString());
  assert.equal(client.expiryIso('never', now), null);

  assert.notEqual(client.DEFAULT_EXPIRY, 'never', 'a link with no expiry must not be what you get by not choosing');
  assert.equal(client.SHARE_LINK_EXPIRIES.at(-1).id, 'never');
  assert.ok(client.SHARE_LINK_EXPIRIES.some((e) => e.id === client.DEFAULT_EXPIRY));

  // A clock that cannot be read produces no expiry rather than an Invalid Date the server would
  // refuse as 'malformed' — which would read to the user as "sharing is broken".
  for (const bad of [NaN, Infinity, 'today', null]) assert.equal(client.expiryIso('7d', bad), null);
});

test('an expiry the UI offers is one the server will accept', () => {
  const now = Date.now();
  for (const choice of client.SHARE_LINK_EXPIRIES) {
    const expires = client.expiryIso(choice.id, now);
    const out = server.redeemShareLink(
      { token: 't', project_id: 'p-1', scope: 'project', resource_id: null, role: 'viewer', expires_at: expires, revoked_at: null },
      { projectId: 'p-1', scope: 'project' },
      now,
    );
    assert.equal(out.ok, true, `"${choice.label}" mints a link the server refuses`);
  }
});

// ============================================================ the words

test('EVERY REFUSAL THE WORKER CAN RETURN HAS A SENTENCE, derived from the worker source', () => {
  // The ShareRefusal union is a TYPE and erases at runtime, so it is read out of the declaration
  // that defines it. A refusal added there without words here goes red.
  const union = workerCollab.match(/export type ShareRefusal\s*=([\s\S]*?);/)?.[1];
  assert.ok(union, 'collab.ts must still declare the ShareRefusal union');
  const reasons = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(reasons.length >= 6, `expected the refusal list to be found in collab.ts, got ${reasons.length}`);
  for (const reason of new Set(reasons)) {
    const said = client.redeemRefusal(reason);
    assert.ok(said.length > 0, `${reason} has no words`);
    assert.equal(said.includes(`(${reason})`), false, `${reason} falls through to the unknown-code branch`);
  }
  // …and the two the route adds on top of the pure function's union.
  for (const reason of ['no_such_link', 'removed_from_project']) {
    assert.equal(client.redeemRefusal(reason).includes(`(${reason})`), false, `${reason} has no words`);
  }
});

test('a refusal this build has never heard of is REPORTED, not smoothed over', () => {
  assert.match(client.redeemRefusal('quarantined'), /quarantined/, 'an unknown code must be quotable by the person reading it');
  assert.ok(client.redeemRefusal(null).length > 0);
  assert.ok(client.redeemRefusal(undefined).length > 0);
});

test('a link state with no words renders as itself, never as a blank that reads as live', () => {
  assert.match(client.describeLinkState('live'), /Live/);
  assert.match(client.describeLinkState('revoked'), /Revoked/);
  assert.match(client.describeLinkState('expired'), /Expired/);
  assert.match(client.describeLinkState('quarantined'), /quarantined/);
  assert.ok(client.describeLinkState(null).length > 0);
  assert.ok(client.describeLinkState('').length > 0);

  // Only a state we recognise as live counts as live: the Revoke button is enabled off this, and
  // an unreadable state must not make a dead link look actionable or a live one look safe.
  assert.equal(client.isLiveLink('live'), true);
  for (const other of ['revoked', 'expired', 'malformed', '', null, undefined, 'LIVE']) {
    assert.equal(client.isLiveLink(other), false, `${JSON.stringify(other)} must not count as live`);
  }
});

test('the token itself does not go on the page', () => {
  const token = 'abcdefghijklmnopqrstuvwxyz012345';
  const shown = client.tokenPreview(token);
  assert.equal(shown, 'abcdefgh…');
  assert.equal(shown.length < token.length, true, 'a screenshot of the panel must not be a bearer credential');
});

// ============================================================ the wiring

test('the panel actually calls the three routes, and offers the revoke the feature exists for', () => {
  for (const fn of ['fetchShareLinks', 'createShareLink', 'revokeShareLink']) {
    assert.match(apiCode, new RegExp(`export const ${fn}`), `lib/api.ts has no ${fn}`);
    assert.match(panelCode, new RegExp(`\\b${fn}\\b`), `the members panel never calls ${fn}`);
  }
  assert.match(panelCode, />\s*Revoke\s*</, 'there is no Revoke control');
  assert.match(panelCode, />\s*Copy link\s*</, 'there is no way to get the link out of the panel');
  // The partial flag is surfaced rather than dropped: a short list shown as a whole one is how an
  // admin concludes a link was already revoked.
  assert.match(panelCode, /links\.data\.partial/, 'the panel drops the partial flag');
});

test('the redeem route has a caller, so the link is not a token with nowhere to go', () => {
  const joinCode = code(read(WEB, 'src', 'routes', 'join.tsx'));
  assert.match(apiCode, /export const redeemShareLinkToken/);
  assert.match(joinCode, /redeemShareLinkToken/);
  // The three outcomes are distinguished. "We could not check this link" and "this link is dead"
  // are different sentences, and only one of them should make somebody ask for a replacement.
  for (const state of ['joined', 'refused', 'failed']) {
    assert.match(joinCode, new RegExp(`status: '${state}'`), `the join page does not distinguish ${state}`);
  }
});
