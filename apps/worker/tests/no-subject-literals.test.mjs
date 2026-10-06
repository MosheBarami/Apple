/**
 * The agent decides, the harness informs and checks (owner directive "generalize-not-patch", 2026-10-02).
 *
 * Every benchmark failure of 2026-10-02 (knife for a treasure chest, a Doge head for a robot pet, party balloons for a
 * hot air balloon) came from the harness holding the subjects of EARLIER benchmarks as code: name tables, recipes,
 * routing words, prompts with worked examples. This guard keeps them out. It reads the real source, so a patch that
 * re-adds a subject, a forced tool, or a baked-in kit goes red whatever it is called.
 *
 * Four parts:
 *   1. a scan of every worker .ts and component .luau file for the benchmark-subject words (comments stripped, strings
 *      and prompts NOT: a prompt that names a subject anchors the model exactly like a table does);
 *   2. structural properties of the run loop (no forced tool, no pre-model library step, no "best" fallback);
 *   3. unit tests of the scanner on in-memory fixtures, so the scanner itself is seen to fail;
 *   4. the non-English name check, in library-object.test.mjs (the allocator must not return a shared default).
 *
 * The allowlist (no-subject-literals.allow.json) holds justified exceptions: path, literal, reason, owner-approved date.
 * Its length is a TRIPWIRE: it may only shrink. When it fires, write the review; do not bump the number.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ROOT = join(WORKER, '..', '..');

// ------------------------------------------------------------------------------------------ the scanner ---

/** Subjects of earlier benchmarks. A word here may not appear in worker source or in a component. */
export const BANNED = [
  'laundry', 'washing machine', 'pizza', 'bakery', 'keyboard', 'piano', 'typewriter', 'butter', 'donut', 'crown', 'asmr',
  'duck', 'tomato', 'carrot', 'eggplant', 'pumpkin', 'orchard', 'Dirty Laundry', 'Doge',
];
/** Banned as plain substrings (no word boundary: an emoji and a prompt string). */
const BANNED_RAW = ['⌨', 'egg_glow', 'squish', 'Click it!'];
const TIER_WORDS = ['Classic', 'Neon', 'Ice', 'Gold', 'Lava', 'Galaxy'];

/**
 * Removes comments and nothing else. `lang` is 'ts' (// and block comments; strings, template literals with ${} and
 * regex literals are skipped over) or 'luau' (-- and --[[ ]] / --[=[ ]=]; strings and long strings are skipped over).
 * Line breaks are kept so a hit's line number stays true.
 */
