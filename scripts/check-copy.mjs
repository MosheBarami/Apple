#!/usr/bin/env node
// The competitor teardown, as a GUARD rather than an impression.
//
// Four rival Roblox-AI products were pulled apart with DevTools. Three of the four lead with the
// same handful of sentence shapes, and the owner named those shapes as the thing he does not want
// in this product. An observation like that survives about a week; a check survives.
//
// So every shape below is quoted from a real competitor page, with the site it came from, and the
// rule is applied to EVERY page of the marketing site and EVERY route of the app — not to the
// landing page somebody happened to be looking at.
//
// WHAT IT DOES NOT DO. It does not judge prose. It matches four specific constructions and two
// measurable properties, and everything else is left alone — a linter with opinions about writing
// gets disabled within a month.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The shapes, each quoted from the site it was found on.
 *
 * `re` matches the CONSTRUCTION, not the words — "describe it, watch it get built" and "you
 * describe the game, we build it" are the same sentence wearing different nouns, and a checker
 * that only caught the exact string would catch nothing the second time.
 */
const SHAPES = [
  {
    id: 'describe-it-builds-it',
    re: /\b(describe|tell|type|say)\b[^.!?]{0,40}\b(and|then|,)\s*(we|it|apple|ai|watch)\b[^.!?]{0,30}\b(build|make|create|come to life|get built)/i,
    found: 'revix.tech H1: "DESCRIBE IT. WATCH IT GET BUILT." · superbullet.ai: "Just describe what you want, and watch your game come to life."',
    why: 'It describes the INTERFACE, not the product. Every competitor says it, so it distinguishes nothing, and it promises a passivity the product does not have.',
  },
  {
    //[[ THE SAME CLAIM SPLIT ACROSS TWO SENTENCES, WHICH IS HOW EVERY RIVAL ACTUALLY WRITES IT.
    //
    //   The first rule needs the whole thing inside one sentence — `[^.!?]{0,40}` between the verb
    //   and the connective. revix.tech does not write it that way and neither did we: the app's
    //   own <title> was "Apple — Describe it. Apple builds it." and it passed all six rules,
    //   because the full stop in the middle is exactly what the first rule refuses to cross.
    //
    //   It sat in the browser tab of every screen of the signed-in product while this checker
    //   reported CLEAN, and it was found by reading the page rather than by running the check.
    id: 'describe-it-then-builds-it',
    re: /\b(describe|tell|type|say)\s+(it|your|what|us)\b[^.!?]{0,30}[.!?]\s*(we|it|apple|ai|the ai)\s+(?:\w+\s+){0,2}(build|make|create)/i,
    found: 'revix.tech H1: "DESCRIBE IT. WATCH IT GET BUILT." · this product\'s own app title, until it was read',
    why: 'Splitting it over two sentences does not make it a different sentence. It is the same promise, in the same shape, that three of the four rivals lead with.',
  },
  {
    // The back half of the same headline, standing on its own. The first rule needs a
    // describe/tell/type verb before it — and "Watch it build, step by step." was sitting as an h2
    // on this project's own landing page, which is revix.tech's H1 with the first sentence removed.
    id: 'watch-it-build',
    re: /\bwatch\s+(it|your|the)\b[^.!?]{0,30}\b(get\s+built|be(ing)?\s+built|build|come\s+to\s+life|appear)\b/i,
    found: 'revix.tech H1: "DESCRIBE IT. WATCH IT GET BUILT." · superbullet.ai: "watch your game come to life"',
    why: 'It casts the customer as an audience. What this product actually offers is the opposite — named steps and a stop button — and saying "watch" throws that away to sound like everyone else.',
  },
  {
    id: 'one-x-whole-y',
    re: /\bone\s+(prompt|sentence|line|message|idea)\b[^.!?]{0,40}\b(whole|full|entire|complete)\b/i,
    found: 'superbullet.ai: "turn one prompt into a full Roblox game" · promptblox.ai: "build a whole world in one prompt"',
    why: 'It is the claim the product cannot keep, said in the shape everybody says it in.',
  },
  {
    id: 'x-not-y',
    // Anchored on the PRODUCT as the subject. The first version matched "That is not a user ID —
    // it should look like the example above", a form validation message, which is the opposite of
    // marketing copy: it is a specific, useful sentence telling somebody exactly what to fix.
    re: /\b(apple|we|this product|the product)\s+(is|are|['’]s|['’]re)\s+not\s+(a|an|just|merely|another)\b/i,
    found: 'revix.tech: "Revix is not a one-shot generator." · "MORE THAN CODE COMPLETION"',
    why: 'Defining yourself against a competitor spends your own headline on theirs.',
  },
  {
    /*
     * THE OTHER HALF OF "X not Y", and the half the owner actually kept naming.
     *
     * `x-not-y` above is anchored on the PRODUCT as subject — "Apple is not a one-shot generator"
     * — because its first version matched "That is not a user ID", a form message that is the
     * opposite of marketing copy. Narrowing it that far left the construction itself unguarded,
     * and the onboarding tour shipped with "Say what you want, not how to build it" while this
     * check printed CLEAN over 94 pages.
     *
     * This one is anchored on an imperative that OPENS the line — a quote mark, a JSX `>`, or the
     * start of a line — followed by a comma and a negation. That is the headline shape and not the
     * validation shape: a message telling somebody what they typed wrong does not begin with "Say"
     * or "Build".
     *
     * Opening position is load-bearing, not decoration. Without it this matched "Written into
     * every project you build, not just this one" in the instructions panel — a scope
     * clarification, specific and useful, where `build` is a relative-clause verb rather than an
     * instruction. A checker that flags the good sentence next to the bad one gets muted, which is
     * a slower way of not having it.
     */
    id: 'imperative-x-not-y',
    re: /(?:^|['"\u2018\u201c>]|\{\s*['"])\s*(say|tell|describe|ask|build|make|write|think|prompt)\b[^.!?\n]{0,48},\s*not\s+(how|what|where|why|when|the|a|an|just|another)\b/im,
    found: 'this product\'s own onboarding tour, until it was read',
    why: 'A line defined by what it is not spends itself on the thing it is refusing. The owner named this shape by hand, twice.',
  },
  {
    id: 'without-learning',
    re: /\bwithout\s+(learning|knowing|writing|touching)\b[^.!?]{0,20}\b(to\s+)?(code|scripting|luau|programming)\b/i,
    found: 'superbullet.ai H2, at 60px: "Make Roblox Games Without Learning To Code"',
    why: 'It sells the absence of work rather than the presence of a result, and it insults the people who did learn.',
  },
  {
    id: 'dream-vague',
    re: /\b(your\s+)?(dream|imagination|vision)\b[^.!?]{0,25}\b(world|game|reality|life)\b/i,
    found: 'promptblox.ai H1: "Create your Dream World" · subhead: "Turn your ideas and visions into playable Roblox games"',
    why: 'It could be any product in any category. A headline that survives a find-and-replace of the noun is not a headline.',
  },
];

/**
 * Display type, capped where the teardown says a reader stops reading.
 *
 * Measured across the four: revix.tech runs an 81.6px uppercase H1, superbullet.ai 60px with no
 * web font at all, and promptblox.ai — the most restrained of them — 40px at desktop and 27px at
 * 500px wide with no horizontal overflow at any width. The cap was set from the one that reads
 * best, not from the biggest, and it was 3.4rem.
 *
 * RAISED TO 3.5rem ON 2026-09-20, and the reason is a fifth reference rather than a preference.
 * The owner named tesana.ai as the bar and instructed that the product match it; measured with
 * getComputedStyle over its live DOM, its H1 is 56px at weight 400 with a 64px line box and
 * -1.12px of tracking. 56px is 3.5rem, so the old cap forbade the exact number the chosen
 * reference uses — and a cap that forbids the bar is a cap measured against the wrong set.
 *
 * The rule itself does not move: a display size is still capped, still measured off shipped pages
 * rather than chosen, and 60px and 81.6px are still failures. What changed is which pages the
 * measurement comes from. Lower it again the day the bar changes again, and say which page.
 */
const MAX_DISPLAY_REM = 3.5;

/** Every file a reader's words can come out of. */
function pages() {
  const out = [];
  const walk = (dir, filter) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { walk(p, filter); continue; }
      if (filter.test(e)) out.push(p);
    }
  };
  walk(join(ROOT, 'apps', 'site', 'src'), /\.(astro|md|mdx)$/);
  walk(join(ROOT, 'apps', 'web', 'src', 'routes'), /\.tsx$/);
  walk(join(ROOT, 'apps', 'web', 'src', 'components'), /\.tsx$/);
  //[[ AND lib, WHICH HOLDS COPY AND WAS NEVER READ.
  //
  //   The walk took routes and components because that is where JSX lives, and a reader's words do
  //   not only live in JSX. `apps/web/src/lib/onboarding.ts` is the five-step tour every new
  //   account is shown, written entirely as title/body strings in a const array — and it carried
  //   "Say what you want, not how to build it" while this file printed CLEAN over 93 pages. The
  //   shape is banned by name; the file was simply not in the denominator.
  //
  //   `.ts` as well as `.tsx`: the point is that the copy is NOT in markup. This is the same gap
  //   the index.html note below records, found a second time in a different directory. ]]
  walk(join(ROOT, 'apps', 'web', 'src', 'lib'), /\.tsx?$/);
  //[[ THE APP'S SHELL, WHICH THIS CHECK NEVER OPENED.
  //
  //   `apps/web/index.html` carries the <title> and the meta description, and it is neither a
  //   route nor a component — so the walk above missed it and it sat in production reading
  //   "Apple — Describe it. Apple builds it.", which is revix.tech's headline and the first rule
  //   in the table below. It was the browser tab on every screen of the signed-in product, and
  //   the guard reported CLEAN over all 85 pages for weeks.
  for (const shell of [join(ROOT, 'apps', 'web', 'index.html'), join(ROOT, 'apps', 'site', 'index.html')]) {
    if (existsSync(shell)) out.push(shell);
  }
  return out;
}

