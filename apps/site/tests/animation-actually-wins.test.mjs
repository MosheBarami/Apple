/**
 * A KEYFRAME THAT NEVER WINS THE CASCADE IS DEAD CODE, AND THE OBVIOUS CHECK CANNOT SEE IT.
 *
 * WHY THIS FILE EXISTS. landing.css declared `fade-in-soft` and applied it with
 * `.u-fade, .sky { animation: fade-in-soft 0.9s ease-out; }`, under a comment asserting "IT IS
 * AIMED AT `.sky`, WHICH IS ON THE PAGE". The assertion was false at runtime. `.sky` is the
 * `<svg class="sky">` inside `<div class="atmosphere">`, and `.atmosphere svg` — specificity
 * (0,1,1), five hundred lines earlier — beats `.sky` (0,1,0) on a SHORTHAND, which replaces the
 * whole declaration rather than merging into it. In a real browser
 * `getComputedStyle('.sky').animationName` returned `drift`. Nothing on the built page ever
 * animated with `fade-in-soft`, and `.u-fade` matched no element in any .astro file either, so the
 * keyframe was dead twice over while a comment swore it was live.
 *
 * THE CHECK THAT MISSED IT is the one everybody writes first, and it is in this very suite:
 * living-background.test.mjs asserts that every `animation:` value names a real `@keyframes`. That
 * is the FORWARD direction and it passes here, because the rule genuinely exists. It simply never
 * wins. I also checked this myself by grepping the built CSS for each keyframe name inside an
 * `animation:` value and reported "28 of 28 reached" — which was wrong for exactly the same reason.
 * A name appearing in a declaration says nothing about whether that declaration survives the
 * cascade.
 *
 * SO THIS RESOLVES THE CASCADE, over the real page. It reads the elements out of index.astro,
 * matches landing.css's selectors against them, and for each element keeps the winner by
 * (specificity, then source order) — which is what a browser does. Then it asks the question that
 * matters: for each declared keyframe, is there an element on the page whose WINNING animation is
 * that keyframe?
 *
 * WHAT IT DELIBERATELY DOES NOT DO, stated so nobody mistakes its silence for coverage:
 *   - it does not evaluate media queries; rules inside @media are collected but a rule that only
 *     applies at one width is exempted rather than resolved, because the harness has no viewport
 *   - it does not resolve pseudo-CLASS rules (:hover, :active, :focus-visible). Those apply only in
 *     a state this harness cannot enter, so a keyframe reached ONLY that way is exempted BY NAME
 *     below, which keeps the exemption a decision somebody made rather than a hole
 *   - it does not understand `>`, `+`, `~`, or attribute selectors; a rule using one is exempted
 *     and counted, and the count is asserted to stay small so the exemptions cannot quietly grow
 *     into the whole sheet
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(SITE, 'src', 'styles', 'landing.css'), 'utf8');
// BOTH the page AND the layout that wraps it. The first version of this file read index.astro
// alone and reported `.site-nav a { animation: slide-in-down }` as dead — the nav is in
// Landing.astro. A harness that reads half the markup reports the other half as missing.
// EVERY .astro under src, because markup is spread across pages, layouts AND components. Reading
// index.astro alone reported `.site-nav a` as dead (the nav is a component); reading the layout too
// was still not enough. A harness that reads a subset of the markup reports the rest as missing.
function astroSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...astroSources(full));
    else if (entry.name.endsWith('.astro')) out.push(readFileSync(full, 'utf8'));
  }
  return out;
}
const PAGE = astroSources(join(SITE, 'src')).join('\n');

/**
 * Keyframes reached only through a state this harness cannot enter. Each one is named on purpose:
 * an unnamed exemption is how a dead keyframe hides. The rule that reaches each is given so the
 * next reader can check the exemption is still true rather than inherited.
 */
const STATE_ONLY = new Map([
  ['press-in', '.u-press:active, .pill:active — a pointer is down'],
  ['nudge', '.u-nudge:hover, .pill-icon:hover .icon-sun — a pointer is over'],
]);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Every declared @keyframes name, with its block, so an empty one can be caught too. */
function declaredKeyframes(css) {
  const out = new Map();
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out.set(m[1], css.slice(re.lastIndex, i - 1));
  }
  return out;
}

