// The redesigned root uses a small CSS atmosphere instead of a banner image or a JavaScript
// animation. Assert the mechanisms that make that claim observable: real moving layers, named
// keyframes with positive durations, a reduced-motion stop, and one dark-only palette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_FILE = join(SITE, 'src', 'pages', 'index.astro');
const SHEET_FILE = join(SITE, 'src', 'styles', 'landing.css');

function read(file) {
  const source = readFileSync(file, 'utf8');
  assert.ok(source.trim(), `${file} is empty — this harness observed no landing source`);
  return source;
}

// Remove comments before parsing selectors. A description of a deleted layer must not make a
// stale selector look live, and a URL's `//` must not turn the remainder of a declaration into a
// comment.
const stripComments = (source) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Flatten CSS rules while retaining the at-rule stack around each rule. */
function rules(css) {
  const out = [];
  const walk = (text, at) => {
    let i = 0;
    let head = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '{') {
        let depth = 1;
        let j = i + 1;
        while (j < text.length && depth > 0) {
          if (text[j] === '{') depth += 1;
          else if (text[j] === '}') depth -= 1;
          j += 1;
        }
        const body = text.slice(i + 1, j - 1);
        const selector = head.trim();
        if (selector.startsWith('@')) {
          // Keyframes contain percentage blocks, not ordinary CSS rules. Keep the whole block so
          // the animation checks can verify that the name has an actual body.
          if (/^@keyframes\b/i.test(selector)) out.push({ selector, body, at });
          else walk(body, [...at, selector]);
        } else {
          out.push({ selector, body, at });
        }
        head = '';
        i = j;
        continue;
      }
      if (ch === '}') { head = ''; i += 1; continue; }
      head += ch;
      i += 1;
    }
  };
  walk(css, []);
  return out;
}

