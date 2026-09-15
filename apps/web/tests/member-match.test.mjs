// Finding a person in a member list.
//
// The server decides WHICH members match — `?q=` on /api/shared/:id/members, against handle,
// display name and id — and returns the page owner-first, then alphabetically. That order is right
// for browsing and wrong for searching: typing `sam` puts `alexander` above `sam` whenever the
// alphabet and relevance disagree, which for a search box is every time. So the page is ORDERED
// here and filtered there, and this module had no test at all.
//
// The tiers are ordered by how CERTAIN the match is, and the two ends are the ones worth pinning:
//
//   AN ID MATCHES WHOLE OR NOT AT ALL, and it is the last tier. A four-character fragment of a
//   UUID is a coincidence rather than a search result, and substring-matching ids would let a
//   query like `ae` outrank every real name in the list.
//
//   AN EMPTY QUERY LEAVES THE SERVER'S ORDER ALONE. Re-sorting an unsearched list by relevance —
//   every member at tier 'none' — is a stable no-op in a correct implementation and quietly moves
//   the owner out of the top row in any implementation that is not.
import test from 'node:test';
import assert from 'node:assert/strict';

const { MATCH_TIERS, tierFor, memberTier, rankMembers } = await import('../src/lib/member-match.ts');

const M = (handle, displayName = null, userId = 'id-' + handle) => ({ userId, handle, displayName });

/* -------------------------------------------------------------------- tiers --- */

test('THE TIERS RANK BY CERTAINTY, and each one is reachable', () => {
  // Written as one table because the ORDER is the content: a change that made 'word' outrank
  // 'prefix' would leave every individual assertion true and the feature wrong.
  assert.equal(tierFor('sam', 'sam'), 'exact');
  assert.equal(tierFor('sammy', 'sam'), 'prefix');
  assert.equal(tierFor('big sam', 'sam'), 'word');
  assert.equal(tierFor('flotsam', 'sam'), 'substring');
  assert.equal(tierFor('nobody', 'sam'), 'none');
});

test('the tier list is ordered the way the ranker uses it', () => {
  assert.deepEqual([...MATCH_TIERS], ['exact', 'prefix', 'word', 'substring', 'id', 'none']);
});

test('matching ignores case in both directions', () => {
  assert.equal(tierFor('SAM', 'sam'), 'exact');
  assert.equal(tierFor('sam', 'SAM'), 'exact');
});

test('a query of nothing but spaces matches nothing, rather than everything', () => {
  // `''.startsWith('')` is true and `'x'.includes('')` is true, so the untrimmed version of this
  // function calls every member an exact match and the ranking collapses.
  assert.equal(tierFor('sam', '   '), 'none');
  assert.equal(tierFor('sam', ''), 'none');
});

test('a member with no name at all does not match', () => {
  assert.equal(tierFor(null, 'sam'), 'none');
  assert.equal(tierFor('', 'sam'), 'none');
});

test('a word boundary is a non-letter, so a hyphen and a dot both start a new word', () => {
  assert.equal(tierFor('jean-sam', 'sam'), 'word');
  assert.equal(tierFor('a.sam', 'sam'), 'word');
  // …and a digit does not: `sam2` is one word, matched from its start.
  assert.equal(tierFor('sam2', 'sam'), 'prefix');
});

/* ------------------------------------------------------------ a whole member --- */

test('the best of a member’s two names is the member’s tier', () => {
  assert.equal(memberTier(M('flotsam', 'Sam Vimes'), 'sam'), 'prefix', 'the display name is a better answer and was ignored');
  assert.equal(memberTier(M('sam', 'Alexander'), 'sam'), 'exact');
});

test('AN ID MATCHES WHOLE OR NOT AT ALL', () => {
  const id = '2f1c9d6e-0000-4000-8000-000000000001';
  assert.equal(memberTier(M('nobody', null, id), id), 'id');
  assert.equal(memberTier(M('nobody', null, id), '2f1c'), 'none', 'a fragment of a UUID is a coincidence, not a result');
});

test('an id match never outranks a name match', () => {
  // `id` is the last real tier for this reason: an id is what you paste when you already know it,
  // and somebody typing a name wants the name.
  const id = '2f1c9d6e-0000-4000-8000-000000000001';
  const byId = M('nobody', null, id);
  const byName = M('sam');
  assert.deepEqual(rankMembers([byId, byName], 'sam').map((m) => m.handle), ['sam', 'nobody']);
});

/* ------------------------------------------------------------------ ranking --- */

test('the best answer comes first, whatever the server’s order was', () => {
  // One member at EVERY tier, in the wrong order, so that swapping any two ranks in TIER_RANK
  // changes this line. A list that happens to skip a tier proves nothing about where that tier
  // sits: with no 'word' member in it, exchanging 'word' and 'prefix' leaves the result identical.
  const list = [M('alexander'), M('flotsam'), M('big sam'), M('sammy'), M('sam')];
  assert.deepEqual(
    rankMembers(list, 'sam').map((m) => m.handle),
    ['sam', 'sammy', 'big sam', 'flotsam', 'alexander'],
  );
});

test('AN EMPTY QUERY LEAVES THE SERVER’S ORDER EXACTLY AS IT CAME', () => {
  // The server puts the owner first. Sorting an unsearched list here moves them out of the top row
  // and nothing on screen would say why. Two mechanisms hold this — the early return, and every
  // member landing on the same tier with a stable tie-break — which is belt and braces rather than
  // redundancy: this asserts the PROPERTY, so removing either one alone still leaves it true.
  const list = [M('zoe'), M('alice'), M('bob')];
  assert.deepEqual(rankMembers(list, '').map((m) => m.handle), ['zoe', 'alice', 'bob']);
  assert.deepEqual(rankMembers(list, '   ').map((m) => m.handle), ['zoe', 'alice', 'bob']);
});

test('ties keep the order they arrived in, so the list does not reshuffle as you type', () => {
  // Also held twice over: the explicit `a.i - b.i` and Array.prototype.sort's own stability. The
  // property is what matters — a list that jumps between two equally good answers on every
  // keystroke is unusable whichever of those two is doing the work.
  const list = [M('sam one'), M('sam two'), M('sam three')];
  assert.deepEqual(rankMembers(list, 'sam').map((m) => m.handle), ['sam one', 'sam two', 'sam three']);
});

test('members that match nothing are kept, at the bottom', () => {
  // The server already decided they match; dropping them here would answer "no such member" about
  // somebody the roster returned, which is the client-side filter this module exists to avoid.
  const list = [M('nobody'), M('sam')];
  const out = rankMembers(list, 'sam');
  assert.equal(out.length, 2);
  assert.equal(out[0].handle, 'sam');
});

test('ranking does not mutate the list it was handed', () => {
  const list = [M('alexander'), M('sam')];
  const copy = [...list];
  rankMembers(list, 'sam');
  assert.deepEqual(list, copy);
});
