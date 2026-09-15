// Every release rule, handed a release that breaks it.
//
// The rules in scripts/lib/release-rules.mjs are pointed at the real ledger by
// scripts/release.mjs, and the real ledger is supposed to be correct — so a rule that only ever
// sees it walks its silent path forever and would be just as green with its body removed. That is
// the defect scripts/lib/offer-rules.mjs was split out of check-offer.mjs to fix, and the fix is
// the same here: the violating input comes from this file.
//
// Where a rule is about a RELATIONSHIP, the assertion is about the relationship. "the next version
// is 0.2.0" is a claim a typo satisfies; "a release that removes a capability lands further along
// than one that fixes a bug" is the property, and it stays true if every number changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bumpFor,
  channelOf,
  compareSemver,
  ledgerPageAgreement,
  nextVersion,
  parseSemver,
  renderChangelog,
  renderReleaseNotes,
  tagFor,
  validateLedger,
  validateTagSequence,
  versionOfTag,
  versionSourceVerdict,
} from '../scripts/lib/release-rules.mjs';

/* ------------------------------------------------------------------ semver --- */

test('a version is the official grammar, not "three numbers with dots"', () => {
  assert.notEqual(parseSemver('1.2.3'), null);
  assert.notEqual(parseSemver('0.2.0-canary.1+build.7'), null);
  for (const bad of ['01.2.3', '1.2', '1.2.3.4', 'v1.2.3', '1.2.3-', '', ' 1.2.3', 1.23, null, undefined, {}]) {
    // Leading zeros are the interesting one: `01.2.3` and `1.2.3` are two spellings of one
    // version, and a release that has two identities has none.
    assert.equal(parseSemver(bad), null, `${JSON.stringify(bad)} must not parse as a version`);
  }
});

test('an unparseable version makes a comparison THROW rather than answer', () => {
  // The alternative is that `compareSemver('1.0.0', 'main')` returns 0, which makes "these are the
  // same version" indistinguishable from "one of these is not a version" — in a function whose
  // callers decide whether a release may proceed.
  assert.throws(() => compareSemver('1.0.0', 'main'), /not a version/);
  assert.throws(() => compareSemver(undefined, '1.0.0'), /not a version/);
});

test('a prerelease sorts before the release it precedes, and its identifiers sort by the spec', () => {
  assert.equal(compareSemver('1.0.0-canary.1', '1.0.0') < 0, true);
  assert.equal(compareSemver('1.0.0-canary.2', '1.0.0-canary.10') < 0, true, 'numeric identifiers compare numerically');
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1') < 0, true, 'fewer identifiers sort first');
  assert.equal(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0, 'build metadata is not precedence');
});

test('a channel is an allowlist — a typo is `unknown`, never "some prerelease"', () => {
  assert.equal(channelOf('1.0.0'), 'stable');
  assert.equal(channelOf('1.0.0-canary.3'), 'canary');
  // `canry` is a valid prerelease and a typo. Anything doing `includes('canary')` would route it
  // as a canary and anything matching an exact name would route it as stable — the two halves of
  // a promotion pipeline disagreeing about what is in front of them.
  assert.equal(channelOf('1.0.0-canry.3'), 'unknown');
  assert.equal(channelOf('not a version'), null);
});

/* -------------------------------------------------------------- the bump --- */

test('an unknown change kind produces NO bump rather than the cheapest one', () => {
  // A lookup table typed Record<Kind, Bump> is a compile-time promise and nothing at runtime: a
  // hand-written ledger can say "feat", get undefined back, and be ranked below patch by any `>`.
  assert.equal(bumpFor([{ kind: 'feat', text: 'x' }]), null);
  assert.equal(bumpFor([{ kind: 'added', text: 'x' }, { kind: 'feat', text: 'y' }]), null, 'one unreadable entry stops the whole set');
  assert.equal(bumpFor([]), null);
  assert.equal(bumpFor('added'), null);
  assert.equal(bumpFor([{ kind: 'added', text: 'x', breaking: 'yes' }]), null, 'a non-boolean "breaking" is not a flag');
  // CONTROL: the same shapes with a kind the table knows.
  assert.equal(bumpFor([{ kind: 'added', text: 'x' }]), 'minor');
});

