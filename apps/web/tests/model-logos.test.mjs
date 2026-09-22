/**
 * THE VENDOR MARKS ARE WHAT THE NOTICE SAYS THEY ARE, AND THEY CAN ONLY EVER BE DRAWINGS.
 *
 * The model picker shows each model with its vendor's own mark (owner decision D-BYOK-1). The marks
 * are lobehub's MIT icons, vendored byte for byte into components/ai-elements/logos/, one ASSET row
 * per file in components/ai-elements/NOTICE with its source URL and sha256. This suite holds:
 *
 *   * every file on disk has a row and every row a file, and the hash is the file's;
 *   * each file is one <path> in currentColor — no script, no link, no event handler, no
 *     foreignObject, nothing that could fetch or run;
 *   * logos/marks.ts, which the picker renders from, is exactly what the files say: re-derived here,
 *     so it cannot drift from the hashed bytes;
 *   * the licence ships beside them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WEB } from './ui-bundle.mjs';

const ROOT = join(WEB, 'src', 'components', 'ai-elements');
const LOGOS = join(ROOT, 'logos');
const NOTICE = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const { LOGO_MARKS } = await import(pathToFileURL(join(LOGOS, 'marks.ts')).href);

const rows = [...NOTICE.matchAll(/^ASSET logos\/(\S+)\n\s+source: (\S+)\n\s+sha256: ([0-9a-f]{64})\n^END$/gm)]
  .map((m) => ({ file: m[1], source: m[2], sha: m[3] }));
const files = readdirSync(LOGOS).filter((f) => f.endsWith('.svg')).sort();

test('the reader found the rows and the files, so nothing below passes over an empty list', () => {
  assert.ok(rows.length >= 10, `NOTICE yielded only ${rows.length} ASSET row(s)`);
  assert.ok(files.length >= 10, `only ${files.length} vendored mark(s)`);
});

test('every mark on disk has a row, every row a mark, and the hash is the file\'s', () => {
  assert.deepEqual(rows.map((r) => r.file).sort(), files);
  for (const row of rows) {
    assert.equal(sha256(join(LOGOS, row.file)), row.sha, `${row.file} is not the file its row hashes`);
    assert.equal(row.source, `https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons/${row.file}`);
  }
});

test('each mark is one monochrome path and nothing that could fetch or run', () => {
  for (const file of files) {
    const svg = readFileSync(join(LOGOS, file), 'utf8');
    assert.equal((svg.match(/<path\b/g) ?? []).length, 1, `${file}: expected exactly one <path>`);
    const elements = new Set([...svg.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((m) => m[1]));
    assert.deepEqual([...elements].sort(), ['path', 'svg', 'title'], `${file}: unexpected elements`);
    assert.doesNotMatch(svg, /\son\w+=|href=|<script|foreignObject|url\(/i, `${file}: carries something active`);
    assert.match(svg, /<svg fill="currentColor"/, `${file}: not drawn in currentColor, so it would bring a brand colour in`);
  }
});

test('marks.ts is exactly what the vendored files say', () => {
  const derived = Object.fromEntries(files.map((file) => {
    const svg = readFileSync(join(LOGOS, file), 'utf8');
    return [file.replace(/\.svg$/, ''), {
      title: /<title>([^<]*)<\/title>/.exec(svg)[1],
      viewBox: /viewBox="([^"]+)"/.exec(svg)[1],
      d: /<path d="([^"]+)"/.exec(svg)[1],
    }];
  }));
  assert.deepEqual(LOGO_MARKS, derived);
});

test('the licence ships with the marks, and the NOTICE names where it came from', () => {
  const licence = readFileSync(join(LOGOS, 'LICENSE'), 'utf8');
  assert.match(licence, /^MIT License/);
  assert.match(licence, /Copyright \(c\) 2023 LobeHub/);
  assert.match(NOTICE, /raw\.githubusercontent\.com\/lobehub\/lobe-icons\/[0-9a-f]{40}\/LICENSE/);
  assert.ok(NOTICE.includes(sha256(join(LOGOS, 'LICENSE'))), 'the NOTICE does not carry the licence file\'s hash');
});