/**
 * Comments are stripped FIRST.
 *
 * A guard that reads its own commentary as data is a defect this repository has caught three
 * times — and this file is the worst possible case, because the SHAPES table above quotes every
 * banned construction verbatim. Without stripping, every file explaining why it avoids a phrase
 * would be reported for containing it.
 */
function prose(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')  // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')       // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1')      // line comments
    //[[ AND THEN THE TAGS, BECAUSE A READER DOES NOT SEE THEM.
    //
    //   The login page's H1 was `Describe it.<br />Apple builds it.` — revix.tech's headline, the
    //   phrase this file names in its own SHAPES table, sitting in production while the check
    //   printed CLEAN over 93 pages. Every rule here is anchored on a sentence boundary followed
    //   by the next few words, and a `<br />` between the two halves put eleven characters of
    //   markup where the regex expected whitespace. The check was reading source; the customer was
    //   reading rendered text; the two disagreed and only one of them was in production.
    //
    //   Collapsing every tag to a single space makes the two agree. It can join the tail of one
    //   element to the head of the next, which is exactly what a rendered page does too — so a
    //   match that only appears after collapsing is still a phrase somebody can read off a screen.
    .replace(/<[^<>]{0,400}>/g, ' ');
  // ASTRO FRONTMATTER IS NOT STRIPPED, and an earlier version stripped it. Copy genuinely lives
  // there — the landing page's proof figures and its prompt chips are both `const` arrays in the
  // frontmatter — so skipping it meant a third of the page's words were never read. The comment
  // strip above already removes the part of frontmatter that is reasoning rather than words.
}

