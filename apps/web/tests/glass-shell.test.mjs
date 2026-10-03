/**
 * THE GLASS SHELL (D-GLASS-1): frosted, matte, softly animated — and still readable, still calm for
 * somebody who asked for less motion, and still cheap to scroll.
 *
 * design/glass.css is the owner's 2026-09-24 visual pass over the app shell: an ambient aurora in the
 * brand blue and violet behind translucent "matte glass" surfaces, with hover lift, press squish and
 * soft entrances. Each test below states a property that pass must keep, not a spelling of it:
 *
 *   1. it loads last, so it is the layer that paints;
 *   2. every text ink clears 4.5:1 on the WORST pixel it can land on — the page with every aurora
 *      layer stacked at full strength, bare and under each glass fill — in both themes;
 *   3. nothing that lifts or squishes under the pointer keeps moving for a reduced-motion reader,
 *      whether they asked through the OS or through the app's own preference;
 *   4. the ambient layer stops whenever the workspace marks it still (hidden tab, reduced motion);
 *   5. blur is spent on single chrome surfaces, never on things a list repeats;
 *   6. focus stays visible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const GLASS_PATH = join(WEB, 'src', 'design', 'glass.css');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (...p) => strip(readFileSync(join(WEB, ...p), 'utf8'));
const glass = () => {
  assert.ok(existsSync(GLASS_PATH), 'src/design/glass.css does not exist — the glass pass has not landed');
  return strip(readFileSync(GLASS_PATH, 'utf8'));
};

/** Every style rule as {selector, body, media}, at any @media depth. */
function rules(css) {
  const out = [];
  const walk = (src, media) => {
    let i = 0;
    let head = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '{') {
        let depth = 0, end = -1;
        for (let j = i; j < src.length; j++) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
        }
        const sel = head.trim();
        const body = src.slice(i + 1, end);
        if (sel.startsWith('@media') || sel.startsWith('@supports')) walk(body, `${media} ${sel}`);
        else if (!sel.startsWith('@')) out.push({ selector: sel.replace(/\s+/g, ' '), body, media });
        i = end + 1;
        head = '';
        continue;
      }
      if (c === '}' || c === ';') { head = ''; i++; continue; }
      head += c;
      i++;
    }
  };
  walk(css, '');
  return out;
}

