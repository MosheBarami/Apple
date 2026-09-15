// Archiving a project.
//
// Deleting used to be the only way to clear a finished project off the dashboard, and deleting is
// permanent — it takes the chat history, the checkpoints and the Studio pairing. So people keep
// dead projects forever rather than risk it, and the dashboard stops being usable at exactly the
// point the product starts working.
//
// The defects worth guarding here are all about a row being in one place and not another: archived
// projects still in the sidebar, a restored project that does not come back, and a list that is
// filtered after it was downloaded rather than in the query.
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
const MIGRATION = readFileSync(join(REPO, 'infra', 'supabase', 'migrations', '0004_project_archive.sql'), 'utf8');
/** Statements only. A negative assertion must run against the SQL, never against the prose that
 *  explains why the SQL is the way it is — the comment naturally names the thing being ruled out. */
const SQL = MIGRATION.replace(/^\s*--.*$/gm, '');

// ------------------------------------------------------------------- schema ---

test('archived is one nullable timestamp, not a boolean beside a date', () => {
  // `is_archived` alongside `archived_at` is two facts that can disagree, and they eventually do.
  assert.match(SQL, /add column if not exists archived_at timestamptz/);
  assert.equal(/is_archived|boolean/.test(SQL), false, 'no redundant flag');
});

test('the migration is re-runnable', () => {
  // Applied by hand, possibly twice. A migration that fails the second time is a migration nobody
  // is sure they have applied.
  assert.match(SQL, /add column if not exists/);
  for (const [, body] of SQL.matchAll(/create index ([\s\S]*?);/g)) {
    assert.ok(/if not exists/.test(body), `index is not idempotent: ${body.slice(0, 50)}`);
  }
});

test('the hot query is indexed for the state users end up in', () => {
  // The normal end state is more archived projects than open ones, so "my active projects" must
  // not degrade into a scan over everything ever created.
  assert.match(SQL, /on public\.projects \(owner_id, updated_at desc\)\s*where archived_at is null/);
});

test('the column list is shared, so the two list queries cannot drift', () => {
  assert.match(PROJECT_COLUMNS, /\barchived_at\b/);
  // Both call sites use the constant rather than their own string.
  assert.match(DASH, /\.select\(PROJECT_COLUMNS\)/);
  assert.match(LAYOUT, /\.select\(PROJECT_COLUMNS\)/);
});

// ------------------------------------------------------------ filtering where ---

test('archived rows are excluded in the QUERY, not after they arrive', () => {
  // A client-side filter still downloads every archived project on every dashboard load, and the
  // entire point of archiving is that the pile grows without bound.
  assert.match(DASH, /\.is\('archived_at', null\)/);
  assert.match(DASH, /\.not\('archived_at', 'is', null\)/);
  assert.equal(/\.filter\(\s*\(?p\)?\s*=>\s*!?p\.archived_at/.test(DASH), false, 'no post-hoc filtering');
});

test('the sidebar hides archived projects too', () => {
  // A project still in the sidebar has not been archived as far as the user is concerned — the
  // sidebar is the list they actually look at.
  assert.match(LAYOUT, /\.is\('archived_at', null\)/);
});

test('archived projects are ordered by when they were archived', () => {
  // Ordering the archive by `updated_at` puts the most recently EDITED at the top, which is not
  // the order anyone looks for something they just put away.
  assert.match(DASH, /\.order\('archived_at', \{ ascending: false \}\)/);
});

// ------------------------------------------------------------- what changes ---

test('every list holding a project name is invalidated on archive', () => {
  // The row moves between two lists and leaves the sidebar: three caches go stale at once, and
  // missing one shows the user a project they just archived.
  assert.deepEqual(PROJECT_LIST_KEYS.map((k) => k[0]).sort(), ['projects', 'projects-archived', 'projects-nav']);
  assert.match(DASH, /for \(const key of PROJECT_LIST_KEYS\) void qc\.invalidateQueries\(\{ queryKey: key \}\)/);
});

test('archiving sets a timestamp and restoring clears it', () => {
  assert.match(DASH, /archived_at: archive \? new Date\(\)\.toISOString\(\) : null/);
});

test('the menu offers Restore on an archived project, not Archive again', () => {
  assert.match(DASH, /\{archived \? 'Restore' : 'Archive'\}/);
  assert.match(DASH, /archived=\{Boolean\(p\.archived_at\)\}/);
  assert.match(DASH, /archive: !p\.archived_at/);
});

test('archiving is not guarded by a confirmation dialog', () => {
  // It is reversible. A dialog in front of a reversible action teaches people to dismiss dialogs,
  // which is exactly the habit that makes the DELETE confirmation stop working.
  const menu = DASH.slice(DASH.indexOf('onArchive();'), DASH.indexOf('onArchive();') + 400);
  assert.equal(/confirm|Modal/.test(menu), false);
  // Delete, which is not reversible, still is. The typed field itself moved into the shared
  // components/confirm-dialog.tsx — one dialog implementation instead of one per destructive
  // action — so the claim is checked in two halves: the delete path asks for the 'typed' ceremony,
  // and the dialog that ceremony renders really does demand the name.
  assert.match(DASH, /confirmationFor\(\{ reversible: false, destroysUserContent: true \}\)/);
  assert.match(DASH, /subject=\{project\.name\}/);
  const DIALOG = readFileSync(join(WEB, 'src', 'components', 'confirm-dialog.tsx'), 'utf8');
  assert.match(DIALOG, /ceremony === 'typed' && \(/, 'the typed field must be gated on the verdict');
  assert.match(DIALOG, /Type <strong className="mono">\{subject\}<\/strong> to confirm/);
});

// -------------------------------------------------------------------- the UI ---

test('the Archived tab appears only when something is in it', () => {
  // A tab that is always there and usually empty is chrome. One that appears when it has contents
  // answers "where did that project go?".
  assert.match(DASH, /\(archived\.data\?\.length \?\? 0\) > 0 && \(/);
});

test('the tabs are a real tablist, so a screen reader can use them', () => {
  assert.match(DASH, /role="tablist"/);
  assert.match(DASH, /role="tab"/);
  assert.match(DASH, /aria-selected=\{scope === 'active'\}/);
  assert.match(DASH, /aria-selected=\{scope === 'archived'\}/);
});

test('an empty archive says something different from having no projects', () => {
  // "Summon a project" under an empty Archived tab answers a question nobody asked.
  assert.match(DASH, /scope === 'archived' && \(\s*<p className="page-note">/);
  assert.match(DASH, /state="noProjects"/);
  assert.ok(
    DASH.indexOf("scope === 'archived' && (") < DASH.indexOf('state="noProjects"'),
    'the archived branch must be checked before the generic empty state',
  );
});

test('the two scopes read from different caches', () => {
  // One cache for both means switching tabs shows the previous tab's rows for a frame, which reads
  // as the archive being wrong.
  assert.match(DASH, /queryKey: scope === 'active' \? \['projects'\] : \['projects-archived'\]/);
});
