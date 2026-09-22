/**
 * THE VENDORED AI ELEMENTS ARE WHAT THE NOTICE SAYS THEY ARE.
 *
 * The chat surface is built from Vercel AI Elements (Apache-2.0), adapted for this app: React 18,
 * no Tailwind, and none of the npm packages upstream imports. "Adapted" is only a claim unless it
 * can be checked, so every adapted file keeps its verbatim upstream original beside it
 * (components/ai-elements/upstream/*.txt) and a row in NOTICE naming the upstream path, the hash
 * and the substitutions. This suite holds the three halves together:
 *
 *   * the copy is the file the NOTICE row names — its sha256 is the row's;
 *   * the adaptation still offers everything upstream offered — every export name, read out of
 *     the copy itself rather than listed here, is still exported by the local file;
 *   * nothing under components/ai-elements/ reaches for an npm package this app does not install:
 *     the only bare imports allowed are react and react-dom, read out of the import statements.
 *
 * Plus the licence: the upstream notice, and the full Apache-2.0 text that notice points at.
 *
 * Every list below is derived — from NOTICE, from the copies, from a directory walk — and each
 * derivation asserts it found something, so a parser that stopped matching fails loudly rather
 * than checking nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, 'src', 'components', 'ai-elements');
const NOTICE = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
const COMMIT = '6a9d5b1822ffb10bba4bd97175f01edd7d8651cd';

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const decomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** NOTICE rows: `FILE <local>` … `END`, with `upstream:`, `copy:`, `sha256:` and substitutions. */
function rows(notice = NOTICE) {
  const out = [];
  for (const m of notice.matchAll(/^FILE (\S+)\n([\s\S]*?)^END$/gm)) {
    const body = m[2];
    const field = (name) => new RegExp(`^\\s+${name}: (.+)$`, 'm').exec(body)?.[1]?.trim();
    const subs = body.slice(body.indexOf('substitutions:') + 'substitutions:'.length);
    out.push({ local: m[1], upstream: field('upstream'), copy: field('copy'), sha: field('sha256'), subs: body.includes('substitutions:') ? subs : '' });
  }
  return out;
}

/** Every name a module exports, read from its text. */
function exportNames(src) {
  const code = decomment(src);
  const names = new Set();
  for (const m of code.matchAll(/\bexport\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of code.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const spec = part.trim().replace(/^type\s+/, '');
      if (!spec) continue;
      const alias = /\bas\s+([A-Za-z_$][\w$]*)$/.exec(spec);
      names.add(alias ? alias[1] : spec.split(/\s+/)[0]);
    }
  }
  return names;
}

/** Every module specifier a file imports or re-exports from, read from its import statements. */
function specifiers(src) {
  const code = decomment(src);
  const out = [];
  for (const m of code.matchAll(/\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

const isBare = (spec) => !spec.startsWith('.') && !spec.startsWith('/');
const ALLOWED_PACKAGES = /^(?:react|react-dom)(?:\/.*)?$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'upstream') continue;
      walk(path, out);
    } else if (/\.(?:ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

// ------------------------------------------------------------------ the parsers ---

test('the parsers read something, so nothing below can pass over an empty list', () => {
  const found = rows();
  assert.ok(found.length >= 14, `NOTICE yielded only ${found.length} FILE row(s)`);
  for (const row of found) {
    assert.ok(row.upstream && row.copy && row.sha, `${row.local}: a row is missing upstream, copy or sha256`);
    assert.match(row.sha, /^[0-9a-f]{64}$/, `${row.local}: sha256 is not a sha256`);
    assert.ok(row.subs.trim().length > 0, `${row.local}: no substitutions listed — say what changed`);
  }
  assert.deepEqual([...exportNames('export const A = 1;\nexport { B, type C, D as E };\nexport function F() {}')].sort(), ['A', 'B', 'C', 'E', 'F']);
  assert.deepEqual(specifiers("import x from 'a';\nimport './b.css';\nexport { y } from \"c\";\n// import z from 'd'"), ['a', 'c', './b.css']);
});

// --------------------------------------------------------------- the copies ---

test('the NOTICE names the one upstream revision every copy comes from', () => {
  assert.match(NOTICE, /https:\/\/github\.com\/vercel\/ai-elements/);
  assert.match(NOTICE, new RegExp(COMMIT));
  assert.match(NOTICE, /Copyright 2023 Vercel, Inc\./);
  assert.match(NOTICE, /Apache License, Version 2\.0/);
});

test('every adapted file has its verbatim upstream copy, and the copy is the one the row names', () => {
  for (const row of rows()) {
    const local = join(ROOT, row.local);
    const copy = join(ROOT, row.copy);
    assert.ok(existsSync(local), `${row.local}: NOTICE lists a file that is not there`);
    assert.ok(existsSync(copy), `${row.local}: its upstream copy ${row.copy} is missing`);
    assert.match(row.copy, /^upstream\/.+\.txt$/, `${row.local}: the copy must be a .txt under upstream/, out of the build`);
    assert.ok(row.copy.endsWith(`${row.upstream.split('/').pop()}.txt`), `${row.local}: the copy is not named after ${row.upstream}`);
    assert.equal(sha256(copy), row.sha, `${row.local}: ${row.copy} is not the upstream file the NOTICE row hashes`);
  }
});

test('every upstream copy on disk has a NOTICE row, so no adaptation goes unrecorded', () => {
  const listed = new Set(rows().map((row) => row.copy));
  const onDisk = [];
  const collect = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) collect(path);
      else if (entry.endsWith('.txt')) onDisk.push(relative(ROOT, path));
    }
  };
  collect(join(ROOT, 'upstream'));
  assert.ok(onDisk.length >= 14, `only ${onDisk.length} upstream copies found`);
  for (const copy of onDisk) assert.ok(listed.has(copy), `${copy} is on disk with no NOTICE row`);
});

