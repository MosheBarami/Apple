// Joining a project by link — the guest class, which until now could only be created by curl.
//
// Guests are a first-class kind of member throughout the roster: MEMBER_ORIGINS names 'link' as
// theirs, `entryFor` sets `guest` from it, origin is a query parameter, and a guest obeys the same
// suspension and revocation rules as a Postgres row. The one thing missing was any way to make
// one. `grep '/links' apps/web/src` returned nothing: no mint, and — the half that would have made
// minting useless — no page a person could open the resulting link on.
//
// SO THIS MODULE HOLDS THE TWO ENDS OF THAT LINK.
//
//   THE ROLE PICKER CANNOT OFFER A ROLE THE MINT ROUTE WILL REFUSE. The route redeems the link it
//   is about to hand out, through the very function that redeems it later, and answers
//   `role_too_strong` above editor — so a picker with Admin in it is a control whose top option
//   always fails. LINKABLE_ROLES mirrors SHARE_LINK_MAX_RANK and this test holds them together.
//
//   EVERY REFUSAL THE REDEEM ROUTE CAN GIVE HAS A SENTENCE. "Forbidden" in front of somebody who
//   was handed a link is the product refusing to say which of seven completely different things
//   went wrong — and two of them (expired, revoked) are things they can ask the sender to fix,
//   while one (removed_from_project) means the answer is no and pressing it again will not help.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { shareLinkUrl, redeemRefusal, readToken, tokenFrom } = await import('../src/lib/share-link.ts');
const { LINKABLE_ROLES } = await import('../src/lib/capabilities.ts');

/* ------------------------------------------------------------------- roles --- */

test('A SHARE LINK MAY NEVER CARRY ADMIN OR OWNER', () => {
  assert.equal(LINKABLE_ROLES.includes('admin'), false);
  assert.equal(LINKABLE_ROLES.includes('owner'), false);
});

test('the roles offered are the roles the mint route accepts', () => {
  // SHARE_LINK_MAX_RANK is `ROLE_RANK.editor`, and ROLE_RANK orders the roles. A mirror nobody
  // checks is a second source of truth that drifts — and this one drifts into a picker whose top
  // option is refused by the server every time.
  const collab = readFileSync(join(HERE, '../../worker/src/collab.ts'), 'utf8');
  const cap = /export const SHARE_LINK_MAX_RANK = ROLE_RANK\.(\w+)/.exec(collab);
  assert.ok(cap, 'the worker no longer declares SHARE_LINK_MAX_RANK where this test can read it');
  assert.equal(LINKABLE_ROLES[LINKABLE_ROLES.length - 1], cap[1], 'the strongest linkable role is not the one the server caps at');
});

/* --------------------------------------------------------------------- url --- */

test('the link points at a page that exists', () => {
  const url = shareLinkUrl('abcdefghijklmnopqrstuvwxyz012345', 'https://example.test');
  assert.match(url, /^https:\/\/example\.test\/app\/join\?token=/);
});

test('the token is escaped on its way into the URL', () => {
  // Tokens are base64url and never need escaping — which is exactly why an unescaped template
  // string survives every test until the day the token format changes.
  assert.match(shareLinkUrl('a b&c', 'https://example.test'), /token=a%20b%26c/);
});

test('reading a token back out of a query string', () => {
  assert.equal(readToken('?token=abc'), 'abc');
  assert.equal(readToken('?other=1'), null);
  assert.equal(readToken(''), null);
  assert.equal(readToken(null), null);
});

test('THE BOX TAKES THE THING PEOPLE ACTUALLY COPY', () => {
  // What somebody pastes is the URL, because the URL is what they were sent. A box that accepts
  // only the bare token refuses the exact string the product told the sender to share.
  assert.equal(tokenFrom('https://example.test/app/join?token=abc123'), 'abc123');
  assert.equal(tokenFrom('  abc123  '), 'abc123');
});

test('a URL with no token on it is nothing, not the URL', () => {
  // Posting a whole address to the redeem route as a token answers `no_such_link`, which reads as
  // "your link is wrong" when what was wrong is that it carried no token at all.
  assert.equal(tokenFrom('https://example.test/app/join'), null);
  assert.equal(tokenFrom('https://example.test/app/join?other=1'), null);
  assert.equal(tokenFrom(''), null);
  assert.equal(tokenFrom(null), null);
});

test('a link survives the round trip out and back', () => {
  const token = 'abcdefghijklmnopqrstuvwxyz012345';
  assert.equal(tokenFrom(shareLinkUrl(token, 'https://example.test')), token);
});

/* ---------------------------------------------------------------- refusals --- */

test('EVERY REFUSAL THE ROUTE CAN GIVE HAS ITS OWN SENTENCE', () => {
  // Seven redemption refusals plus the two the route adds. One message for all of them is the
  // product declining to say which.
  const REASONS = [
    'malformed',
    'revoked',
    'expired',
    'role_too_strong',
    'wrong_project',
    'wrong_scope',
    'wrong_resource',
    'no_such_link',
    'removed_from_project',
  ];
  const said = new Set();
  for (const reason of REASONS) {
    const msg = redeemRefusal(reason);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 0, `${reason} has no sentence`);
    assert.equal(/undefined/.test(msg), false, `${reason} fell through the lookup`);
    said.add(msg);
  }
  assert.ok(said.size >= 6, 'too many of these refusals share one sentence to tell them apart');
});

