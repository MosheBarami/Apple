/**
 * WHAT THE CONNECT-YOUR-ROBLOX-ACCOUNT PANEL IS ALLOWED TO SAY.
 *
 * `lib/roblox-key.ts` held every sentence this panel shows and had NO test of its own. Three
 * things were wrong with what it said, and all three are the same wrong: the words did not match
 * what the product does.
 *
 *   1. SIX PERMISSIONS OFFERED, ONE IMPLEMENTED. 'Publish to your places', 'Send messages to a
 *      running game' and the rest were tickboxes granting real authority over a real Roblox
 *      account for features that do not exist. A permission taken for nothing is worse than a
 *      missing feature: the feature is absent either way, and now the key can do it.
 *
 *   2. FOUR STATES, AND NONE OF THEM WAS "ROBLOX IS REFUSING THIS KEY". A revoked key rendered as
 *      "Connected to Roblox account 11279664020 — last used 2026-09-14", confidently, forever.
 *
 *   3. EVERY FAILURE WAS A BARE TOAST OF `e.message`. The worker distinguishes no-key from
 *      scope-not-declared from cannot-decrypt, and Roblox distinguishes a revoked key from a
 *      rejected file; all of it arrived as one grey line with no next action.
 *
 * THE HAZARD THESE ASSERT AGAINST is the confident sentence: a health verdict of "unknown" that
 * renders as reassurance, or a name printed from an id nobody verified. So the cases below read
 * whole sentences back rather than checking that a formatter was called.
 *
 * Run with:  node --test tests/roblox-key.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCOPE_EXPLANATIONS,
  describeStored,
  describeHealth,
  explainKeyFailure,
  implementedScopes,
  stateOf,
} from '../src/lib/roblox-key.ts';
import { ROBLOX_SCOPES } from '@golem/shared';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = readFileSync(join(WEB, 'src', 'components', 'roblox-key-panel.tsx'), 'utf8');
const API = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');

/** Nothing this module produces may ever contain one of these. */
const POISON = ['undefined', 'NaN', 'null', 'Invalid Date', '[object'];
const clean = (s, what) => {
  assert.equal(typeof s, 'string', `${what} must be a string, got ${typeof s}`);
  for (const bad of POISON) assert.equal(s.includes(bad), false, `${what} rendered "${bad}": ${s}`);
};

const CRED = {
  robloxCreatorId: '11279664020',
  creatorType: 'user',
  scopes: ['asset:write'],
  fingerprint: 'f'.repeat(64),
  hint: '6789',
  createdAt: '2026-09-01T10:00:00.000Z',
  lastUsedAt: '2026-09-14T09:00:00.000Z',
};

// ------------------------------------------------- 1. a permission offered is a permission used

test('EVERY DESCRIBED SCOPE SAYS WHETHER THE PRODUCT ACTUALLY USES IT', () => {
  assert.ok(SCOPE_EXPLANATIONS.length >= 6, 'the scope vocabulary shrank — check this is deliberate');
  for (const e of SCOPE_EXPLANATIONS) {
    assert.equal(typeof e.implemented, 'boolean', `${e.scope} must declare whether it is implemented`);
    clean(e.title, `${e.scope} title`);
    clean(e.does, `${e.scope} does`);
  }
});

test('and the implemented ones are exactly the ones with a consumer in the worker', () => {
  // asset:write is used by asset-import.ts; user.social:read by roblox-check.ts. The other four
  // have no call site anywhere in the tree. When one of them grows a consumer this list changes in
  // the same commit, which is the point of the field existing at all.
  assert.deepEqual([...implementedScopes()].sort(), ['asset:write', 'user.social:read']);
});

test('an unimplemented permission is LABELLED as such where it is ticked', () => {
  // Hiding them was the other option and it is worse: a key already connected with one of these
  // would then show a permission the panel cannot explain. Labelling keeps the account's real
  // authority visible while telling the truth about what is behind it.
  assert.match(PANEL, /implemented/, 'the panel must read the flag');
  assert.match(PANEL, /Not used yet|not used yet/, 'and say so beside the tickbox');
});

// ------------------------------------------------------ 2. the state that did not exist: rejected

test('A KEY ROBLOX IS REFUSING IS ITS OWN STATE — not "connected", not "none"', () => {
  const state = stateOf({ isPending: false, isError: false, credential: CRED, health: { status: 'rejected', reason: 'x' } });
  assert.equal(state, 'rejected');
  const said = describeStored(CRED, state);
  clean(said, 'the rejected sentence');
  assert.match(said, /revoked|expired/i, 'it must say what happened to the key');
  assert.match(said, /create\.roblox\.com/, 'and where to make a new one');
  assert.match(said, /nothing already built/i, 'and answer "did I lose anything" — the first question anyone has');
});

