import { buildDocsIndex } from '../data/docs-index';

// The docs search index, emitted as a static file at build time.
//
// NOT /api/docs/search. That route exists in the worker and is the wrong thing twice over: it
// queries the vendored Roblox creator-docs corpus rather than Apple's own pages, and it bills a
// Credit per query behind a signed-in session. A visitor looking up how to install the plugin must
// not be charged for asking, or answered out of Roblox's documentation.
//
// The pages are read with Vite's raw glob, so the index is derived from the SOURCES rather than
// maintained by hand: a new page under src/pages/docs/ becomes searchable the moment it exists.
// That is the rule DocsLayout's nav list states and cannot enforce.
//
// JAVASCRIPT RATHER THAN TYPESCRIPT, and not by preference: Astro names a JSON endpoint
// `<route>.json.<ext>`, and this repository's file-naming hook rejects a `.ts` basename containing
// a dot. The extractor it calls is typed, and `astro check` still typechecks this file's use of it.
const sources = /** @type {Record<string, string>} */ (
  import.meta.glob('./docs/*.astro', { query: '?raw', import: 'default', eager: true })
);

export const GET = () =>
  new Response(JSON.stringify(buildDocsIndex(sources)), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
