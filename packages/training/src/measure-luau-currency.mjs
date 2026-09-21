#!/usr/bin/env node
/**
 * IS THIS CURRENT LUAU? The corpus card says it does not know, and the ask was for current Luau.
 *
 * The standing request names it directly — "כל סוגי הluau העדכניים", all the CURRENT kinds of
 * Luau — and `data/roblox-github-v1/dataset-card.json` lists the gap in its own words under
 * `what_this_does_not_establish`:
 *
 *   "That the corpus is current Luau. These are repositories as they stood at their pinned
 *    commits; some predate the .luau extension and 6,090 of the files in the surrounding survey
 *    are .lua."
 *
 *   node packages/training/src/measure-luau-currency.mjs [--dir=...]
 *
 * WHERE THE DEPRECATED LIST COMES FROM. Roblox's own engine reference, which the corpus already
 * holds at a pinned revision: a member tagged `Deprecated` in `tags:`. 12 globals — among them
 * `wait`, `spawn`, `delay`, `getfenv`, `ypcall` — and 420 qualified class members. Nothing here is
 * typed by hand, because every hand-typed list in this repository has outlived what it lists, and
 * a list of deprecated APIs is the kind that goes stale fastest. If Roblox deprecates something
 * next month, re-fetching the reference and re-running this picks it up.
 *
 * THREE DIFFERENT QUALITIES OF EVIDENCE, REPORTED SEPARATELY BECAUSE THEY ARE NOT EQUAL:
 *
 *   GLOBALS are precise. `wait(` is matched only where it is not preceded by a dot, a colon or a
 *   word character, so `task.wait(` — the modern replacement, and the thing a corpus SHOULD be
 *   full of — does not count, and neither does a legacy signal's `:wait()`.
 *
 *   METHODS are an UPPER BOUND, and are labelled one. `Humanoid:LoadAnimation` is deprecated;
 *   matching `:LoadAnimation(` cannot tell whether the receiver is a Humanoid or somebody's own
 *   class with the same method name. Reporting this as a count of deprecated calls would be the
 *   same overstatement as reporting 8,187 generated icon stubs as 8,187 contributions.
 *
 *   PROPERTIES are NOT COUNTED AT ALL. Deprecated property names include `.Rotation`, `.Scale`
 *   and `.Transparency`; matching them by name would light up on nearly every file in the corpus
 *   and produce a large, confident, meaningless number. A measurement that cannot be made
 *   honestly is left unmade and said to be unmade.
 *
 * AND THE POSITIVE SIDE, which the negative one cannot give. A file that calls nothing deprecated
 * may simply be Lua 5.1 that never needed to. Modern Luau leaves marks a parser-free scan can see
 * without ambiguity — a `--!strict` mode line, a type annotation, a `type` alias, string
 * interpolation with backticks, `continue`. Those are counted too, and the two figures answer
 * different halves of one question.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripLuauComments } from './measure-ui-yield.mjs';
import { syntaxReportApplies } from './check-luau-syntax.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const ENGINE = join(REPO, 'packages/corpus/raw/Roblox__creator-docs/content/en-us/reference/engine');

/**
 * Every member in one engine-reference YAML whose `tags:` block contains `Deprecated`.
 *
 * Split on the member boundary rather than scanning line by line, so a `Deprecated` tag belonging
 * to one member cannot be attributed to the member above it.
 */
export function deprecatedMembers(yaml) {
  const out = [];
  for (const block of String(yaml).split(/\n(?= {2}- name: )/)) {
    const name = /^ {2}- name: (\S+)/m.exec(block);
    if (!name) continue;
    // `(?:\n|$)` and not `\n`: the split above consumes the newline before the next member, so a
    // `tags:` block that is the LAST key of a member ends at the end of the string with no
    // trailing newline, and a rule demanding one skips it silently. Found by a fixture, not by the
    // corpus — in real files `tags:` is usually followed by `code_samples:`, so the bug hid.
    const tags = /^ {4}tags:\n((?: {6}- .*(?:\n|$))+)/m.exec(block);
    if (tags && /^ {6}- Deprecated\s*$/m.test(tags[1])) out.push(name[1]);
  }
  return out;
}

