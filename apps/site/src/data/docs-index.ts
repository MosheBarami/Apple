/**
 * A search index over Apple's own help pages, and the matcher that reads it.
 *
 * THE DOCS COULD NOT BE SEARCHED. The nav is a hand-maintained list of links; there was no input,
 * no form and no index anywhere on the site. Finding "what happens if I close Studio mid-build"
 * meant opening pages until you hit it. The app's two search boxes both look elsewhere — one at
 * commands, one at the conversation.
 *
 * AND THE ENDPOINT THAT LOOKS LIKE THE ANSWER IS NOT ONE. The worker has GET /api/docs/search, but
 * it queries the vendored ROBLOX creator-docs corpus, it requires a signed-in user, and it bills a
 * Credit per query. Pointing the docs nav at it would charge a visitor money to find out how to
 * install the plugin, and then answer from the wrong corpus. This index is Apple's pages only,
 * free, static, and built at deploy time.
 *
 * WHY EXTRACTION IS A PURE FUNCTION HERE rather than a script beside the build: its failure mode is
 * silent and total. A stripper that swallows the body produces an index of twelve titles and no
 * text, and the search box still looks like it works — it simply never finds anything. Keeping it
 * here lets tests/docs-search.test.mjs run it over the real pages and assert it found prose.
 *
 * The extraction is deliberately crude — these are hand-written .astro pages with no MDX, no
 * partials and no components inside the prose, so tag-stripping is enough and a real parser would
 * be a dependency bought for nothing. If that stops being true, the test above goes red on the
 * character count before anyone ships an empty index.
 */

export interface DocEntry {
  /** The URL the page is served at: /docs, /docs/plugin, … */
  path: string;
  title: string;
  /** Section headings, kept separately because they are what a person scans for. */
  headings: string[];
  /** The page's prose, tags and frontmatter removed, whitespace collapsed. */
  text: string;
}

export interface DocHit extends DocEntry {
  /** Enough of the text around the match to recognise the answer without opening the page. */
  snippet: string;
}

/** `./docs/plugin.astro` -> `/docs/plugin`; the index page is the section root. */
function pathForFile(file: string): string {
  const slug = file.split('/').pop()!.replace(/\.astro$/, '');
  return slug === 'index' ? '/docs' : `/docs/${slug}`;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ');
}

/** The `heading=` prop a docs page passes its layout, which is the page's real title. */
function titleOf(src: string, fallback: string): string {
  const heading = /\n\s*heading="([^"]+)"/.exec(src) ?? /heading=\{?"([^"]+)"\}?/.exec(src);
  if (heading) return decode(heading[1]!.trim());
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(src);
  if (h1) return decode(h1[1]!.replace(/<[^>]+>/g, '').trim());
  return fallback;
}

/**
 * Remove `{...}` template expressions, brace-counting so nested ones go too.
 *
 * Astro pages interpolate real code into the prose — `{paid.map((id) => (` and
 * `{free.creditsPerDay.toLocaleString()}` — and a regex-based tag stripper leaves every character
 * of it behind. Indexed, that made `/docs/credits-and-limits` match a search for "map" and put
 * JavaScript in the snippet a reader sees. The numbers those expressions render are lost from the
 * index, which is the right trade: nobody searches help for "2,310".
 */
function stripExpressions(src: string): string {
  let out = '';
  let depth = 0;
  for (const ch of src) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

/**
 * Prose that lives in a page's FRONTMATTER rather than its markup.
 *
 * /docs/faq is the whole reason this exists: its ten questions and answers are a TypeScript array
 * handed to a component, so a stripper that drops frontmatter indexes 141 characters of that page —
 * the FAQ, the single most search-shaped page on the site, effectively absent. That is exactly the
 * silent-and-total failure this module's header warns about, and it happened on the first run.
 *
 * Long quoted strings only, and never from an `import` line: a path like '../../layouts/Base.astro'
 * is short and has no business in a haystack, while an answer is a sentence.
 *
 * AND NEVER FROM A COMMENT. Comments are the one part of a page written FOR the person editing it
 * and never for the person reading it, and this indexed them: a page whose frontmatter explained
 * why Super Agent had been withdrawn put the words "Plan, Agent and Super Agent" — the old copy,
 * QUOTED so a maintainer could see what had changed — straight into the customer-facing search
 * index, along with the `//` that opened the line. The result is worse than noise: the search box
 * answers a question about the product with the commentary on its own source, and a mode a reader
 * cannot select was findable in the docs search of a site whose pages no longer mention it.
 * apps/site/tests/withdrawn-modes.test.mjs is what caught it, in dist/docs-index.json.
 */
function frontmatterProse(front: string): string {
  const lines = stripComments(front)
    .split('\n')
    .filter((l) => !/^\s*import\s/.test(l));
  const strings = [...lines.join('\n').matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)]
    .map((m) => m[2]!)
    // A string with an interpolation in it is not text, it is a TEMPLATE, and nothing here can
    // fill it in: the page's copy is derived at build time from the product, and this reads the
    // file. Indexed anyway, it put `about ${m.perFreeDay} ${m.name} requests` and the argument of
    // a `throw new Error` into the haystack and into the snippet a reader is shown. Dropping it
    // loses a sentence from the index; keeping it showed source code to a customer.
    .filter((s) => !s.includes('${'))
    .filter((s) => s.length >= 24 && !/^[./]/.test(s));
  return strings.join(' ').replace(/<[^>]+>/g, ' ');
}

