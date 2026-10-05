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

import { SHAPES } from './lib/copy-shapes.mjs';

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
  //[[ AND THE SHARE SURFACES, WHICH ARE WORDS A PERSON READS BEFORE THEY EVER OPEN A PAGE.
  //
  //   apps/site/brand/og.html is the source of the card every link to the site unfurls into (og:image and twitter:image on every route), and
  //   apps/site/public/site.webmanifest is what a phone shows when the site is added to the home screen. Neither is a page, so the walk above
  //   never opened either, and both read "Describe a Roblox game. StudPilot builds it." (whole-game framing, and the competitor shape this
  //   file bans) while this check printed CLEAN. They are in the denominator now. ]]
  for (const surface of [join(ROOT, 'apps', 'site', 'brand', 'og.html'), join(ROOT, 'apps', 'site', 'public', 'site.webmanifest')]) {
    if (existsSync(surface)) out.push(surface);
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
    .replace(/<!--[\s\S]*?-->/g, ' ')        // HTML comments (the share card's own explanation)
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
