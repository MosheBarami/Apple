/**
 * The list of things that are wrong right now, and the page that publishes it.
 *
 * /status was a live probe of /api/health and nothing else: three states, a legend, and an email
 * address. It could tell a visitor that the API answered — which is exactly the question NOT being
 * asked by someone whose plugin will not install, or whose build stops the same way twice. There
 * was no incident list anywhere in the product, no history, and nothing an operator could publish
 * to short of editing markup.
 *
 * WHY THE DATA IS A CHECKED-IN MODULE. Publishing an issue should cost a commit, not a schema, a
 * route and an admin screen that nobody would build. The trade is deliberate and has one real
 * consequence: an issue goes live on the next deploy rather than instantly. That is the right side
 * of the trade for a product whose whole incident history fits on one screen.
 *
 * WHAT THIS FILE GUARDS. The ordering and cut-off are asserted by RUNNING them against fixtures,
 * because the failure mode of "unresolved first, three most recent resolved" is silent: a page that
 * shows the wrong three, or shows a resolved issue above a live one, looks exactly like a page that
 * works. The real data is checked for shape only — its content is editorial.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = join(ROOT, 'apps', 'site', 'src', 'data', 'known-issues.ts');
const K = await import(MODULE);

const STATUS = readFileSync(join(ROOT, 'apps', 'site', 'src', 'pages', 'status.astro'), 'utf8');
const TROUBLE = readFileSync(join(ROOT, 'apps', 'site', 'src', 'pages', 'docs', 'troubleshooting.astro'), 'utf8');
const FOOTER = readFileSync(join(ROOT, 'apps', 'site', 'src', 'components', 'Footer.astro'), 'utf8');

const issue = (id, openedAt, resolvedAt) => ({
  id,
  title: `t-${id}`,
  impact: `i-${id}`,
  workaround: `w-${id}`,
  openedAt,
  resolvedAt: resolvedAt ?? null,
});

test('an unresolved issue is never below a resolved one', () => {
  const rows = [issue('old-fix', '2026-01-01', '2026-02-01'), issue('live', '2026-01-02')];
  assert.deepEqual(K.openIssues(rows).map((r) => r.id), ['live']);
  assert.deepEqual(K.resolvedIssues(rows).map((r) => r.id), ['old-fix']);
});

test('unresolved issues read newest first — the thing breaking today is at the top', () => {
  const rows = [issue('a', '2026-01-01'), issue('c', '2026-03-01'), issue('b', '2026-02-01')];
  assert.deepEqual(K.openIssues(rows).map((r) => r.id), ['c', 'b', 'a']);
});

test('only the three most recently resolved are kept, by resolution date', () => {
  // Resolution date, NOT opened date: an old bug fixed yesterday is the interesting one, and
  // sorting by when it started would bury it under three that were fixed months ago.
  const rows = [
    issue('r1', '2026-01-01', '2026-01-10'),
    issue('r2', '2026-01-02', '2026-04-10'),
    issue('r3', '2026-01-03', '2026-03-10'),
    issue('r4', '2026-01-04', '2026-02-10'),
  ];
  assert.deepEqual(K.resolvedIssues(rows).map((r) => r.id), ['r2', 'r3', 'r4']);
});

test('an empty list produces empty lists, not a crash and not a placeholder row', () => {
  assert.deepEqual(K.openIssues([]), []);
  assert.deepEqual(K.resolvedIssues([]), []);
});

test('every published issue carries the four things a reader needs', () => {
  assert.ok(Array.isArray(K.KNOWN_ISSUES), 'KNOWN_ISSUES must be an array');
  const ids = new Set();
  for (const row of K.KNOWN_ISSUES) {
    assert.match(row.id, /^[a-z0-9-]+$/, `bad id: ${row.id}`);
    assert.equal(ids.has(row.id), false, `duplicate id: ${row.id}`);
    ids.add(row.id);
    assert.ok(row.title && row.title.length > 8, `${row.id} has no title`);
    // Impact and workaround are the whole point. An entry that says a thing is broken and not what
    // to do about it is an apology, and the reader already knew.
    assert.ok(row.impact && row.impact.length > 20, `${row.id} does not say who it affects`);
    assert.ok(row.workaround && row.workaround.length > 20, `${row.id} offers no workaround`);
    assert.match(row.openedAt, /^\d{4}-\d{2}-\d{2}$/, `${row.id} has no opened date`);
    assert.ok(
      row.resolvedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(row.resolvedAt),
      `${row.id} has a malformed resolved date`,
    );
    if (row.resolvedAt) {
      assert.ok(row.resolvedAt >= row.openedAt, `${row.id} was resolved before it was opened`);
    }
  }
});

test('an issue listed as OPEN is still true of the code that would close it', () => {
  // The failure mode of a checked-in incident list is that it becomes a museum: an entry stays
  // "open" months after the thing was fixed, and a visitor reads a current-sounding page describing
  // a product that no longer exists. Every entry whose truth is decided by a constant is pinned to
  // that constant here, so closing the defect makes this red and forces the entry to be resolved.
  const shared = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const open = new Set(K.openIssues().map((i) => i.id));
  if (open.has('plugin-not-in-creator-store')) {
    assert.match(
      shared,
      /export const STUDIO_PLUGIN_STORE_LIVE: boolean = false;/,
      'the store listing is live — mark plugin-not-in-creator-store resolved',
    );
  }
  if (open.has('plugin-presence-not-detectable')) {
    const model = readFileSync(join(ROOT, 'apps', 'web', 'src', 'components', 'empty-state-model.ts'), 'utf8');
    assert.match(
      model,
      /M06_NOT_MODELLED/,
      'the app now models plugin presence — mark plugin-presence-not-detectable resolved',
    );
  }
});

test('/status publishes the list rather than only probing the API', () => {
  assert.match(STATUS, /known-issues/, 'status.astro does not read the known-issues data');
  assert.match(STATUS, /openIssues/, 'status.astro does not render the unresolved list');
  assert.match(STATUS, /resolvedIssues/, 'status.astro does not show that the list is maintained');
  // The workaround has to be ON the page. A list of titles linking elsewhere is a worse version of
  // the email address that was already there.
  assert.match(STATUS, /workaround/, 'the workaround is not rendered inline');
  // And the live probe it sits under must survive.
  assert.match(STATUS, /\/api\/health/);
});

test('the two pages a stuck person is already on link to it', () => {
  assert.match(TROUBLE, /href="\/status"/, 'troubleshooting does not point at the known-issues list');
  assert.match(FOOTER, /href="\/status"/, 'the footer does not point at the known-issues list');
});
