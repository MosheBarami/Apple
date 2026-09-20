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
// THE DEPLOYED HALF IS THE LIVE ORIGIN, AND IT IS NOT ONLY /app. §6.10 names three denominators —
// tracked source, the SPA bundle, and the rendered HTML of every route in the sitemap. Two were
// implemented. The marketing site is eighteen routes of pure prose and the checker fetched none of
// them, while its own headline said it covered the deployed site.
//
//   node scripts/check-rebrand.mjs               source + the last capture, verified against live
//   node scripts/check-rebrand.mjs --deployed    refetch every route and the SPA bundle first
//   node scripts/check-rebrand.mjs --offline     source only; says so, and never claims production
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// THE ORIGIN IS `apple`, NOT `golem`. The old value was the LEGACY worker, which serves /api/* from
// a 27-commit-stale build; a capture taken from it is a measurement of a deployment nobody is sent
// to. The hostname stays on the exemption list because clients still resolve it — being exempt from
// the RENAME and being the right thing to MEASURE are different questions, and conflating them is
// how the deployed half came to describe the wrong worker.
const ORIGIN = 'https://apple.moshe-barami111.workers.dev';
// CHECK_REBRAND_BUNDLE redirects the capture, so this program can be exercised end to end — take a
// real capture, verify it, watch the verification fail on a doctored one — without writing over the
// tracked evidence file in a checkout other sessions are working in.
const BUNDLE = process.env.CHECK_REBRAND_BUNDLE
  ? resolve(ROOT, process.env.CHECK_REBRAND_BUNDLE)
  : join(ROOT, 'docs/evidence/probes/pass3/app-bundle.txt');
/** Marker line written at the top of a capture, recording WHAT it is a capture OF. */
const PROVENANCE = '//= check-rebrand capture ';

const args = process.argv.slice(2);
for (const a of args) {
  if (a !== '--deployed' && a !== '--offline') {
    console.error(`check-rebrand: unrecognised flag ${a}`);
    process.exit(2);
  }
}
const REFETCH = args.includes('--deployed');
const OFFLINE = args.includes('--offline');
if (REFETCH && OFFLINE) {
  console.error('check-rebrand: --deployed and --offline contradict each other');
  process.exit(2);
}

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
  // PROOF: `golem.studio-ops.v1` is a WIRE VALUE the installed plugin sends and the worker compares
  // by equality. apps/apple-plugin/src/Commands.luau:3686 sets `CAPABILITY_SCHEMA` and puts it in
  // every poll body; apps/worker/src/plugin-capabilities.ts:65 answers
  // `if (top.schema !== PLUGIN_CAPABILITY_SCHEMA) return null` — and `null` is documented on the
  // line above as COMPATIBILITY MODE, meaning the worker keeps offering every tool because it has
  // no report. Rename one side and every plugin already in somebody's Plugins folder silently
  // stops negotiating capabilities until they reinstall; rename both and the same happens for one
  // release cycle. It is also persisted: the DO stores the parsed report under
  // `pluginCapabilities:<hash>` with the schema string inside it. Identical in kind to `golem.v1`
  // three entries up, which is exempt for the same reason.
  { pattern: /golem\.studio-ops\.v1/gi, why: 'a wire schema value the installed plugin sends and the worker compares by equality' },
  // PROOF: this `'golem'` is the legacy worker's DEPLOYMENT NAME, not copy. apps/worker/wrangler.jsonc:55
  // ships `"BILLING_WORKER_NAME": "golem"` and wrangler.apple.jsonc:117 ships `"apple"`; index.ts:2564
  // compares the running worker's var against BILLING_AUTHORITY_WORKER to decide which deployment
  // may resolve Stripe state, and index.ts:2592 addresses the other one by this exact string when
  // replicating the mutation into the legacy QuotaDO namespace. Changing the constant without
  // redeploying the legacy worker's var makes the authority stop replicating — entitlement diverges
  // between the two deployments, silently. Same class as the hostname at the top of this list.
  //
  // It is SCOPED to the two files that declare the deployment identity. An unqualified `'golem'`
  // exemption would blank the word wherever it appeared alone, including in copy, which is the
  // failure this program exists to catch.
  {
    pattern: /golem/gi,
    file: /^apps\/worker\/src\/(billing-origin-authority|env)\.ts$/,
    line: /BILLING_REPLICA_WORKER|BILLING_WORKER_NAME/,
    why: "the legacy worker's deployment name, set in wrangler.jsonc and used to address it",
  },
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
 * A `/` at this offset opens a regex literal rather than dividing.
 *
 * Decided by the last SIGNIFICANT character before it — comments are already spaces in `out` by
 * the time this is asked, so the scan skips whitespace and lands on real code. After a value
 * (identifier, number, `)`, `]`, a closing quote) a slash divides; after an operator, an opening
 * bracket, a separator or one of the value-position keywords it opens a regex.
 *
 * `<` and `>` are deliberately NOT in the set: `</div>` in a .tsx file would otherwise be read as
 * a regex, and JSX is two thirds of apps/web.
 */