test('a health verdict of "unknown" NEVER becomes a claim about the key', () => {
  // The whole hazard: an unreachable provider rendered as a working credential, or as a dead one.
  const state = stateOf({ isPending: false, isError: false, credential: CRED, health: { status: 'unknown', reason: 'Apple could not reach Roblox to check.' } });
  assert.equal(state, 'connected', 'an unmeasured check leaves the stored state exactly as it was');
  const said = describeHealth({ status: 'unknown', reason: 'Apple could not reach Roblox to check.' });
  clean(said, 'the unknown sentence');
  assert.match(said, /could not/i);
  assert.equal(/still works|is fine|healthy|all good/i.test(said), false, `an unknown verdict must not reassure: ${said}`);
});

test('a checked, live key says so, and says it about an account with a NAME', () => {
  const said = describeHealth({ status: 'ok', accountName: 'Builderman', checkedAt: '2026-09-15T10:00:00.000Z' });
  clean(said, 'the ok sentence');
  assert.match(said, /Builderman/);
  const nameless = describeHealth({ status: 'ok', accountName: null, checkedAt: '2026-09-15T10:00:00.000Z' });
  clean(nameless, 'the nameless ok sentence');
  assert.equal(nameless.includes('Builderman'), false);
});

test('no health check yet is silence, not a verdict', () => {
  assert.equal(describeHealth(null), null);
  assert.equal(describeHealth({ status: 'none' }), null, 'nothing connected is the panel\'s own state, not a health line');
});

test('the four states that existed still behave, so this did not become five broken ones', () => {
  assert.equal(stateOf({ isPending: true, isError: false, credential: null, health: null }), 'loading');
  assert.equal(stateOf({ isPending: false, isError: true, credential: null, health: null }), 'failed');
  assert.equal(stateOf({ isPending: false, isError: false, credential: null, health: null }), 'none');
  assert.equal(stateOf({ isPending: false, isError: false, credential: CRED, health: null }), 'connected');
  // A rejected health for an account with NO stored key is a stale answer, not a state.
  assert.equal(stateOf({ isPending: false, isError: false, credential: null, health: { status: 'rejected', reason: 'x' } }), 'none');
});

// --------------------------------------------------------------- 3. failures that say what to do

test('THE WORKER\'S THREE CREDENTIAL REFUSALS BECOME THREE DIFFERENT ANSWERS', () => {
  const cases = [
    ['no Roblox key is connected for this account', /connect/i],
    ['the connected Roblox key was not declared with the asset:write scope', /permission|scope/i],
    ['the stored key could not be decrypted — CREDENTIAL_KEY may have been rotated or lost', /support|Apple/i],
  ];
  const seen = new Set();
  for (const [message, next] of cases) {
    const x = explainKeyFailure(new Error(message));
    clean(x.title, `title for "${message}"`);
    clean(x.next, `next step for "${message}"`);
    assert.match(x.next, next);
    seen.add(x.title);
  }
  assert.equal(seen.size, 3, 'three distinct causes must not collapse into one sentence');
});

test('a Roblox 401 is the key being refused, NOT the user being signed out', () => {
  // The taxonomy's own 401 branch says "Your session has expired — sign in again", which for an
  // integration failure sends somebody to re-authenticate the wrong account entirely.
  const x = explainKeyFailure(Object.assign(new Error('{"message":"Invalid API Key"}'), { status: 401 }), { integration: true });
  assert.equal(/sign in/i.test(x.next ?? ''), false, `a dead Roblox key must not ask for an Apple sign-in: ${x.next}`);
  assert.match(x.title, /Roblox/i);
  assert.match(x.next, /new key|create\.roblox\.com/i);
});

test('an unrecognised failure still answers both questions rather than shrugging', () => {
  const x = explainKeyFailure(new Error('something nobody mapped'));
  clean(x.title, 'fallback title');
  assert.equal(typeof x.next, 'string');
  assert.ok(x.detail.includes('something nobody mapped'), 'the server\'s own words survive for support');
});

// ----------------------------------------------------------------------------- it is all wired

test('the panel can actually ask for a health check, and the client has a route to ask on', () => {
  assert.match(API, /\/api\/me\/roblox-key\/check/, 'the api client must call the check route');
  assert.match(API, /export const checkRobloxKey/, 'and export it under a name the panel imports');
  assert.match(PANEL, /checkRobloxKey/, 'the panel must import it');
  assert.match(PANEL, /Test connection|Check connection/i, 'and give it a control a person can press');
});

test('the panel renders the mapped explanation, not a bare e.message toast', () => {
  assert.match(PANEL, /explainKeyFailure/, 'the mapper must be used where the failures land');
});

test('every scope the panel offers is one the worker will accept', () => {
  // The vocabulary lives in @golem/shared precisely so this cannot drift; asserted because a
  // scope offered and refused is a tickbox that fails at save time.
  for (const e of SCOPE_EXPLANATIONS) {
    assert.ok(ROBLOX_SCOPES.includes(e.scope), `${e.scope} is not a Roblox Open Cloud scope`);
  }
});