/** Top-level rules in source order, plus whether each sat inside an at-rule. */
function flatRules(css) {
  const out = [];
  const walk = (text, inAt, offset) => {
    let i = 0;
    let head = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '{') {
        let depth = 1;
        let j = i + 1;
        while (j < text.length && depth) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}') depth--;
          j++;
        }
        const body = text.slice(i + 1, j - 1);
        const selector = head.trim();
        if (selector.startsWith('@')) {
          // `@supports` and feature/motion media are conditions this page really meets; only a
          // WIDTH-gated rule is genuinely unresolvable without a viewport. Skipping every at-rule
          // reported `.step { animation: step-focus }` — which lives inside
          // `@supports (animation-timeline: view())` — as dead code.
          // ALSO GATED: `prefers-reduced-motion: reduce`. That block ends with a universal
          // `* { animation: none }`, and once it is resolved it wins on every element by source
          // order and reports the ENTIRE sheet as dead. It describes a state the default page is
          // not in. `no-preference` is the default state and IS resolved.
          const widthGated = /\(\s*(?:min|max)-(?:width|height)/i.test(selector)
            || /prefers-reduced-motion\s*:\s*reduce/i.test(selector)
            || /prefers-contrast|forced-colors|print/i.test(selector);
          if (!/^@keyframes\b/i.test(selector)) walk(body, inAt || widthGated, offset + i + 1);
        } else if (selector) {
          out.push({ selector, body, inAt, at: offset + i });
        }
        head = '';
        i = j;
        continue;
      }
      if (ch === '}') { head = ''; i++; continue; }
      head += ch;
      i++;
    }
  };
  walk(css, false, 0);
  return out;
}

/** (ids, classes+pseudo-classes, types) — the browser's own tuple, minus inline and !important. */
function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) ?? []).length;
  const classes = (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (sel.replace(/::?[\w-]+(\([^)]*\))?/g, ' ').match(/(?:^|[\s>+~])([a-zA-Z][\w-]*)/g) ?? []).length;
  return [ids, classes, types];
}

const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

/** Elements on the page: tag plus classes, with their ancestor chain. */
function elements(page) {
  const out = [];
  const stack = [];
  const re = /<(\/)?([a-zA-Z][\w-]*)([^>]*?)(\/)?>/g;
  let m;
  while ((m = re.exec(page))) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (closing) { stack.pop(); continue; }
    const cls = /\bclass=["']([^"']*)["']/.exec(attrs);
    const node = { tag: tag.toLowerCase(), classes: (cls?.[1] ?? '').split(/\s+/).filter(Boolean) };
    out.push({ ...node, ancestors: [...stack] });
    if (!selfClosing && !/^(img|br|hr|input|meta|link|path|circle|rect|stop|use)$/i.test(tag)) stack.push(node);
  }
  return out;
}

/** Does one compound (`svg.sky`, `.pill`, `h1`) describe this node? */
function compoundMatches(compound, node) {
  const tag = /^([a-zA-Z][\w-]*)/.exec(compound);
  if (tag && tag[1].toLowerCase() !== node.tag) return false;
  const classes = compound.match(/\.([\w-]+)/g) ?? [];
  return classes.every((c) => node.classes.includes(c.slice(1)));
}

/**
 * Descendant combinators and pseudo-elements. Anything fancier is UNRESOLVED, not absent.
 *
 * A PSEUDO-ELEMENT IS NOT A DIFFERENT ELEMENT for this question. `.card-media::after` animates a
 * box generated on `.card-media`; if that element is on the page, the rule reaches something. The
 * first version of this file treated `::` as unparseable and so reported six keyframes — pulse,
 * shimmer, scan-line, border-travel, count-up, ambient-drift — as dead when every one of them was
 * live on a pseudo-element. That is the exact failure this file exists to catch, committed by the
 * file itself: an inability to observe, reported as an observation.
 */
