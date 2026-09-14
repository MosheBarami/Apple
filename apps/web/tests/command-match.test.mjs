// How the command palette ranks what you typed.
//
// A palette lives or dies on this. If the obvious command is third, people stop opening it — and
// the failure is invisible in a screenshot, so it has to be pinned here. Every case below is a
// query someone would actually type against the real command set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCommands, scoreCommand, groupBySection, dedupeByTitle } from '../src/lib/command-match.ts';

const cmd = (id, title, over = {}) => ({ id, title, section: 'Test', run: () => {}, ...over });

/** The real set, near enough — these are the commands that actually compete with each other. */
const SET = [
  cmd('new', 'New project'),
  cmd('connect', 'Connect Studio', { keywords: ['pair', 'plugin'] }),
  cmd('export-md', 'Export conversation (Markdown)'),
  cmd('export-json', 'Export conversation (JSON)'),
  cmd('rename', 'Rename project'),
  cmd('checkpoints', 'Checkpoints'),
  cmd('roadmap', 'Roadmap'),
  cmd('settings', 'Settings', { keywords: ['preferences', 'account'] }),
  cmd('usage', 'Usage'),
  cmd('theme', 'Toggle theme', { keywords: ['dark', 'light'] }),
  cmd('signout', 'Sign out', { keywords: ['logout', 'log out'] }),
  cmd('stop', 'Stop the run', { enabled: false, why: 'Nothing is running' }),
];

const top = (q) => rankCommands(SET, q)[0]?.command.id;
const ids = (q) => rankCommands(SET, q).map((s) => s.command.id);

// ------------------------------------------------------------------ the ordering ---

test('a prefix of the whole title wins', () => {
  assert.equal(top('new'), 'new');
  assert.equal(top('rena'), 'rename');
  assert.equal(top('roadm'), 'roadmap');
});

test('a prefix beats a substring, even a substring that appears earlier', () => {
  // "co" is at index 0 of "Connect Studio" and index 7 of "Export conversation". Both match. The
  // one the user meant is the one their letters START.
  assert.equal(top('co'), 'connect');
});

test('a prefix of a LATER word is findable', () => {
  // Nobody remembers which word a command starts with; they remember the distinctive one.
  assert.equal(top('stud'), 'connect');
  // Both project commands match "proj" on their second word; the ordering between two equally
  // good matches is not the claim — that they are both found, and lead, is.
  assert.deepEqual(ids('proj').sort(), ['new', 'rename']);
});

test('initials work', () => {
  assert.equal(top('np'), 'new');
  assert.equal(top('cs'), 'connect');
  assert.equal(top('tt'), 'theme');
});

test('initials may not skip the first word', () => {
  // "Export conversation (Markdown)" has word-starts e/c/m. Matching "cm" against the middle two
  // would be a substring match wearing a disguise, and would let almost anything match almost
  // anything as command titles get longer.
  assert.deepEqual(ids('cm'), [], '"cm" must not reach Export conversation (Markdown)');
  // The positive control: a command whose initials really are "cm" IS found, so the assertion
  // above is testing the skip rule rather than a broken matcher.
  const withCm = [...SET, cmd('milestone', 'Create milestone')];
  assert.equal(rankCommands(withCm, 'cm')[0].command.id, 'milestone');
});

test('a single letter is a prefix match, never an initials match', () => {
  // With one letter, initials are meaningless and would scramble the order for the commonest
  // possible query.
  const first = rankCommands(SET, 'c')[0].command.title.toLowerCase();
  assert.ok(first.startsWith('c'), `expected a c-initial title, got "${first}"`);
});

test('a keyword finds a command whose title does not contain the word', () => {
  assert.equal(top('logout'), 'signout');
  assert.equal(top('pair'), 'connect');
  assert.equal(top('dark'), 'theme');
});

test('a title match outranks a keyword match', () => {
  // The keyword is not on screen. A result whose reason for appearing is invisible reads as a bug.
  assert.equal(top('se'), 'settings');
});

test('an empty query returns everything in registration order', () => {
  const order = ids('');
  // Only the unavailable command moves; everything else keeps the order it was registered in, so
  // the palette opens as a stable menu rather than a reshuffle.
  assert.deepEqual(order.filter((id) => id !== 'stop'), SET.filter((c) => c.id !== 'stop').map((c) => c.id));
});

test('nonsense matches nothing rather than everything', () => {
  assert.deepEqual(ids('zzqx'), []);
});

// ----------------------------------------------------------- unavailable commands ---

