/**
 * Bundle real app components for `node --test` and render them to static markup.
 *
 * The suites that use this assert on what a browser would RECEIVE — the markup React produces from
 * the shipped source — rather than on the source's spelling. esbuild is borrowed from the worker's
 * install (apps/web installs none), CSS is dropped, and `import.meta.env` is the production shape.
 *
 * DOMPurify needs a DOM and node has none, so it is swapped for a pass-through: nothing rendered
 * through this helper is sanitised, and no suite may use it to assert sanitisation (that property
 * is held in lib/markdown.tsx by tests/code-presentation.test.mjs).
 *
 * `render` fails on any React warning printed while rendering — an unknown prop on a DOM element or
 * a missing key is a real defect no source check would see.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
// Resolved through the worker package's own dependency graph, as a clone installs it, rather than by a
// path into its node_modules that no commit holds (tests/check-committed-imports.test.mjs).
const esbuild = createRequire(join(WEB, '..', 'worker', 'package.json'))('esbuild');

const passThroughPurify = {
  name: 'dompurify-without-a-dom',
  setup(build) {
    build.onResolve({ filter: /^dompurify$/ }, () => ({ path: 'dompurify', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default { addHook() {}, sanitize(html) { return html; } };',
      loader: 'js',
    }));
  },
};

/**
 * Bundle `entry` (TSX) and load it. The caller passes `resolveDir` (apps/web) and writes the entry's
 * specifiers from there (`./src/...`), so scripts/check-deadends.mjs — which resolves a virtual
 * module against its package root when the file declares a resolveDir — sees them as real edges.
 */
export async function bundle(entry, { name = 'ui', resolveDir }) {
  assert.ok(resolveDir, 'bundle() needs the directory the entry\'s specifiers are written against');
  const out = join(mkdtempSync(join(tmpdir(), `${name}-`)), 'bundle.cjs');
  const built = await esbuild.build({
    stdin: { contents: entry, resolveDir, loader: 'tsx', sourcefile: `${name}.tsx` },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': '{"DEV":false,"PROD":true,"MODE":"test"}' },
    plugins: [passThroughPurify],
    outfile: out,
    logLevel: 'silent',
  });
  assert.deepEqual(built.errors, []);
  return createRequire(import.meta.url)(out);
}

/** renderToStaticMarkup, failing on any React warning printed while it ran. */
export function renderWith(renderToStaticMarkup, element) {
  const warnings = [];
  const original = console.error;
  console.error = (...args) => warnings.push(args.map(String).join(' '));
  try {
    return renderToStaticMarkup(element);
  } finally {
    console.error = original;
    assert.deepEqual(warnings, [], `React warned while rendering:\n${warnings.join('\n')}`);
  }
}

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&amp;': '&' };
export const unescape = (s) => s.replace(/&(?:lt|gt|quot|#x27|amp);/g, (m) => ENTITIES[m]);
export const text = (html) => unescape(html.replace(/<[^>]+>/g, ''));
export const count = (html, needle) => html.split(needle).length - 1;

/**
 * The outer HTML of the first element whose opening tag matches `open`, found by balancing its
 * tag name. Enough for React's static markup (no comments, no raw `<` in attributes).
 */
export function element(html, open) {
  const start = html.search(open);
  if (start < 0) return null;
  const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start))?.[1];
  if (!tag) return null;
  const re = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].startsWith('</')) depth -= 1;
    else if (m[1] !== '/') depth += 1;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  return null;
}

/** Strip block and line comments from source before a negative scan reads it. */
export const decomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
