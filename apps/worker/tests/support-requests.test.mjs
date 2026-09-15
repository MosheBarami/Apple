/**
 * WHAT A SUPPORT REQUEST IS ALLOWED TO BE, BEFORE IT REACHES THE DATABASE.
 *
 * WHAT WAS THERE. `public.feedback` has existed since 0001_init.sql with every column a support
 * desk needs — kind, content, page, status — a CHECK constraint naming three categories, and two
 * RLS policies. Nothing in the product ever wrote a row. A user who wanted to report that a build
 * had failed had one address on a marketing page and no way at all from inside the app where the
 * failure happened. The schema was a design nobody built.
 *
 * This file is the half that can be decided without a network: given a request body, what is
 * stored, and what is refused. Three properties earn their own tests because each one is a way the
 * obvious implementation loses:
 *
 *  1. THE CHECK CONSTRAINT IS NOT A VALIDATOR. Posting kind:'question' to PostgREST does not
 *     return "that is not a category" — it returns a 400 whose body is a Postgres constraint name,
 *     which the route would forward as an opaque failure. The three kinds have to be known HERE,
 *     and they have to be the same three the column allows, or the product grows a category the
 *     database silently rejects.
 *
 *  2. A REPORT CAN CARRY A LIVE CREDENTIAL. This product puts `access_token` in the URL fragment
 *     (apps/web/src/lib/auth-flows.ts:227), and a person reporting a bug pastes what is in front of
 *     them. A widget that files `location.href` and a body that keeps a pasted JWT would write a
 *     working session token into a table read by whoever answers support. Both halves are removed
 *     before anything is stored, and the submitter is told so rather than quietly edited.
 *
 *  3. REDACTION CHANGES THE LENGTH, SO IT HAS TO HAPPEN FIRST. `[redacted:private_key_block]` is
 *     26 characters where the key was 1800; a placeholder is 14 where a short token was 20. The
 *     column's CHECK is on what is STORED, so judging the length of what arrived is judging the
 *     wrong string — in one direction it refuses a report that would have fitted, in the other it
 *     accepts one the database then rejects with a 500.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WORKER, '..', '..');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

// Compiled rather than read: these are the functions the route calls, not a paraphrase of them.
const TMP = mkdtempSync(join(tmpdir(), 'golem-support-'));
const OUT = join(TMP, 'support.mjs');
execFileSync(
  ESBUILD,
  [join(WORKER, 'src', 'support.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${OUT}`],
  { stdio: 'pipe', cwd: WORKER },
);
const S = await import(`file://${OUT}`);

const INIT_SQL = readFileSync(join(ROOT, 'infra', 'supabase', 'migrations', '0001_init.sql'), 'utf8');

/** The `kind in (...)` list on public.feedback, read out of the migration that creates it. */
function kindsAllowedByTheColumn() {
  const table = INIT_SQL.slice(INIT_SQL.indexOf('create table public.feedback'));
  const decl = table.slice(0, table.indexOf(');'));
  const m = /kind\s+text[^\n]*check\s*\(\s*kind\s+in\s*\(([^)]*)\)\s*\)/i.exec(decl);
  assert.ok(m, 'public.feedback no longer declares a CHECK on kind — this test is measuring nothing');
  const list = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.ok(list.length > 0, 'parsed an empty kind list — a broken parse, not a permissive column');
  return list;
}

/** The column's own default, so "absent" and "unspecified" cannot disagree. */
function defaultKindOfTheColumn() {
  const table = INIT_SQL.slice(INIT_SQL.indexOf('create table public.feedback'));
  const m = /kind\s+text\s+not\s+null\s+default\s+'([a-z]+)'/i.exec(table);
  assert.ok(m, 'public.feedback no longer declares a default for kind');
  return m[1];
}

/** The `char_length(content) between A and B` bound, read out of the same declaration. */
function contentBoundsOfTheColumn() {
  const table = INIT_SQL.slice(INIT_SQL.indexOf('create table public.feedback'));
  const m = /char_length\(content\)\s+between\s+(\d+)\s+and\s+(\d+)/i.exec(table);
  assert.ok(m, 'public.feedback no longer bounds content — this test is measuring nothing');
  return { min: Number(m[1]), max: Number(m[2]) };
}