function selectorMatches(sel, el) {
  if (/[>+~]|\[|:not\(|:is\(|:where\(/.test(sel)) return 'unsupported';
  const parts = sel.trim().replace(/::[\w-]+/g, '').split(/\s+/).filter(Boolean);
  if (!parts.length) return 'unsupported';
  // A pseudo-CLASS describes a state this harness cannot enter, and its extra specificity would
  // otherwise let `.site-nav a:active { animation: press-in }` outrank the resting rule on the same
  // element and hide it. Resting state only.
  if (/(?<!:):(?!:)[\w-]/.test(sel)) return 'unsupported';
  if (!compoundMatches(parts[parts.length - 1], el)) return false;
  let remaining = parts.slice(0, -1);
  const chain = [...el.ancestors].reverse();
  for (const want of [...remaining].reverse()) {
    const hit = chain.findIndex((a) => compoundMatches(want, a));
    if (hit === -1) return false;
    chain.splice(0, hit + 1);
  }
  return true;
}

const KEYFRAMES = declaredKeyframes(stripComments(CSS));
const RULES = flatRules(stripComments(CSS)).filter((r) => /(?:^|[;{\s])animation(?:-name)?\s*:/.test(r.body));
const ELEMENTS = elements(PAGE);

/** The keyframe name out of an `animation` shorthand or `animation-name`. */
function namesIn(body) {
  const decl = /(?:^|[;{\s])animation(?:-name)?\s*:\s*([^;}]+)/i.exec(body);
  if (!decl) return [];
  return decl[1].split(',').map((part) => part.trim().split(/\s+/).find((w) =>
    /^[a-zA-Z_-][\w-]*$/.test(w) && !/^(infinite|alternate|alternate-reverse|linear|both|forwards|backwards|reverse|normal|none|paused|running|ease|ease-in|ease-out|ease-in-out|step-start|step-end|var)$/i.test(w)
    && !/^\d/.test(w))).filter(Boolean);
}

test('the harness read a real sheet and a real page, so nothing below is vacuous', () => {
  assert.ok(KEYFRAMES.size >= 10, `only ${KEYFRAMES.size} keyframes parsed; the parse has drifted`);
  assert.ok(RULES.length >= 10, `only ${RULES.length} animation rules parsed; the parse has drifted`);
  assert.ok(ELEMENTS.length >= 40, `only ${ELEMENTS.length} elements parsed from index.astro`);
  assert.ok(ELEMENTS.some((e) => e.classes.includes('sky')),
    'the .sky element was not found; the very element this file was written about is unparsed');
});

test('every declared keyframe actually WINS on some element of the page', () => {
  // Resolve the winner per element the way a browser does: highest specificity, then source order.
  const winners = new Set();
  let unsupported = 0;

  for (const el of ELEMENTS) {
    // `::before` and `::after` are SEPARATE BOXES generated on one element; they do not compete
    // with each other or with the element itself. Collapsing all three into one winner reported
    // border-travel (on .card-media::before) as dead because shimmer (.card-media::after) came
    // later in the sheet. The cascade is resolved once per (element, pseudo) target.
    const byTarget = new Map();
    for (const rule of RULES) {
      if (rule.inAt) continue;                       // gated; see the header note
      for (const sel of rule.selector.split(',').map((s) => s.trim())) {
        const hit = selectorMatches(sel, el);
        if (hit === 'unsupported') { unsupported++; continue; }
        if (!hit) continue;
        const pseudo = (/::([\w-]+)/.exec(sel) ?? [, ''])[1];
        const spec = specificity(sel);
        const cur = byTarget.get(pseudo);
        if (!cur || cmp(spec, cur.spec) > 0 || (cmp(spec, cur.spec) === 0 && rule.at > cur.at)) {
          byTarget.set(pseudo, { spec, at: rule.at, body: rule.body });
        }
      }
    }
    for (const best of byTarget.values()) for (const n of namesIn(best.body)) winners.add(n);
  }

  // A keyframe whose ONLY rules use a combinator this harness cannot resolve is not dead — it is
  // unobserved, and the two must never be reported as the same thing. `.u-stagger > *` is the live
  // example. These are listed separately and their count is bounded, so an unresolved set cannot
  // quietly grow until it covers a real defect.
  const unresolvable = new Set();
  for (const rule of RULES) {
    const sels = rule.selector.split(',').map((x) => x.trim());
    if (!sels.every((x) => /[>+~]|\[|:not\(|:is\(|:where\(/.test(x))) continue;
    for (const n of namesIn(rule.body)) if (!winners.has(n)) unresolvable.add(n);
  }

  const dead = [...KEYFRAMES.keys()]
    .filter((n) => !winners.has(n) && !STATE_ONLY.has(n) && !unresolvable.has(n));

  assert.ok(unresolvable.size <= 3,
    `${unresolvable.size} keyframes are reachable only through selectors this harness cannot `
    + `resolve (${[...unresolvable].join(', ')}). Above three, this exemption is wide enough to be `
    + 'hiding the dead code the file looks for — teach the matcher the combinator instead.');

  assert.deepEqual(dead, [],
    'these keyframes are declared and never win the cascade on any element of the landing page, so '
    + 'nothing animates with them — which is what happened to fade-in-soft, under a comment '
    + `asserting the opposite: ${dead.join(', ')}`);

  // The exemptions must not quietly become the answer.
  assert.ok(unsupported < RULES.length * ELEMENTS.length * 0.5,
    `${unsupported} selector/element pairs used combinators this harness cannot resolve; the `
    + 'exemption is now large enough to be hiding the thing this file looks for');
});

test('a state-only exemption names a rule that still exists', () => {
  for (const [name, why] of STATE_ONLY) {
    assert.ok(KEYFRAMES.has(name), `${name} is exempted as state-only but is no longer declared`);
    const reached = RULES.some((r) => /:hover|:active|:focus/.test(r.selector) && namesIn(r.body).includes(name));
    assert.ok(reached,
      `${name} is exempted as reachable only through a state (${why}), but no :hover/:active/:focus `
      + 'rule names it any more — the exemption has outlived its reason and must be removed');
  }
});

test('no keyframe is declared with an empty body', () => {
  const hollow = [...KEYFRAMES.entries()]
    .filter(([, body]) => !/(?:from|to|\d+%)\s*\{/i.test(body))
    .map(([name]) => name);
  assert.deepEqual(hollow, [], `these keyframes have no frame block at all: ${hollow.join(', ')}`);
});