/** The custom properties declared by the first rule whose selector is exactly `selector`. */
function tokens(css, selector) {
  const r = rules(css).find((x) => x.selector === selector && !x.media);
  assert.ok(r, `no top-level ${selector} rule`);
  const out = {};
  for (const [, name, value] of r.body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

function rgba(value) {
  const v = value.trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)).concat(1);
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  assert.ok(m, `"${v}" is not a literal colour this check can measure — keep glass tokens as hex or rgba()`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

const over = (bg, fg) => [0, 1, 2].map((k) => fg[k] * fg[3] + bg[k] * (1 - fg[3])).concat(1);
function luminance([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** Split a selector list at its top-level commas only, so `:is(a,b)` stays one part. */
function parts(selector) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of selector) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  return out.concat(cur.trim()).filter(Boolean);
}

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('glass.css loads after every other global sheet, so it is the layer that paints', () => {
  glass();
  const main = strip(readFileSync(join(WEB, 'src', 'main.tsx'), 'utf8'));
  const at = (name) => main.search(new RegExp(`import\\s+['"]\\./design/${name}\\.css['"]`));
  assert.notEqual(at('glass'), -1, 'main.tsx does not import design/glass.css');
  assert.ok(at('glass') > at('apple-minimal') && at('glass') > at('system'), 'glass.css must be imported after system.css and apple-minimal.css');
});

test('every text ink clears 4.5:1 on the worst pixel of the aurora, bare and under each glass fill, in both themes', () => {
  const G = glass();
  const APPLE = read('src', 'design', 'apple-minimal.css');
  const NM = read('src', 'routes', 'nonworkspace-minimal.css');
  const themes = [
    ['dark', ':root', ':is(.page.shelf,.page.usage-page,.page.settings-page,.auth-page)'],
    ['light', ":root[data-theme='light']", ":root[data-theme='light'] :is(.page.shelf,.page.usage-page,.page.settings-page,.auth-page)"],
  ];
  let measured = 0;
  for (const [theme, rootSel, nmSel] of themes) {
    const g = tokens(G, rootSel);
    const a = tokens(APPLE, rootSel);
    const n = tokens(NM, nmSel);
    const aurora = Object.keys(g).filter((k) => /^aurora-\d+$/.test(k));
    const fills = Object.keys(g).filter((k) => /^glass-fill/.test(k));
    assert.ok(aurora.length >= 2, `${theme}: expected the aurora's colours as --aurora-N tokens, found ${aurora.length}`);
    assert.ok(fills.length >= 2, `${theme}: expected --glass-fill* tokens, found ${fills.length}`);
    // Worst case: every aurora layer overlapping at full strength on the page colour.
    const ground = aurora.reduce((bg, k) => over(bg, rgba(g[k])), rgba(a.paper));
    const inks = { ink: a.ink, muted: a.muted, faint: a.faint, 'nm-ink': n['nm-ink'], 'nm-muted': n['nm-muted'], 'nm-faint': n['nm-faint'] };
    for (const [surface, bg] of [['bare aurora', ground], ...fills.map((f) => [f, over(ground, rgba(g[f]))])]) {
      for (const [name, value] of Object.entries(inks)) {
        assert.ok(value, `${theme}: ink --${name} not found`);
        const ratio = contrast(rgba(value), bg);
        assert.ok(ratio >= 4.5, `${theme}: --${name} on ${surface} is ${ratio.toFixed(2)}:1, below 4.5:1`);
        measured++;
      }
    }
  }
  assert.ok(measured >= 36, `only ${measured} pairs measured — the check has gone vacuous`);
});

test('nothing that lifts or squishes under the pointer moves for a reduced-motion reader (OS or app setting)', () => {
  const all = rules(glass());
  const moving = all.filter((r) => !/reduce/.test(r.media) && /:(hover|active)/.test(r.selector)
    && /(^|;)\s*(transform|translate|scale)\s*:\s*(?!none)/.test(r.body));
  assert.ok(moving.length > 0, 'no hover/press motion found in glass.css — this check would be vacuous');
  const stills = all.filter((r) => /(^|;)\s*(transform|translate|scale)\s*:\s*none/.test(r.body));
  const osStill = stills.filter((r) => /prefers-reduced-motion:\s*reduce/.test(r.media)).map((r) => r.selector).join(' ');
  const appStill = stills.filter((r) => r.selector.includes('.motion-reduced')).map((r) => r.selector).join(' ');
  for (const r of moving) {
    for (const part of parts(r.selector)) {
      assert.ok(osStill.includes(part), `"${part}" moves on hover/press but is not stilled under prefers-reduced-motion`);
      assert.ok(appStill.includes(part), `"${part}" moves on hover/press but is not stilled under .motion-reduced`);
    }
  }
});

test('the ambient layer stops whenever the workspace marks it still (hidden tab or reduced motion)', () => {
  const all = rules(glass());
  const animated = all.filter((r) => r.selector.includes('studio-atmosphere') && !r.selector.includes('is-still')
    && /(^|;)\s*animation\s*:\s*(?!none)/.test(r.body));
  assert.ok(animated.length > 0, 'glass.css animates no ambient layer — nothing to check');
  const still = all.filter((r) => r.selector.includes('.studio-atmosphere.is-still') && /animation\s*:\s*none/.test(r.body))
    .map((r) => r.selector).join(' ');
  for (const r of animated) {
    for (const part of parts(r.selector)) {
      const tail = part.slice(part.indexOf('.studio-atmosphere') + '.studio-atmosphere'.length);
      assert.ok(still.includes(`.studio-atmosphere.is-still${tail}`), `"${part}" animates but has no .is-still stop`);
    }
  }
  // And the ambient layer is actually shown on the shell, over apple-minimal's !important hide.
  const shown = all.some((r) => /studio-atmosphere\b(?!__)/.test(r.selector) && /display\s*:\s*block\s*!important/.test(r.body));
  assert.ok(shown, 'the ambient layer is still hidden on the shell');
});

test('blur is spent on single chrome surfaces, never on items a list repeats, and will-change stays rare', () => {
  const all = rules(glass());
  const blurred = all.filter((r) => /(^|;)\s*(-webkit-)?backdrop-filter\s*:\s*(?!none)/.test(r.body));
  assert.ok(blurred.length > 0, 'glass.css blurs nothing — this check would be vacuous');
  for (const r of blurred) {
    assert.doesNotMatch(r.selector, /card|plan\b|row|item|link|chip|tag|__cell/, `backdrop-filter on a repeated item: ${r.selector}`);
  }
  const hints = all.filter((r) => /(^|;)\s*will-change\s*:/.test(r.body));
  assert.ok(hints.length <= 1, `will-change declared ${hints.length} times; keep it to the one ambient layer`);
});

test('focus stays visible: glass.css never removes an outline on focus', () => {
  for (const r of rules(glass())) {
    if (!/:focus/.test(r.selector)) continue;
    assert.doesNotMatch(r.body, /(^|;)\s*outline\s*:\s*(none|0)\b/, `outline removed on ${r.selector}`);
  }
});