/**
 * The deprecated vocabulary, derived from the reference.
 *
 * `globals` are bare names. `methods` are the part after `:` in a qualified member — the only
 * form a call site shows. Properties (the `.` form) are collected but deliberately NOT returned
 * for matching; see the header.
 */
export function deriveDeprecated(engineDir) {
  const globals = new Set();
  for (const f of readdirSync(join(engineDir, 'globals'))) {
    if (!f.endsWith('.yaml')) continue;
    for (const n of deprecatedMembers(readFileSync(join(engineDir, 'globals', f), 'utf8'))) globals.add(n);
  }
  const methods = new Set();
  let properties = 0;
  let classFiles = 0;
  for (const f of readdirSync(join(engineDir, 'classes'))) {
    if (!f.endsWith('.yaml')) continue;
    classFiles += 1;
    for (const n of deprecatedMembers(readFileSync(join(engineDir, 'classes', f), 'utf8'))) {
      const m = /:([A-Za-z_]\w*)$/.exec(n);
      if (m) methods.add(m[1]); else properties += 1;
    }
  }
  return { globals, methods, properties_seen_but_not_matched: properties, class_files_read: classFiles };
}

/**
 * Which deprecated globals does this source CALL?
 *
 * The lookbehind is the whole precision of this function. `task.wait(` is the modern replacement
 * and must not count; `signal:wait(` is a method; `mywait(` is somebody else's function. Only a
 * bare `wait(` is the deprecated global.
 */
export function deprecatedGlobalsUsed(code, globals) {
  const hits = new Set();
  for (const g of globals) {
    if (new RegExp(`(?<![.:\\w])${g}\\s*[({"']`).test(code)) hits.add(g);
  }
  return hits;
}

