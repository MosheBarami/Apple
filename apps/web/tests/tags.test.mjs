// Tagging a project.
//
// The dashboard is one flat grid with an Active/Archived split, and the only axis that has ever
// ordered it is recency. Pinning fixed "the thing I am working on today"; it does nothing for "my
// three client projects" or "the four things that are experiments". Once someone has twenty
// projects the grid is a wall, and the only way through it is to read every card.
//
// Most of the risk in a tag feature is not the column. It is:
//
//   * NORMALISATION. "Client", "client " and "CLIENT" are one tag to a human and three to a
//     database, and a filter chip row rendered from three spellings of one tag is worse than no
//     chips at all. Every write goes through one normaliser, tested directly.
//   * FILTERING IN THE QUERY. The dashboard already refuses to download rows it will not draw
//     (see archive.test.mjs). A tag filter applied after the fetch reintroduces exactly that.
//   * THE CHIP ROW MUST NOT COLLAPSE. Derive the available tags from the FILTERED list and
//     selecting one leaves that tag as the only chip on screen — a filter you cannot get out of
//     except by reloading.
//   * AN EMPTY RESULT MUST BE ESCAPABLE. Same defect as a remembered 'archived' scope with nothing
//     archived: a view with no rows and no control to leave it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_COLUMNS } from '../src/lib/archive.ts';
import { TAG_MAX_LEN, TAGS_MAX, normaliseTag, addTag, removeTag, tagUniverse } from '../src/lib/tags.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const REPO = join(WEB, '..', '..');
const DASH = readFileSync(join(WEB, 'src', 'routes', 'dashboard.tsx'), 'utf8');
const ROW = readFileSync(join(WEB, 'src', 'lib', 'supabase.ts'), 'utf8');
const MIGRATION = readFileSync(join(REPO, 'infra', 'supabase', 'migrations', '0008_project_tags.sql'), 'utf8');
const SQL = MIGRATION.replace(/^\s*--.*$/gm, '');

// ------------------------------------------------------------- normalisation ---

test('one tag, one spelling', () => {
  // Three spellings of "client" is three chips in the filter row and three different filters, none
  // of which finds all the projects the user meant.
  assert.equal(normaliseTag('  Client '), 'client');
  assert.equal(normaliseTag('CLIENT'), 'client');
  assert.equal(normaliseTag('Client Work'), 'client work');
});

test('inner whitespace is collapsed, not preserved', () => {
  // "client   work" and "client work" look identical on a chip and are not the same string.
  assert.equal(normaliseTag('client   work'), 'client work');
  assert.equal(normaliseTag('client\twork'), 'client work');
});

test('a tag that is only punctuation or space is not a tag', () => {
  assert.equal(normaliseTag('   '), '');
  assert.equal(normaliseTag(''), '');
});

test('an over-long tag is refused, not silently cut', () => {
  // Truncating stores a tag the user never typed, and two different long tags can truncate to the
  // same one — which quietly merges two groups of projects.
  assert.equal(normaliseTag('x'.repeat(TAG_MAX_LEN)), 'x'.repeat(TAG_MAX_LEN));
  assert.equal(normaliseTag('x'.repeat(TAG_MAX_LEN + 1)), '');
});

test('commas cannot survive a tag', () => {
  // A tag containing the separator people expect to type BETWEEN tags produces one tag that looks
  // like two everywhere it is rendered.
  assert.equal(normaliseTag('client,work'), 'client work');
});

// --------------------------------------------------------------- add / remove ---

test('adding an existing tag changes nothing rather than duplicating it', () => {
  assert.deepEqual(addTag(['client'], 'Client'), ['client']);
  assert.deepEqual(addTag(['client'], ' client '), ['client']);
});

test('adding is capped, and the cap refuses rather than drops something else', () => {
  const full = Array.from({ length: TAGS_MAX }, (_, i) => `t${i}`);
  assert.deepEqual(addTag(full, 'one-more'), full, 'the existing tags are untouched');
});

test('an unusable tag is not added', () => {
  assert.deepEqual(addTag(['client'], '   '), ['client']);
  assert.deepEqual(addTag(['client'], 'x'.repeat(TAG_MAX_LEN + 1)), ['client']);
});

test('removing is spelling-insensitive too', () => {
  assert.deepEqual(removeTag(['client', 'obby'], 'CLIENT'), ['obby']);
  assert.deepEqual(removeTag(['client'], 'nothing-like-it'), ['client']);
});

test('tags keep the order they were added in', () => {
  // Sorting them would move a chip under the cursor between one render and the next.
  assert.deepEqual(addTag(addTag([], 'zeta'), 'alpha'), ['zeta', 'alpha']);
});

// ---------------------------------------------------------------- the universe ---

