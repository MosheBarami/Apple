/**
 * EVERYTHING A CUSTOMER READS IS ENGLISH (V3 handoff §1, gate G08, NEXT_ACTION 1d).
 *
 * Two sweeps over the customer-facing source trees:
 *
 *   1. No non-Latin script — Hebrew, Arabic, Cyrillic, CJK, kana, Hangul, Thai, Devanagari — in the
 *      CODE of apps/web/src, apps/site/src and apps/apple-plugin/src. Comments are stripped first:
 *      the reasons this product stopped offering Hebrew are written down in Hebrew, and a scanner
 *      that read them would report its own explanation as the defect.
 *   2. No formatter in the web app that takes the BROWSER's locale. `toLocaleString()` with no
 *      locale prints month names, "PM" and even digits in whatever language the device is set to,
 *      which is non-English product text that no string in this repository contains — so sweep 1
 *      cannot see it.
 *
 * What this does NOT forbid is non-English INPUT: a person may type Hebrew, and the workspace must
 * render it right way round (no-hebrew-claim.test.mjs guards that half).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOTS = ['web/src', 'site/src', 'apple-plugin/src'];
const CODE = new Set(['.ts', '.tsx', '.js', '.mjs', '.jsx', '.astro', '.html', '.css', '.json', '.luau', '.lua']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (CODE.has(extname(p))) out.push(p);
  }
  return out;
}

/**
 * Remove comments, keeping line numbers. Deliberately simple: a `//` or `--` only counts as a
 * comment at the start of a line or after whitespace, so `https://` inside a string survives. The
 * cost is that a comment-looking run inside a string is stripped too — a miss, never a false alarm.
 */
function stripComments(src, ext) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  if (ext === '.luau' || ext === '.lua') {
    return src.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, blank).replace(/(^|\s)--.*$/gm, (m, pre) => pre + blank(m.slice(pre.length)));
  }
  let s = src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/<!--[\s\S]*?-->/g, blank);
  if (ext !== '.css' && ext !== '.html' && ext !== '.json') s = s.replace(/(^|\s)\/\/.*$/gm, (m, pre) => pre + blank(m.slice(pre.length)));
  return s;
}

const NON_LATIN = /[֐-׿؀-ۿݐ-ݿЀ-ӿ฀-๿ऀ-ॿ぀-ヿ㐀-鿿가-힯יִ-﷿ﹰ-﻿]/;

// Each entry names the ONE line it excuses, by a substring of that line, and why.
const SCRIPT_ALLOW = [
  {
    file: 'web/src/routes/studio-preview.tsx',
    line: 'const HEBREW_USER = ',
    why: 'dev-only specimen (app.tsx registers it under import.meta.env.DEV) of a USER typing Hebrew; the reply beside it is English',
  },
];

const files = ROOTS.flatMap((r) => walk(join(APPS, r)));

test('the sweep actually reads all three trees', () => {
  for (const r of ROOTS) {
    const n = files.filter((f) => relative(APPS, f).startsWith(r + '/')).length;
    assert.ok(n > 5, `${r}: only ${n} files found — this sweep would check nothing`);
  }
});

test('no customer-facing source string is written in a non-Latin script', () => {
  const found = [];
  const used = new Set();
  for (const f of files) {
    const rel = relative(APPS, f);
    const lines = stripComments(readFileSync(f, 'utf8'), extname(f)).split('\n');
    lines.forEach((text, i) => {
      if (!NON_LATIN.test(text)) return;
      const allow = SCRIPT_ALLOW.find((a) => a.file === rel && text.includes(a.line));
      if (allow) return used.add(allow);
      found.push(`${rel}:${i + 1}: ${text.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(found, [], `non-English customer-facing text:\n${found.join('\n')}`);
  for (const a of SCRIPT_ALLOW) assert.ok(used.has(a), `stale allowlist entry — ${a.file} no longer has "${a.line}"; remove it`);
});

// A formatter handed no locale, or `undefined`, uses the browser's. `Intl.DateTimeFormat()` is only
// allowed for `.resolvedOptions().timeZone`, which reads the zone and prints nothing.
const BROWSER_LOCALE = /\.toLocale(?:Date|Time)?String\(\s*(?:undefined\s*)?[,)]|new Intl\.[A-Za-z]+\(\s*(?:undefined\s*)?[,)]|Intl\.[A-Za-z]+\(\)(?!\.resolvedOptions\(\)\.timeZone)/;

const LOCALE_ALLOW = [
  { file: 'web/src/routes/admin.tsx', why: 'operator console, rendered only for is_admin profiles — not customer-facing' },
  // Added 2026-10-01: the genuine upstream WebPreview (hash-checked against its NOTICE row, so it
  // cannot be edited here) stamps its console lines with toLocaleTimeString. Only WebPreviewConsole
  // draws that, and no surface of this app renders WebPreviewConsole — the test below holds that.
  { file: 'web/src/components/ai-elements/web-preview.tsx', why: 'upstream WebPreviewConsole timestamps; the console is never rendered by this app' },
];

test('no surface renders the upstream console whose timestamps are in the browser locale', () => {
  const users = files
    .filter((p) => relative(APPS, p).startsWith('web/src/') && !relative(APPS, p).startsWith('web/src/components/ai-elements/'))
    .filter((p) => /\bWebPreviewConsole\b/.test(stripComments(readFileSync(p, 'utf8'), extname(p))));
  assert.deepEqual(users.map((p) => relative(APPS, p)), []);
});

test('no web formatter prints in the browser\'s own locale', () => {
  const found = [];
  const used = new Set();
  for (const f of files.filter((p) => relative(APPS, p).startsWith('web/src/'))) {
    const rel = relative(APPS, f);
    const lines = stripComments(readFileSync(f, 'utf8'), extname(f)).split('\n');
    lines.forEach((text, i) => {
      if (!BROWSER_LOCALE.test(text)) return;
      const allow = LOCALE_ALLOW.find((a) => a.file === rel);
      if (allow) return used.add(allow);
      found.push(`${rel}:${i + 1}: ${text.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(found, [], `formatting in the browser's locale:\n${found.join('\n')}`);
  for (const a of LOCALE_ALLOW) assert.ok(used.has(a), `stale allowlist entry — ${a.file} no longer formats in the browser locale; remove it`);
});