/** Which deprecated method NAMES does this source call? An upper bound: the receiver is unknown. */
export function deprecatedMethodNamesUsed(code, methods) {
  const hits = new Set();
  for (const m of code.matchAll(/:([A-Za-z_]\w*)\s*[({"']/g)) {
    if (methods.has(m[1])) hits.add(m[1]);
  }
  return hits;
}

/**
 * Marks of modern Luau that a scan can see without ambiguity.
 *
 * Each is a syntax form that did not exist in Lua 5.1, so a file carrying one was written for
 * Luau and not merely parsed by it.
 *
 * TWO ARGUMENTS, AND THE REASON IS A BUG THIS SHIPPED WITH FOR ONE RUN. Everything here reads
 * `code`, which has had its comments stripped — a scanner that reads prose counts a file's own
 * description of what it does not do. But `--!strict` IS A COMMENT. It is Luau's mode line, the
 * single most common mark of modern Luau there is, and stripping comments deletes it. The first
 * run over 27,671 rows reported `strict_mode` firing ZERO times and it did not look like an
 * error — the marker simply never appeared in the tally, and the other five carried the number.
 *
 * So the mode line is read from `raw`, and everything else from `code`.
 */
export function modernMarkers(code, raw = code) {
  return {
    strict_mode: /^\s*--!(strict|nonstrict|native|optimize)\b/m.test(raw),
    type_alias: /^\s*(export\s+)?type\s+[A-Za-z_]\w*\s*[=<]/m.test(code),
    annotation: /\blocal\s+[A-Za-z_]\w*\s*:\s*[A-Za-z_{(]/.test(code) || /\)\s*:\s*[A-Za-z_{(][\w.<]*\s*$/m.test(code),
    string_interpolation: /`[^`\n]*\{[^`\n]*\}[^`\n]*`/.test(code),
    // `continue` ends a statement: at end of line, before `end`, or before `;`. Requiring end of
    // line alone missed `if done then continue end`, which is how most of it is actually written.
    continue_statement: /(?<![\w.:])continue\b\s*(?:$|;|\bend\b)/m.test(code),
    compound_assignment: /[^=<>~!+\-*/%^.]\s(\+=|-=|\*=|\/=|\^=|%=|\.\.=)\s/.test(code),
  };
}

/**
 * Is this currency report about THIS corpus, at THIS size?
 *
 * The same question `syntaxReportApplies` asks, and for the same reason. The card quotes this
 * report; a report left over from a smaller corpus would certify rows it never read, and the drift
 * is invisible because the sentence it produces reads exactly the same either way. The card must
 * fall back to `not_measured` rather than quote a stale number — 241 rows were added to this corpus
 * on 2026-09-21 and every report generated before that moment describes a corpus that no longer
 * exists.
 */
export function currencyReportApplies(report, corpusRelPath, rowsInCorpus) {
  if (!report || typeof report !== 'object') return false;
  if (report.corpus !== corpusRelPath) return false;
  return report.rows_in_corpus === rowsInCorpus;
}

/* c8 ignore start -- filesystem driver */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const a = process.argv.find((x) => x.startsWith('--dir='));
  const DIR = resolve(a ? a.split('=')[1] : join(HERE, '..', 'data', 'roblox-github-v1'));
  const ROWS = join(DIR, 'rows.jsonl');
  for (const [p, why] of [[ROWS, 'run acquire-github-luau.mjs first'], [ENGINE, 'the engine reference is not in this checkout']]) {
    if (!existsSync(p)) { console.error(`${p} does not exist — ${why}.`); process.exit(2); }
  }

  const dep = deriveDeprecated(ENGINE);
  if (dep.globals.size === 0 || dep.methods.size === 0) {
    console.error('the derived deprecated set is EMPTY on one axis — every row would be reported modern '
      + 'and the result would look like a clean corpus. Refusing.');
    process.exit(3);
  }
  console.error(`derived ${dep.globals.size} deprecated globals and ${dep.methods.size} deprecated method names `
    + `from ${dep.class_files_read} class files (${dep.properties_seen_but_not_matched} deprecated properties NOT matched)`);

  const rows = readFileSync(ROWS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

  // Join the parse gate so "current Luau" cannot include bytes that are not Luau.
  const SYNTAX = join(HERE, '..', 'runs', 'luau-syntax-github-v1.json');
  const corpusRel = DIR.replace(`${REPO}/`, '');
  let parses = null;
  if (existsSync(SYNTAX)) {
    const rep = JSON.parse(readFileSync(SYNTAX, 'utf8'));
    if (syntaxReportApplies(rep, corpusRel, rows.length)) {
      const bad = new Set([...rep.failures, ...(rep.not_measured ?? [])].map((f) => f.row_id));
      parses = (id) => !bad.has(id);
    } else console.error(`the syntax report is about ${rep.corpus} / ${rep.rows_checked} rows — ignoring it`);
  }

  const globalTally = new Map(); const methodTally = new Map(); const markerTally = new Map();
  let usesDeprecatedGlobal = 0; let namesDeprecatedMethod = 0; let anyModernMarker = 0;
  let currentCandidates = 0; let handWritten = 0;
  const extensions = new Map();

  for (const r of rows) {
    const code = stripLuauComments(r.text);
    const g = deprecatedGlobalsUsed(code, dep.globals);
    const m = deprecatedMethodNamesUsed(code, dep.methods);
    const marks = modernMarkers(code, r.text);
    const modern = Object.values(marks).some(Boolean);

    for (const k of g) globalTally.set(k, (globalTally.get(k) ?? 0) + 1);
    for (const k of m) methodTally.set(k, (methodTally.get(k) ?? 0) + 1);
    for (const [k, v] of Object.entries(marks)) if (v) markerTally.set(k, (markerTally.get(k) ?? 0) + 1);
    if (g.size) usesDeprecatedGlobal += 1;
    if (m.size) namesDeprecatedMethod += 1;
    if (modern) anyModernMarker += 1;

    const ext = /\.(luau|lua)$/i.exec(r.provenance.source_path)?.[1]?.toLowerCase() ?? 'other';
    extensions.set(ext, (extensions.get(ext) ?? 0) + 1);

    if (r.generated !== true) {
      handWritten += 1;
      if (g.size === 0 && parses !== null && parses(r.id)) currentCandidates += 1;
    }
  }

  const sorted = (m) => Object.fromEntries([...m].sort((x, y) => y[1] - x[1]));
  const report = {
    generated_at: new Date().toISOString(),
    generator: 'packages/training/src/measure-luau-currency.mjs',
    corpus: corpusRel,
    derived_from: {
      engine_reference: 'packages/corpus/raw/Roblox__creator-docs (pinned in raw/manifest.json)',
      deprecated_globals: [...dep.globals].sort(),
      deprecated_method_names: dep.methods.size,
      class_files_read: dep.class_files_read,
      deprecated_properties_seen_but_not_matched: dep.properties_seen_but_not_matched,
      why_properties_are_not_matched: 'deprecated property names include .Rotation, .Scale and .Transparency. Matching them by name would fire on nearly every file and produce a large, confident, meaningless number.',
    },
    rows_in_corpus: rows.length,
    rows_hand_written: handWritten,
    extensions: sorted(extensions),
    extension_note: 'a .lua extension is not by itself old code — Roblox accepted .lua long after Luau shipped — and a .luau extension is not by itself new code.',

    deprecated_globals: {
      rows_calling_at_least_one: usesDeprecatedGlobal,
      percent_of_corpus: Number(((usesDeprecatedGlobal / rows.length) * 100).toFixed(2)),
      precision: 'PRECISE. The match requires the name not to be preceded by a dot, colon or word character, so task.wait( and signal:wait( do not count. A file that shadows a global with its own local of the same name would, and that is the known residual.',
      by_name: sorted(globalTally),
    },
    deprecated_method_names: {
      rows_naming_at_least_one: namesDeprecatedMethod,
      percent_of_corpus: Number(((namesDeprecatedMethod / rows.length) * 100).toFixed(2)),
      precision: 'UPPER BOUND. A call site shows the method name, never the receiver\'s class, so somebody\'s own :Remove() counts the same as Instance:Remove(). Quote this as "names a deprecated member", never as "uses a deprecated API".',
      by_name: sorted(methodTally),
    },
    modern_luau: {
      rows_with_at_least_one_marker: anyModernMarker,
      percent_of_corpus: Number(((anyModernMarker / rows.length) * 100).toFixed(2)),
      note: 'a file with no marker is not thereby old — it may be code that never needed a type annotation. This counts evidence OF modernity, not evidence against it.',
      by_marker: sorted(markerTally),
    },
    current_luau_candidates: parses === null ? null : currentCandidates,
    current_luau_candidates_meaning: parses === null
      ? 'not computable: the parse gate has not been run against this corpus, and a row that is not Luau cannot be current Luau.'
      : 'hand-written, observed to parse, and calling none of the deprecated globals. It is a CANDIDATE set: the method-name upper bound is deliberately not applied, because excluding on an upper bound would discard files for a name collision.',
    what_this_does_not_establish: [
      'That a row free of deprecated calls is modern. Lua 5.1 that never needed wait() is indistinguishable here from Luau that avoided it.',
      'That a row using a deprecated global is bad. wait() in a 2019 repository is that repository being its age, not a defect.',
      'That any of this approves anything for training. training_approved is false and semantic_quality_pass is null on every row, and this pass changes neither.',
    ],
  };

  const out = join(REPO, 'packages/training/runs/luau-currency-github-v1.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`\n${usesDeprecatedGlobal} of ${rows.length} rows call a deprecated GLOBAL (${report.deprecated_globals.percent_of_corpus}%)`);
  console.error(`${namesDeprecatedMethod} name a deprecated METHOD — upper bound, receiver unknown (${report.deprecated_method_names.percent_of_corpus}%)`);
  console.error(`${anyModernMarker} carry at least one modern-Luau marker (${report.modern_luau.percent_of_corpus}%)`);
  console.error(`current-Luau candidates: ${report.current_luau_candidates ?? 'not computable without the parse gate'}`);
  console.error(`wrote ${out}`);
}
/* c8 ignore stop */