const findings = [];

for (const file of pages()) {
  const rel = relative(ROOT, file);
  const text = prose(readFileSync(file, 'utf8'));
  for (const shape of SHAPES) {
    const hit = shape.re.exec(text);
    if (!hit) continue;
    findings.push({
      file: rel,
      rule: shape.id,
      quote: hit[0].replace(/\s+/g, ' ').trim().slice(0, 90),
      why: shape.why,
      found: shape.found,
    });
  }
}

/* --------------------------------------------------------------------- display type --- */

//[[ EVERY STYLESHEET, FOUND — NOT TWO THAT SOMEBODY LISTED.
//
//   This was a hand-written list of two files, and it reported "no display type above 3.4rem"
//   over a site that has six stylesheets plus fifteen Astro files carrying their own <style>
//   blocks. Four of the six and all fifteen were never opened. The dashboard's own stylesheet
//   (apps/web/src/styles/workspace.css) was one of the four.
//
//   That is this repository's oldest defect wearing a new hat: a failure to observe rendering as
//   an observation. "CLEAN" meant "clean in the third of the CSS I happened to name".
//
//   So the stylesheets are DISCOVERED, the <style> blocks inside pages are read as stylesheets in
//   their own right, and finding none at all is a hard failure rather than a clean run — because
//   a walk that returns nothing and a codebase with no CSS are indistinguishable from the exit
//   code otherwise. ]]
function stylesheets() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === 'dist' || e === '.astro') continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (/\.css$/.test(e)) out.push({ file: p, css: readFileSync(p, 'utf8') });
    }
  };
  walk(join(ROOT, 'apps', 'site', 'src'));
  walk(join(ROOT, 'apps', 'web', 'src'));

  // A <style> block inside a page is a stylesheet that happens to live in a page file. Astro's
  // scoped styles are where a component's own display type actually gets set, so a checker that
  // reads only .css files reads none of them.
  for (const file of pages()) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      out.push({ file, css: m[1] });
    }
  }
  return out;
}

