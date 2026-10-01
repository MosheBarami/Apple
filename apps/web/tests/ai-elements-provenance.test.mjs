/**
 * THE AI ELEMENTS ARE THE GENUINE UPSTREAM FILES, AND THE NOTICE SAYS WHICH.
 *
 * Owner order (2026-10-01): the chat is built from the real Vercel AI Elements (Apache-2.0), not a
 * re-implementation. scripts/vendor-ai-elements.mjs copies each component from upstream
 * packages/elements/src, and the shadcn/ui primitives they import from packages/shadcn-ui, the way
 * the AI Elements CLI installs them: upstream's bytes with the CLI's import alias. This suite holds
 * that claim to something checkable:
 *
 *   * every vendored file has a NOTICE row naming its upstream path and the sha256 of the UPSTREAM
 *     bytes, and the local file — with the alias (and any patch the row records) reversed — hashes
 *     to exactly that, so a local edit to a vendored file cannot go unrecorded;
 *   * every file on disk under ai-elements/ and ui/ has a row, so nothing home-made hides beside them;
 *   * every npm package they import is one apps/web actually declares (no stand-ins, no phantom deps);
 *   * the licence: the upstream notice and the full Apache-2.0 text it points at.
 *
 * Every list is derived — from NOTICE, from a directory walk, from the import statements — and each
 * derivation asserts it found something, so a parser that stopped matching fails loudly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toLocal, toUpstream, PATCHES } from '../scripts/vendor-ai-elements.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, 'src');
const ROOT = join(SRC, 'components', 'ai-elements');
const NOTICE = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
const COMMIT = '6a9d5b1822ffb10bba4bd97175f01edd7d8651cd';
const PKG = JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf8'));

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const decomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** NOTICE rows: `FILE <path under src>` … `END`. */
function rows(notice = NOTICE) {
  return [...notice.matchAll(/^FILE (\S+)\n([\s\S]*?)^END$/gm)].map((m) => ({
    local: m[1],
    upstream: /^\s+upstream: (.+)$/m.exec(m[2])?.[1]?.trim(),
    sha: /^\s+sha256: (.+)$/m.exec(m[2])?.[1]?.trim(),
    patched: /^\s+patch: /m.test(m[2]),
  }));
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

/** The package a bare specifier names: `@scope/name` or `name`. */
const packageOf = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
const isBare = (spec) => !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('@/');

const tsxIn = (dir) => readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/.test(f)).map((f) => join(dir, f));

const ROWS = rows();

test('the parsers read something, so nothing below can pass over an empty list', () => {
  assert.ok(ROWS.length >= 50, `NOTICE yielded only ${ROWS.length} FILE row(s)`);
  for (const row of ROWS) {
    assert.ok(row.upstream && row.sha, `${row.local}: a row is missing upstream or sha256`);
    assert.match(row.sha, /^[0-9a-f]{64}$/, `${row.local}: sha256 is not a sha256`);
  }
  assert.deepEqual(specifiers("import x from 'a';\nimport './b.css';\nexport { y } from \"c\";\n// import z from 'd'"), ['a', 'c', './b.css']);
  assert.equal(packageOf('@radix-ui/react-use-controllable-state'), '@radix-ui/react-use-controllable-state');
  assert.equal(packageOf('motion/react'), 'motion');
  // The reversal is the inverse of the copy, so a hash match means the bytes ARE upstream's.
  const sample = 'import { cn } from "@repo/shadcn-ui/lib/utils";\nimport { Button } from "@repo/shadcn-ui/components/ui/button";\n';
  assert.equal(toUpstream(toLocal(sample, 'x.tsx'), 'x.tsx'), sample);
  for (const [local, patches] of Object.entries(PATCHES)) {
    assert.ok(ROWS.some((row) => row.local === local && row.patched), `${local} is patched by the script and its NOTICE row does not say so`);
    assert.ok(patches.length > 0);
  }
});

test('the NOTICE names the one upstream revision every copy comes from', () => {
  assert.match(NOTICE, /https:\/\/github\.com\/vercel\/ai-elements/);
  assert.match(NOTICE, new RegExp(`BEGIN FILES \\(upstream commit ${COMMIT}\\)`));
  assert.match(NOTICE, /Copyright 2023 Vercel, Inc\./);
  assert.match(NOTICE, /Apache License, Version 2\.0/);
  assert.match(NOTICE, /shadcn\/ui is distributed under the MIT License/);
});

test('every vendored file is upstream byte for byte, apart from the alias and the recorded patches', () => {
  for (const row of ROWS) {
    const path = join(SRC, row.local);
    assert.ok(existsSync(path), `${row.local}: NOTICE lists a file that is not there`);
    const back = toUpstream(readFileSync(path, 'utf8'), row.local);
    assert.equal(sha256(back), row.sha, `${row.local} is not the upstream ${row.upstream} its row hashes — edited locally?`);
  }
});

test('every file under ai-elements/ and ui/ is a vendored one with a row — nothing home-made beside them', () => {
  const listed = new Set(ROWS.map((row) => row.local));
  const onDisk = [
    ...tsxIn(ROOT).map((p) => `components/ai-elements/${p.slice(ROOT.length + 1)}`),
    ...tsxIn(join(SRC, 'components', 'ui')).map((p) => `components/ui/${p.slice(join(SRC, 'components', 'ui').length + 1)}`),
  ];
  assert.ok(onDisk.length >= 50, `only ${onDisk.length} files found`);
  assert.deepEqual(onDisk.filter((file) => !listed.has(file)), [], 'a file with no NOTICE row — not upstream');
  // No stylesheet stands in for upstream's Tailwind classes any more.
  assert.deepEqual(readdirSync(ROOT).filter((f) => f.endsWith('.css')), []);
});

test('every npm package a vendored file imports is a dependency apps/web declares', () => {
  const declared = new Set(Object.keys({ ...PKG.dependencies, ...PKG.devDependencies }));
  let bare = 0;
  const missing = [];
  for (const row of ROWS) {
    for (const spec of specifiers(readFileSync(join(SRC, row.local), 'utf8'))) {
      if (!isBare(spec)) continue;
      bare++;
      if (!declared.has(packageOf(spec))) missing.push(`${row.local} imports ${spec}`);
    }
  }
  assert.ok(bare > 100, `only ${bare} package import(s) found — the import reader is not reading`);
  assert.deepEqual(missing, [], 'imported but not declared in apps/web/package.json');
  // The real packages, not stand-ins: the ones upstream's components are built on.
  for (const pkg of ['radix-ui', 'lucide-react', 'streamdown', 'shiki', 'motion', 'use-stick-to-bottom', 'class-variance-authority', 'tailwind-merge']) {
    assert.ok(declared.has(pkg), `${pkg} is not a dependency`);
  }
  assert.ok(declared.has('tailwindcss') && declared.has('@tailwindcss/vite'), 'Tailwind CSS v4 compiles upstream\'s classes');
});

test('the vendored components import their primitives through the CLI alias, never the upstream monorepo path', () => {
  for (const row of ROWS) {
    const specs = specifiers(readFileSync(join(SRC, row.local), 'utf8'));
    assert.equal(specs.some((s) => s.startsWith('@repo/')), false, `${row.local} still imports @repo/…`);
  }
});

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
  assert.equal(sha256(readFileSync(join(ROOT, 'LICENSE-APACHE-2.0'))), 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30');
});