// -------------------------------------------------------------- the exports ---

test('every export of every upstream file is still exported by its adaptation', () => {
  for (const row of rows()) {
    const upstream = exportNames(readFileSync(join(ROOT, row.copy), 'utf8'));
    const local = exportNames(readFileSync(join(ROOT, row.local), 'utf8'));
    assert.ok(upstream.size > 0, `${row.copy}: no exports parsed — the reader has gone blind`);
    const missing = [...upstream].filter((name) => !local.has(name));
    assert.deepEqual(missing, [], `${row.local} no longer exports upstream's ${missing.join(', ')}`);
  }
});

// -------------------------------------------------------------- the imports ---

test('nothing under ai-elements imports an npm package other than react and react-dom', () => {
  const files = walk(ROOT);
  assert.ok(files.length >= 20, `the walk found only ${files.length} file(s)`);
  let bare = 0;
  const offenders = [];
  for (const file of files) {
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (!isBare(spec)) continue;
      bare++;
      if (!ALLOWED_PACKAGES.test(spec)) offenders.push(`${relative(ROOT, file)} imports ${spec}`);
    }
  }
  assert.ok(bare > 10, 'no react imports found at all — the import reader is not reading');
  assert.deepEqual(offenders, [], 'this app installs none of these; add a local stand-in instead');
});

test('every npm package an upstream file imports is accounted for in its NOTICE row', () => {
  // Derived from the copy's own imports: a substitution nobody wrote down is a change a reviewer
  // diffing the two files would have to reverse-engineer.
  let checked = 0;
  for (const row of rows()) {
    for (const spec of specifiers(readFileSync(join(ROOT, row.copy), 'utf8'))) {
      if (!isBare(spec) || ALLOWED_PACKAGES.test(spec)) continue;
      checked++;
      assert.ok(row.subs.includes(spec), `${row.local}: upstream imports ${spec}, and the NOTICE row does not say what replaced it`);
    }
  }
  assert.ok(checked > 20, `only ${checked} upstream package import(s) found`);
});

test('an adapted file keeps no import of the package it replaced', () => {
  for (const row of rows()) {
    const upstreamPackages = specifiers(readFileSync(join(ROOT, row.copy), 'utf8')).filter((s) => isBare(s) && !ALLOWED_PACKAGES.test(s));
    const local = specifiers(readFileSync(join(ROOT, row.local), 'utf8'));
    for (const pkg of upstreamPackages) assert.ok(!local.includes(pkg), `${row.local} still imports ${pkg}`);
  }
});

// ------------------------------------------------------------------ licence ---

test('the upstream licence notice and the full Apache-2.0 text both ship with the code', () => {
  const notice = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
  assert.match(notice, /Copyright 2023 Vercel, Inc\./);
  assert.match(notice, /http:\/\/www\.apache\.org\/licenses\/LICENSE-2\.0/);
  const full = readFileSync(join(ROOT, 'LICENSE-APACHE-2.0'), 'utf8');
  assert.match(full, /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/);
  assert.match(full, /4\. Redistribution\./);
  assert.match(full, /END OF TERMS AND CONDITIONS/);
  // A tripwire, deliberately exact: the canonical text from apache.org does not change, so any
  // difference is an edit to a licence, which needs a human.
  assert.equal(sha256(join(ROOT, 'LICENSE-APACHE-2.0')), 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30');
});