test('THE RELATIONSHIP: the more a release takes away, the further the version moves', () => {
  const from = '1.4.2';
  const fix = nextVersion(from, [{ kind: 'fixed', text: 'x' }]);
  const feature = nextVersion(from, [{ kind: 'added', text: 'x' }]);
  const removal = nextVersion(from, [{ kind: 'removed', text: 'x' }]);
  assert.equal(compareSemver(feature, fix) > 0, true, 'a feature lands further along than a fix');
  assert.equal(compareSemver(removal, feature) > 0, true, 'a removal lands further along than a feature');
  // And a set is bumped by its loudest member, not by its first or its last.
  assert.equal(nextVersion(from, [{ kind: 'fixed', text: 'a' }, { kind: 'removed', text: 'b' }]), removal);
  assert.equal(nextVersion(from, [{ kind: 'added', text: 'a', breaking: true }]), removal, '"breaking" forces the major regardless of kind');
});

test('below 1.0.0 a breaking change spends a minor, which is what this product actually did', () => {
  // v0.1 → v0.2 removed multi-model routing. The major stayed 0, and the ledger's bump rule has to
  // agree with the history it is checking or it is useless against it.
  assert.equal(nextVersion('0.1.0', [{ kind: 'removed', text: 'multi-model routing' }]), '0.2.0');
  assert.equal(nextVersion('1.1.0', [{ kind: 'removed', text: 'multi-model routing' }]), '2.0.0');
});

test('a prerelease is not bumped by this function, and says so by returning null', () => {
  assert.equal(nextVersion('1.0.0-canary.1', [{ kind: 'fixed', text: 'x' }]), null);
  assert.equal(nextVersion('not a version', [{ kind: 'fixed', text: 'x' }]), null);
});

/* -------------------------------------------------------------- the tags --- */

test('a tag round-trips, and a bare version is not a tag', () => {
  assert.equal(tagFor('1.2.3'), 'v1.2.3');
  assert.equal(versionOfTag('v1.2.3'), '1.2.3');
  assert.equal(versionOfTag('1.2.3'), null);
  assert.equal(versionOfTag('v1.2'), null);
  assert.equal(tagFor('1.2'), null);
});

test('a tag sequence may not repeat, go backwards, or contain something that is not a tag', () => {
  assert.deepEqual(validateTagSequence(['v0.1.0', 'v0.2.0', 'v1.0.0']), []);
  // A REUSED TAG IS THE UNFIXABLE ONE: every earlier report that cites it becomes ambiguous
  // forever, including this repository's own FALSIFIED records.
  assert.match(validateTagSequence(['v0.1.0', 'v0.1.0']).join('\n'), /appears twice/);
  assert.match(validateTagSequence(['v0.2.0', 'v0.1.0']).join('\n'), /goes backwards/);
  assert.match(validateTagSequence(['v0.1.0', 'release-2']).join('\n'), /not a version tag/);
  assert.match(validateTagSequence('v0.1.0').join('\n'), /not a list/);
});

/* ------------------------------------------------------------ the ledger --- */

/** A ledger that is correct in every way. Each test below breaks exactly one thing in it. */
const ledger = () => ([
  {
    version: '0.2.0',
    tag: 'v0.2.0',
    date: '2026-08-30',
    title: 'One model, measured',
    changes: [{ kind: 'removed', breaking: true, text: 'Multi-model routing.' }, { kind: 'added', text: 'Four spend gates.' }],
  },
  {
    version: '0.1.0',
    tag: 'v0.1.0',
    date: '2026',
    title: 'First public release',
    changes: [{ kind: 'added', text: 'The workspace.' }],
  },
]);

test('CONTROL: a ledger that agrees with itself has no problems', () => {
  assert.deepEqual(validateLedger(ledger()), []);
});

test('THE CENTRAL RULE: a version that does not follow from its own changes is a problem', () => {
  // The number follows the content. A release that REMOVES something is not a patch, and this is
  // the assertion a literal "the version is 0.1.1" could never make.
  const l = ledger();
  l[0].version = '0.1.1';
  l[0].tag = 'v0.1.1';
  const problems = validateLedger(l);
  assert.match(problems.join('\n'), /does not follow from v0\.1\.0/);
  assert.match(problems.join('\n'), /which makes it v0\.2\.0/);
});

test('a ledger that is not newest-first is a problem', () => {
  assert.match(validateLedger(ledger().reverse()).join('\n'), /the ledger is newest-first/);
});