test('a removal is not undone by pressing the link again, and the page says so', () => {
  // The redeem route bars re-redemption for somebody an administrator removed, because otherwise
  // the removal lasted exactly as long as it took them to re-click the link in their inbox.
  const msg = redeemRefusal('removed_from_project');
  assert.match(msg, /remov/i);
});

test('an unrecognised refusal is shown rather than swallowed', () => {
  assert.match(redeemRefusal('some_future_refusal'), /some_future_refusal/);
});

test('no refusal is no sentence', () => {
  assert.equal(redeemRefusal(null), null);
  assert.equal(redeemRefusal(''), null);
});


/* --------------------------------------------------- the round trip through login --- */

test('A SIGNED-OUT RECIPIENT DOES NOT LOSE THE TOKEN AT THE LOGIN SCREEN', () => {
  // AuthGuard stashes where the visitor was aiming so the login form can send them back. It
  // stashed `location.pathname` alone, and for `/app/join?token=…` the token IS the content of the
  // URL — so the one person this whole feature exists for arrived at an empty box after signing
  // in, with nothing on screen saying where their invitation went.
  const auth = readFileSync(join(HERE, '../src/lib/auth.tsx'), 'utf8');
  assert.match(auth, /from: `\$\{location\.pathname\}\$\{location\.search\}`/, 'the query string is dropped at the guard');
  // And the other end still validates it: safeInternalPath is what stops a crafted `from` becoming
  // an open redirect at the moment the user has just been asked to trust the screen.
  const login = readFileSync(join(HERE, '../src/routes/auth-pages.tsx'), 'utf8');
  assert.match(login, /safeInternalPath\(/, 'the stashed path is used without validation');
});

/* ------------------------------------------- both ends of the link actually exist --- */

const WEB = join(HERE, '..');
const src = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');
const stripped = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PANEL = stripped(src('components', 'ws', 'members-panel.tsx'));
const JOIN = stripped(src('routes', 'join.tsx'));
const APP = stripped(src('app.tsx'));
const API_SRC = src('lib', 'api.ts');

test('THE MINT ROUTE HAS A CLIENT, AND THE LINK IT MAKES HAS A PAGE', () => {
  // Either half alone is the defect: a token with nowhere to present it is a control that produces
  // a useless string, and a redeem route nothing reaches is the same dead branch from the other
  // side. `grep '/links' apps/web/src` returned nothing at all before this.
  assert.match(API_SRC, /export const createShareLink/, 'no client for POST /:id/links');
  assert.match(API_SRC, /export const redeemShareLink/, 'no client for the redeem route');
  assert.match(PANEL, /<ShareLinkForm\b/, 'the panel offers no way to make a link');
  assert.match(APP, /path="\/join"/, 'the link points at a route that does not exist');
  assert.match(APP, /<JoinPage \/>/, 'the route renders nothing');
});

test('the join route is behind the auth guard, because redeeming writes a membership', () => {
  // The redeem route needs an identity to write the grant for. A /join outside the guard is a page
  // whose only possible outcome is a 401 the visitor cannot act on.
  const guarded = /<AuthGuard>[\s\S]*?<\/Routes>/.exec(APP);
  assert.ok(guarded, 'the guarded block is no longer shaped the way this test reads it');
  assert.match(guarded[0], /path="\/join"/, '/join is outside AuthGuard');
});

test('OPENING THE PAGE DOES NOT SPEND THE LINK — the person presses Join', () => {
  // A page that redeems on mount is a link any preview fetcher, mail scanner or chat unfurler can
  // spend on the recipient's behalf, and this one grants membership of somebody else's project.
  assert.equal(/useEffect/.test(JOIN), false, 'the join page runs something on mount');
  assert.match(JOIN, /onSubmit=/, 'there is no press to make');
});

test('the refusal the server gave is the refusal on screen', () => {
  assert.match(JOIN, /redeemRefusal\(/, 'the nine refusals collapse into one message');
  assert.match(JOIN, /join\.error\.body/, 'the reason code never leaves ApiError');
});

test('A LINK PICKER CANNOT OFFER A ROLE THE MINT ROUTE REFUSES', () => {
  // GRANTABLE_ROLES includes admin; the mint route caps at editor and answers `role_too_strong`.
  // Reusing the invite form's list here would ship a select whose top option always fails.
  const form = /function ShareLinkForm\([\s\S]*?\n\}/.exec(PANEL);
  assert.ok(form, 'ShareLinkForm is no longer a function this test can read');
  assert.match(form[0], /LINKABLE_ROLES\.map/, 'the link role picker is not built from LINKABLE_ROLES');
  assert.equal(/GRANTABLE_ROLES/.test(form[0]), false, 'the link picker offers the invite roles');
});

test('the minted token is held in the component, not in a cache that outlives the drawer', () => {
  const form = /function ShareLinkForm\([\s\S]*?\n\}/.exec(PANEL);
  assert.equal(/useQuery/.test(form[0]), false, 'the token is being kept in the query cache');
  assert.match(form[0], /allows\(access, 'share'\)/, 'the control is not gated on the share capability');
});