test('an unavailable command is listed, not hidden', () => {
  // Hiding it teaches the user it does not exist. Showing it with a reason teaches them what to do.
  assert.ok(ids('stop').includes('stop'));
});

test('but it never outranks something that can actually run', () => {
  const set = [cmd('off', 'Stop', { enabled: false, why: 'nope' }), cmd('on', 'Stop the run')];
  assert.equal(rankCommands(set, 'stop')[0].command.id, 'on');
  // Even when the disabled one is the STRONGER match.
  assert.equal(rankCommands(set, 'sto')[0].command.id, 'on');
});

// ------------------------------------------------------------------- highlighting ---

test('the matched span is reported so it can be highlighted', () => {
  const hit = scoreCommand(cmd('c', 'Connect Studio'), 'stud');
  assert.deepEqual(hit.hits, [8, 9, 10, 11]);
  assert.equal('Connect Studio'.slice(8, 12), 'Stud');
});

test('initials report every matched letter, not a span', () => {
  const hit = scoreCommand(cmd('c', 'Connect Studio'), 'cs');
  assert.deepEqual(hit.hits, [0, 8]);
});

test('a keyword match highlights nothing rather than highlighting the wrong thing', () => {
  const hit = scoreCommand(cmd('s', 'Sign out', { keywords: ['logout'] }), 'logout');
  assert.deepEqual(hit.hits, [], 'the matched word is not in the title, so there is nothing to mark');
});

// --------------------------------------------------------------------- robustness ---

test('case and surrounding whitespace do not matter', () => {
  assert.equal(top('  CONNECT  '), 'connect');
  assert.equal(top('RoAdMaP'), 'roadmap');
});

test('a query longer than every title matches nothing and does not throw', () => {
  assert.deepEqual(ids('x'.repeat(500)), []);
});

test('regex metacharacters in the query are treated as text', () => {
  // The query is never compiled, but a future refactor that compiles it would break here first.
  for (const q of ['(', '.*', '[a-z]', '\\', '?']) {
    assert.doesNotThrow(() => rankCommands(SET, q), `query ${JSON.stringify(q)} threw`);
  }
  // And a real parenthesis in a title is findable by typing it.
  assert.ok(ids('(json').includes('export-json'));
});

test('an empty command set is not a crash', () => {
  assert.deepEqual(rankCommands([], 'anything'), []);
  assert.deepEqual(rankCommands([], ''), []);
});

// ---------------------------------------------------------------------- grouping ---

test('sections keep rank order inside and first-appearance order between', () => {
  const set = [
    cmd('a', 'Alpha', { section: 'One' }),
    cmd('b', 'Beta', { section: 'Two' }),
    cmd('c', 'Alps', { section: 'One' }),
  ];
  const groups = groupBySection(rankCommands(set, ''));
  assert.deepEqual(groups.map((g) => g.section), ['One', 'Two']);
  assert.deepEqual(groups[0].items.map((s) => s.command.id), ['a', 'c']);
});

test('grouping an empty result is an empty list, not a section with nothing in it', () => {
  assert.deepEqual(groupBySection([]), []);
});

// ----------------------------------------------------------------- duplicates ---
// THE DEFECT, seen in the running app: the shell contributes "New project" on every route and the
// dashboard contributes its own. On the dashboard the palette listed the same words twice.

test('two commands with one title collapse to one row', () => {
  const global = cmd('shell-new', 'New project', { section: 'Navigate' });
  const local = cmd('dash-new', 'New project', { section: 'Projects' });
  const out = dedupeByTitle([global, cmd('other', 'Usage'), local]);
  assert.deepEqual(out.map((c) => c.title), ['New project', 'Usage']);
});

test('the later registration wins, because it is the more specific one', () => {
  // The route mounts inside the shell, so it registers second. Its command opens the create form
  // directly; the shell's only navigates to where the form lives.
  const out = dedupeByTitle([cmd('shell-new', 'New project'), cmd('dash-new', 'New project')]);
  assert.equal(out[0].id, 'dash-new');
});

test('the winner keeps the loser position, so the list does not reorder between routes', () => {
  const out = dedupeByTitle([
    cmd('shell-new', 'New project'),
    cmd('usage', 'Usage'),
    cmd('settings', 'Settings'),
    cmd('dash-new', 'New project'),
  ]);
  assert.deepEqual(out.map((c) => c.id), ['dash-new', 'usage', 'settings']);
});

test('distinct titles are all kept', () => {
  const out = dedupeByTitle(SET);
  assert.equal(out.length, SET.length);
});

test('deduping an empty list is an empty list', () => {
  assert.deepEqual(dedupeByTitle([]), []);
});
