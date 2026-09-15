// Finding a setting, and the two ways a settings search is worse than no search at all.
//
//   1. IT FINDS SOMETHING THAT IS NOT THERE. A registry entry with no matching control is a result
//      that reveals an empty section. This is the same failure the tour has — a pointer outliving
//      the thing it points at — so it is checked the same way tests/onboarding.test.mjs checks
//      coach-mark anchors: against the attributes actually present in the JSX.
//
//   2. IT CANNOT FIND SOMETHING THAT IS. Worse, because the user concludes the setting does not
//      exist and goes looking for it in the wrong product. Checked in the same pass, in the other
//      direction.
//
// The queries below are the words people actually type, not the words on the labels — a search that
// only matches the label is `Ctrl+F` with extra steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTING_FIELDS, matchSettings, settingMatches, visibleSections } from '../src/lib/settings-search.ts';
import { DEFAULT_PREFS } from '../src/lib/prefs.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, '..', 'src', 'routes', 'settings.tsx'), 'utf8');

/**
 * Every setting id the page actually puts on screen.
 *
 * Two spellings, because the page has two: the row component stamps `data-setting={id}` onto the
 * element, and the call sites name the id as a prop. Scraping only the attribute found ZERO ids and
 * would have reported "nothing missing" — F-64 exactly, a parser matching nothing and calling it
 * success. The non-vacuity assertion below is what caught it.
 */
const rendered = new Set([
  ...[...PAGE.matchAll(/data-setting="([^"]+)"/g)].map((m) => m[1]),
  ...[...PAGE.matchAll(/<Row\s+id="([^"]+)"/g)].map((m) => m[1]),
]);

test('the page renders a control for every registered setting', () => {
  // F-64 first: if the scrape found nothing, an empty difference would mean nothing.
  assert.ok(rendered.size >= 8, `only found ${rendered.size} data-setting attributes — the scrape is broken`);
  const missing = SETTING_FIELDS.map((f) => f.id).filter((id) => !rendered.has(id));
  assert.deepEqual(missing, [], 'these are searchable but nothing on the page carries the id');
});

test('the id reaches the DOM, not only the JSX', () => {
  // Added after a falsification came back GREEN. Deleting `data-setting={id}` from the row
  // component turned nothing red, and the first reading of that is "the assertion is vacuous" —
  // it is not. The scrape above reads the `<Row id="…">` call sites as well, and those are what
  // prove a control EXISTS, which is the property that test names. The attribute is a different
  // promise, made in this page's own header comment and relied on by anything that has to find a
  // setting in the rendered document, and nothing was checking it. So it gets its own assertion
  // rather than being folded into one that means something else.
  assert.match(
    PAGE,
    /<div className="settings-row" data-setting=\{id\}/,
    'the settings row must stamp its id onto the element',
  );
});

test('every control on the page is registered, so search can find it', () => {
  const unregistered = [...rendered].filter((id) => !SETTING_FIELDS.some((f) => f.id === id));
  assert.deepEqual(unregistered, [], 'these are on the page but search cannot find them');
});

test('an empty query shows the whole page, not an empty one', () => {
  // The obvious reading of "no search, no results" opens the settings page blank.
  assert.equal(matchSettings('').length, SETTING_FIELDS.length);
  assert.equal(matchSettings('   ').length, SETTING_FIELDS.length);
  assert.equal(matchSettings(null).length, SETTING_FIELDS.length);
  assert.equal(matchSettings(undefined).length, SETTING_FIELDS.length);
});

test('the words people type find the control they mean', () => {
  const cases = [
    ['dark', 'appearance'],
    ['theme', 'appearance'],
    ['24 hour', 'clock'],
    ['am pm', 'clock'],
    ['timezone', 'time-zone'],
    ['utc', 'time-zone'],
    ['animation', 'motion'],
    ['reduce', 'motion'],
    ['devices', 'sign-out-everywhere'],
    ['lost laptop', 'sign-out-everywhere'],
    ['password', 'password'],
    ['decimal', 'region'],
    ['defaults', 'reset-settings'],
    ['training', 'training-opt-in'],
  ];
  for (const [query, id] of cases) {
    const hits = matchSettings(query);
    assert.ok(hits.includes(id), `"${query}" did not find ${id}; it found ${JSON.stringify(hits)}`);
  }
});

test('a query that names a section reveals everything in it', () => {
  const security = matchSettings('security');
  for (const id of ['email-address', 'password', 'sign-out-everywhere']) {
    assert.ok(security.includes(id), `"security" did not reveal ${id}`);
  }
  assert.ok(!security.includes('appearance'), 'a section query should not reveal unrelated controls');
});

test('a query that matches nothing matches nothing', () => {
  // The state the page renders "Nothing here matches" for. A search that silently falls back to
  // showing everything teaches people it is broken.
  assert.deepEqual(matchSettings('qwertzuiop'), []);
  assert.deepEqual(visibleSections('qwertzuiop'), []);
});

test('an empty section is not rendered as a heading with nothing under it', () => {
  const sections = visibleSections('clock');
  assert.deepEqual(sections, ['Language and region']);
  assert.equal(settingMatches('clock', 'clock'), true);
  assert.equal(settingMatches('appearance', 'clock'), false);
});

test('every preference the product stores has somewhere to be changed', () => {
  // The gap this closes: a stored setting with no control is a value only the product can write,
  // which the user can neither see nor undo.
  //
  // Not every one of them belongs on THIS page. `sendKey` sits in the keyboard-shortcuts dialog,
  // beside the binding it changes, which is the right home for it — so the property is "reachable
  // somewhere", and the somewhere is named and checked rather than assumed.
  const byId = new Set(SETTING_FIELDS.map((f) => f.id));
  const onThisPage = {
    appearance: 'appearance',
    motion: 'motion',
    region: 'region',
    hourCycle: 'clock',
    timeZone: 'time-zone',
    landingView: 'landing-view',
  };
  const elsewhere = {
    sendKey: join(HERE, '..', 'src', 'components', 'shortcuts-dialog.tsx'),
  };

  for (const key of Object.keys(DEFAULT_PREFS)) {
    const id = onThisPage[key];
    if (id) {
      assert.ok(byId.has(id), `${key} is stored but ${id} is not a registered setting`);
      continue;
    }
    const file = elsewhere[key];
    assert.ok(file, `${key} is stored but nothing in this test knows where it can be changed`);
    const body = readFileSync(file, 'utf8');
    assert.match(
      body,
      new RegExp(`setPref\\(\\s*['"]${key}['"]`),
      `${key} is said to be changeable in ${file}, but nothing there writes it`,
    );
  }
});
