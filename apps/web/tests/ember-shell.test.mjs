/**
 * THE EMBER SHELL (phase 6, 2026-10-02): FLAT, HAIRLINE, ONE SIGNAL COLOUR, AND STILL READABLE,
 * STILL CALM FOR SOMEBODY WHO ASKED FOR LESS MOTION.
 *
 * This file REPLACES glass-shell.test.mjs (D-GLASS-1, 2026-09-24), which held a frosted aurora shell
 * to six properties. The owner's 2026-10-02 brief rebuilt the design from zero (D-EMBER-1), so the
 * aurora, the glass fills and the ambient layer are gone and their tests went with them: a test of a
 * layer that no longer exists cannot fail for a reason that matters. Three of its six properties are
 * carried over in their new form, because the reasons for them did not change:
 *
 *   it loads last                     -> 1. ember.css is the last global sheet and glass.css is gone
 *   ink is readable on every pixel    -> 2. every text token clears 4.5:1 on all five surfaces, the
 *                                          control boundary clears 3:1, in both themes (was: the
 *                                          worst pixel of an aurora; there is no aurora to stack now)
 *   reduced motion stills everything  -> 4. pressing and the logo's Snap are stilled for the OS
 *                                          preference AND the app's own `.motion-reduced`
 *   blur is rare                      -> 5. blur only on the top bar and the composer
 *   focus is never removed            -> 6. no rule removes an outline on focus
 *
 * and the rest are the new language's own rules: flat (no gradient, no glow, no will-change), the
 * plate edge only under the primary button, the Snap driven only by the real Studio link.
 *
 * Every value is READ out of the stylesheets, never restated here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (...p) => strip(readFileSync(join(WEB, ...p), 'utf8'));
const EMBER = read('src', 'design', 'ember.css');
const MINIMAL = read('src', 'design', 'apple-minimal.css');

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

/** The custom properties declared by the first top-level rule whose selector is exactly `selector`. */
function tokens(css, selector) {
  const r = rules(css).find((x) => x.selector === selector && !x.media);
  assert.ok(r, `no top-level ${selector} rule`);
  const out = {};
  for (const [, name, value] of r.body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

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

test('ember.css is the last global sheet, and the glass shell is gone', () => {
  assert.ok(existsSync(join(WEB, 'src', 'design', 'ember.css')), 'src/design/ember.css does not exist');
  assert.ok(!existsSync(join(WEB, 'src', 'design', 'glass.css')), 'glass.css is back: the aurora shell was retired (D-EMBER-1)');
  const main = strip(readFileSync(join(WEB, 'src', 'main.tsx'), 'utf8'));
  const at = (name) => main.search(new RegExp(`import\\s+['"]\\./design/${name}\\.css['"]`));
  assert.notEqual(at('ember'), -1, 'main.tsx does not import design/ember.css');
  assert.ok(at('ember') > at('apple-minimal') && at('ember') > at('system'), 'ember.css must be imported after system.css and apple-minimal.css');
  assert.doesNotMatch(main, /glass\.css/, 'main.tsx still imports glass.css');
});

test('every text token clears 4.5:1 and every control boundary 3:1 on all five surfaces, in both themes', () => {
  let measured = 0;
  for (const [theme, selector] of [['dark', ':root'], ['light', ":root[data-theme='light']"]]) {
    const t = tokens(MINIMAL, selector);
    const surfaces = ['paper', 'paper-2', 'surface', 'surface-2', 'surface-3'];
    for (const s of surfaces) assert.match(t[s] ?? '', /^#[0-9a-f]{3,6}$/i, `${theme}: --${s} is not a hex colour this check can measure`);
    for (const ink of ['ink', 'ink-2', 'muted', 'faint', 'accent-text']) {
      for (const s of surfaces) {
        const r = contrast(t[ink], t[s]);
        assert.ok(r >= 4.5, `${theme}: --${ink} ${t[ink]} on --${s} ${t[s]} is ${r.toFixed(2)}:1, below 4.5:1`);
        measured += 1;
      }
    }
    for (const s of surfaces) {
      const boundary = contrast(t['line-strong'], t[s]);
      assert.ok(boundary >= 3, `${theme}: the control boundary --line-strong on --${s} is ${boundary.toFixed(2)}:1, below 3:1`);
      const ring = contrast(t.ring, t[s]);
      assert.ok(ring >= 3, `${theme}: the focus ring on --${s} is ${ring.toFixed(2)}:1, below 3:1`);
      measured += 2;
    }
    assert.ok(contrast(t['on-accent'], t.accent) >= 4.5, `${theme}: the label on the Ember button is below 4.5:1`);
    assert.ok(contrast('#ffffff', tokens(MINIMAL, ':root')['danger-fill']) >= 4.5, 'white on the danger fill is below 4.5:1');
    // The ramp descends, or the three tiers are three names for one colour.
    const ladder = ['ink', 'ink-2', 'muted', 'faint'].map((n) => contrast(t[n], t.paper));
    assert.deepEqual([...ladder].sort((a, b) => b - a), ladder, `${theme}: ink, ink-2, muted, faint no longer descend: ${ladder.map((x) => x.toFixed(1))}`);
    measured += 2;
  }
  assert.ok(measured >= 70, `only ${measured} pairs measured — the check has gone vacuous`);
});

test('the quiet page palette (--nm-*) is the same palette, written as hex because contrast.test.mjs measures it literally', () => {
  const NM = read('src', 'routes', 'nonworkspace-minimal.css');
  const pairs = [['nm-ink', 'ink'], ['nm-muted', 'muted'], ['nm-faint', 'faint'], ['nm-bg', 'paper'], ['nm-panel', 'surface']];
  const scope = ':is(.page.shelf,.page.usage-page,.page.settings-page,.auth-page)';
  for (const [theme, rootSel, nmSel] of [['dark', ':root', scope], ['light', ":root[data-theme='light']", `:root[data-theme='light'] ${scope}`]]) {
    const a = tokens(MINIMAL, rootSel);
    const n = tokens(NM, nmSel);
    for (const [nm, shared] of pairs) {
      assert.equal(n[nm].toLowerCase(), a[shared].toLowerCase().replace(/^#fff$/, '#ffffff'), `${theme}: --${nm} (${n[nm]}) has drifted from --${shared} (${a[shared]})`);
    }
  }
});

test('the shell is flat: no gradient fill, no glow, no will-change, no aurora, in the two sheets that paint it', () => {
  for (const [name, css] of [['ember.css', EMBER], ['apple-minimal.css', MINIMAL]]) {
    for (const r of rules(css)) {
      // The one gradient is the composer's scrim: it fades the page colour out under the composer so
      // the last line of a reply is not cut by a hard edge. It is functional, it is the page's own
      // colour, and it is named here so a second one has to be argued for.
      if (/background(?:-image)?\s*:[^;]*gradient\(/.test(r.body)) {
        assert.equal(r.selector, '.gx-compose-region', `${name}: a gradient fill on ${r.selector}`);
      }
      assert.doesNotMatch(r.body, /box-shadow\s*:\s*0\s+0\s+\d+px/, `${name}: a glow on ${r.selector}`);
      assert.doesNotMatch(r.body, /(^|;)\s*will-change\s*:/, `${name}: will-change on ${r.selector}`);
    }
    assert.doesNotMatch(css, /aurora|glass-fill|glass-r\b|--glass-/, `${name} still carries the glass vocabulary`);
  }
  assert.ok(rules(EMBER).length > 20, 'ember.css parsed to almost nothing; the check has gone blind');
});

test('blur is spent on the top bar and the composer, and nowhere else', () => {
  let blurred = 0;
  for (const css of [EMBER, MINIMAL]) {
    for (const r of rules(css)) {
      if (!/(^|;)\s*(-webkit-)?backdrop-filter\s*:\s*(?!none)/.test(r.body)) continue;
      blurred += 1;
      assert.match(r.selector, /topbar|gx-composer/, `backdrop-filter on ${r.selector}: only the top bar and the composer may blur`);
    }
  }
  assert.ok(blurred >= 2, `only ${blurred} blurred rule(s) found: the top bar and the composer are missing or the scan is blind`);
});

test('the plate edge (a 2px solid shade, no blur) is on the primary button, and its press goes flat', () => {
  const t = tokens(MINIMAL, ':root');
  assert.match(t['shadow-primary'], /^0 2px 0 var\(--plate\)$/, 'the primary button shadow is no longer the plate edge');
  const press = rules(EMBER).find((r) => /:active:not\(:disabled\)/.test(r.selector) && /\.btn-primary/.test(r.selector) && !r.media);
  assert.ok(press, 'no press rule for the primary button');
  assert.match(press.body, /transform\s*:\s*translateY\(2px\)/);
  assert.match(press.body, /box-shadow\s*:\s*0 0 0 var\(--plate\)/);
  // No other rule may draw a 2px solid under something: the edge belongs to the button and to bricks.
  for (const css of [EMBER]) {
    for (const r of rules(css)) {
      if (/box-shadow\s*:\s*0\s+2px\s+0\b/.test(r.body)) assert.match(r.selector, /btn|gx-send/, `a plate edge on ${r.selector}`);
    }
  }
});

test('anything that moves under the pointer or on its own is stilled for the OS preference AND the app setting', () => {
  const all = rules(EMBER);
  const moving = all.filter((r) => !/reduce/.test(r.media) && /:(active)/.test(r.selector) && /(^|;)\s*transform\s*:\s*(?!none)/.test(r.body));
  assert.ok(moving.length > 0, 'no press motion found in ember.css — this check would be vacuous');
  const stills = all.filter((r) => /(^|;)\s*transform\s*:\s*none/.test(r.body));
  const osStill = stills.filter((r) => /prefers-reduced-motion:\s*reduce/.test(r.media)).map((r) => r.selector).join(' ');
  const appStill = stills.filter((r) => r.selector.includes('.motion-reduced')).map((r) => r.selector).join(' ');
  for (const r of moving) {
    for (const part of parts(r.selector)) {
      assert.ok(osStill.includes(part), `"${part}" moves on press but is not stilled under prefers-reduced-motion`);
      assert.ok(appStill.includes(part), `"${part}" moves on press but is not stilled under .motion-reduced`);
    }
  }
  // The Snap: the stud is simply seated, and the transition is off, in both.
  for (const scope of [(r) => /prefers-reduced-motion:\s*reduce/.test(r.media), (r) => r.selector.startsWith('.motion-reduced')]) {
    const snap = all.find((r) => scope(r) && r.selector.includes('.stud--snap'));
    assert.ok(snap, 'the logo stud has no reduced-motion rule');
    assert.match(snap.body, /transition\s*:\s*none/);
    assert.match(snap.body, /transform\s*:\s*none/);
  }
  // Every menu, toast and popover entrance is off too.
  const entrances = all.filter((r) => /animation\s*:\s*none/.test(r.body) && /gx-pop|toast/.test(r.selector));
  assert.ok(entrances.some((r) => /reduce/.test(r.media)) && entrances.some((r) => r.selector.includes('.motion-reduced')), 'menu and toast entrances are not stilled for both preferences');
});

test('focus is a 2px Ember ring at a 3px offset, and no rule removes it', () => {
  const focus = rules(EMBER).find((r) => /:focus-visible/.test(r.selector) && /outline\s*:\s*2px solid var\(--ring\)/.test(r.body));
  assert.ok(focus, 'ember.css does not set the one focus ring');
  assert.match(focus.body, /outline-offset\s*:\s*3px/);
  assert.match(focus.body, /transition\s*:\s*none/);
  for (const css of [EMBER, MINIMAL]) {
    for (const r of rules(css)) {
      if (!/:focus/.test(r.selector)) continue;
      assert.doesNotMatch(r.body, /(^|;)\s*outline\s*:\s*(none|0)\b/, `outline removed on ${r.selector}`);
    }
  }
});

test('the logo is one drawing with a separate stud, and the Snap is driven only by the real Studio link', () => {
  const glyphs = readFileSync(join(WEB, 'src', 'components', 'glyphs.tsx'), 'utf8');
  assert.match(glyphs, /className="stud stud--snap"/, 'the right-hand stud is not its own shape');
  assert.match(glyphs, /data-state=\{state\}/);
  assert.doesNotMatch(glyphs.slice(glyphs.indexOf('export function AppleGlyph'), glyphs.indexOf('Small Apple status mark')), /setTimeout|setInterval|useEffect|requestAnimationFrame/, 'the mark moves on a timer: it must only follow state');
  assert.doesNotMatch(glyphs, /M16 3 L27\.26 9\.5/, 'the retired hexagon mark is still drawn');
  const mark = readFileSync(join(WEB, 'src', 'components', 'ws', 'model-mark.tsx'), 'utf8');
  assert.match(mark, /AppleGlyph/, 'the second logo (ModelMark) is not the one drawing');
  assert.doesNotMatch(mark, /<svg/, 'ModelMark draws its own mark again');
  const layout = readFileSync(join(WEB, 'src', 'components', 'layout.tsx'), 'utf8');
  assert.equal([...layout.matchAll(/studioLink === 'disconnected' \? 'lifted' : 'seated'/g)].length, 2, 'the rail brand and the drawer mark must both follow the Studio link');
  const workspace = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
  assert.match(workspace, /useProvideStudioLink\(studioStatus\)/, 'the workspace does not tell the shell what the Studio link is');
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  assert.match(html, /fill='%23ff8a4c'/, 'the app favicon is not the Ember mark');
  assert.doesNotMatch(html, /m5 24 7-19/, 'the retired folded-sheet favicon is back');
});