const ok = (raw) => {
  const r = S.parseSupportSubmission(raw);
  assert.ok(r.ok, `expected accepted, refused with: ${r.ok ? '' : r.error}`);
  return r.value;
};
const refused = (raw) => {
  const r = S.parseSupportSubmission(raw);
  assert.equal(r.ok, false, 'expected a refusal, was accepted');
  return r.error;
};

// ----------------------------------------------------------------- categories

test('the kinds the code accepts are exactly the kinds the column allows', () => {
  // The dead-schema failure in reverse: a category the product offers and the database refuses is
  // a 500 on submit, and one the database allows and the product never offers is a dead branch.
  assert.deepEqual([...S.SUPPORT_KINDS].sort(), kindsAllowedByTheColumn().sort());
});

test('an unknown category is refused here, not by a constraint the user cannot read', () => {
  const err = refused({ kind: 'question', content: 'hello there, this is a real report' });
  // The refusal has to say what IS allowed; "invalid kind" sends the caller back to guessing.
  for (const k of S.SUPPORT_KINDS) assert.match(err, new RegExp(k), `the refusal never names ${k}`);
});

test('an absent category means what the column says it means', () => {
  assert.equal(ok({ content: 'the build stopped halfway and I lost the place' }).kind, defaultKindOfTheColumn());
});

test('a category is a category, not any string that happens to be truthy', () => {
  for (const bad of [1, true, {}, [], 'SUPPORT', ' bug ', null]) {
    if (bad === null) continue; // null is absent, covered above
    refused({ kind: bad, content: 'a report long enough to be a report' });
  }
});

// -------------------------------------------------------------------- content

test('an empty report is refused, and so is one that is only whitespace', () => {
  for (const bad of ['', '   ', '\n\t  \n']) refused({ kind: 'bug', content: bad });
  refused({ kind: 'bug' });
  refused({ kind: 'bug', content: 42 });
});

test('a report past the column limit is refused with the number, never silently truncated', () => {
  const { max } = contentBoundsOfTheColumn();
  const err = refused({ kind: 'bug', content: 'x'.repeat(max + 1) });
  assert.match(err, new RegExp(String(max)), 'the refusal does not say how long a report may be');
  // Truncation is the tempting fix and the wrong one: the end of a bug report is where the person
  // says what they expected to happen.
  assert.equal(ok({ kind: 'bug', content: 'y'.repeat(max) }).content.length, max);
});

// ------------------------------------------------------------------- secrets

test('a session token pasted into a report is not what gets stored', () => {
  const jwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const v = ok({ kind: 'bug', content: `it failed and the console printed ${jwt} before it stopped` });
  assert.ok(!v.content.includes(jwt), 'the pasted token was stored verbatim');
  assert.match(v.content, /it failed and the console printed/, 'redaction ate the report as well as the token');
  // Editing someone's words without telling them is its own failure. The route reports this back.
  assert.equal(v.redacted, true, 'the submitter is not told that their report was changed');
});

test('a report with nothing sensitive in it is stored exactly as written', () => {
  const words = 'The Studio panel says "Session ended" every time I press Build. Nothing else.';
  const v = ok({ kind: 'support', content: words });
  assert.equal(v.content, words);
  assert.equal(v.redacted, false, 'an untouched report claims to have been redacted');
});

test('the length that is judged is the length that is stored', () => {
  const { max } = contentBoundsOfTheColumn();
  // A private key block is long; its placeholder is short. A report that arrives OVER the limit
  // only because of the key must be accepted, because what reaches the column is under it.
  const key = `-----BEGIN RSA PRIVATE KEY-----\n${'A'.repeat(max)}\n-----END RSA PRIVATE KEY-----`;
  const v = ok({ kind: 'bug', content: `the deploy step printed this:\n${key}` });
  assert.ok(v.content.length <= max, `stored ${v.content.length} characters into a column that allows ${max}`);
  assert.ok(!v.content.includes('BEGIN RSA PRIVATE KEY'), 'the key survived');
});

// ---------------------------------------------------------------------- page

test('the page a report was filed from keeps its path and loses its credentials', () => {
  // The real shape: this product returns from a magic link to /app#access_token=…
  const v = ok({
    kind: 'bug',
    content: 'it broke right after I signed in',
    page: '/app/project/9b1d#access_token=eyJhbGciOiJIUzI1NiJ9.abc.def&type=recovery',
  });
  assert.equal(v.page, '/app/project/9b1d');
  assert.ok(!v.page.includes('access_token'), 'a live session token was filed into the support table');
});

