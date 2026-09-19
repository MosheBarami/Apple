// The redesigned root uses a small CSS atmosphere instead of a banner image or a JavaScript
// animation. Assert the mechanisms that make that claim observable: real moving layers, named
// keyframes with positive durations, a reduced-motion stop, and one dark-only palette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('the hero has an accessible CSS atmosphere and no script or banner canvas', () => {
  const hero = /<section\b[^>]*\bclass=["']hero["'][\s\S]*?<\/section>/i.exec(PAGE);
  assert.ok(hero, 'could not locate the redesigned .hero section');
  const html = hero[0];
  assert.match(html, /class=["']atmosphere["']/,
    'the hero has no atmosphere container for its decorative motion');
  assert.match(html, /class=["']light-column["']/,
    'the atmosphere has no light-column layer');
  assert.match(html, /<svg\b/i,
    'the atmosphere has no wave SVG layer');
  assert.match(html, /aria-hidden=["']true["']/,
    'decorative atmosphere is not hidden from assistive technology');
  assert.doesNotMatch(PAGE, /<canvas\b|<script\b/i,
    'the root route contains a script/canvas animation instead of the zero-JavaScript CSS field');
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

test('the landing uses one dark-only palette, with no dormant light/theme override', () => {
  const root = topLevel(':root');
  assert.ok(root, 'landing.css has no top-level :root palette');
  const scheme = decl(root.body, 'color-scheme');
  assert.equal(scheme, 'dark', 'the root palette must declare color-scheme: dark');
  for (const token of ['--ground', '--surface', '--ink', '--ink-secondary', '--muted', '--line']) {
    assert.match(root.body, new RegExp(`${token}\\s*:`),
      `the dark palette has no ${token} token`);
  }

  // The route is intentionally dark-only. A second theme or a light system override would make
  // the landing's initial pixels depend on a preference the redesign does not support.
  assert.doesNotMatch(CSS, /prefers-color-scheme|data-theme|color-scheme\s*:\s*(?:light|light\s+dark)/i,
    'landing.css carries a dormant light/theme override despite the dark-only design');
  const ground = hexLuminance((/--ground\s*:\s*([^;]+)/i.exec(root.body) ?? [])[1] ?? '');
  const surface = hexLuminance((/--surface\s*:\s*([^;]+)/i.exec(root.body) ?? [])[1] ?? '');
  const ink = hexLuminance((/--ink\s*:\s*([^;]+)/i.exec(root.body) ?? [])[1] ?? '');
  assert.ok(ground !== null && ground < 0.08, `--ground is not a dark surface (${ground})`);
  assert.ok(surface !== null && surface < 0.16, `--surface is not a dark surface (${surface})`);
  assert.ok(ink !== null && ink > 0.75, `--ink is not readable light text (${ink})`);
});