/**
 * The cap in px, so one number governs whichever unit a rule happens to be written in.
 *
 * 1rem is 16px here — `apps/site/src/styles/global.css` sets no root font-size, so the browser
 * default stands. A stylesheet that changes it would make this conversion wrong, which is why the
 * rem rules below still name the rem figure in what they report.
 */
const MAX_DISPLAY_PX = MAX_DISPLAY_REM * 16;

const SHEETS = stylesheets();
if (SHEETS.length === 0) {
  console.error('COPY CHECK IS BLIND — the stylesheet walk found no CSS at all. That is a broken\n'
    + 'checker, not a clean codebase: it cannot tell you anything about display type. Fix the walk.');
  process.exit(2);
}

for (const sheet of SHEETS) {
  const rel = relative(ROOT, sheet.file);
  const css = sheet.css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // The MAXIMUM of a clamp is the size a desktop reader actually gets, so that is the term read.
  for (const m of css.matchAll(/font-size:\s*clamp\([^)]*?,\s*([\d.]+)(rem|px)\s*\)/g)) {
    const px = m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16;
    if (px > MAX_DISPLAY_PX) {
      findings.push({
        file: rel,
        rule: 'display-too-big',
        quote: m[0].replace(/\s+/g, ' '),
        why: `${m[1]}${m[2]} is ${Math.round(px)}px at the top of the clamp. The most readable competitor caps its H1 at 40px; the worst runs 81.6px.`,
        found: 'revix.tech H1 81.6px · superbullet.ai 60px · promptblox.ai 40px (the readable one)',
      });
    }
  }
  for (const m of css.matchAll(/font-size:\s*([\d.]+)(rem|px)\s*[;}]/g)) {
    const px = m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16;
    if (px > MAX_DISPLAY_PX) {
      findings.push({
        file: rel,
        rule: 'display-too-big',
        quote: m[0].replace(/[;}]$/, '').trim(),
        why: `${m[1]}${m[2]} is ${Math.round(px)}px, fixed — it cannot shrink on a phone.`,
        found: `measured cap: ${MAX_DISPLAY_REM}rem (${MAX_DISPLAY_PX}px)`,
      });
    }
  }
}

/* -------------------------------------------------------------------------- report --- */

const byRule = {};
for (const f of findings) (byRule[f.rule] ??= []).push(f);

if (!findings.length) {
  console.log(`COPY CLEAN — ${pages().length} pages and ${SHEETS.length} stylesheets (every .css under apps/site/src and apps/web/src, plus every <style> block in a page) carry none of the ${SHAPES.length} competitor shapes, and no display type above ${MAX_DISPLAY_REM}rem / ${MAX_DISPLAY_PX}px.`);
  process.exit(0);
}

for (const [rule, list] of Object.entries(byRule)) {
  console.log(`\n${rule} — ${list.length}`);
  console.log(`  seen on: ${list[0].found}`);
  console.log(`  why not: ${list[0].why}`);
  for (const f of list) console.log(`    ${f.file}: "${f.quote}"`);
}
console.log(`\nCOPY FAILS — ${findings.length} finding(s) across ${new Set(findings.map((f) => f.file)).size} file(s)`);
process.exit(1);
