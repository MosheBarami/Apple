#!/usr/bin/env node
// Is the product called what it is called?
//
// The rebrand from Golem to Apple covers PROSE, COPY AND USER-VISIBLE STRINGS ONLY. It does not
// cover identifiers: the worker hostname, the D1 and Vectorize names, the Durable Object binding
// and class names, the Supabase project ref, and a short list of wire and storage literals. Those
// carry persisted values and live contracts, and renaming one breaks something a user is depending
// on right now. That exception list is CLOSED — adding to it requires a one-line proof, in the same
// commit, that renaming the identifier breaks a persisted value or a wire contract.
//
// THE DENOMINATOR IS NOT AUTHORED BY THIS PROGRAM. It is every string literal in the tracked
// source, plus the DEPLOYED bundle, because the repository and the deployed artifact disagree and
// only one of them is what a stranger sees. A rebrand that is complete in git and absent from
// production is not a rebrand; it is a plan.
//
//   node scripts/check-rebrand.mjs               source + the last captured bundle
//   node scripts/check-rebrand.mjs --deployed    refetch the bundle from the live origin first
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://golem.moshe-barami111.workers.dev';
const BUNDLE = join(ROOT, 'docs/evidence/probes/pass3/app-bundle.txt');

const args = process.argv.slice(2);
for (const a of args) {
  if (a !== '--deployed') {
    console.error(`check-rebrand: unrecognised flag ${a}`);
    process.exit(2);
  }
}
const REFETCH = args.includes('--deployed');

const git = (a) => {
  try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim(); }
  catch { return ''; }
};

/* ------------------------------------------------------- the CLOSED exceptions --- */
//
// Exactly the §12.5 identifier list. Each is here because renaming it breaks a persisted value or
// a live wire contract — not because it was inconvenient to change.