test('a query string goes the same way as a fragment', () => {
  assert.equal(ok({ kind: 'bug', content: 'x'.repeat(30), page: '/app/settings?code=abc123&tab=keys' }).page, '/app/settings');
});

test('a page that is missing, blank or not a string is stored as nothing, not as "undefined"', () => {
  for (const bad of [undefined, null, '', '   ', 7, {}, '?only=query', '#only-hash']) {
    assert.equal(ok({ kind: 'bug', content: 'a report long enough to be a report', page: bad }).page, null);
  }
});

test('an absurdly long page is bounded rather than stored whole', () => {
  const v = ok({ kind: 'bug', content: 'a report long enough to be a report', page: `/app/${'a'.repeat(4000)}` });
  assert.ok(v.page.length <= S.SUPPORT_PAGE_MAX, `stored a ${v.page.length}-character page`);
  assert.ok(S.SUPPORT_PAGE_MAX > 0 && S.SUPPORT_PAGE_MAX < 4000, 'the bound is not a bound');
});

// -------------------------------------------------------------------- shape

test('the parsed value carries no owner, because the body is never asked who it is', () => {
  const v = ok({ kind: 'bug', content: 'a report long enough to be a report', owner_id: 'somebody-else', ownerId: 'also-not-me' });
  assert.equal('owner_id' in v, false, 'the parsed submission carries an owner the caller supplied');
  assert.equal('ownerId' in v, false, 'the parsed submission carries an owner the caller supplied');
  assert.deepEqual(Object.keys(v).sort(), ['content', 'kind', 'page', 'redacted']);
});

test('a body that is not an object at all is refused rather than thrown at', () => {
  for (const bad of [null, undefined, 'a string', 42, []]) refused(bad);
});

/* --------------------------------------------- what the export owes the submitter --- */
/**
 * IF THE PRODUCT TELLS YOU SOMETHING ABOUT YOURSELF, YOUR EXPORT HAS TO CONTAIN IT.
 *
 * `feedback.status` was excluded from the user export with the reason "our triage state for the
 * report, not a fact about the person who filed it", and while nothing anywhere showed a status to
 * anybody, that was a defensible line: it really was an internal note.
 *
 * It stopped being true the moment a person could read it. The support dialog now renders "Waiting
 * on us" or "Answered and closed" against each of their own requests, and GET /api/feedback serves
 * that value to the account that filed it. A value the product states to you is, by construction,
 * something you have been told — so an export that leaves it out is no longer a copy of what this
 * product says about you, it is a copy minus the one field you would go looking for.
 *
 * The rule this encodes, and the reason it is a test rather than a note: an exclusion carries a
 * REASON, and a reason can go stale without the line that states it ever being reread. The
 * assertion below fails the moment the two halves disagree.
 */
const USER_EXPORT_TS = readFileSync(join(WORKER, 'src', 'user-export.ts'), 'utf8');

test('a field the product reads back to the submitter is in the submitter\'s export', () => {
  const spec = USER_EXPORT_TS.slice(USER_EXPORT_TS.indexOf("table: 'feedback'"));
  const block = spec.slice(0, spec.indexOf('},\n  {'));
  assert.ok(block.includes('fields:'), 'could not find the feedback export spec — this test measures nothing');
  const fields = /fields:\s*\[([^\]]*)\]/.exec(block);
  assert.ok(fields, 'the feedback export spec has no field list');
  const names = fields[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.ok(names.length >= 5, `parsed ${names.length} exported fields — a broken parse, not a thin export`);

  // GET /api/feedback serves `status` to the account that filed the row, and the dialog renders it.
  assert.ok(
    names.includes('status'),
    'the product shows a submitter the status of their own request and then withholds it from their export',
  );
  // And the stale reason must be gone rather than left sitting under a field that now leaves.
  assert.equal(
    /status:\s*'our triage state/.test(block),
    false,
    'status is exported AND still listed as excluded — the spec contradicts itself',
  );
});

test('the route that shows a status is the reason the export owes one', () => {
  // Names the dependency out loud: if the route stops serving `status`, the export rule above is
  // a rule about nothing and should be revisited rather than silently kept.
  const INDEX_TS = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
  assert.match(INDEX_TS, /FEEDBACK_SELECT = '[^']*status/, 'the feedback routes no longer read status at all');
});
