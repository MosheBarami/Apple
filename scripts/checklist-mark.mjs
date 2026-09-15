#!/usr/bin/env node
// Put a ✓ next to the owner's 1,200 checklist items — and never put one there on a guess.
//
// WHAT A ✓ MEANS HERE, EXACTLY: a TEST IN THIS REPOSITORY, named in the output, asserts something
// about this item. Not "a file exists whose name sounds similar". A test is a claim somebody
// wrote down and the suite re-checks; a filename is a filename.
//
// The three states are deliberately three, because the difference between them is the whole point:
//   ✓  done       — a named test asserts it. The test is printed beside the item.
//   ~  partial    — source that implements it exists, but no test names it. The file is printed.
//   ☐  not-found  — neither. This is NOT "missing": it is "this script could not find it",
//                   which is a statement about the script. A failure to observe must not render
//                   as an observation.
//
// THE MATCHER IS DELIBERATELY STRICT, AND ITS FALSE-POSITIVE RATE IS THE ONLY RISK. An item is
// matched when its HEAD NOUN and at least one other distinctive word both appear in the same test
// name. A single shared word never matches — "public" and "page" would tick half the list.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = join(ROOT, 'docs', 'backlog', 'CHECKLIST-V2.json');
const MD_PATH = join(ROOT, 'docs', 'backlog', 'CHECKLIST-V2.md');

const STOP = new Set(('a an and or the of for to in on with by is are be able all any at from into '
  + 'that this these those it its per via user users support supported management control controls '
  + 'option options basic simple clear proper full complete correct accurate working live real '
  + 'entry point points overview access accessible available across each every other more most '
  + 'new old first last next previous own same different single multiple').split(' '));

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));

/** Light stemming so "invitations" matches "invitation" and "pairing" matches "pair". */
const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(sses|shes|ches|xes)$/, (m) => m.slice(0, -2))
  .replace(/([^s])s$/, '$1').replace(/(ing|ed)$/, '');

const key = (s) => [...new Set(words(s).map(stem))];

/* ------------------------------------------------------------------- the evidence corpus --- */

// `.claude/worktrees` holds throwaway COPIES of this tree. Scanning them credits the checklist
// with tests that are not in the checkout — the stale-artifact failure this repo has hit before.
const SKIP = /node_modules|\.git\b|\.claude\/worktrees|\/dist\/|\/\.astro\/|\/raw\/|\/adapters\/|\/build\//;
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP.test(p)) continue;
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js|astro|lua|luau|css|sql)$/.test(e) && st.size < 3_000_000) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const TEST_RE = /(?:^|\s)(?:test|it)\s*\(\s*(['"`])([\s\S]{4,220}?)\1/g;
/** Every test name in the repository, with the file it lives in. This is the ✓ evidence. */
const tests = [];
/** Every source file, by path words. This is the ~ evidence. */
const sources = [];
for (const f of files) {
  const rel = relative(ROOT, f);
  if (/\.(ts|tsx|mjs|js)$/.test(f) && /(test|spec)/.test(rel)) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(TEST_RE)) tests.push({ name: m[2].replace(/\s+/g, ' ').trim(), file: rel, k: new Set(key(m[2])) });
  }
  // A source file's evidence is NOT its path. Paths are three or four words long, so a path
  // corpus almost never carries an item's rare word and the ~ tier collapses to nothing — which
  // reads as "nothing is built", the exact misreading this script exists to avoid. What a file
  // actually says about itself is in the names it exports and the sentence at the top of it.
  const text = readFileSync(f, 'utf8');
  const names = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const camel = names.flatMap((n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_]+/));
  const head = text.slice(0, 1200).split('\n').filter((l) => /^\s*(\/\/|\*|--)/.test(l)).slice(0, 6).join(' ');
  sources.push({ file: rel, k: new Set(key(`${rel.replace(/[/.]/g, ' ')} ${camel.join(' ')} ${head}`)) });
}

/* ------------------------------------------------------------------------------ matching --- */

/**
 * Document frequency over the evidence corpus. This is what separates a real match from a shared
 * English noun: "page", "questions", "registration" and "handling" appear in hundreds of test
 * names, so an item whose ONLY overlap is one of those has matched the language, not the feature.
 */
function docFreq(pool) {
  const df = new Map();
  for (const c of pool) for (const w of c.k) df.set(w, (df.get(w) ?? 0) + 1);
  return df;
}

