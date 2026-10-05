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

/** A built redirect stub (Astro `redirects`): a meta refresh and a link, nothing a reader reads. */
export const isRedirect = (html) => /<meta http-equiv="refresh"[^>]*url=/i.test(html);

/** Every built page that is a page: the redirect stubs left out. */
export function realPages() {
  const pages = distPages().filter((p) => !isRedirect(p.html));
  assert.ok(pages.length > 0, 'the build holds no real page, only redirects');
  return pages;
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

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ', '&#160;': ' ', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&mdash;': '—', '&ndash;': '–', '&hellip;': '…', '&copy;': '©', '&rarr;': '→', '&larr;': '←', '&times;': '×', '&middot;': '·' };

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

/** The tags that start or end a block of text for a reader: a paragraph, a list item, a heading, a cell, a button, a label. Inline tags are not in it. */
const BLOCK_TAGS = 'address|article|aside|blockquote|body|br|button|caption|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|label|li|main|nav|ol|option|p|pre|section|summary|table|tbody|td|tfoot|th|thead|title|tr|ul';

/**
 * What a reader sees as separate blocks of text: one string per paragraph, list item, heading, cell, button or label, in page order.
 * Inline tags (a, strong, em, code, span) do not split a block, so "Use <a>Sign in with Roblox</a>, then ..." is one block. A guard that asks
 * "does the paragraph that makes the claim also carry the qualifier" reads these, not the whole page flattened into one string.
 */
export function blocksOf(html) {
  const marked = html.replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), ' \u0001 ');
  return textOf(marked).split('\u0001').map((b) => b.trim()).filter(Boolean);
}

/**
 * The words a page itself says, as one string: its <main>, with the navigation, the docs sidebar and the search form taken out (a link's label is not a
 * sentence the page says), then its title and descriptions (what a search result shows). The header and footer sit outside <main>.
 */
export function pageWordsOf(html) {
  const main = /<main\b[\s\S]*<\/main>/.exec(html)?.[0] ?? html;
  const body = main
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<details\b[^>]*\bdocs__nav\b[\s\S]*?<\/details>/gi, ' ')
    .replace(/<form\b[^>]*role="search"[\s\S]*?<\/form>/gi, ' ');
  const head = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  return [textOf(head), ...metaTextOf(html), textOf(body)].join('. ');
}

/** The words a page puts in its head for a search result or a pasted link, besides its title (blocksOf reads the title): every description, Open Graph and Twitter content. */
export function metaTextOf(html) {
  const out = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    if (a.content && /^(?:description|og:|twitter:)/i.test(a.name ?? a.property ?? '')) out.push(textOf(a.content));
  }
  return out;
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
