/**
 * WHAT A READER RECEIVES, WITH THE REASONS WRITTEN BESIDE IT TAKEN OUT.
 *
 * Six guards in this directory check that a page does not make a claim the code cannot keep, and
 * every one of them has the same problem: the page now carries a comment QUOTING the false sentence
 * and explaining why it went. A scanner that cannot tell a page from the commentary on it either
 * fires on its own explanation, or gets quiet by having that explanation deleted — and the second
 * outcome is how this repository loses the reason a line exists.
 *
 * WHY FRONTMATTER IS KEPT, unlike apps/site/tests/withdrawn-modes.test.mjs which strips it.
 * pricing.astro builds its FAQ as an array of HTML strings INSIDE the `---` fence and renders it
 * further down, so the single most load-bearing sentence on the commercial page is frontmatter. A
 * stripper that removed it would report that page clean without having read a word of it. The cost
 * is that identifiers and import lines survive into the haystack; that is harmless, because every
 * pattern these guards match is English prose, not a symbol.
 *
 * Not itself a test file — `node --test tests/` only collects names matching the test pattern, so
 * this is loaded by the guards and never executed as one.
 */

/**
 * Strip every form of comment this site uses, and the blocks a visitor never reads.
 *
 * The `//` rule requires a non-colon before the slashes so that `https://…` inside a link survives
 * as itself rather than truncating the rest of the line; withdrawn-modes.test.mjs learned the same
 * lesson one file over.
 */
export function visibleCopy(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
}

/** Tags removed as well, so `<strong>three</strong> steps` reads as the phrase a person sees. */
export function visibleText(src) {
  return visibleCopy(src).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}
