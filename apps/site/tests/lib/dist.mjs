/**
 * THE BUILT SITE, READ THE WAY A VISITOR RECEIVES IT.
 *
 * The M2 rebuild guards (no-fake-output, beta-labels, nav-and-routes, hermetic-build) all read
 * apps/site/dist, never a list typed into a test: a page added tomorrow is read tomorrow. This
 * module holds the four small parsers they share, and each one is proved able to see what it is
 * looking for by the tests that import it (a guard whose parser silently finds nothing reports a
 * clean site, which is the failure this repository keeps paying for).
 *
 * Not a test file: `node --test tests/*.test.mjs` collects only names matching the test pattern.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIST = join(SITE, 'dist');

/** Every built page as { route, file, html }: derived from the dist folder, never listed. */
export function distPages() {
  assert.ok(
    existsSync(DIST),
    'apps/site/dist is missing: run `pnpm --filter @studpilot/site build` first. A guard with no build to read has proved nothing.',
  );
  const pages = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html') {
        const rel = relative(DIST, dirname(p)).split(sep).join('/');
        pages.push({ route: rel === '' ? '/' : `/${rel}/`, file: p, html: readFileSync(p, 'utf8') });
      } else if (e.name === '404.html') {
        pages.push({ route: '/404', file: p, html: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(DIST);
  assert.ok(pages.length > 0, 'the build holds no page at all: the walk of dist found nothing to read');
  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

export function distPage(route) {
  const page = distPages().find((p) => p.route === route);
  assert.ok(page, `dist has no page for ${route}: the build did not emit it`);
  return page;
}

/** Every file under a folder, recursively, as paths relative to it (posix separators). */
export function walkFiles(root, keep = () => true) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (keep(p)) out.push(relative(root, p).split(sep).join('/'));
    }
  };
  if (existsSync(root)) walk(root);
  return out.sort();
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ', '&#160;': ' ', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&mdash;': '—', '&ndash;': '–', '&hellip;': '…' };

/** What a reader sees: scripts, styles and tags out, entities in, whitespace flattened. */
export function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|[a-z]+);/gi, (m, d, h) => (d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : (ENTITIES[m] ?? m)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** The attributes of one start tag, as an object. */
export function attrsOf(tag) {
  const out = {};
  const rest = tag.replace(/^<[a-zA-Z][a-zA-Z0-9]*/, '').replace(/\/?>$/, '');
  for (const m of rest.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

/** Every <img> in a document: { tag, attrs }. */
export function imgsOf(html) {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => ({ tag: m[0], attrs: attrsOf(m[0]) }));
}

/**
 * The inner HTML of every element that carries `attr` (a bare attribute name or name=value),
 * nesting-aware for elements of the same tag name. Void elements are not supported as containers.
 */
export function regionsWith(html, attr) {
  const out = [];
  const start = new RegExp(`<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*?\\s${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s=>/])[^>]*>`, 'g');
  let m;
  while ((m = start.exec(html))) {
    const name = m[1];
    const open = new RegExp(`<${name}\\b[^>]*>|</${name}\\s*>`, 'gi');
    open.lastIndex = start.lastIndex;
    let depth = 1;
    let t;
    while ((t = open.exec(html))) {
      if (t[0][1] === '/') depth -= 1;
      else if (!t[0].endsWith('/>')) depth += 1;
      if (depth === 0) {
        out.push({ tag: m[0], inner: html.slice(start.lastIndex, t.index) });
        break;
      }
    }
  }
  return out;
}

/** The href of every <a> in a fragment. */
export function hrefsOf(fragment) {
  return [...fragment.matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2]);
}

/** Source text with every kind of comment removed (HTML, JSX-style, block and line). */
export function stripComments(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}
