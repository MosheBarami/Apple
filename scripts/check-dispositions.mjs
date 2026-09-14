#!/usr/bin/env node
// The checker that makes a disposition cost as much as the work it stands in for.
//
// WHY IT EXISTS (§6.7). FEATURES.json holds 1,249 rows and 1,085 of them are not-started. The
// terminal condition wants every row either CLOSED-WITH-EVIDENCE or carrying a disposition that
// explains why it is not — and the moment that becomes the goal, the cheapest path stops being
// "do the work" and becomes "write the same sentence a thousand times".
//
// Every rule below exists to make one specific shortcut expensive:
//
//   STRUCTURALLY-BLOCKED is for a constraint OUTSIDE this repository. "Not built", "no caller
//   yet" and "requires refactor" are descriptions of unfinished work wearing the costume of an
//   obstacle — they are what the row already said. And a constraint that some OTHER row in the
//   same section closed against is, by demonstration, not blocking.
//
//   FACET-BOUND says "this is a face of something already done". If the parent is not itself
//   CLOSED-WITH-EVIDENCE, the row is bound to a promise rather than to a result.
//
//   MERGE-DUPLICATE says "another row is this row". A survivor named approximately is two rows
//   with a hopeful sentence between them.
//
//   ACCEPTED_DEBT is the owner's call and only the owner's: the quoted words must appear
//   byte-for-byte in docs/DECISIONS.md beside this row's id. A paraphrase is me deciding.
//
//   AND THE ONE THAT MATTERS MOST: any disposition applied to more than 20 rows in a single pass
//   needs a DISTINCT proving citation per row. Identical citations across rows collapse to one
//   row and reopen the rest. Without this every rule above is satisfiable by writing one good
//   justification and pasting it — which is the thousand-row shortcut with extra steps.
//
//   node scripts/check-dispositions.mjs
//   node scripts/check-dispositions.mjs --pass 9
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
let passFilter = null;
let rootFlag = null;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--pass') { passFilter = argv[i + 1]; i += 1; continue; }
  // `--root <dir>` so this checker's own tests can plant a ledger and watch each rule fire.
  // Every rule here is about a relationship between rows, and the only way to prove one fires is
  // to build rows that violate it — which must never mean writing them into the real backlog.
  if (argv[i] === '--root') { rootFlag = argv[i + 1]; i += 1; continue; }
  console.error(`check-dispositions: unrecognised flag ${argv[i]}`);
  console.error('check-dispositions: known flags — --pass <n> --root <dir>');
  process.exit(2);
}
if (argv.includes('--root') && !rootFlag) { console.error('check-dispositions: --root needs a directory'); process.exit(2); }

const ROOT = rootFlag ? resolve(rootFlag) : join(dirname(fileURLToPath(import.meta.url)), '..');
const FEATURES = join(ROOT, 'docs', 'backlog', 'FEATURES.json');
const DECISIONS = join(ROOT, 'docs', 'DECISIONS.md');

const findings = [];
const fail = (what, where, why) => findings.push({ what, where, why });

/* --------------------------------------------------------------- the rows --- */

let data;
try { data = JSON.parse(readFileSync(FEATURES, 'utf8')); }
catch (err) {
  console.error(`check-dispositions: FEATURES.json does not parse — ${err.message}`);
  process.exit(2);
}

const rows = (data.sections ?? []).flatMap((s) => (s.items ?? []).map((i) => ({ ...i, section: s.section })));
const byId = new Map(rows.map((r) => [r.id, r]));
const byName = new Map();
for (const r of rows) byName.set(r.name, r);

const DISPOSITIONS = new Set([
  'CLOSED-WITH-EVIDENCE', 'FACET-BOUND', 'MERGE-DUPLICATE',
  'ACCEPTED_DEBT', 'STRUCTURALLY-BLOCKED', 'OWNER-BLOCKED', 'BOOKKEEPING-FLIP',
]);

const dispositioned = rows.filter((r) => r.disposition);
const scoped = passFilter ? dispositioned.filter((r) => String(r.dispositionPass ?? '') === String(passFilter)) : dispositioned;

const decisions = existsSync(DECISIONS) ? readFileSync(DECISIONS, 'utf8') : '';

/* ------------------------------------------------------------- the vocabulary --- */

for (const r of dispositioned) {
  if (!DISPOSITIONS.has(r.disposition)) {
    fail(`${r.id} carries "${r.disposition}", which is not a disposition`, r.section, `known: ${[...DISPOSITIONS].join(', ')}`);
  }
}

/* -------------------------------------------------- STRUCTURALLY-BLOCKED --- */

// A path, a module, a function — anything a reader could open. A constraint inside this
// repository is work, not a wall.
const IN_REPO = /(^|\s)(apps|packages|scripts|infra|docs|tests)\/[\w./-]+/;
const NOT_A_CONSTRAINT = /\bnot built\b|\bno caller yet\b|\brequires? (?:a )?refactor\b|\bnot implemented\b|\bTODO\b/i;

const blocked = dispositioned.filter((r) => r.disposition === 'STRUCTURALLY-BLOCKED');
for (const r of blocked) {
  const cite = String(r.dispositionCitation ?? '').trim();
  if (!cite) { fail(`${r.id} is STRUCTURALLY-BLOCKED with no citation`, r.section, 'a wall nobody can see is a wall nobody can check'); continue; }
  if (NOT_A_CONSTRAINT.test(cite)) {
    fail(`${r.id} cites unfinished work as a structural block`, r.section, `"${cite.slice(0, 70)}" describes the row, not an obstacle`);
  }
  if (IN_REPO.test(cite)) {
    fail(`${r.id} cites something inside this repository`, r.section, `"${cite.slice(0, 70)}" — a constraint we own is a task`);
  }
}