export function stripComments(src, lang) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  if (lang === 'luau') {
    while (i < n) {
      const c = src[i];
      if (c === '-' && src[i + 1] === '-') {
        const m = /^--\[(=*)\[/.exec(src.slice(i, i + 40));
        if (m) {
          const close = `]${m[1]}]`;
          const end = src.indexOf(close, i + m[0].length);
          const stop = end < 0 ? n : end + close.length;
          out += blank(src.slice(i, stop)); i = stop; continue;
        }
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
        out += src.slice(i, j + 1); i = j + 1; continue;
      }
      if (c === '[') {
        const m = /^\[(=*)\[/.exec(src.slice(i, i + 40));
        if (m) {
          const close = `]${m[1]}]`;
          const end = src.indexOf(close, i + m[0].length);
          const stop = end < 0 ? n : end + close.length;
          out += src.slice(i, stop); i = stop; continue;
        }
      }
      out += c; i++;
    }
    return out;
  }
  // ts: a small recursive scanner. `code(i, inside)` copies code from i, stopping at the "}" that closes a template's ${ ... }
  // when `inside` is true, so a template inside a template, a regex or a quote inside a ${ } are each read as what they are.
  let pos = 0;
  const regexAllowedAfter = (s) => s === '' || /[(,=:[!&|?{};+\-*%<>~^]$/.test(s) || /\b(return|typeof|case|in|of|delete|void|throw|new)$/.test(s);
  const template = () => {
    // at a backtick: copies the whole template literal, scanning each ${ ... } as code
    let text = '`'; pos++;
    while (pos < n) {
      const c = src[pos];
      if (c === '\\') { text += src.slice(pos, pos + 2); pos += 2; continue; }
      if (c === '`') { text += c; pos++; return text; }
      if (c === '$' && src[pos + 1] === '{') { text += '${'; pos += 2; text += code(true); text += '}'; pos++; continue; }
      text += c; pos++;
    }
    return text;
  };
  const code = (inside) => {
    let res = '', last = '', depth = 0;
    while (pos < n) {
      const c = src[pos], d = src[pos + 1];
      if (c === '/' && d === '/') { while (pos < n && src[pos] !== '\n') pos++; continue; }
      if (c === '/' && d === '*') { const end = src.indexOf('*/', pos + 2); const stop = end < 0 ? n : end + 2; res += blank(src.slice(pos, stop)); pos = stop; continue; }
      if (c === '"' || c === "'") {
        let j = pos + 1;
        while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
        res += src.slice(pos, j + 1); pos = j + 1; last = 'x'; continue;
      }
      if (c === '`') { res += template(); last = 'x'; continue; }
      if (c === '/' && regexAllowedAfter(last)) {
        let j = pos + 1, inClass = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          j++;
        }
        if (src[j] === '/') { res += src.slice(pos, j + 1); pos = j + 1; last = 'x'; continue; }
      }
      if (inside) {
        if (c === '{') depth++;
        else if (c === '}') { if (depth === 0) return res; depth--; }
      }
      res += c; pos++;
      if (!/\s/.test(c)) last = (/[A-Za-z0-9_$]/.test(c) ? (last.match(/[A-Za-z0-9_$]+$/)?.[0] ?? '') : '') + c;
    }
    return res;
  };
  return code(false);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A word inside an identifier is not the word (poly_pizza is a provider id, inputKeyboard a reference key): `_` is a word character.
const BANNED_RES = BANNED.map((w) => [w, new RegExp(`(?<![A-Za-z0-9_])${escapeRe(w)}(?![A-Za-z0-9_])`, 'i')]);

/** Banned literals in `src` (comments stripped by the caller). Returns [{ literal, line }]. */
export function scanSubjects(src) {
  const hits = [];
  const lines = src.split('\n');
  lines.forEach((text, idx) => {
    for (const [w, re] of BANNED_RES) if (re.test(text)) hits.push({ literal: w, line: idx + 1 });
    for (const raw of BANNED_RAW) if (text.includes(raw)) hits.push({ literal: raw === '⌨' ? '⌨️' : raw, line: idx + 1 });
  });
  // The tier vocabulary: three or more of its words as quoted strings within one array or object literal.
  const quoted = [...src.matchAll(new RegExp(`['"\`](${TIER_WORDS.join('|')})['"\`]`, 'g'))];
  for (let a = 0; a < quoted.length; a++) {
    const seen = new Set();
    for (let b = a; b < quoted.length && quoted[b].index - quoted[a].index < 400; b++) seen.add(quoted[b][1]);
    if (seen.size >= 3) { hits.push({ literal: `tier vocabulary (${[...seen].join('|')})`, line: src.slice(0, quoted[a].index).split('\n').length }); break; }
  }
  return hits;
}

/**
 * Object literals keyed by two or more subject words (the shape of `THINGS = { laundry: [...], bakery: [...] }` and of
 * `KIN = { keyboard: ..., piano: ... }`): flagged even when the words are not on the banned list, because a new table of
 * subjects is the same defect with other nouns. Subject keys are detected as bare words or quoted words whose value is
 * an array or object literal, in a run of three or more such entries.
 */
export function scanSubjectTables(src) {
  const hits = [];
  const entry = /(?:^|[\s,{])(?:['"]?)([a-z][a-z ]{2,20})(?:['"]?)\s*:\s*[[{]/g;
  const keys = [...src.matchAll(entry)].map((m) => ({ key: m[1], at: m.index }));
  const SPEC_KEYS = new Set(['props', 'children', 'size', 'items', 'params', 'args', 'data', 'meta', 'scale', 'move', 'parts', 'color', 'at', 'tools', 'properties', 'properties', 'enum', 'type', 'required', 'oneOf', 'anyOf', 'allOf', 'default', 'example']);
  for (let a = 0; a < keys.length; a++) {
    if (SPEC_KEYS.has(keys[a].key)) continue;
    let run = 1;
    for (let b = a + 1; b < keys.length && keys[b].at - keys[b - 1].at < 220; b++) { if (!SPEC_KEYS.has(keys[b].key)) run++; }
    const banned = [];
    for (let b = a; b < keys.length && keys[b].at - keys[a].at < 900; b++) {
      for (const [w, re] of BANNED_RES) if (re.test(keys[b].key) && !banned.includes(w)) banned.push(w);
    }
    if (banned.length >= 2) { hits.push({ literal: `subject table (${banned.join(', ')})`, line: src.slice(0, keys[a].at).split('\n').length }); break; }
  }
  return hits;
}

function walk(dir, ext, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'tests' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, ext, acc);
    else if (name.endsWith(ext) && !name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

const SOURCES = [
  ...walk(join(WORKER, 'src'), '.ts').map((p) => ({ p, lang: 'ts' })),
  ...walk(join(ROOT, 'packages', 'components'), '.luau').map((p) => ({ p, lang: 'luau' })),
];

const ALLOW = JSON.parse(readFileSync(join(HERE, 'no-subject-literals.allow.json'), 'utf8'));
/** An exception names its file, its literal AND the text of the line it covers, so it cannot cover a new use of the word. */
const allowed = (rel, literal, line) => ALLOW.entries.some((e) => e.path === rel && e.literal === literal && line.includes(e.lineContains));

function findings() {
  const out = [];
  for (const { p, lang } of SOURCES) {
    const rel = relative(ROOT, p);
    const src = stripComments(readFileSync(p, 'utf8'), lang);
    const lines = src.split('\n');
    for (const h of [...scanSubjects(src), ...(lang === 'ts' ? scanSubjectTables(src) : [])]) {
      if (!allowed(rel, h.literal, lines[h.line - 1] ?? '')) out.push(`${rel}:${h.line} ${h.literal}`);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------- 1. the real scan ---

test('the scan reads the real source (a scan that read nothing would pass)', () => {
  assert.ok(SOURCES.length > 150, `only ${SOURCES.length} source files found`);
  assert.ok(SOURCES.some((s) => s.p.endsWith('compose-tycoon.ts')), 'the kept block source material is scanned (compose-tool.ts was removed in M4)');
  assert.equal(SOURCES.some((s) => s.p.endsWith('compose-tool.ts')), false, 'the whole-game tool came back');
  assert.ok(SOURCES.some((s) => s.p.endsWith('AppleTycoon.luau')));
});

test('no benchmark subject, tier vocabulary, baked-in prompt line or subject table in worker source or components', () => {
  const found = findings();
  assert.deepEqual(found, [], `${found.length} subject literal(s):\n${found.join('\n')}`);
});

test('the allowlist is a tripwire: it only shrinks, every entry says why, and an entry without the owner\'s approval is counted as pending', () => {
  // It is meant to fire on ANY change. If it fires because an entry was added, write the review (path, literal, the line it covers,
  // the reason, the owner's approval date) and do not bump this number; if an entry was removed, lower it.
  assert.equal(ALLOW.entries.length, 3);
  for (const e of ALLOW.entries) {
    assert.ok(e.path && e.literal && e.lineContains && e.reason, `incomplete allowlist entry ${JSON.stringify(e)}`);
    assert.ok(e.approvedOn === null || /^\d{4}-\d{2}-\d{2}$/.test(e.approvedOn), `approvedOn is the owner's date, or null while pending: ${JSON.stringify(e)}`);
  }
});

test('an allowlist entry covers only its own line: the word anywhere else in the same file still fails', () => {
  const e = ALLOW.entries[0];
  assert.equal(allowed(e.path, e.literal, `x ${e.lineContains} y`), true);
  assert.equal(allowed(e.path, e.literal, 'const asmr = make a keyboard;'), false);
  assert.equal(allowed('apps/worker/src/other.ts', e.literal, e.lineContains), false);
});

// ----------------------------------------------------------------------------- 2. structural properties ---

const read = (rel) => readFileSync(join(WORKER, 'src', rel), 'utf8');

test('the run loop forces no tool and routes nothing before the model', () => {
  const session = stripComments(read('do/session.ts'), 'ts');
  // A tool is required only when the USER named the sequence ("first X then Y"): every requiredTool is sequenceStep's.
  const forced = session.split('\n').map((t, i) => ({ t, line: i + 1 })).filter(({ t }) => /\brequiredTool\b/.test(t) && !/sequenceStep/.test(t));
  assert.deepEqual(forced.map((f) => `session.ts:${f.line} ${f.t.trim().slice(0, 100)}`), [], 'a requiredTool that is not the user\'s own sequence');
  assert.equal(/\b(objectFirst|composeFirst|upgradesFirst|coolFirst)\b/.test(session), false, 'a forced first tool flag is back');
  assert.equal(/\?\?\s*best\b/.test(session), false, 'a "?? best" fallback picks for the agent');
  const firstModelCall = session.search(/\bllmChat\(/);
  assert.ok(firstModelCall > 0, 'no llmChat call found: the structural check would pass on nothing');
  const step = [...session.matchAll(/this\.libraryObjectStep\(/g)].map((m) => m.index);
  assert.deepEqual(step.filter((at) => at < firstModelCall), [], 'libraryObjectStep runs before the first model call');
  assert.equal(step.length, 0, 'libraryObjectStep is gone: the agent searches, previews and chooses in its own loop');
});

test('the picking and the kit live in no function the harness runs on its own', () => {
  const lib = stripComments(read('library-object.ts'), 'ts');
  assert.equal(/\bpickPrompt\b|\bpickedIndex\b|\bobjectQueries\b|\bobjectNameOf\b|\bcoolChoice\b/.test(lib), false, 'the harness picks or searches for the agent again');
  assert.equal(/\bwobble\b/.test(lib), false, 'a wobble is baked into library placement');
});

test('tools.ts holds no table keyed by subject words', () => {
  const tools = stripComments(read('tools.ts'), 'ts');
  assert.deepEqual(scanSubjectTables(tools), []);
});

// ------------------------------------------------------------------- 3. the scanner itself, on fixtures ---

test('scanner: clean source passes', () => {
  assert.deepEqual(scanSubjects(stripComments("const x = { gear: [1, 2] };\nconst y = 'a lantern';\n", 'ts')), []);
  assert.deepEqual(scanSubjectTables(stripComments("const x = { gear: [1, 2], lantern: [3] };\n", 'ts')), []);
});

test('scanner: a subject table fails and names the line', () => {
  const src = "const a = 1;\nconst THINGS = { laundry: ['washing machine'] };\n";
  const hits = scanSubjects(stripComments(src, 'ts'));
  assert.ok(hits.some((h) => h.line === 2 && h.literal === 'laundry'), JSON.stringify(hits));
  assert.ok(hits.some((h) => h.line === 2 && h.literal === 'washing machine'));
});

test('scanner: a table of two subject keys fails even without the banned words in values', () => {
  const src = "const KIN = {\n  keyboard: ['key'],\n  piano: ['keys'],\n};\n";
  assert.ok(scanSubjectTables(stripComments(src, 'ts')).length > 0);
});

test('scanner: a word inside a comment does not count, a word inside a string or prompt does', () => {
  assert.deepEqual(scanSubjects(stripComments('// no pizza here\n/* nor a crown */\nconst a = 1;', 'ts')), []);
  assert.equal(scanSubjects(stripComments('const p = "make a stick of butter";', 'ts')).length, 1);
  assert.equal(scanSubjects(stripComments('const p = `ok ${"duck"} no`;', 'ts')).length, 1);
  assert.deepEqual(scanSubjects(stripComments('-- a crown\nlocal a = 1', 'luau')), []);
  assert.deepEqual(scanSubjects(stripComments('--[[ crown\npiano ]]\nlocal a = 1', 'luau')), []);
  assert.equal(scanSubjects(stripComments('local s = "crown"', 'luau')).length, 1);
});

test('scanner: word boundaries (a duck is not a duckling-proof "conduct"; butterfly is not butter)', () => {
  assert.deepEqual(scanSubjects('const a = "butterfly conduct crowned poly_pizza inputKeyboard";'), []);
  assert.equal(scanSubjects('const a = "Butter";').length, 1);
});

test('scanner: a URL with // inside a string is not a comment, a regex with // is not either', () => {
  const src = "const u = 'https://example.com/x'; const r = /a\\/\\/b/; const k = 'pizza';\n";
  assert.equal(scanSubjects(stripComments(src, 'ts')).length, 1);
});

test('scanner: the prompt line, the emoji and the effect names are caught', () => {
  assert.equal(scanSubjects("const h = 'Click it!';").length, 1);
  assert.equal(scanSubjects("const i = '⌨️';").length, 1);
  assert.equal(scanSubjects("const e = 'egg_glow';").length, 1);
  assert.equal(scanSubjects("const e = 'squish';").length, 1);
});

test('scanner: the tier vocabulary is caught as a list, not as one material', () => {
  assert.equal(scanSubjects("const m = { Material: 'Neon' };").length, 0);
  assert.equal(scanSubjects("const T = ['Classic', 'Neon', 'Ice', 'Gold'];").length, 1);
});