/**
 * The head noun is the last non-stopword of the item name. Requiring it present is necessary but
 * nowhere near sufficient, so three more conditions stand beside it:
 *   COVERAGE  — at least 60% of the item's distinctive words appear in the candidate.
 *   A RARE WORD — at least one matched word occurs in under 2% of the corpus. This is the one
 *                 that does the work: it is what makes "passkey" count and "registration" not.
 *   TWO WORDS — a single-word match is never enough, whatever its rarity.
 */
function match(item, pool, df, rareMax) {
  const k = key(item);
  if (k.length < 2) return null;
  const head = k[k.length - 1];
  const itemRarest = k.reduce((a, b) => ((df.get(a) ?? 0) <= (df.get(b) ?? 0) ? a : b));
  let best = null;
  for (const c of pool) {
    if (!c.k.has(head)) continue;
    const hit = k.filter((w) => c.k.has(w));
    if (hit.length < 2) continue;
    const coverage = hit.length / k.length;
    if (coverage < 0.6) continue;
    // THE ITEM'S OWN RAREST WORD MUST BE ONE OF THE MATCHED ONES. Without this, "Passkey
    // registration and sign-in" ticks on a test about registration and sign-in that never
    // mentions a passkey — the item's whole distinguishing term missing, and the two generic
    // halves carrying the match. The rare word is the item; the rest is grammar.
    if (!hit.includes(itemRarest)) continue;
    const rarest = Math.min(...hit.map((w) => df.get(w) ?? 0));
    if (rarest > rareMax) continue;
    const score = coverage + (1 - rarest / rareMax) * 0.5;
    if (!best || score > best.score) best = { score, ...c };
  }
  return best;
}

const dfTests = docFreq(tests);
const dfSources = docFreq(sources);
const rareTests = Math.max(3, Math.round(tests.length * 0.02));
const rareSources = Math.max(3, Math.round(sources.length * 0.02));

const doc = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
let done = 0, partial = 0, notFound = 0, notPlanned = 0;
for (const section of doc.sections) {
  for (const item of section.items) {
    if (item.status === 'not-planned') { notPlanned++; continue; }
    const t = match(item.name, tests, dfTests, rareTests);
    if (t) { item.status = 'done'; item.evidence = `${t.file} — "${t.name.slice(0, 90)}"`; done++; continue; }
    const s = match(item.name, sources, dfSources, rareSources);
    if (s) { item.status = 'partial'; item.evidence = s.file; partial++; continue; }
    item.status = 'not-found';
    item.evidence = null;
    notFound++;
  }
}

doc.markedAt = new Date().toISOString();
doc.marking = {
  method: 'a ✓ requires a NAMED TEST in this repository whose name contains the item\'s head noun, '
    + 'the item\'s rarest word, at least two of its words in total and 60% of them; ~ requires a '
    + 'source file matched the same way; ☐ means this script found neither, which is a statement '
    + 'about the script, not proof of absence.',
  rarityThreshold: { tests: rareTests, sources: rareSources },
  testsScanned: tests.length,
  filesScanned: sources.length,
  counts: { done, partial, notFound, notPlanned },
};
writeFileSync(JSON_PATH, JSON.stringify(doc, null, 1) + '\n');

/* ------------------------------------------------------------------------------ the file --- */

const MARK = { done: '✓', partial: '~', 'not-found': '☐', 'not-planned': '✗' };
const total = done + partial + notFound;
const lines = [
  '# COMPLETE AI ROBLOX SAAS SHELL — 10/10 TARGET CHECKLIST',
  '',
  `Owner-authored list of record. 60 sections, ${doc.itemCount} items. Marked ${doc.markedAt.slice(0, 10)}.`,
  '',
  `**✓ ${done} done · ~ ${partial} partly built · ☐ ${notFound} not found · ✗ ${notPlanned} dropped by the owner**`,
  '',
  '`✓` a test in this repo asserts it, and the test is printed beside the line.',
  '`~` code that implements it exists, but no test names it.',
  '`☐` this script found neither. That is what the script saw — not proof the feature is absent.',
  '`✗` the owner said no to this one.',
  '',
];
for (const section of doc.sections) {
  const d = section.items.filter((i) => i.status === 'done').length;
  lines.push(`## ${section.section}  —  ${d}/${section.items.length}`, '');
  for (const i of section.items) {
    lines.push(`- [${MARK[i.status] ?? '?'}] ${i.name}${i.evidence ? `  · \`${i.evidence}\`` : ''}`);
  }
  lines.push('');
}
writeFileSync(MD_PATH, lines.join('\n'));
console.error(`done ${done} · partial ${partial} · not-found ${notFound} · not-planned ${notPlanned} (of ${total + notPlanned})`);
console.error(`scanned ${tests.length} test names, ${sources.length} source files`);