// A constraint another CLOSED row in the same section also faces is, by demonstration, survivable.
const closedBySection = new Map();
for (const r of dispositioned) {
  if (r.disposition !== 'CLOSED-WITH-EVIDENCE') continue;
  if (!closedBySection.has(r.section)) closedBySection.set(r.section, []);
  closedBySection.get(r.section).push(r);
}
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
for (const r of blocked) {
  const cite = norm(r.dispositionCitation);
  if (!cite) continue;
  for (const other of closedBySection.get(r.section) ?? []) {
    if (norm(other.dispositionCitation) === cite) {
      fail(
        `${r.id} is blocked by something ${other.id} closed against`,
        r.section,
        'the same constraint, in the same section, with one row closed and one blocked',
      );
      break;
    }
  }
}

/* ------------------------------------------------------------- FACET-BOUND --- */

for (const r of dispositioned.filter((x) => x.disposition === 'FACET-BOUND')) {
  const parent = byId.get(r.facetOf);
  if (!r.facetOf) { fail(`${r.id} is FACET-BOUND to nothing`, r.section, 'a facet needs a parent'); continue; }
  if (!parent) { fail(`${r.id} is FACET-BOUND to ${r.facetOf}, which is not a row`, r.section, 'a pointer to nothing'); continue; }
  if (parent.disposition !== 'CLOSED-WITH-EVIDENCE') {
    fail(
      `${r.id} is FACET-BOUND to ${parent.id}, which is "${parent.disposition ?? 'undispositioned'}"`,
      r.section,
      'a facet of a promise is a promise',
    );
  }
}

/* --------------------------------------------------------- MERGE-DUPLICATE --- */

for (const r of dispositioned.filter((x) => x.disposition === 'MERGE-DUPLICATE')) {
  if (!r.survivor) { fail(`${r.id} is MERGE-DUPLICATE with no survivor`, r.section, 'merged into nothing'); continue; }
  const survivor = byId.get(r.survivor);
  if (!survivor) { fail(`${r.id} names survivor ${r.survivor}, which is not a row`, r.section, 'a pointer to nothing'); continue; }
  if (survivor.name !== r.name) {
    fail(
      `${r.id} merges into a row with a different name`,
      r.section,
      `"${r.name}" vs "${survivor.name}" — approximately the same is two rows and a hopeful sentence`,
    );
  }
}

/* ----------------------------------------------------------- ACCEPTED_DEBT --- */

for (const r of dispositioned.filter((x) => x.disposition === 'ACCEPTED_DEBT')) {
  const quote = String(r.dispositionCitation ?? '').trim();
  if (!quote) { fail(`${r.id} is ACCEPTED_DEBT with no owner quote`, r.section, 'debt nobody accepted'); continue; }
  if (!decisions.includes(quote)) {
    fail(`${r.id}'s quote does not appear in docs/DECISIONS.md`, r.section, `"${quote.slice(0, 60)}" — a paraphrase is me deciding`);
    continue;
  }
  // Beside THIS row's id, not merely somewhere in the file: one owner sentence must not license
  // every row that finds it convenient.
  const at = decisions.indexOf(quote);
  const near = decisions.slice(Math.max(0, at - 800), at + 800);
  if (!near.includes(r.id)) {
    fail(`${r.id}'s quote is in DECISIONS.md but not beside this row`, r.section, 'one owner sentence cannot license every row that cites it');
  }
}

/* ------------------------------------------- the mass-disposition shortcut --- */

const MASS = 20;
const byDisposition = new Map();
for (const r of scoped) {
  if (!byDisposition.has(r.disposition)) byDisposition.set(r.disposition, []);
  byDisposition.get(r.disposition).push(r);
}
for (const [d, group] of byDisposition) {
  if (group.length <= MASS) continue;
  const seen = new Map();
  for (const r of group) {
    const key = norm(r.dispositionCitation) || '(none)';
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(r.id);
  }
  for (const [key, ids] of seen) {
    if (ids.length === 1) continue;
    fail(
      `${d} was applied to ${group.length} rows in one pass and ${ids.length} share a citation`,
      'docs/backlog/FEATURES.json',
      `${key === '(none)' ? 'no citation at all' : `"${key.slice(0, 50)}"`} — identical citations collapse to one row and reopen the rest: ${ids.slice(0, 4).join(', ')}${ids.length > 4 ? '…' : ''}`,
    );
  }
}

/* ------------------------------------------------------------------ report --- */

console.log(
  `DENOMINATOR ${rows.length} row(s); ${dispositioned.length} carry a disposition` +
  (passFilter ? `, ${scoped.length} of them in pass ${passFilter}` : '') +
  `; ${rows.filter((r) => r.status === 'not-started').length} still not-started`,
);

if (!findings.length) {
  console.log(`DISPOSITIONS SOUND — ${dispositioned.length} examined, 0 findings`);
  process.exit(0);
}
for (const f of findings.slice(0, 40)) console.error(`  ${f.where}: ${f.what} — ${f.why}`);
if (findings.length > 40) console.error(`  … and ${findings.length - 40} more`);
console.log(`DISPOSITIONS UNSOUND — ${findings.length} finding(s)`);
process.exit(1);