const REGEX_OPENERS = new Set(['=', '(', ',', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '*', '%', '^', '~']);
const REGEX_KEYWORDS = /(?:^|[^\w$])(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/;

/**
 * The source with every comment — and every REGEX LITERAL — replaced by spaces of the same length.
 *
 * Offsets are preserved, because callers report a line number computed from the offset. Walked
 * rather than regexed: a string can contain `//` (every https:// in the tree) and a comment can
 * contain a quote, so neither can be found without tracking which one you are inside.
 *
 * REGEX LITERALS ARE THE REASON THIS FUNCTION WAS BLIND TO 8.7% OF THE TREE. `/\bhttps?:\/\/[^\s<>"')]+/gi`
 * in apps/worker/src/abuse.ts contains a `"` and a `'`. The walker used to see the `"` as the start
 * of a double-quoted string and then run forward to the next `"` anywhere in the file — 49 lines
 * later — swallowing every literal in between. Across the 449 tracked source files that hid 16,187
 * lines from the denominator while the program printed a file count that sounded complete.
 * A regex is not a string literal, so it is blanked rather than kept: §6.10's denominator is
 * "every string literal", and leaving the regex body in `code` would let its quotes pair up with
 * a real quote on the same line and manufacture a literal that is not in the source.
 *
 * LUAU LONG COMMENTS are the second half of the same blindness. `--[[ … ]]` was explicitly NOT
 * treated as a comment (the old `src[i + 2] !== '['` guard stepped over the `--` and left the
 * walker inside the comment body), so the apostrophe in `--[[ The companion's direct-manipulation
 * ops.` at apps/plugin/src/Ops.luau:22 opened a string region five lines long. Build.luau lost
 * 3,216 lines to one apostrophe on line 11.
 *
 * `--` IS ONLY A COMMENT IN LUAU. In TypeScript it is the decrement operator, and blanking to end
 * of line from `i--` removed real code — including any literal that shared the line.
 */
function blankComments(src, { luau = false, py = false } = {}) {
  const out = src.split('');
  let i = 0;
  const blank = (from, to) => { for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' '; };
  const opensRegex = (at) => {
    let k = at - 1;
    while (k >= 0 && /\s/.test(out[k])) k -= 1;
    if (k < 0) return true;
    const ch = out[k];
    if (REGEX_OPENERS.has(ch)) return true;
    return REGEX_KEYWORDS.test(out.slice(Math.max(0, k - 12), k + 1).join(''));
  };
  while (i < src.length) {
    const c = src[i];
    // A PYTHON TRIPLE-QUOTED REGION IS ONE LITERAL, and it is the only string in either language
    // that legitimately spans lines with a plain quote. Skipped rather than blanked — it is a
    // literal, stringLiterals() matches it, and a docstring is printed by `help()`, so it is
    // exactly the kind of prose this program exists to read. Handled BEFORE the single-quote
    // branch below, whose newline backstop would otherwise close it after one line and leave the
    // rest of the docstring to be re-read as code.
    if (py && (c === '"' || c === "'")) {
      const triple = src.slice(i, i + 3);
      if (triple === '"""' || triple === "'''") {
        const end = src.indexOf(triple, i + 3);
        i = end === -1 ? src.length : end + 3;
        continue;
      }
    }
    if (py && c === '#') {
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    // A Luau long STRING — `[[ … ]]`, `[==[ … ]==]`. Kept, not blanked: it is a literal, and
    // stringLiterals() matches it. Skipped here so quotes inside it cannot open a phantom string.
    if (luau && c === '[') {
      const m = /^\[(=*)\[/.exec(src.slice(i, i + 16));
      if (m) {
        const close = `]${m[1]}]`;
        const end = src.indexOf(close, i + m[0].length);
        i = end === -1 ? src.length : end + close.length;
        continue;
      }
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const start = i;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') { i += 2; continue; }
        // A `'` or `"` STRING CANNOT CONTAIN A RAW NEWLINE, in TypeScript or in Luau — an
        // unterminated one is a syntax error, and a deliberate continuation escapes the newline,
        // which the branch above already steps over. So reaching a newline PROVES this quote was
        // not opening a string: it is an apostrophe in JSX prose, like
        //   <span>Admin key (kept in this tab's sessionStorage)</span>
        // in apps/web/src/routes/admin.tsx:820, which used to swallow the next 29 lines.
        //
        // This is the backstop for the whole function. The regex and long-comment cases below are
        // the two mis-opens that were MEASURED; this one catches any third without needing a JSX
        // parser, because it checks the consequence rather than enumerating the cause.
        if (src[i] === '\n' && quote !== '`') { i = -1; break; }
        i += 1;
      }
      if (i === -1) { i = start + 1; continue; }
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
    if (!luau && c === '/' && opensRegex(i)) {
      // Scan to the unescaped closing `/`, honouring `[...]` character classes so `[/]` does not
      // end it. A regex cannot span a line, so hitting a newline first proves this was division
      // after all and the slash is stepped over as ordinary code.
      let j = i + 1;
      let inClass = false;
      let closed = -1;
      while (j < src.length) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '\n') break;
        if (inClass) { if (d === ']') inClass = false; }
        else if (d === '[') inClass = true;
        else if (d === '/') { closed = j; break; }
        j += 1;
      }
      if (closed !== -1) {
        j = closed + 1;
        while (j < src.length && /[a-z]/i.test(src[j])) j += 1;
        blank(i, j);
        i = j;
        continue;
      }
    }
    if (luau && c === '-' && src[i + 1] === '-') {
      const m = /^--\[(=*)\[/.exec(src.slice(i, i + 18));
      if (m) {
        const close = `]${m[1]}]`;
        const end = src.indexOf(close, i + m[0].length);
        const stop = end === -1 ? src.length : end + close.length;
        blank(i, stop);
        i = stop;
        continue;
      }
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * An .astro file with everything the build strips replaced by spaces of the same length.
 *
 * Offsets are preserved because the caller reports a line number computed from one. Two kinds are
 * removed: the FRONTMATTER between the opening `---` fences, which is TypeScript and whose `//`
 * and `/* *\/` comments are already handled by blankComments(), and `{/* … *\/}` expression
 * comments in the markup, which Astro deletes at compile time.
 */
function blankAstroComments(src) {
  let out = src;
  const pad = (m) => m.replace(/[^\n]/g, ' ');
  const fence = /^---\n([\s\S]*?)\n---/.exec(out);
  if (fence) {
    const body = blankComments(fence[1], {});
    out = `${out.slice(0, 4)}${body}${out.slice(4 + fence[1].length)}`;
  }
  return out.replace(/\{\/\*[\s\S]*?\*\/\}/g, pad);
}

function stringLiterals(src, rel) {
  // Astro markup is prose by construction — the whole file renders to a user.
  //
  // EXCEPT WHAT THE BUILD DELETES, and the difference is not pedantry — it is the difference
  // between a checker and a muzzle. apps/site/src/components/Footer.astro carries a six-line
  // `{/* … */}` comment explaining why the operator's byline is "Apple Labs" and what it used to
  // say; Astro compiles that comment away and no browser ever receives a byte of it. Reported as a
  // finding, the only way to clear the gate is to DELETE THE EXPLANATION — so the check would be
  // spending the one thing this repository is built on, the reason a decision was made, to buy a
  // green line about a word nobody can read.
  //
  // An HTML `<!-- … -->` comment is NOT in this exemption. Astro keeps it, it is served, and a
  // stranger reading source sees it. The line is drawn at what reaches the browser.
  if (/\.astro$/.test(rel)) return [{ text: blankAstroComments(src), offset: 0 }];

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
  const code = blankComments(src, { luau: /\.luau$/.test(rel), py: /\.py$/.test(rel) });
  // Single, double and backtick strings, and Luau's [[long brackets]]. Escapes are honoured so a
  // quote inside a string does not end it early.
  const re = /"""[\s\S]*?"""|'''[\s\S]*?'''|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|\[\[[\s\S]*?\]\]/g;
  for (const m of code.matchAll(re)) {
    // A Luau long bracket is also the comment syntax `--[[ ... ]]`, so one preceded by `--` is a
    // comment, not a literal.
    if (m[0].startsWith('[[') && /--\s*$/.test(code.slice(Math.max(0, m.index - 4), m.index))) continue;
    out.push({ text: m[0], offset: m.index });
  }
  return out;
}

/** Blank every exempt identifier, so only the ones that are genuinely COPY remain. */
function maskExempt(text, ctx = {}) {
  let out = text;
  for (const e of EXEMPT) {
    // A SCOPED entry only applies where its proof applies. `file` and `line` exist because some
    // identifiers are indistinguishable from copy when you look at the literal alone: `'golem'` in
    // `BILLING_WORKER_NAME?: 'apple' | 'golem'` is a deployment name, and `'golem'` in a toast is a
    // defect, and the two strings are byte-identical. Exempting the string everywhere to cover the
    // first would blind the program to the second, which is the whole of its job.
    //
    // An entry with `file` is therefore NOT applied to the deployed bundle either: the bundle has
    // no file path, so the proof cannot be shown to hold there, and a proof that cannot be shown
    // does not get the benefit of the doubt.
    if (e.file && !(ctx.rel && e.file.test(ctx.rel))) continue;
    if (e.line && !(ctx.line && e.line.test(ctx.line))) continue;
    out = out.replace(e.pattern, (m) => ' '.repeat(m.length));
  }
  return out;
}

/* ------------------------------------------------------------------ the selftest --- */
//
// IT RUNS ON EVERY INVOCATION, not behind a flag, and that is the point.
//
// The scanner's failure mode is SILENT UNDER-READING: a mis-scanned quote makes the program report
// on two thirds of the tree while printing a file count that sounds like all of it. There is no
// output that distinguishes "449 files, clean" from "449 files, 16,187 lines of which were never
// looked at". `REBRAND COMPLETE` was printable in both states, so the headline was not evidence.
//
// A flag would not close that: the run that matters is the one somebody does WITHOUT the flag.
// These fixtures cost under a millisecond and they are the only thing standing between the
// headline and the claim it makes.

function selftest() {
  const fails = [];
  let ran = 0;
  const check = (name, cond, detail = '') => {
    ran += 1;
    if (!cond) fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
  };
  const texts = (src, rel) => stringLiterals(src, rel).map((l) => l.text);
  /** A `'…'` or `"…"` span crossing a newline is impossible in real source: it is a mis-scan. */
  const noMultilineQuote = (src, rel) =>
    !texts(src, rel).some((t) => (t.startsWith("'") || t.startsWith('"')) && t.includes('\n'));

  // 1. THE DEFECT, MINIMALLY — asserted on blankComments(), not on the literal list.
  //
  //    This is the layer that has to be tested. `re` in stringLiterals() re-scans independently, so
  //    a mis-positioned walker does NOT usually produce a visibly broken literal; what it produces
  //    is a COMMENT LEFT UNBLANKED further down, and the damage lands later. An assertion on the
  //    literal list alone passes with the defect present — this one was written that way first and
  //    stayed green when the fix was disabled on purpose.
  {
    const src = "const RE = /['\"]x/;\n// golem was here\nconst s = 1;\n";
    const blanked = blankComments(src, {});
    check('regex-class: the comment AFTER a quote-bearing regex is still blanked',
      !/golem/i.test(blanked), JSON.stringify(blanked.split('\n')[1]));
    check('regex-class: blanking preserves every offset',
      blanked.length === src.length && blanked.split('\n').length === src.split('\n').length);
  }
  // 2. THE DEFECT, END TO END — the exact shape that hid the Golem sentence in
  //    apps/worker/src/assets.ts. A regex with a quote in it mis-opens a phantom string; the JSDoc
  //    block below it is therefore never blanked; its lone backtick pairs with the REAL template
  //    literal's opening backtick; and the sentence a user reads drops out of the denominator
  //    entirely, reported as nothing rather than as a finding.
  {
    const src = 'const RE = /[\'"]x/;\n/** doc mentioning the ` character */\nconst label = `Golem ships`;\n';
    check('assets.ts shape: the template literal is still in the denominator',
      texts(src, 'a.ts').includes('`Golem ships`'), JSON.stringify(texts(src, 'a.ts')));
  }
  // 2b. The real one from apps/worker/src/abuse.ts, which swallowed 49 lines.
  {
    const src = 'const URL_RE = /\\bhttps?:\\/\\/[^\\s<>"\')]+/gi;\n// golem was here\nconst label = "Golem ships";\n';
    check('url regex: the comment after it is still blanked', !/golem was here/.test(blankComments(src, {})));
    check('url regex: the literal after it is still seen', texts(src, 'a.ts').includes('"Golem ships"'));
    check('url regex: no phantom multi-line string', noMultilineQuote(src, 'a.ts'));
  }
  // 3. A regex body is NOT a string literal, so it must not become one.
  check('regex body is not reported as a literal',
    !texts('const R = /golem/i;\n', 'a.ts').some((t) => /golem/i.test(t)));
  // 4. DIVISION IS STILL DIVISION. The cure must not eat code.
  {
    const src = 'const ratio = total / count;\nconst label = "Golem";\n';
    check('division: literal after a division is seen', texts(src, 'a.ts').includes('"Golem"'));
  }
  // 5. `--` is the decrement operator in TypeScript, not a comment.
  check('ts decrement is not a comment', texts("i--; const s = 'Golem';\n", 'a.ts').includes("'Golem'"));
  // 6. Luau long comment holding an apostrophe — Ops.luau:22 cost 850 lines, Build.luau:11 cost
  //    3,216 to a single `'` in the word "companion's".
  {
    const src = "--[[ The companion's golem ops.\n  More prose. ]]\nlocal s = \"Golem\"\n";
    check('luau long comment: the body is blanked', !/companion/.test(blankComments(src, { luau: true })));
    check('luau long comment: the literal after it is seen', texts(src, 'a.luau').includes('"Golem"'));
    check('luau long comment body is not a literal',
      !texts(src, 'a.luau').some((t) => /companion/.test(t)));
    check('luau long comment: no phantom multi-line string', noMultilineQuote(src, 'a.luau'));
  }
  // 6b. `--[=[ … ]=]` is the same comment with a level, and closes only on its own level.
  {
    const src = "--[=[ don't stop ]] still comment ]=]\nlocal s = \"Golem\"\n";
    check('luau levelled long comment: the body is blanked', !/still comment/.test(blankComments(src, { luau: true })));
    check('luau levelled long comment: the literal after it is seen', texts(src, 'a.luau').includes('"Golem"'));
  }
  // 7. A Luau long STRING is a literal and must survive.
  check('luau long string is a literal', texts('local s = [[Golem]]\n', 'a.luau').includes('[[Golem]]'));
  // 8. JSX close tags are not regexes — `</div>` must not open one.
  {
    const src = 'const x = <div className="a" />;\nconst label = "Golem";\n';
    check('tsx: self-closing tag is not a regex', texts(src, 'a.tsx').includes('"Golem"'));
  }
  // 8b. THE BACKSTOP. An apostrophe in JSX prose is not an opening quote — admin.tsx:820 lost the
  //     next 29 lines to `this tab's sessionStorage`.
  {
    const src = "const x = <span>kept in this tab's store</span>;\n// golem was here\nconst s = 1;\n";
    check('tsx: a JSX apostrophe does not swallow the next line',
      !/golem/i.test(blankComments(src, {})), JSON.stringify(blankComments(src, {}).split('\n')[1]));
  }
  // 8c. …while an ESCAPED quote inside a string still does not end it, which is the property the
  //     backslash handling exists for and the one the backstop must not trample.
  {
    const src = "const s = 'it\\'s Golem';\n// golem here\nconst t = 1;\n";
    check('escaped quote does not end the string', texts(src, 'a.ts').includes("'it\\'s Golem'"),
      JSON.stringify(texts(src, 'a.ts')));
    check('escaped quote: the comment after it is still blanked', !/golem here/.test(blankComments(src, {})));
  }
  // 8d. PYTHON. `#` is a comment there and nothing at all in TypeScript, and a docstring is a
  //     quote that legitimately spans lines — the one case the newline backstop must not close.
  {
    const src = '# golem lived here\nBASE = "Golem ships"\n';
    check('py: a # comment is blanked', !/golem lived/.test(blankComments(src, { py: true })));
    check('py: the literal after it is seen', texts(src, 'a.py').includes('"Golem ships"'));
    check('py: # is NOT a comment in TypeScript', texts('const s = "#golem";\n', 'a.ts').includes('"#golem"'));
  }
  {
    const src = '"""Talk to Golem.\n\nSecond line.\n"""\nX = "after"\n';
    check('py: a docstring is one literal, not a mis-scan',
      texts(src, 'a.py').some((t) => t.startsWith('"""') && /Golem/.test(t)), JSON.stringify(texts(src, 'a.py')));
    check('py: the assignment after a docstring is still seen', texts(src, 'a.py').includes('"after"'));
  }
  {
    // A `#` inside a string is not a comment, so the literal must survive intact.
    const src = 'X = "golem#1"\n# golem lived here\n';
    check('py: # inside a string does not start a comment', texts(src, 'a.py').includes('"golem#1"'));
    check('py: the comment after that string is still blanked', !/golem lived/.test(blankComments(src, { py: true })));
  }
  // 8e. ASTRO. The markup is prose, so the whole file counts — but not the two things the build
  //     deletes, and very much still the one it keeps.
  {
    const withJsx = '<p>Apple</p>\n{/* it used to say Golem */}\n<p>Two</p>\n';
    check('astro: a {/* … */} comment is not shipped prose', !/golem/i.test(texts(withJsx, 'a.astro').join('')));
    check('astro: blanking a comment preserves the line count',
      texts(withJsx, 'a.astro')[0].split('\n').length === withJsx.split('\n').length);
    check('astro: the markup around it is still prose',
      /Apple/.test(texts(withJsx, 'a.astro').join('')));
    const frontmatter = '---\nconst x = 1; // Golem lived here\n---\n<p>Apple</p>\n';
    check('astro: a frontmatter // comment is not shipped prose', !/golem/i.test(texts(frontmatter, 'a.astro').join('')));
    const html = '<p>Apple</p>\n<!-- Golem -->\n';
    check('astro: an HTML comment IS shipped and still counts', /Golem/.test(texts(html, 'a.astro').join('')));
    const copy = '<p>Built with Golem</p>\n';
    check('astro: ordinary copy still counts', /Golem/.test(texts(copy, 'a.astro').join('')));
  }
  // 9. Comments are still excluded, which is the property the blanking existed for.
  check('line comment is not a literal', !texts("// Golem was here\nconst a = 1;\n", 'a.ts').some((t) => /Golem/.test(t)));
  // 10. The exception list still masks, and still only masks what it names.
  check('exempt masks golem.v1', !/golem/i.test(maskExempt("'golem.v1'")));
  check('exempt does not mask prose', /golem/i.test(maskExempt("'Built with Golem'")));
  // 10b. A SCOPED entry must stay scoped. `'golem'` is a deployment name on two lines of two files
  //      and a defect everywhere else; if this ever passes unscoped the program has gone blind to
  //      the bare word.
  check('scoped exempt does not fire without context', /golem/i.test(maskExempt("'golem'")));
  check('scoped exempt does not fire on the wrong file',
    /golem/i.test(maskExempt("'golem'", { rel: 'apps/web/src/app.tsx', line: "const BILLING_WORKER_NAME = 'golem'" })));
  check('scoped exempt does not fire on the wrong line',
    /golem/i.test(maskExempt("'golem'", { rel: 'apps/worker/src/env.ts', line: "const toast = 'golem'" })));
  check('scoped exempt fires where its proof holds',
    !/golem/i.test(maskExempt("'golem'", { rel: 'apps/worker/src/env.ts', line: "  BILLING_WORKER_NAME?: 'apple' | 'golem';" })));
  // 10c. The deployed bundle has no file path, so a scoped entry must not apply to it.
  check('scoped exempt never applies to the deployed bundle',
    /golem/i.test(maskExempt('window.brand="golem"')));

  if (fails.length) {
    for (const f of fails) console.error(`  SELFTEST FAIL ${f}`);
    console.error(`check-rebrand: SELFTEST FAIL — ${fails.length} of the scanner's own properties do not hold, so no number below this line is evidence`);
    process.exit(2);
  }
  return ran;
}

const selftestCases = selftest();

/* ------------------------------------------------------------- the deployed half --- */

/** The nine-plus prose routes, from the live sitemap; the hard-coded list is the fallback. */
const KNOWN_ROUTES = [
  '/', '/pricing/', '/changelog/', '/status/', '/privacy/', '/terms/', '/404',
  '/docs/', '/docs/billing/', '/docs/build-from-source/', '/docs/connect/',
  '/docs/credits-and-limits/', '/docs/faq/', '/docs/getting-started/', '/docs/modes/',
  '/docs/plugin/', '/docs/privacy-and-data/', '/docs/troubleshooting/', '/docs/updating/',
];

async function sitemapRoutes() {
  try {
    const res = await fetch(`${ORIGIN}/sitemap-0.xml`);
    if (!res.ok) return KNOWN_ROUTES;
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => { try { return new URL(m[1]).pathname; } catch { return null; } })
      .filter(Boolean);
    // 404 is not in a sitemap and is a page a stranger reaches by accident, so it is added by hand.
    return locs.length ? [...new Set([...locs, '/404'])] : KNOWN_ROUTES;
  } catch { return KNOWN_ROUTES; }
}

/** The `/app/assets/...` paths an /app HTML document references. This is the deployment's identity. */
const assetPathsIn = (html) =>
  [...new Set([...html.matchAll(/"(\/app\/assets\/[A-Za-z0-9._-]+\.(?:js|css))"/g)].map((m) => m[1]))].sort();

async function fetchBundle() {
  const html = await (await fetch(`${ORIGIN}/app`)).text();
  const assets = assetPathsIn(html);
  let all = html;
  for (const a of assets) {
    const res = await fetch(`${ORIGIN}${a}`);
    if (!res.ok) throw new Error(`${a} -> ${res.status}`);
    all += await res.text();
  }
  // §6.10's THIRD denominator: the rendered HTML of every sitemap route. The SPA shell is one page
  // of the deployed site; the eighteen marketing and docs routes are the rest of it, and they are
  // where the prose lives.
  const routes = await sitemapRoutes();
  const fetched = [];
  for (const r of routes) {
    const res = await fetch(`${ORIGIN}${r}`);
    if (!res.ok && res.status !== 404) throw new Error(`${r} -> ${res.status}`);
    all += await res.text();
    fetched.push(r);
  }
  const header = `${PROVENANCE}${JSON.stringify({ origin: ORIGIN, at: new Date().toISOString(), assets, routes: fetched })}\n`;
  mkdirSync(dirname(BUNDLE), { recursive: true });
  writeFileSync(BUNDLE, header + all);
  console.log(`  captured ${assets.length} bundle asset(s) and ${fetched.length} rendered route(s) from ${ORIGIN}`);
  return header + all;
}

/** What a capture says it is a capture of — or null when it does not say. */
function provenanceOf(text) {
  if (!text.startsWith(PROVENANCE)) return null;
  try { return JSON.parse(text.slice(PROVENANCE.length, text.indexOf('\n'))); } catch { return null; }
}

/*
 * A CAPTURE THAT CANNOT BE DATED IS NOT EVIDENCE ABOUT PRODUCTION.
 *
 * The file on disk when this was written referenced index-Cj9mt5rz.js, index-B6-LuWK4.css and
 * react-D1cdeanG.js. The live deployment serves index-CPGoixus.js, index-CauSDkTI.css and
 * react-CbGl50uX.js. Three of five assets differ: the capture describes a build nobody is served,
 * and the program read it without a word and printed a verdict about "the deployed bundle". That
 * is the exact shape this repository calls a failure to observe rendered as an observation, and it
 * is what BLOCKERS.md's closed rebrand row was resting on.
 *
 * So the capture now carries a provenance line, and the default run checks it against the live
 * /app document — one request, the smallest thing that can tell the difference. `--offline` skips
 * the check AND gives up the claim: the headline stops mentioning production.
 */
async function verifyCapture(text) {
  const prov = provenanceOf(text);
  if (!prov) {
    return ['THE CAPTURED BUNDLE CARRIES NO PROVENANCE — it does not record which deployment it came '
      + 'from or when, so it cannot support a statement about production. Re-run with --deployed.'];
  }
  console.log(`  capture: ${prov.origin} at ${prov.at}, ${prov.assets?.length ?? 0} asset(s), ${prov.routes?.length ?? 0} route(s)`);
  if (prov.origin !== ORIGIN) {
    return [`THE CAPTURED BUNDLE IS FROM ${prov.origin}, NOT ${ORIGIN} — it measures a different deployment. Re-run with --deployed.`];
  }
  if (!prov.routes?.length) {
    return ['THE CAPTURED BUNDLE HOLDS NO RENDERED ROUTES — §6.10 names them as a denominator and this capture covers only /app. Re-run with --deployed.'];
  }
  let live;
  try { live = await (await fetch(`${ORIGIN}/app`)).text(); }
  catch (e) {
    return [`COULD NOT REACH ${ORIGIN} TO DATE THE CAPTURE (${e.message}) — so nothing below is a `
      + 'statement about production. Pass --offline to check the source half alone and say so.'];
  }
  const now = assetPathsIn(live);
  const then = [...(prov.assets ?? [])].sort();
  const gone = then.filter((a) => !now.includes(a));
  const added = now.filter((a) => !then.includes(a));
  if (gone.length || added.length) {
    return [
      `THE CAPTURED BUNDLE IS STALE — ${gone.length} asset(s) it holds are no longer served and ${added.length} `
      + 'live asset(s) are not in it, so it describes a deployment that has been replaced. Re-run with --deployed.',
      ...gone.slice(0, 5).map((a) => `  captured, no longer live: ${a}`),
      ...added.slice(0, 5).map((a) => `  live, not captured: ${a}`),
    ];
  }
  console.log('  capture verified against the live /app document — same asset set');
  return [];
}

const deployed = REFETCH
  ? await fetchBundle()
  : existsSync(BUNDLE) ? readFileSync(BUNDLE, 'utf8') : null;
const captureProblems = OFFLINE || deployed === null ? [] : await verifyCapture(deployed);

/* --------------------------------------------------------------- the source half --- */

// Exactly §6.10's denominator. Markdown is NOT in it, and adding it was a mistake worth recording:
// it pulled in docs/MISSION-PROMPT.md — a file this agent was instructed to copy verbatim, which
// necessarily contains the old name — and README.md, which is prose for a developer rather than
// copy for a user. A checker that flags the instructions it was given is measuring the wrong thing.
const SOURCE_GLOBS = ['*.ts', '*.tsx', '*.astro', '*.luau'];
//
// AND THE SHIPPED CLIENTS, WHICH ARE NEITHER .ts NOR .luau AND WERE THEREFORE NOT LOOKED AT.
//
// packages/sdk ships three language clients and a CLI. The Luau one is a .luau and was in the
// denominator; the JavaScript one is .mjs and the Python one is .py, and this program had never
// opened either. That is not a gap in coverage of internal code — it is the SDK a stranger is
// handed, and `apple --help` printed "then GOLEM_TOKEN" to everyone who ran it while this
// checker reported the tree clean. A denominator that omits the shipped product cannot support
// the sentence REBRAND COMPLETE.
//
// The rest of the tree's .mjs is deliberately NOT here: 271 of its hits are test fixtures —
// `golem.test` hostnames and tmpdir prefixes — which are neither prose nor shipped, and a checker
// whose signal is mostly noise gets muted. What is in scope is what package.json's `files` field
// puts in the tarball.
const SHIPPED_CLIENT_GLOBS = [
  'packages/sdk/src/*.mjs',
  'packages/sdk/bin/*.mjs',
  'packages/sdk/python/apple_sdk/*.py',
];
const lsFiles = (globs) => git(['ls-files', ...globs]).split('\n').filter(Boolean);
const shipped = lsFiles(SHIPPED_CLIENT_GLOBS);
// A GLOB THAT MATCHES NOTHING IS THIS PROGRAM'S OWN FAILURE MODE, one directory rename away: move
// or rename the SDK and the clients leave the denominator in silence while the headline keeps its
// wording. Refused rather than reported, because there is no honest verdict over a denominator
// that lost a limb.
if (!shipped.length) {
  console.error('check-rebrand: the shipped-client globs match no tracked file — packages/sdk has moved, '
    + 'and the clients a stranger is handed are no longer in the denominator. Re-aim SHIPPED_CLIENT_GLOBS.');
  process.exit(2);
}
const sources = [...new Set([...lsFiles(SOURCE_GLOBS), ...shipped])]
  // The checker names every exempt identifier, so it would flag itself.
  .filter((f) => f !== 'scripts/check-rebrand.mjs')
  //[[ EVIDENCE IS A RECORD OF WHAT HAPPENED, NOT A SURFACE THE PRODUCT SHIPS.
  //
  //   SOURCE_GLOBS takes every tracked `.luau`, and on 2026-09-20 that swept in
  //   docs/evidence/ui-showcase/*.luau — Luau the MODEL generated, captured so the owner could look
  //   at what it builds. One of them is a gacha screen whose rarity table contains
  //   `Epic — Ember Golem`, and the checker read that as the product calling itself Golem.
  //
  //   It is not. A golem is a stock fantasy monster; Minecraft ships iron ones. I checked whether
  //   the model had instead echoed a residual product name out of its own inputs, because that
  //   WOULD be a real leak — the five hits in prompts.ts are all TypeScript identifiers
  //   (`GolemMode`, `@golem/shared`) that the model never sees, and the 120 in
  //   packages/corpus/data/sources.json are licence prose in a build-time ingestion manifest read
  //   by packages/corpus/src/*.mjs and by nothing at inference. So the model invented a monster.
  //
  //   The deeper reason to exclude these rather than edit them: an evidence file is a record.
  //   Rewriting one so a checker goes green falsifies the record, which is the failure this whole
  //   repository is organised against. The product's own surface is unaffected — apps/, packages/
  //   and the shipped SDK clients are all still in the denominator, and the deployed half still
  //   reads the live bundle. ]]
  .filter((f) => !f.startsWith('docs/evidence/'));

const capturedRoutes = deployed ? provenanceOf(deployed)?.routes?.length ?? 0 : 0;
console.log(
  `DENOMINATOR ${sources.length} files + ${OFFLINE
    ? 'NO DEPLOYED HALF (--offline)'
    : deployed ? `${deployed.length} bytes of deployed capture (${capturedRoutes} rendered route(s))` : 'NO DEPLOYED BUNDLE'}; ` +
  `EXCEPTIONS ${EXEMPT.length}: the closed §12.5 identifier list; SELFTEST ${selftestCases} properties`,
);

/* ------------------------------------------------------------------ the check --- */

const problems = [];
let exemptHits = 0;

for (const rel of sources) {
  let src;
  try { src = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; }
  const srcLines = src.split('\n');
  for (const lit of stringLiterals(src, rel)) {
    const before = (lit.text.match(/golem/gi) ?? []).length;
    if (!before) continue;
    // The line the literal STARTS on, which is what a scoped exemption's `line` proof is about.
    const startLine = src.slice(0, lit.offset).split('\n').length;
    const masked = maskExempt(lit.text, { rel, line: srcLines[startLine - 1] ?? '' });
    const after = [...masked.matchAll(/golem/gi)];
    exemptHits += before - after.length;
    for (const m of after) {
      const line = src.slice(0, lit.offset + m.index).split('\n').length;
      const text = srcLines[line - 1]?.trim().slice(0, 90) ?? '';
      problems.push(`${rel}:${line} — ${text}`);
    }
  }
}

problems.push(...captureProblems);

if (OFFLINE) {
  // Nothing is pushed: --offline is not a failure, it is a SMALLER CLAIM, and the headline below
  // says so. What must never happen is the full sentence over half the evidence.
} else if (deployed === null) {
  problems.push(
    'NO DEPLOYED BUNDLE CAPTURED — run with --deployed. A rebrand complete in git and absent from ' +
    'production is a plan, not a rebrand, and this checker cannot tell the difference without it.',
  );
}
// NOT `if (deployed !== null)`. In --offline the capture on disk is NOT READ AT ALL, and that is
// the difference between a smaller claim and a dishonest one: a stale capture scanned offline would
// contribute findings — or, worse, contribute none — under a headline that says the deployed site
// was not checked. The mode's sentence and the mode's behaviour have to be the same thing.
if (!OFFLINE && deployed !== null) {
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
  // TWO DIFFERENT SENTENCES, because they are two different claims. The offline one does not say
  // "the deployed" anything: the whole defect being closed here is a headline that covered ground
  // the program had not walked.
  //[[ THIS READS THE WORKING TREE. CI CHECKS OUT THE COMMIT.
  //
  //   On 2026-09-20 this printed REBRAND COMPLETE four times over a fix that was never staged.
  //   frontier-harness.luau carried __APPLE_FRONTIER_LOOP__ on disk and __GOLEM_FRONTIER_LOOP__ in
  //   HEAD, and assets.ts the same. Locally green for hours; CI red every run, with the two
  //   verdicts worded identically. It was reported as done in a checkpoint report.
  //
  //   The verdict now carries how many of the files it just read differ from HEAD. It does not
  //   FAIL on that — a dirty tree is the normal state of this repository and several lanes are
  //   editing it right now — but nobody can quote a green from here without seeing whether the
  //   green describes bytes that exist in any commit. ]]
  let uncommitted = 0;
  try {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', ...sources.map((f) => (typeof f === 'string' ? f : f.path))],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    uncommitted = out.split('\n').filter(Boolean).length;
  } catch {
    uncommitted = -1; // no git, or a path list git would not take. Reported as unknown, not as zero.
  }
  const tree = uncommitted === 0 ? 'and every one of them matches HEAD'
    : uncommitted > 0 ? `BUT ${uncommitted} of them differ from HEAD — this verdict describes the working tree, and CI checks out the commit`
      : 'and whether they match HEAD could not be determined';

  console.log(OFFLINE
    ? `REBRAND COMPLETE IN SOURCE — ${sources.length} tracked files carry no user-visible Golem, ${tree}. THE DEPLOYED SITE WAS NOT CHECKED (--offline).`
    : `REBRAND COMPLETE — ${sources.length} source files, the deployed bundle and ${capturedRoutes} rendered route(s) carry no user-visible Golem, ${tree}`);
  process.exit(0);
}

for (const p of problems) console.error(`  ${p.startsWith('  ') ? p : `BROKEN: ${p}`}`);
console.log(`REBRAND INCOMPLETE — ${problems.length} finding(s)`);
process.exit(1);