/**
 * Block and line comments out. The `[^:]` guard before `//` is load-bearing: without it the first
 * `https://` in a frontmatter string takes the rest of that line with it.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Section headings, which are the part of this index a person actually reads.
 *
 * EXPRESSIONS COME OUT HERE TOO. `stripExpressions` was applied to the body prose and not to the
 * headings, so a page that derives its sections from the product — `<h2>{s.name} — {s.credits}
 * credits</h2>`, which is how /docs/modes stopped being able to advertise a withdrawn mode —
 * indexed the heading "{s.name} — {s.credits} credits" and offered it to a searcher as a section
 * of the page. A heading with ANY expression in it is dropped whole rather than stripped down to
 * what is left: "{s.name} — {s.credits} credits" strips to "— credits", and a searcher offered
 * "— credits" as a section of the manual has been told something worse than nothing. This index
 * reads sources and cannot know what the build put there; where it cannot know, it says nothing
 * and lets the page's body text carry the words.
 */
function headingsOf(body: string): string[] {
  return [...body.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => m[2]!)
    .filter((h) => !h.includes('{'))
    .map((h) => decode(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter((h) => /[\p{L}\p{N}]/u.test(h));
}

/**
 * Build the index from raw page sources, keyed by file path.
 *
 * The argument shape is what Vite's `import.meta.glob(..., { query: '?raw' })` hands back, so the
 * endpoint passes it through untouched and the tests can hand it the same thing read off disk.
 */
export function buildDocsIndex(files: Record<string, string>): DocEntry[] {
  return Object.entries(files)
    .map(([file, raw]) => {
      // Frontmatter first: it is TypeScript, and indexing it would put `import DocsLayout` into the
      // haystack and make every page match a search for "layout".
      const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(raw)?.[1] ?? '';
      const body = raw.replace(/^---[\s\S]*?\n---\n/, '');
      // <style>/<script> blocks first, whole: their CONTENT is not help content either, and a
      // tag-only strip would leave every CSS selector in the haystack.
      const prose = stripExpressions(
        body
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<[^>]+>/g, ' '),
      );
      const text = decode(`${frontmatterProse(frontmatter)} ${prose}`).replace(/\s+/g, ' ').trim();
      return {
        path: pathForFile(file),
        title: titleOf(raw, pathForFile(file)),
        headings: headingsOf(body),
        text,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Find pages for a typed query.
 *
 * Deliberately simple: every word must appear somewhere in the page, and pages are ranked by where
 * the words landed — a hit in the title beats a hit in a heading beats a hit in the body. Nobody
 * is going to type a sentence into a twelve-page index, and a fuzzy matcher over twelve pages
 * mostly produces confident wrong answers.
 *
 * A query that matches nothing returns nothing. It never falls back to "here is everything", which
 * is the behaviour that teaches people the box is decorative.
 */
export function searchDocs(index: DocEntry[], query: string, limit = 6): DocHit[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return [];

  const scored: { entry: DocEntry; score: number }[] = [];
  for (const entry of index) {
    const title = entry.title.toLowerCase();
    const heads = entry.headings.join(' · ').toLowerCase();
    const body = entry.text.toLowerCase();
    let score = 0;
    let matchedAll = true;
    for (const w of words) {
      const inTitle = title.includes(w);
      const inHead = heads.includes(w);
      const inBody = body.includes(w);
      if (!inTitle && !inHead && !inBody) {
        matchedAll = false;
        break;
      }
      score += (inTitle ? 8 : 0) + (inHead ? 3 : 0) + (inBody ? 1 : 0);
    }
    if (matchedAll) scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
    .slice(0, limit)
    .map(({ entry }) => ({ ...entry, snippet: snippetFor(entry, words) }));
}

/** Text around the first matched word, so a result is recognisable without opening the page. */
function snippetFor(entry: DocEntry, words: string[]): string {
  const lower = entry.text.toLowerCase();
  let at = -1;
  for (const w of words) {
    const i = lower.indexOf(w);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return entry.text.slice(0, 160).trim();
  const start = Math.max(0, at - 60);
  const end = Math.min(entry.text.length, at + 120);
  return `${start > 0 ? '…' : ''}${entry.text.slice(start, end).trim()}${end < entry.text.length ? '…' : ''}`;
}
