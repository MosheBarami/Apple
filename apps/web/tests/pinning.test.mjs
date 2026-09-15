// Pinning a project to the top.
//
// Both lists were pure recency: the dashboard ordered by `updated_at desc` and the rail took the
// first eight of the same order. So the project someone is actually living in slid down the page
// every time they opened anything else, and on the ninth project it left the sidebar entirely.
//
// Two defects are worth guarding here, and neither is "does a pin column exist".
//
//   * ORDER DESCENDING WITH NULLS LAST. Postgres sorts `desc` NULLS FIRST by default, so the
//     obvious `order('pinned_at', {ascending:false})` puts every UNPINNED project above every
//     pinned one — the exact inverse of the feature, and it looks like it works because the pinned
//     project is still in the list somewhere.
//   * A PINNED ROW MUST SURVIVE THE RAIL LIMIT. Sorting pinned rows to the top of a list that is
//     then sliced to eight is fine until nine things are pinned; the slice is what the user
//     actually sees, so the exemption has to be in the slice, not only in the order.
//
// And one decision, enforced rather than commented: favourites is NOT built as a second axis. A
// star and a pin that both mean "this one matters" are two states that disagree the first time
// someone uses both. Pinning is the one that exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_COLUMNS, PROJECT_LIST_KEYS } from '../src/lib/archive.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const REPO = join(WEB, '..', '..');
const DASH = readFileSync(join(WEB, 'src', 'routes', 'dashboard.tsx'), 'utf8');
const LAYOUT = readFileSync(join(WEB, 'src', 'components', 'layout.tsx'), 'utf8');
const ROW = readFileSync(join(WEB, 'src', 'lib', 'supabase.ts'), 'utf8');
const MIGRATION = readFileSync(join(REPO, 'infra', 'supabase', 'migrations', '0007_project_pinning.sql'), 'utf8');
/** Statements only — a negative assertion must never run against the prose that explains it. */
const SQL = MIGRATION.replace(/^\s*--.*$/gm, '');

// ------------------------------------------------------------------- schema ---

test('pinned is one nullable timestamp, the same shape archiving settled on', () => {
  // `is_pinned` beside a `pinned_at` is two facts that can disagree. See 0004 for the argument.
  assert.match(SQL, /add column if not exists pinned_at timestamptz/);
  assert.equal(/is_pinned|boolean/.test(SQL), false, 'no redundant flag');
});

test('the migration is re-runnable', () => {
  assert.match(SQL, /add column if not exists/);
  for (const [, body] of SQL.matchAll(/create index ([\s\S]*?);/g)) {
    assert.ok(/if not exists/.test(body), `index is not idempotent: ${body.slice(0, 50)}`);
  }
});

test('the pinned rows are indexed, because every dashboard load now sorts by them', () => {
  assert.match(SQL, /create index if not exists projects_owner_pinned_idx/);
  assert.match(SQL, /where pinned_at is not null/);
});

test('favourites is not a second axis beside pinning', () => {
  // Two controls that both mean "this one matters", with separate storage and separate ordering,
  // disagree the first time anyone uses both. One of them had to be the one that exists.
  const ALL = DASH + LAYOUT + ROW + SQL;
  assert.equal(/favorited_at|favourited_at|starred_at/.test(ALL), false);
});

// ----------------------------------------------------------------- selected ---

test('both list queries select the pin, so neither can sort by a column it did not fetch', () => {
  assert.match(PROJECT_COLUMNS, /\bpinned_at\b/);
  assert.match(ROW, /pinned_at\?: string \| null/);
  assert.match(DASH, /\.select\(PROJECT_COLUMNS\)/);
  assert.match(LAYOUT, /\.select\(PROJECT_COLUMNS\)/);
});

// ------------------------------------------------------------------- order ---

test('pinned first is done in the QUERY, and with nulls LAST', () => {
  // `desc` in Postgres is NULLS FIRST by default, which sorts every unpinned project above every
  // pinned one. The feature then looks merely broken rather than absent.
  assert.match(DASH, /\.order\('pinned_at', \{ ascending: false, nullsFirst: false \}\)/);
  assert.match(LAYOUT, /\.order\('pinned_at', \{ ascending: false, nullsFirst: false \}\)/);
  assert.equal(/\.sort\(\s*\(?a\)?.*pinned_at/.test(DASH), false, 'not re-sorted after it arrives');
});

test('recency still decides everything below the pins', () => {
  const active = DASH.slice(DASH.indexOf("scope === 'active'"), DASH.indexOf('if (error) throw'));
  assert.match(active, /\.order\('pinned_at'[\s\S]*\.order\('updated_at', \{ ascending: false \}\)/);
});

test('the ARCHIVED list is not reordered by pins', () => {
  // Archived is ordered by when it was put away — that is what someone looking for a project they
  // just archived is scanning for. A pin from three months ago floating to the top of that list
  // answers a question nobody asked.
  const archived = DASH.slice(DASH.indexOf(".not('archived_at', 'is', null)"), DASH.indexOf('if (error) throw'));
  assert.equal(/pinned_at/.test(archived), false);
});

test('a pinned conversation survives the rail limit', () => {
  // Sorting to the top of a list that is then sliced to eight works until nine things are pinned.
  // The slice is what the user sees, so the exemption belongs in the slice.
  assert.match(LAYOUT, /const shown = /);
  const slice = LAYOUT.slice(LAYOUT.indexOf('const shown ='), LAYOUT.indexOf('const shown =') + 400);
  assert.match(slice, /pinned_at/, 'the slice knows about pins');
  assert.match(slice, /RAIL_LIMIT/);
});

// ------------------------------------------------------------- what changes ---

test('pinning invalidates every list that holds a project', () => {
  // The row moves within two lists and within the sidebar at once.
  assert.deepEqual(PROJECT_LIST_KEYS.map((k) => k[0]).sort(), ['projects', 'projects-archived', 'projects-nav']);
  const fn = DASH.slice(DASH.indexOf('const setPinned'), DASH.indexOf('const setPinned') + 1200);
  assert.match(fn, /for \(const key of PROJECT_LIST_KEYS\) void qc\.invalidateQueries\(\{ queryKey: key \}\)/);
});

test('pinning sets a timestamp and unpinning clears it', () => {
  assert.match(DASH, /pinned_at: pin \? new Date\(\)\.toISOString\(\) : null/);
});

test('the menu offers Unpin on a pinned project, not Pin again', () => {
  assert.match(DASH, /\{pinned \? 'Unpin' : 'Pin to top'\}/);
  assert.match(DASH, /pinned=\{Boolean\(p\.pinned_at\)\}/);
  assert.match(DASH, /pin: !p\.pinned_at/);
});

test('pinning is not guarded by a confirmation dialog', () => {
  // It is reversible from the same menu item that set it.
  const menu = DASH.slice(DASH.indexOf('onPin();'), DASH.indexOf('onPin();') + 400);
  assert.equal(/confirm|Modal/.test(menu), false);
});

// -------------------------------------------------------------- visible why ---

test('a pinned project says it is pinned, on the card and in the rail', () => {
  // Otherwise the ordering has no explanation on screen: the top card is simply somewhere the user
  // did not put it, and the only way to find out why is to open the menu.
  assert.match(DASH, /p\.pinned_at && /);
  assert.match(DASH, /aria-label="Pinned"/);
  assert.match(LAYOUT, /p\.pinned_at && /);
});