const PAGE = read(PAGE_FILE);
const CSS = stripComments(read(SHEET_FILE));
const ALL = rules(CSS);
const decl = (body, property) => {
  const match = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;}]+)`, 'i').exec(body);
  return match ? match[1].trim() : null;
};
const topLevel = (selector) => ALL.find((rule) => !rule.at.length && rule.selector.trim() === selector);
const selectors = (rule) => rule.selector.split(',').map((item) => item.trim()).filter(Boolean);
const keyframes = (name) => ALL.find((rule) => !rule.at.length
  && new RegExp(`^@keyframes\\s+${name}$`, 'i').test(rule.selector.trim()));

/** Read the first CSS time in an animation shorthand. */
function durationMs(value) {
  const match = /(^|\s)(-?\d*\.?\d+)\s*(ms|s)(?=\s|$)/i.exec(value);
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isFinite(number)) return null;
  return match[3].toLowerCase() === 'ms' ? number : number * 1000;
}

function animationName(value) {
  return value.split(/\s+/).find((part) => /^[a-zA-Z_-][\w-]*$/.test(part)
    && !/^(?:infinite|alternate|linear|both|forwards|backwards|reverse|normal|none|paused|running|ease(?:-in|-out|-in-out)?|step-start|step-end)$/i.test(part));
}

function hexLuminance(value) {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const raw = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  const channels = [0, 2, 4].map((at) => Number.parseInt(raw.slice(at, at + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * The atmosphere container's OWN markup, found by balancing `<div>` tags from its opening one.
 *
 * WHY THIS EXISTS, WRITTEN ON THE DAY IT WAS NEEDED (2026-09-20). The three assertions below used
 * to read the whole `.hero` section, and `assert.match(html, /<svg\b/i)` was described as "the
 * atmosphere has no wave SVG layer". That held only for as long as the hero contained no other
 * SVG. The rosebud restructure put an attachment control in the composer with a 15px paperclip
 * icon in it, and from that moment the assertion was satisfied by the paperclip: deleting the
 * ENTIRE atmosphere SVG — twenty-six strata and both ridges — left this file green.
 *
 * That was proved rather than suspected. The mutation was applied, the suite was run, and it
 * reported 203 of 203 passing over a hero with no line art in it at all.
 *
 * A guard that names one layer and is satisfied by an icon somewhere else on the page is the
 * observation failure this repository keeps a file about: blind reads exactly like compliant. So
 * the scope is now the container the layer actually lives in, which is what the message always
 * claimed. Nothing is weakened — this can only turn red in cases where the old one also would.
 */
/**
 * The page's MARKUP, with the prose stripped out of it.
 *
 * `PAGE` stays raw on purpose for the forbidden-name check at the foot of this test — a banner
 * commented out today is uncommented tomorrow, and that check is about content. The STRUCTURAL
 * scans below are the opposite case and need the opposite input.
 *
 * MEASURED, not anticipated. The mount check written directly under this found `<Horizon />` in the
 * index's own JSX comment — a paragraph explaining that the component replaced the flow field —
 * so deleting the real mount from the hero left the guard green over an atmosphere with no canvas
 * in it. A comment that DESCRIBES a mount is not a mount, and a guard that cannot tell the
 * difference is reading a page's prose about itself.
 */
const MARKUP = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

function atmosphereOf(html) {
  const open = /<div\b[^>]*class=["']atmosphere["'][^>]*>/i.exec(html);
  if (!open) return null;
  const tag = /<\/?div\b[^>]*>/gi;
  tag.lastIndex = open.index + open[0].length;
  let depth = 1;
  let match;
  while ((match = tag.exec(html))) {
    depth += match[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(open.index, match.index + match[0].length);
  }
  return null;
}

test('the hero has an accessible CSS atmosphere and no script or banner canvas', () => {
  const hero = /<section\b[^>]*\bclass=["']hero["'][\s\S]*?<\/section>/i.exec(MARKUP);
  assert.ok(hero, 'could not locate the redesigned .hero section');
  const html = hero[0];
  assert.match(html, /class=["']atmosphere["']/,
    'the hero has no atmosphere container for its decorative motion');
  const atmosphere = atmosphereOf(html);
  assert.ok(atmosphere, 'the atmosphere container is not a balanced <div>; nothing below read it');
  assert.match(atmosphere, /class=["']light-column["']/,
    'the atmosphere has no light-column layer');
  assert.match(atmosphere, /<svg\b/i,
    'the atmosphere has no wave SVG layer');
  assert.match(html, /aria-hidden=["']true["']/,
    'decorative atmosphere is not hidden from assistive technology');
  //[[ RE-AIMED, AND IT WAS BLIND BEFORE IT WAS WRONG.
  //
  //   This line used to read `assert.doesNotMatch(PAGE, /<canvas\b|<script\b/i)` with the reason
  //   "the root route contains a script/canvas animation instead of the zero-JavaScript CSS field".
  //
  //   TWO SEPARATE THINGS WERE WRONG WITH IT, and the second is the one worth remembering.
  //
  //   1. The decision it defended is reversed. Zero-JavaScript was a choice this file made on the
  //      landing's behalf; the owner has said repeatedly, over weeks, that the page reads as a
  //      screenshot and asked for motion that answers the pointer. CSS cannot do that. So a canvas
  //      on the root route is now correct, and a guard forbidding one defends a decision nobody
  //      holds any more.
  //
  //   2. IT NEVER WENT RED ANYWAY. A canvas and a script DID ship to the root route — they simply
  //      shipped inside `components/FlowField.astro`, and this assertion reads the text of
  //      index.astro only. Moving the markup one file away did not make the guard fail; it made the
  //      guard BLIND, and blind reads exactly like compliant. It was green over the very thing it
  //      forbade, on the same deploy in which that thing was also completely broken.
  //
  //   So what is asserted now is the property that actually survives the reversal: the CSS
  //   atmosphere must still carry the hero ON ITS OWN. The canvas is ADDITIVE. If its script throws,
  //   is blocked, or never reaches its element — which is exactly what happened in production — the
  //   layers below it are still a composition rather than a blank panel. That is checked directly
  //   above (light-column, wave SVG, their keyframes), and pinned here against the component too, so
  //   the next piece of markup that moves out of this file cannot go unobserved the same way.
  //
  //   Whether the field DRAWS is a different question and not answerable from source text at all.
  //   `tests/flow-field-runs.test.mjs` executes the script and counts strokes; that is the guard
  //   that would have caught the shipped defect, and it is red without this one's help.
  //[[ RE-AIMED AGAIN 2026-09-20, AND FOR THE THIRD TIME BECAUSE IT WENT BLIND RATHER THAN WRONG.
  //
  //   What was here read `const FIELD = readFileSync(... 'FlowField.astro')` followed by
  //   `if (/<FlowField\b/.test(html)) { ... }`, and it had two holes that were measured, not
  //   guessed, by removing the mount and running the suite:
  //
  //   1. IT NAMED ONE COMPONENT. The hero's canvas is now <Horizon />, and the moment the mount
  //      changed name this whole block stopped running — silently, because an `if` that is false
  //      is indistinguishable from an `if` that passed. The canvas could have shipped with no
  //      reduced-motion path and no visibilitychange stop and this file would have said nothing.
  //   2. IT NEVER REQUIRED A MOUNT AT ALL. Deleting `<Horizon />` from the hero outright left the
  //      suite at 203 of 203. `tests/horizon-runs.test.mjs` executes the component, so it proves
  //      the canvas DRAWS — but nothing anywhere proved the page still puts it on screen, which is
  //      the same one-file-away blindness recorded in the note above this one.
  //
  //   So the mount is discovered instead of named. Every component the atmosphere mounts is read;
  //   at least one of them must render a canvas, and EVERY one that renders a canvas must also give
  //   that canvas up under reduced motion and on a hidden tab. Renaming the component keeps this
  //   green. Removing it, or adding a second canvas layer that never stops, turns it red. ]]
  const mounted = [...atmosphere.matchAll(/<([A-Z][A-Za-z0-9]*)\b[^>]*\/?>/g)].map((m) => m[1]);
  const withCanvas = [];
  for (const name of new Set(mounted)) {
    const file = join(SITE, 'src', 'components', `${name}.astro`);
    assert.ok(existsSync(file), `the atmosphere mounts <${name} />, and no such component exists`);
    const source = readFileSync(file, 'utf8');
    if (!/<canvas\b/i.test(source)) continue;
    withCanvas.push(name);
    assert.match(source, /<canvas\b[^>]*aria-hidden=["']true["']/i,
      `${name}.astro's canvas is not hidden from assistive technology; it is decoration and announces itself`);
    assert.match(source, /prefers-reduced-motion/,
      `${name}.astro has no reduced-motion path, so it moves for somebody who asked it not to`);
    assert.match(source, /visibilitychange/,
      `${name}.astro never stops on a hidden tab, so a background tab keeps burning a core`);
  }
  assert.ok(withCanvas.length > 0,
    'the hero atmosphere mounts no component that renders a canvas. The owner asked for that layer '
    + 'by name; a page that quietly drops the mount looks identical in source to one that never had '
    + 'it, and the component test alone cannot tell the difference.');

  // The atmosphere must not become the canvas alone. These layers are what a visitor sees when the
  // script does not run, and the shipped defect is the proof that "does not run" is a real state.
  assert.match(atmosphere, /class=["']light-column["']/,
    'the JavaScript field has replaced the CSS atmosphere rather than being layered over it');

  assert.doesNotMatch(PAGE, /BuildStage|asset[-_]?wall|ap[-_]wall/i,
    'the removed build/banner surface has returned to the root route');
});

