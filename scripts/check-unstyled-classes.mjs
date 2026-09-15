#!/usr/bin/env node
// Every class the app draws with has a rule somewhere.
//
// THREE PANELS HAVE NOW SHIPPED WITH NO STYLES AT ALL. `mb__` was caught by a test written for
// that one panel. `rk__` and `asrc__` were not: `grep -c 'rk__' styles.css` returned ZERO, and the
// owner opened his own settings page and read
//
//     "Read your assetsApple can look up things you already own"
//     "The Apple libraryApple picks from assets it has already gathered"
//
// Both panels are built from <span>s. With no rules every span stays inline and each label runs
// into its own description. Nothing failed: tsc passed, the tests passed, the build passed, the
// page rendered. A selector that matches nothing is not an error in any of them.
//
// WHAT IT CHECKS. Every `className="… foo__bar …"` in the app's components and routes, against
// every selector in its stylesheets. A BEM-ish prefixed class (`foo__bar`, `foo--bar`) is a class
// somebody wrote CSS for, or meant to. Plain single words are excluded — `btn`, `muted` and
// `card` are shared and already covered, and including them would drown the real finding.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps', 'web', 'src');

function walk(dir, test, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test.test(e.name)) out.push(p);
  }
  return out;
}

/* ------------------------------------------------------------------ the rules --- */

const sheets = walk(WEB, /\.css$/);
let css = sheets.map((f) => readFileSync(f, 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
const styled = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

/* ------------------------------------------------------------------ the usage --- */

const used = new Map();
/** Template stems: `foo__bar--` from a `${}` class. Satisfied by any selector starting with it. */
const stems = new Map();
for (const file of walk(WEB, /\.(tsx|ts)$/)) {
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  // className="a b", className={`a ${x}`}, className={'a'} — the literal parts of each.
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
    for (const cls of (m[1] ?? m[2] ?? m[3] ?? '').split(/[\s${}?:'"+]+/)) {
      //[[ A TRAILING `--` IS A TEMPLATE STEM, NOT A CLASS.
      //
      //   `className={`gx-playtest__chip--${state}`}` has the literal half `gx-playtest__chip--`,
      //   and no such class exists — the real ones are `…--running`, `…--passed`. The first version
      //   of this file reported both stems as unstyled and I nearly wrote two rules for classes
      //   that can never appear, which is a checker inventing work. A stem is satisfied when SOME
      //   selector begins with it, because that is the most this file can know without evaluating
      //   the template.
      if (/(__|--)$/.test(cls)) {
        if (![...styled].some((sel) => sel.startsWith(cls))) stems.set(cls, file);
        continue;
      }
      // Only prefixed classes otherwise. A bare word is a shared utility and covered elsewhere.
      if (!/^[a-z][\w-]*(__|--)[\w-]+$/.test(cls)) continue;
      if (!used.has(cls)) used.set(cls, file);
    }
  }
}

/* --------------------------------------------------------------------- verdict --- */

// A WALK THAT FOUND NOTHING IS A BROKEN CHECK, and both halves can go blind independently: no
// stylesheets means everything looks unstyled, no classNames means everything looks fine.
if (styled.size === 0) {
  console.error(`UNSTYLED CHECK IS BLIND — parsed no selectors out of ${sheets.length} stylesheet(s).`);
  process.exit(2);
}
if (used.size === 0) {
  console.error('UNSTYLED CHECK IS BLIND — found no prefixed classNames in apps/web/src.\n'
    + 'Either the app stopped using them, or the matcher stopped matching them.');
  process.exit(2);
}

const orphans = [...[...used].filter(([cls]) => !styled.has(cls)), ...stems];

if (!orphans.length) {
  console.log(`CLASSES OK — all ${used.size} prefixed class(es) and ${stems.size === 0 ? 'every' : stems.size} `
    + `template stem(s) used in apps/web/src have a rule among ${sheets.length} stylesheet(s) `
    + `(${styled.size} selectors).`);
  process.exit(0);
}

// GROUPED BY PREFIX, because that is the unit that goes missing. One orphan is a typo; eleven
// sharing a prefix is a panel nobody ever drew, and the two want different reactions.
const byPrefix = new Map();
for (const [cls, file] of orphans) {
  const prefix = cls.split(/__|--/)[0];
  if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
  byPrefix.get(prefix).push({ cls, file });
}

console.error(`UNSTYLED CLASSES — ${orphans.length} class(es) the app draws with have no rule:\n`);
for (const [prefix, list] of [...byPrefix].sort((a, b) => b[1].length - a[1].length)) {
  const whole = list.length >= 4 ? '  ← a whole panel with no stylesheet' : '';
  console.error(`    ${prefix}__ — ${list.length}${whole}`);
  for (const o of list.slice(0, 6)) console.error(`        ${o.cls}   ${relative(ROOT, o.file)}`);
  if (list.length > 6) console.error(`        … ${list.length - 6} more`);
}
console.error('\nA selector that matches nothing fails no typecheck, no test and no build. It renders,');
console.error('and every span stays inline: "Read your assetsApple can look up things you already own".');
process.exit(1);