const EXEMPT = [
  { pattern: /golem\.moshe-barami111\.workers\.dev/gi, why: 'the deployed worker hostname; renaming it breaks every client and the plugin' },
  { pattern: /golem-corpus/gi, why: 'the D1 database name; the binding resolves by name' },
  { pattern: /golem-docs/gi, why: 'the Vectorize index name; same' },
  { pattern: /golem\.v1/gi, why: 'a wire protocol version literal the plugin also sends' },
  { pattern: /golem\.jwt\./gi, why: 'a storage key prefix; renaming it signs every live session out' },
  { pattern: /X-Golem-/gi, why: 'a request header the plugin sends; renaming it breaks pairing' },
  { pattern: /golem_session/gi, why: 'a persisted session key' },
  { pattern: /golem-ui/gi, why: 'a persisted UI namespace' },
  { pattern: /golem_original/gi, why: 'an attribute written into places already built' },
  { pattern: /golem-authored/gi, why: 'same — it marks instances in a live user place' },
  { pattern: /@golem\//g, why: 'the npm workspace scope; renaming it rewrites every import in the monorepo' },
  { pattern: /golem-theme/gi, why: 'a persisted localStorage key for the theme choice' },
  { pattern: /golem\.rail\.collapsed/gi, why: 'a persisted localStorage key for the sidebar state' },
  { pattern: /\bgolem\b(?=\{|,|\.[a-z-]+\{)/gi, why: 'a generated CSS class name; it is not read by a human' },
  // `golem-plugin` WAS HERE, with the reason "the built artifact filename the owner uploads". That
  // is an argument for renaming it, not for exempting it: the filename a person drags into their
  // Plugins folder is the most user-visible string the product has, and it is neither a persisted
  // value nor a wire contract — rojo's `--output` names the file, and the Instance inside it is
  // named by `default.project.json`'s `name`, which is a separate string. Nothing resolves the
  // artifact by its old filename, so the rename costs a build flag and a line of documentation.
  { pattern: /MosheBarami\/golem/gi, why: 'the git remote' },
  // PROOF, per §6.10's requirement for any addition: `GolemPalette` is the NAME of a ServerStorage
  // folder inside places that have ALREADY been built, and Build.luau resolves it by name at
  // runtime (`PALETTE_ROOT_NAME = "GolemPalette"`). Renaming it orphans the palette in every
  // existing place and the meshes silently stop being found — a persisted value, which is the bar
  // §12.5 sets.
  { pattern: /GolemPalette/g, why: 'an instance name inside places already built; resolved by name at runtime' },
  // PROOF: `GolemBaseVolume` is an ATTRIBUTE that sound-design.ts's generated Luau writes onto Sound
  // instances in the user's own place, and reads back on the next pass to recover the volume the
  // sound had before any trim (`if node:GetAttribute("GolemBaseVolume") == nil then ...`). Rename it
  // and a place that already carries the old attribute re-baselines off its ALREADY-TRIMMED volume,
  // so a second pass is -24 dB instead of -12 dB. That is a persisted value silently changing
  // meaning, which is the bar §12.5 sets. The `-- Golem …` comments in the same generated chunk are
  // pure branding and are NOT covered by this: they were renamed.
  { pattern: /GolemBaseVolume/g, why: 'an attribute written onto Sounds in places already built; read back to recover the pre-trim volume' },
  // PROOF: `golem.memory.v1` is the format stamp written INTO memory export files that users
  // already hold on disk, and `parseImport` refuses an envelope whose `format` is anything else.
  // The stamp NEW exports carry is now `apple.memory.v1`; this literal survives only in
  // LEGACY_EXPORT_FORMATS, the list that keeps an already-downloaded bundle importable. Drop it and
  // every export taken before the rename becomes unreadable — a persisted value, exactly as with
  // `golem.v1` two entries up.
  { pattern: /golem\.memory\.v1/gi, why: 'the format stamp inside memory exports users already hold; accepted on import for compatibility' },
];

/**
 * The string literals in a source file, and nothing else.
 *
 * §6.10 says the denominator is "every string literal", and §12.5 scopes the rebrand to "prose,
 * copy and user-visible strings ONLY". A TypeScript type name is none of those: `GolemMode` is an
 * identifier for a union of wire VALUES, and renaming the type changes nothing a user or a client
 * can observe. Grepping whole files flagged forty of them and buried the three findings that
 * actually matter — a checker whose signal is mostly noise gets muted, which is a slower way of
 * not having one.
 *
 * Comments are excluded for the same reason: a comment is not shipped to anyone. What IS included
 * is every quoted string, because that is what becomes a label, a prompt, a toast or a page.
 */
/**
 * The source with every comment replaced by spaces of the same length.
 *
 * Offsets are preserved, because callers report a line number computed from the offset. Walked
 * rather than regexed: a string can contain `//` (every https:// in the tree) and a comment can
 * contain a quote, so neither can be found without tracking which one you are inside.
 */
function blankComments(src) {
  const out = src.split('');
  let i = 0;
  const blank = (from, to) => { for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' '; };
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < src.length && src[i] !== quote) { if (src[i] === '\\') i += 1; i += 1; }
      i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '-' && src[i + 1] === '-' && src[i + 2] !== '[') {
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

function stringLiterals(src, rel) {
  // Astro markup is prose by construction — the whole file renders to a user.
  if (/\.astro$/.test(rel)) return [{ text: src, offset: 0 }];

  const out = [];
  // COMMENTS ARE BLANKED FIRST, and this is not belt-and-braces — it is the difference between
  // reporting three defects and reporting none.
  //
  // JSDoc writes code spans in markdown backticks: `* The runtime mode allowlist. \`GolemMode\` is
  // a COMPILE-TIME type`. The literal regex below matches a backtick pair as a TEMPLATE LITERAL, so
  // three comments explaining a type name were reported as un-rebranded user-facing copy. A type
  // name is neither prose nor user-visible, and §12.5 scopes the rebrand to "prose, copy and
  // user-visible strings ONLY".
  //
  // Blanking cannot be a regex either: `//` appears inside every https:// URL in the tree, and a
  // naive strip would eat the rest of those lines and the literals on them.
  const code = blankComments(src);
  // Single, double and backtick strings, and Luau's [[long brackets]]. Escapes are honoured so a
  // quote inside a string does not end it early.
  const re = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|\[\[[\s\S]*?\]\]/g;
  for (const m of code.matchAll(re)) {
    // A Luau long bracket is also the comment syntax `--[[ ... ]]`, so one preceded by `--` is a
    // comment, not a literal.
    if (m[0].startsWith('[[') && /--\s*$/.test(code.slice(Math.max(0, m.index - 4), m.index))) continue;
    out.push({ text: m[0], offset: m.index });
  }
  return out;
}

/** Blank every exempt identifier, so only the ones that are genuinely COPY remain. */
function maskExempt(text) {
  let out = text;
  for (const { pattern } of EXEMPT) out = out.replace(pattern, (m) => ' '.repeat(m.length));
  return out;
}

/* ------------------------------------------------------------- the deployed half --- */

async function fetchBundle() {
  const html = await (await fetch(`${ORIGIN}/app`)).text();
  const assets = [...html.matchAll(/"(\/app\/assets\/[A-Za-z0-9._-]+\.(?:js|css))"/g)].map((m) => m[1]);
  let all = html;
  for (const a of [...new Set(assets)]) {
    const res = await fetch(`${ORIGIN}${a}`);
    if (!res.ok) throw new Error(`${a} -> ${res.status}`);
    all += await res.text();
  }
  mkdirSync(dirname(BUNDLE), { recursive: true });
  writeFileSync(BUNDLE, all);
  return all;
}

const deployed = REFETCH
  ? await fetchBundle()
  : existsSync(BUNDLE) ? readFileSync(BUNDLE, 'utf8') : null;

/* --------------------------------------------------------------- the source half --- */

// Exactly §6.10's denominator. Markdown is NOT in it, and adding it was a mistake worth recording:
// it pulled in docs/MISSION-PROMPT.md — a file this agent was instructed to copy verbatim, which
// necessarily contains the old name — and README.md, which is prose for a developer rather than
// copy for a user. A checker that flags the instructions it was given is measuring the wrong thing.
const SOURCE_GLOBS = ['*.ts', '*.tsx', '*.astro', '*.luau'];
const sources = git(['ls-files', ...SOURCE_GLOBS]).split('\n').filter(Boolean)
  // The checker names every exempt identifier, so it would flag itself.
  .filter((f) => f !== 'scripts/check-rebrand.mjs');

console.log(
  `DENOMINATOR ${sources.length} files + ${deployed ? `${deployed.length} bytes of deployed bundle` : 'NO DEPLOYED BUNDLE'}; ` +
  `EXCEPTIONS ${EXEMPT.length}: the closed §12.5 identifier list`,
);

/* ------------------------------------------------------------------ the check --- */

const problems = [];
let exemptHits = 0;

for (const rel of sources) {
  let src;
  try { src = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; }
  for (const lit of stringLiterals(src, rel)) {
    const before = (lit.text.match(/golem/gi) ?? []).length;
    if (!before) continue;
    const masked = maskExempt(lit.text);
    const after = [...masked.matchAll(/golem/gi)];
    exemptHits += before - after.length;
    for (const m of after) {
      const line = src.slice(0, lit.offset + m.index).split('\n').length;
      const text = src.split('\n')[line - 1]?.trim().slice(0, 90) ?? '';
      problems.push(`${rel}:${line} — ${text}`);
    }
  }
}

if (deployed === null) {
  problems.push(
    'NO DEPLOYED BUNDLE CAPTURED — run with --deployed. A rebrand complete in git and absent from ' +
    'production is a plan, not a rebrand, and this checker cannot tell the difference without it.',
  );
} else {
  const maskedDeployed = maskExempt(deployed);
  const hits = [...maskedDeployed.matchAll(/golem/gi)];
  exemptHits += ((deployed.match(/golem/gi) ?? []).length) - hits.length;
  if (hits.length) {
    // Deduplicated to a few distinct phrases: a minified bundle repeats a string, and 86 lines of
    // the same phrase tells a reader less than the phrase does.
    const phrases = [...new Set(hits.map((m) => deployed.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ')))];
    problems.push(`DEPLOYED BUNDLE still says Golem ${hits.length} time(s) in ${deployed.length} bytes — a stranger sees this, not the repository`);
    for (const p of phrases.slice(0, 8)) problems.push(`  deployed: …${p}…`);
  }
}

/* ------------------------------------------------------------------- report --- */

console.log(`  ${exemptHits} exempt identifier occurrence(s) masked by the closed list`);

if (!problems.length) {
  console.log(`REBRAND COMPLETE — ${sources.length} source files and the deployed bundle carry no user-visible Golem`);
  process.exit(0);
}

for (const p of problems) console.error(`  ${p.startsWith('  ') ? p : `BROKEN: ${p}`}`);
console.log(`REBRAND INCOMPLETE — ${problems.length} finding(s)`);
process.exit(1);