test('every declared landing animation has a named keyframe and a finite positive duration', () => {
  const animated = ALL.filter((rule) => !rule.at.length && decl(rule.body, 'animation')
    && !/^none\b/i.test(decl(rule.body, 'animation')));
  assert.ok(animated.length >= 2,
    'fewer than two top-level animation rules were observed; the CSS atmosphere may be flat');

  const atmosphereSelectors = ['.light-column', '.atmosphere svg'];
  for (const selector of atmosphereSelectors) {
    assert.ok(animated.some((rule) => selectors(rule).includes(selector)),
      `${selector} has no live top-level animation rule`);
  }

  for (const rule of animated) {
    const value = decl(rule.body, 'animation');
    const label = selectors(rule).join(', ');
    assert.ok(value, `${label} has an unreadable animation declaration`);
    const duration = durationMs(value);
    assert.ok(duration !== null && duration > 0 && Number.isFinite(duration),
      `${label} animation ${value} has no finite positive duration`);
    const name = animationName(value);
    assert.ok(name, `${label} animation ${value} has no keyframe name`);
    const frames = keyframes(name);
    assert.ok(frames, `${label} names ${name}, but @keyframes ${name} is absent`);
    assert.match(frames.body, /(?:from|to|\d+%)\s*\{/i,
      `@keyframes ${name} has no actual frame block`);
  }
});

test('reduced motion stops every landing animation without hiding content', () => {
  const reduced = ALL.filter((rule) => rule.at.some((at) => /prefers-reduced-motion\s*:\s*reduce/i.test(at)));
  assert.ok(reduced.length > 0,
    'landing.css has no prefers-reduced-motion guard');
  const stop = reduced.find((rule) => /^none\b/i.test(decl(rule.body, 'animation') ?? '')
    && /(?:^|,)\s*\*(?:::\w+)?\s*(?:,|$)/.test(rule.selector));
  assert.ok(stop,
    'reduced-motion does not stop the universal animation surface, so one new layer could keep moving');
  assert.match(decl(stop.body, 'animation') ?? '', /^none\b/i,
    'the reduced-motion stop is not animation: none');
  assert.match(decl(stop.body, 'transition') ?? '', /^none\b/i,
    'reduced-motion leaves transitions active');

  const animated = ALL.filter((rule) => !rule.at.length && decl(rule.body, 'animation')
    && !/^none\b/i.test(decl(rule.body, 'animation')));
  assert.ok(animated.length >= 2, 'the reduced-motion check has no animation rules to cover');
  for (const rule of animated) {
    const covered = reduced.some((candidate) => {
      if (!/^none\b/i.test(decl(candidate.body, 'animation') ?? '')) return false;
      const candidateSelectors = selectors(candidate);
      return candidateSelectors.some((selector) => selector === '*'
        || selector === '*::before' || selector === '*::after'
        || selectors(rule).includes(selector));
    });
    assert.ok(covered,
      `${selectors(rule).join(', ')} is not stopped under prefers-reduced-motion`);
  }
});

test('the landing is dark by default, and light only when the visitor asked for it', () => {
  const root = topLevel(':root');
  assert.ok(root, 'landing.css has no top-level :root palette');
  const scheme = decl(root.body, 'color-scheme');
  assert.equal(scheme, 'dark', 'the root palette must declare color-scheme: dark');
  for (const token of ['--ground', '--surface', '--ink', '--ink-secondary', '--muted', '--line']) {
    assert.match(root.body, new RegExp(`${token}\\s*:`),
      `the dark palette has no ${token} token`);
  }

  //[[ RE-AIMED, NOT RELAXED. This forbade `data-theme` outright, and the REASON it gave was
  //   "a second theme or a light system override would make the landing's initial pixels depend on
  //   a preference the redesign does not support". That reason is about the FIRST PAINT, and it is
  //   still enforced below — harder than before.
  //
  //   What the old rule also forbade was the explicit, opt-in light ramp, and forbidding it was a
  //   defect: the landing was the only route on the site that dropped the visitor's stored theme
  //   choice and offered no toggle. Choosing light on /pricing and clicking the wordmark landed a
  //   reader on a dark homepage they could not change.
  //
  //   So: `:root[data-theme='light']` is now REQUIRED, and `prefers-color-scheme` — the one thing
  //   that could move the initial pixels without the visitor asking — is still banned outright, as
  //   is `color-scheme: light` at the top level. Default dark; light only on request.
  assert.doesNotMatch(CSS, /prefers-color-scheme/i,
    'landing.css lets the OS decide the first paint; the landing is dark by default');
  assert.match(CSS, /:root\[data-theme='light'\]\s*\{/,
    'landing.css has no explicit light ramp, so the stored theme choice is dropped on the front page');
  // Exactly one theme override, and it is the attribute one. A second selector is how a ramp drifts.
  const overrides = CSS.match(/:root\[data-theme=[^\]]+\]\s*\{/g) ?? [];
  assert.deepEqual(overrides.map((o) => o.replace(/\s*\{$/, '')), [":root[data-theme='light']"],
    'landing.css declares a theme override other than the explicit light one');
  const ground = hexLuminance((/--ground\s*:\s*([^;]+)/i.exec(root.body) ?? [])[1] ?? '');
  const surface = hexLuminance((/--surface\s*:\s*([^;]+)/i.exec(root.body) ?? [])[1] ?? '');
  const ink = hexLuminance((/--ink\s*:\s*([^;]+)/i.exec(root.body) ?? [])[1] ?? '');
  assert.ok(ground !== null && ground < 0.08, `--ground is not a dark surface (${ground})`);
  assert.ok(surface !== null && surface < 0.16, `--surface is not a dark surface (${surface})`);
  assert.ok(ink !== null && ink > 0.75, `--ink is not readable light text (${ink})`);
});
