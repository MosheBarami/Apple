// What removing this person WOULD do, before it is done.
//
// GET /api/shared/:id/members/:userId/impact exists, is careful, and was called by nothing. It
// combines the roster standing with a footprint counted IN SQL by the collaboration store — their
// comments, the open reviews they are the only reviewer on, the versions they authored, whether
// they wrote the checkpoint the project is currently sitting on — and then states the effects of
// the removal explicitly rather than leaving them to be inferred from the numbers. The panel's
// Remove button called removeMember directly, with no preview and no confirmation.
//
// THE FIELD THIS MODULE EXISTS FOR IS `footprintAvailable`. The counts come from the project's
// Durable Object, which can be unreachable. A preview that renders an unread count as `0` tells an
// administrator the departing member holds nothing — a failure to observe rendered as an
// observation, in front of the one decision where being wrong is permanent. Unknown is never zero
// and never silence.
import test from 'node:test';
import assert from 'node:assert/strict';

const { readImpact } = await import('../src/lib/member-impact.ts');

const FOOTPRINT = {
  comments: 4,
  openComments: 1,
  reviewsRequested: 0,
  reviewsAwaiting: 2,
  reviewsSoleReviewer: 0,
  approvals: 3,
  versions: 7,
  authorsCurrentHead: false,
  retained: ['comments', 'versions', 'approvals'],
  blocked: [],
};

const impact = (over = {}) => ({
  userId: 'u1',
  member: { userId: 'u1', handle: 'sam', role: 'editor', status: 'active', origin: 'invite' },
  footprint: FOOTPRINT,
  footprintAvailable: true,
  effects: {
    accessEndsImmediately: true,
    linkGrantRevoked: false,
    reRedemptionBarred: false,
    ownershipUnchanged: true,
    historyRetained: true,
  },
  ...over,
});

/* ------------------------------------------------------------------- counts --- */

test('the counts are shown, each with the thing it counts', () => {
  const r = readImpact(impact());
  assert.ok(Array.isArray(r.counts));
  const labels = r.counts.map((c) => c.label.toLowerCase()).join(' | ');
  assert.match(labels, /comment/);
  // 'Checkpoints', not 'versions'. The wire field is `versions`; the word this product puts in
  // front of a person is checkpoint, everywhere, and tests/tool-vocabulary.test.mjs is why.
  assert.match(labels, /checkpoint/);
  assert.equal(/\bversion/.test(labels), false, 'the wire field name leaked onto the screen');
});

test('A COUNT WE COULD NOT READ IS NOT ZERO', () => {
  // The whole reason this module is not two lines of JSX.
  const r = readImpact(impact({ footprint: null, footprintAvailable: false }));
  assert.equal(r.counts, null, 'an uncounted footprint must not render as a list of zeroes');
  assert.ok(
    r.warnings.some((w) => /could not count/i.test(w)),
    'nothing told the reader the counting failed',
  );
});

test('a member who genuinely holds nothing is DIFFERENT from a member we could not count', () => {
  const empty = { ...FOOTPRINT, comments: 0, openComments: 0, reviewsAwaiting: 0, approvals: 0, versions: 7 };
  const r = readImpact(impact({ footprint: { ...empty, versions: 0 } }));
  assert.ok(Array.isArray(r.counts), 'a real zero is still an answer and must be shown');
  assert.equal(
    r.warnings.some((w) => /could not count/i.test(w)),
    false,
  );
});

/* ----------------------------------------------------------------- warnings --- */

test('an open review with nobody else on it is the loudest thing on the screen', () => {
  // Once they are gone that request can never reach `approved`, and nobody can tell why.
  const r = readImpact(impact({ footprint: { ...FOOTPRINT, reviewsSoleReviewer: 2 } }));
  assert.ok(r.warnings.some((w) => /review/i.test(w)), 'the sole-reviewer case is not surfaced');
});

test('the checkpoint the project is sitting on being theirs is worth saying', () => {
  const r = readImpact(impact({ footprint: { ...FOOTPRINT, authorsCurrentHead: true } }));
  assert.ok(r.warnings.some((w) => /checkpoint|current/i.test(w)));
});

test('a roster that could not be read in full says so here too', () => {
  const r = readImpact(impact({ partial: true, incomplete: ['link_grants'] }));
  assert.ok(r.warnings.length > 0);
});

test('somebody who was never here is named as such, not previewed as a removal', () => {
  const r = readImpact(impact({ member: null }));
  assert.ok(r.warnings.some((w) => /not a member|no membership/i.test(w)));
});

/* ------------------------------------------------------------------ effects --- */

test('only the effects that are TRUE are stated', () => {
  const r = readImpact(impact());
  const all = r.effects.join(' | ').toLowerCase();
  assert.match(all, /access/, 'accessEndsImmediately is true and unsaid');
  assert.equal(/link/.test(all), false, 'linkGrantRevoked is false and was stated anyway');
});

test('a guest is told the link they hold stops working', () => {
  const r = readImpact(
    impact({
      member: { userId: 'u1', handle: 'sam', role: 'viewer', status: 'active', origin: 'link' },
      effects: {
        accessEndsImmediately: true,
        linkGrantRevoked: true,
        reRedemptionBarred: true,
        ownershipUnchanged: true,
        historyRetained: true,
      },
    }),
  );
  const all = r.effects.join(' | ').toLowerCase();
  assert.match(all, /link/);
});

test('what SURVIVES the removal is stated, because a list of numbers invites the opposite reading', () => {
  const r = readImpact(impact());
  const all = r.effects.join(' | ').toLowerCase();
  assert.match(all, /kept|remain|stay|not deleted/);
});

/* ------------------------------------------------- an answer we cannot read --- */

test('AN UNREADABLE PREVIEW IS A WARNING, NEVER A CONFIDENT EMPTY ONE', () => {
  // The dangerous failure is silence: a reading with no counts, no effects and no warnings renders
  // as "removing them does nothing", which is the most reassuring possible way to be wrong.
  for (const bad of [null, undefined, 'nope', 42, {}]) {
    const r = readImpact(bad);
    assert.equal(r.counts, null);
    assert.ok(r.warnings.length > 0, `readImpact(${JSON.stringify(bad)}) answered with confident silence`);
  }
});