test('the tag universe is every tag in use, once, sorted', () => {
  const rows = [{ tags: ['obby', 'client'] }, { tags: ['client'] }, { tags: null }, {}];
  assert.deepEqual(tagUniverse(rows), ['client', 'obby']);
});

test('the universe survives a row with a malformed tags value', () => {
  // The column is `not null default '{}'`, but a project created before this migration lands comes
  // back with the field absent. A chip row that throws takes the whole dashboard with it.
  assert.deepEqual(tagUniverse([{ tags: 'client' }, { tags: [1, 'obby'] }]), ['obby']);
});

// -------------------------------------------------------------------- schema ---

test('tags is a non-null array with a default, so no row is ever a null to reason about', () => {
  assert.match(SQL, /add column if not exists tags text\[\] not null default '\{\}'/);
});

test('the tag filter is indexed for the operator it actually uses', () => {
  // `.contains()` is `@>`, which a btree index cannot serve. Without a GIN index the filter is a
  // sequential scan of every project the user owns.
  assert.match(SQL, /create index if not exists projects_tags_idx/);
  assert.match(SQL, /using gin \(tags\)/);
});

test('the migration is re-runnable', () => {
  assert.match(SQL, /add column if not exists/);
  for (const [, body] of SQL.matchAll(/create index ([\s\S]*?);/g)) {
    assert.ok(/if not exists/.test(body), `index is not idempotent: ${body.slice(0, 50)}`);
  }
});

// ------------------------------------------------------------------- wiring ---

test('both list queries select the tags', () => {
  assert.match(PROJECT_COLUMNS, /\btags\b/);
  assert.match(ROW, /tags\?: string\[\]/);
});

test('the filter narrows the QUERY, not the array that came back', () => {
  assert.match(DASH, /\.contains\('tags', \[tag\]\)/);
  assert.equal(/\.filter\(\s*\(?p\)?\s*=>\s*p\.tags/.test(DASH), false, 'no post-hoc filtering');
});

test('the filter is part of the cache key, or two filters share one cached answer', () => {
  assert.match(DASH, /\['projects', 'filter', tagFilter \?\? ''\]/);
});

test('the grid key and the tag-universe key cannot collide on a user-chosen tag', () => {
  // Both live under the 'projects' prefix so one invalidation refreshes both. That makes their
  // remaining segments the only thing keeping them apart, and a tag is a string the USER picked —
  // somebody naming a tag "tag-universe" must not make the grid render bare tag arrays.
  assert.match(DASH, /\['projects', 'filter', tagFilter \?\? ''\]/);
  assert.match(DASH, /\['projects', 'tag-universe'\]/);
});

test('the chip row is built from an UNFILTERED query, so selecting a tag cannot collapse it', () => {
  // Derived from the filtered list, choosing "client" leaves "client" as the only chip on screen
  // and there is no way back to the other tags.
  assert.match(DASH, /queryKey: \['projects', 'tag-universe'\], queryFn: fetchTagUniverse/);
  assert.match(DASH, /tagUniverse\(/);
  const fn = DASH.slice(DASH.indexOf('async function fetchTagUniverse'), DASH.indexOf('function ProjectMenu'));
  assert.equal(/tagFilter|contains\(/.test(fn), false, 'the universe query does not read the filter');
  assert.match(fn, /\.select\('tags'\)/, 'one column, not a second copy of every project');
});

test('the chip row is keyed UNDER projects, so it cannot be the cache nobody invalidates', () => {
  // Archiving, deleting and tagging all change which tags are in use. Each of them already
  // invalidates ['projects']; a key outside that prefix would be a fourth cache to remember, which
  // is the exact failure PROJECT_LIST_KEYS was written to prevent.
  assert.match(DASH, /queryKey: \['projects', 'tag-universe'\]/);
});

test('a tag nobody uses any more cannot leave the grid filtered by it', () => {
  // Untag the last project carrying "client" while filtered by "client" and every project
  // disappears, with no chip pressed anywhere to explain it.
  assert.match(DASH, /if \(tagFilter && tagged\.isSuccess && !allTags\.includes\(tagFilter\)\) setTagFilter\(null\)/);
});

test('a filter that matches nothing can be cleared from the empty state itself', () => {
  // Otherwise it is the stuck-empty-view defect scopeToShow exists to prevent, with a different
  // cause: rows exist, the filter hides all of them, and the chip row is above the fold.
  assert.match(DASH, /Clear tag filter|Show all projects/);
});

test('archiving a project does not silently drop its tags', () => {
  // The archived list is not filtered by tag — but restoring must bring the tags back with it, so
  // nothing in the archive path may write the column.
  const archive = DASH.slice(DASH.indexOf('const setArchived'), DASH.indexOf('const setArchived') + 900);
  assert.equal(/tags/.test(archive), false);
});
