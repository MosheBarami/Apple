/**
 * THE PRESENCE ROW, AND THE FOUR THINGS IT MUST NOT DO.
 *
 * The server already refuses to report anyone whose heartbeat it could not read
 * (apps/worker/src/presence.ts, tested there). What is left for the browser is the part that can
 * still be wrong on screen: showing you your own face, rendering a role the product does not have,
 * cutting a name through the middle of a code point, and a "+N" that does not account for the
 * people it stands for.
 *
 * Each test below feeds the thing that must not be rendered and checks that it is not rendered.
 *
 * Run with:  node --test tests/presence-model.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { presenceView, initialsOf, PRESENCE_VISIBLE } from '../src/components/presence-model.ts';

const person = (over = {}) => ({
  userId: 'u-1',
  role: 'editor',
  displayName: 'Tal Levi',
  activity: 'viewing',
  connections: 1,
  lastSeenMs: 1_770_000_000_000,
  ...over,
});

test('you are never your own avatar, but being alone is still worth saying', () => {
  const alone = presenceView([person({ userId: 'me' })], 'me');
  assert.deepEqual(alone.rows, [], 'your own face is noise');
  assert.equal(alone.overflow, 0);
  assert.equal(alone.summary, 'You are the only one here');

  const empty = presenceView([], 'me');
  assert.equal(empty.summary, 'Nobody else is here', 'an empty room and a room with only you are different facts');

  // Before the session loads there is no self to exclude, and guessing would hide a real person.
  const unknownSelf = presenceView([person({ userId: 'me' })], null);
  assert.equal(unknownSelf.rows.length, 1);
});

test('a role the product does not have is not rendered at all', () => {
  for (const role of ['superuser', 'Owner', '', null, undefined, 3, {}]) {
    const view = presenceView([person({ role })], 'me');
    assert.deepEqual(view.rows, [], `role ${JSON.stringify(String(role))} must not reach the screen`);
    assert.equal(view.summary, 'Nobody else is here');
  }
  // …and every real role does render, or the guard has eaten the feature.
  for (const role of ['viewer', 'commenter', 'editor', 'admin', 'owner']) {
    assert.equal(presenceView([person({ role })], 'me').rows[0].role, role);
  }
});

test('a missing name never renders as the word undefined', () => {
  for (const displayName of [null, undefined, '', '   ', 42, {}]) {
    const [row] = presenceView([person({ displayName, userId: 'abcd1234' })], 'me').rows;
    assert.ok(row, 'the person is still present');
    assert.equal(/undefined|null|NaN|\[object/.test(row.name), false, `name rendered as ${row.name}`);
    assert.equal(/undefined|null/.test(row.title), false, `title rendered as ${row.title}`);
    assert.ok(row.initials.length >= 1, 'a face always has something in it');
  }
});

test('initials are code points, not charAt — a surrogate pair is never cut in half', () => {
  // `'🌊ocean'[0]` is half a surrogate pair and renders as a replacement glyph.
  assert.equal(initialsOf('🌊 Ocean'), '🌊O');
  assert.equal([...initialsOf('🌊 Ocean')].length, 2, 'two code points, not two UTF-16 units');
  assert.equal(initialsOf('נועה ברק'), 'נב');
  assert.equal(initialsOf('tal'), 'T');
  assert.equal(initialsOf('tal.levi'), 'TL', 'a handle separator is a word break');
  assert.equal(initialsOf('   '), '?', 'an empty name still gets a face');
  assert.equal(initialsOf('a b c d'), 'AB', 'at most two');
});

test('the rows and the overflow count add up to everyone present', () => {
  const crowd = Array.from({ length: PRESENCE_VISIBLE + 5 }, (_, i) => person({ userId: `u-${i}`, displayName: `Person ${i}` }));
  const view = presenceView(crowd, 'me');
  // The claim is the RELATIONSHIP. "rows is 4" would survive a cap that silently dropped people.
  assert.equal(view.rows.length + view.overflow, crowd.length, 'a capped face must still be counted');
  assert.equal(view.rows.length, PRESENCE_VISIBLE);
  assert.ok(view.overflow > 0);
  assert.equal(view.summary, `${crowd.length} other people are here`);

  // And a cap that is itself nonsense falls back rather than rendering zero or every face.
  for (const bad of [0, -3, NaN, Infinity, undefined]) {
    const v = presenceView(crowd, 'me', bad);
    assert.equal(v.rows.length, PRESENCE_VISIBLE, `a cap of ${bad} must fall back to the default`);
    assert.equal(v.rows.length + v.overflow, crowd.length);
  }
});

test('the person actually changing the project is the face you see first', () => {
  const view = presenceView(
    [
      person({ userId: 'u-a', activity: 'viewing', displayName: 'Ann' }),
      person({ userId: 'u-b', activity: 'building', displayName: 'Ben' }),
      person({ userId: 'u-c', activity: 'typing', displayName: 'Cal' }),
    ],
    'me',
  );
  assert.deepEqual(view.rows.map((r) => r.name), ['Ben', 'Cal', 'Ann']);
  // Deterministic within an activity, so two clients draw the same order.
  const tie = presenceView([person({ userId: 'u-z' }), person({ userId: 'u-a' })], 'me');
  assert.deepEqual(tie.rows.map((r) => r.userId), ['u-a', 'u-z']);
});

test('an unknown activity is shown as being here, never as a word the product does not own', () => {
  const [row] = presenceView([person({ activity: 'deleting-everything' })], 'me').rows;
  assert.equal(row.activity, 'viewing');
  assert.equal(row.title.includes('deleting'), false);
  assert.match(row.title, /Tal Levi \(editor\) is here/);
});

test('a single other person is named, not counted', () => {
  const one = presenceView([person({ displayName: 'Noa', activity: 'typing' })], 'me');
  assert.equal(one.summary, 'Noa is typing');
});

test('entries that are not objects are skipped rather than thrown over', () => {
  const view = presenceView([null, 'editor', 7, [], person()], 'me');
  assert.equal(view.rows.length, 1);
  assert.equal(presenceView(undefined, 'me').rows.length, 0);
});
