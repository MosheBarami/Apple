/**
 * DOCUMENT STRUCTURE IS INVISIBLE UNTIL SOMEONE NAVIGATES BY IT.
 *
 * A page whose headings and landmarks are wrong looks exactly like one whose are right.
 * The landing shipped with the product's three claims inside a `<footer>` — an element
 * picked for where it sat on the screen — which announced them as site boilerplate, and
 * with `<span>` titles, so a reader navigating by heading got one stop for the whole
 * page. Nothing about that is visible in a screenshot, and no other check caught it.
 *
 * Run against the BUILT site, because that is what ships, and because these pages are
 * assembled from layouts and components — the defect lives in the composition, not in
 * any one source file.
 *
 * What is deliberately NOT flagged:
 *
 *   - a `<footer>` nested inside `<article>` or `<section>`. That is an article's own
 *     footer and is not a `contentinfo` landmark; the docs pages each have one, quite
 *     correctly, and a checker that counted raw `<footer>` tags would report eleven
 *     false positives and be switched off within the week.
 *   - heading COUNT. A short page with two headings is not worse than a long one with
 *     twenty. What matters is that there is a hierarchy and that it does not skip.
 *
 * Usage: node scripts/check-site-semantics.mjs      (after building the site)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../apps/site/dist/', import.meta.url).pathname;

function pages(dir = DIST, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Opening tags of `name` that are NOT inside any of `within`. */
function topLevelCount(html, name, within) {
  let count = 0;
  const stack = [];
  const tag = new RegExp(`<(/?)(${[name, ...within].join('|')})\\b[^>]*>`, 'g');
  for (const m of html.matchAll(tag)) {
    const [, closing, el] = m;
    if (closing) {
      const i = stack.lastIndexOf(el);
      if (i !== -1) stack.splice(i, 1);
      continue;
    }
    if (el === name) {
      if (!stack.some((s) => within.includes(s))) count += 1;
    }
    // Void-ish/self-closing forms do not occur for these elements in this build.
    if (within.includes(el)) stack.push(el);
  }
  return count;
}

/** Remove every balanced `<tag>...</tag>` region, nesting included. */
function stripRegions(html, tags) {
  let out = html;
  for (const tag of tags) {
    const open = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
    let m;
    while ((m = open.exec(out)) !== null) {
      let depth = 1;
      const scan = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
      scan.lastIndex = m.index + m[0].length;
      let end = -1;
      let t;
      while ((t = scan.exec(out)) !== null) {
        depth += t[1] ? -1 : 1;
        if (depth === 0) {
          end = t.index + t[0].length;
          break;
        }
      }
      if (end === -1) break;
      out = out.slice(0, m.index) + out.slice(end);
      open.lastIndex = m.index;
    }
  }
  return out;
}

const problems = [];
const files = pages().sort();

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const where = '/' + relative(DIST, file).replace(/index\.html$/, '').replace(/\.html$/, '');
  const say = (msg) => problems.push(`${where}: ${msg}`);

  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/gs)].map((m) => ({
    level: Number(m[1]),
    text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  }));

  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length !== 1) say(`${h1s.length} <h1>, expected exactly 1`);

  for (const h of headings) {
    if (h.text === '') say(`an empty <h${h.level}> — a heading with no text is a stop that says nothing`);
  }

  for (let i = 1; i < headings.length; i += 1) {
    const from = headings[i - 1].level;
    const to = headings[i].level;
    if (to > from + 1) say(`heading level jumps h${from} -> h${to} at "${headings[i].text.slice(0, 40)}"`);
  }

  // A HEURISTIC, and labelled as one. Every page in this site has at least four
  // headings; the single time a page had exactly one, it was because three headings
  // had been written as <span> inside a footer, which is the defect that prompted this
  // file. A page that genuinely expresses one idea and nothing else would trip this
  // wrongly — no page here does, and when one exists the right move is to look at it,
  // not to weaken the rule.
  if (headings.length < 2) {
    say(`only ${headings.length} heading(s) — nothing to navigate by; check for titles written as <span> or <div>`);
  }

  // §15.3 gives the public modes as Plan / Agent / Super Agent. packages/shared is
  // explicit that Clay, Stone and Rune "are internal specialist identities, not
  // user-facing brands: nothing in normal product UI should name them" — and the web app
  // goes as far as regex-replacing them out of worker copy before it renders. The docs
  // site named them 96 times, so a reader learned a vocabulary the product does not use.
  //
  // Script and style contents are stripped first: a CSS class like `is-clay` is
  // implementation, not something a reader is told.
  const prose = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ');
  const leaked = [...new Set([...prose.matchAll(/\b(Clay|Stone|Rune)\b/g)].map((m) => m[1]))];
  if (leaked.length > 0) {
    say(`names an internal specialist in visible copy: ${leaked.join(', ')} — the public modes are Plan, Agent and Super Agent`);
  }

  const mains = (html.match(/<main\b/g) ?? []).length;
  if (mains !== 1) say(`${mains} <main>, expected exactly 1`);

  // contentinfo: a footer that is not scoped to an article or section.
  const contentinfo = topLevelCount(html, 'footer', ['article', 'section', 'aside', 'nav']);
  if (contentinfo > 1) say(`${contentinfo} page-level <footer> elements — that is ${contentinfo} contentinfo landmarks`);

  // The claim the landing got wrong: primary content that is not in <main> is content
  // a "skip to content" link skips past.
  //
  // The page CHROME is excluded, and that exclusion is the whole difficulty. The first
  // version of this rule flagged every page in the site for the footer's own column
  // labels — "Product", "Docs", "Legal" — which are headings doing exactly the job
  // headings are for. A heading inside header, nav or footer is labelling the chrome;
  // one loose in the body is content that was left out of main.
  const mainStart = html.indexOf('<main');
  const mainEnd = html.lastIndexOf('</main>');
  if (mainStart !== -1 && mainEnd !== -1) {
    const outside = stripRegions(html.slice(0, mainStart) + html.slice(mainEnd), ['header', 'nav', 'footer']);
    const strayHeadings = [...outside.matchAll(/<h([1-3])\b[^>]*>(.*?)<\/h\1>/gs)].map((m) =>
      m[2].replace(/<[^>]+>/g, '').trim(),
    );
    if (strayHeadings.length > 0) {
      say(`h1-h3 outside <main> and outside the page chrome: ${strayHeadings.map((t) => `"${t.slice(0, 30)}"`).join(', ')}`);
    }
  }
}

if (files.length === 0) {
  console.error('check-site-semantics: no built pages found — run `pnpm --filter @golem/site build` first');
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`check-site-semantics: ${problems.length} problem(s) across ${files.length} page(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`check-site-semantics: ${files.length} page(s), heading hierarchy and landmarks are sound`);