test('a release dated before the one below it is a problem', () => {
  const l = ledger();
  l[0].date = '2025-01-01';
  assert.match(validateLedger(l).join('\n'), /dated 2025-01-01, before v0\.1\.0/);
});

test('a duplicated version, a missing title, an unusable date and a wrong tag are each reported', () => {
  const l = ledger();
  l[0].version = '0.1.0';
  assert.match(validateLedger(l).join('\n'), /appears twice/);

  const m = ledger();
  m[0].title = '   ';
  assert.match(validateLedger(m).join('\n'), /has no title/);

  const n = ledger();
  n[0].date = '30 August';
  assert.match(validateLedger(n).join('\n'), /no usable date/);

  const o = ledger();
  o[0].tag = 'v0.2';
  assert.match(validateLedger(o).join('\n'), /which is not v0\.2\.0/);
});

test('a release with no changes, or with a change of an unknown kind, is a problem', () => {
  const l = ledger();
  l[0].changes = [];
  assert.match(validateLedger(l).join('\n'), /lists no changes/);

  const m = ledger();
  m[0].changes = [{ kind: 'feat', text: 'x' }];
  assert.match(validateLedger(m).join('\n'), /unknown kind "feat"/);

  const n = ledger();
  n[0].changes = [{ kind: 'added', text: '' }];
  assert.match(validateLedger(n).join('\n'), /has no text/);
});

test('an empty ledger is a problem, because an empty history is not a history', () => {
  assert.match(validateLedger([]).join('\n'), /no releases/);
  assert.match(validateLedger(null).join('\n'), /not a list of releases/);
});

/* ---------------------------------------------------------- the rendering --- */

test('the rendering is deterministic, marks breaking changes, and refuses an invalid ledger', () => {
  const once = renderChangelog(ledger());
  assert.equal(renderChangelog(ledger()), once, 'the same ledger must render the same bytes, or --check reports drift forever');
  assert.match(once, /GENERATED by scripts\/release\.mjs/);
  assert.match(once, /\*\*BREAKING\*\* Multi-model routing\./);
  assert.match(once, /## v0\.2\.0 — One model, measured/);
  // The order of the sections is the table's order, not the ledger's: Removed comes after Added.
  assert.equal(once.indexOf('### Added') < once.indexOf('### Removed'), true);

  const broken = ledger();
  broken[0].changes = [{ kind: 'feat', text: 'x' }];
  assert.throws(() => renderChangelog(broken), /cannot render an invalid ledger/);
  assert.throws(() => renderReleaseNotes({ version: '1.0.0' }), /cannot render an invalid release/);
});

/* -------------------------------------------------- the ledger and the page --- */

test('BOTH directions between the ledger and the page are checked, because they catch different defects', () => {
  const page = '<h2><span>v0.2</span> One model</h2><h2><span>v0.1</span> First</h2>';
  assert.deepEqual(ledgerPageAgreement(ledger(), page), { missingFromPage: [], missingFromLedger: [] });

  // A release nobody announced.
  assert.deepEqual(
    ledgerPageAgreement(ledger(), '<h2>v0.1</h2>').missingFromPage,
    ['0.2'],
  );
  // An announcement with no release behind it — the direction that lets a product advertise a
  // version it never shipped.
  assert.deepEqual(
    ledgerPageAgreement(ledger(), '<h2>v0.2</h2><h2>v0.1</h2><h2>v9.9 coming soon</h2>').missingFromLedger,
    ['9.9'],
  );
});

test("a build's declared version is checked against the ledger, and the four faults are named apart", () => {
  const l = ledger();
  assert.equal(versionSourceVerdict('0.2.0', l).state, 'current');
  assert.equal(versionSourceVerdict('0.1.0', l).state, 'behind');
  assert.equal(versionSourceVerdict('0.1.0', l).releasesBehind, 1);
  // A version nothing describes: no changelog entry, nothing to say what is in it.
  assert.equal(versionSourceVerdict('0.1.5', l).state, 'unknown');
  // A build claiming a release that has not happened.
  assert.equal(versionSourceVerdict('0.3.0', l).state, 'ahead');
  assert.equal(versionSourceVerdict('main', l).state, 'unreadable');
  assert.equal(versionSourceVerdict('0.2.0', []).state, 'unreadable', 'with no releases there is nothing to be current with');
});
