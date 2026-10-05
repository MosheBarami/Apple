/**
 * FLAT SURFACES: no glass, no aurora, one set of sheets.
 *
 * The language is flat surfaces with hairline borders. Before M2 both apps had a frosted-glass layer
 * (blurred translucent panels over a drifting aurora) and each carried its own copy of the token
 * sheet. These tests hold what replaced them:
 *
 *   - no backdrop filter drawn by any file of either app, in ANY spelling: the CSS property, a Tailwind utility
 *     (`backdrop-blur`, `backdrop-blur-sm`, `[&>x]:backdrop-blur-xl`, `backdrop-saturate-150`...), a React style
 *     object key (`backdropFilter`, `WebkitBackdropFilter`), `style.setProperty('backdrop-filter', ...)`. The first
 *     version matched only the hyphenated property in a stylesheet, so the composer shipped a blur (a utility
 *     in a className) and no test knew; and no element is blurred statically (`filter: blur()` outside a keyframe);
 *   - no glass or aurora token, class, component or file;
 *   - the three duplicated sheets are deleted, and no file but tokens.css writes a colour on a theme root,
 *     in any nesting (@media, @layer, @supports), any selector (ANY rule whose subject is `html`, `:root` or `body`,
 *     with any qualifier: `html.no-js`, `html[dir=rtl]`, `:root.dark-mode`; and any head-less theme switch:
 *     `[data-theme=light]`, `[data-bs-theme=dark]`, `.dark-mode`) and any colour syntax (hex, rgb(), hsl(),
 *     oklch(), lab(), a named colour); apps/web/index.html is read like a layout; an inline `style` on <html> or
 *     <body> and a script that writes a colour on the document element are read too.
 *
 * Motion is deliberately NOT asserted here. The token file's easings never overshoot
 * (tokens.test.mjs holds that), but about twenty owner-picked interaction components still carry
 * their own spring curves; those are interactions, not the visual system, and they stay until the
 * app rebuild.
 *
 * Comments are stripped before anything is searched: the better a removal is documented, the more a
 * scanner that reads prose finds its own explanation and reports it as the defect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments, stripScriptComments } from './css-tokens.mjs';
import { ROOT, readText, walkText } from './tests/repo-walk.mjs';
import { cssOf, flatRules, inlineRootColours, isThemeRoot, scriptRootColours, themeRootColours } from './tests/sheets.mjs';

const APPS = ['apps/site/src', 'apps/web/src'];
// apps/web/index.html is the one document of the app: its first-paint <style> and any inline style are the app's too.
const FILES = walkText(APPS).concat([{ path: join(ROOT, 'apps/web/index.html'), rel: 'apps/web/index.html' }]);
const code = (f) => stripComments(readText(f)).replace(/<!--[\s\S]*?-->/g, ' ').replace(/(^|[^:\w'"`])\/\/[^\n]*/g, '$1');
const isStyle = (f) => /\.(css|astro|html)$/.test(f.rel);

/**
 * A class that names the glass or aurora layer, as a whole word of its name: `.glass`, `.aurora--soft`,
 * `.hero-aura`, and a BEM element or modifier of any block, such as `.auth__aura`. (The first version
 * of this guard only knew the block form, so `.auth__aura`, a blurred drifting radial gradient, got
 * past it.) Words are split on `-` and `_`, so `.laura` and `.aurally` are not matches.
 */
const isLayerClass = (name) => /(?:^|[-_])studio-atmosphere(?:$|[-_])/.test(name) || name.toLowerCase().split(/[-_]+/).some((w) => w === 'glass' || w === 'aurora' || w === 'aura');

test('the walk found both apps', () => {
  assert.ok(FILES.length > 450, `only ${FILES.length} app files scanned; the walk has drifted`);
  assert.ok(FILES.some((f) => f.rel.startsWith('apps/site/')) && FILES.some((f) => f.rel.startsWith('apps/web/')), 'one app is missing from the walk');
});

/** A class token split at its last colon outside brackets: its variants and its utility (`[&>x]:backdrop-blur` -> `backdrop-blur`). */
function utilityOf(token) {
  let depth = 0;
  let at = -1;
  for (let i = 0; i < token.length; i += 1) {
    const c = token[i];
    if (c === '[' || c === '(') depth += 1;
    else if (c === ']' || c === ')') depth -= 1;
    else if (c === ':' && depth === 0) at = i;
  }
  return token.slice(at + 1).replace(/^!/, '');
}

/** Tailwind's backdrop filter utilities: every function of the property. `-none` switches one off and is not a use. */
const BACKDROP_UTILITY = /^backdrop-(?:blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia|filter)(?:-(?!none$)[\w./\[\]%-]+)?$/;

/**
 * Every backdrop filter a source file draws, in any spelling, as readable strings:
 *   a stylesheet or <style>      `backdrop-filter: blur(8px)`, `-webkit-backdrop-filter: ...`  (not `none`)
 *   a Tailwind class             `backdrop-blur`, `backdrop-blur-sm`, `[&>x]:backdrop-saturate-150`, in any string
 *   a style object key           `backdropFilter: 'blur(20px)'`, `WebkitBackdropFilter`, `'backdrop-filter': ...`
 *   a script write               `el.style.setProperty('backdrop-filter', 'blur(4px)')`
 * `supports-[backdrop-filter]:bg-x` is a feature query for a variant, not a use, and is not reported.
 */
function backdropUses(rel, source, isScriptFile = !/\.(css|astro|html)$/.test(rel)) {
  const out = [];
  const src = isScriptFile ? stripScriptComments(source) : stripComments(source).replace(/<!--[\s\S]*?-->/g, ' ');
  for (const m of src.matchAll(/(?:-webkit-)?backdrop-filter\s*:\s*([^;}\n"'`]+)/gi)) if (m[1].trim().toLowerCase() !== 'none') out.push(`${rel}: ${m[0].trim().slice(0, 60)}`);
  // Class tokens are read from scripts and markup. A stylesheet's selectors (`[class*='backdrop-blur']`, which is how a
  // rule switches the utility OFF) are not classes, and a <style> block is a stylesheet.
  if (!/\.css$/.test(rel)) {
    const markup = isScriptFile ? src : src.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
    for (const m of markup.matchAll(/[^\s"'`]+/g)) if (BACKDROP_UTILITY.test(utilityOf(m[0]))) out.push(`${rel}: the class ${m[0].slice(0, 80)}`);
  }
  for (const m of src.matchAll(/(?:\bbackdropFilter|\bWebkitBackdropFilter|['"`](?:-webkit-)?backdrop-filter['"`])\s*:\s*(['"`]?)([^,}'"`\n]*)/g)) if (m[2].trim().toLowerCase() !== 'none') out.push(`${rel}: a style object sets ${m[0].trim().slice(0, 60)}`);
  for (const m of src.matchAll(/setProperty\(\s*['"`](?:-webkit-)?backdrop-filter['"`]\s*,\s*['"`]([^'"`]*)/g)) if (m[1].trim().toLowerCase() !== 'none') out.push(`${rel}: setProperty('backdrop-filter', '${m[1].slice(0, 30)}')`);
  return out;
}

/**
 * The vendored AI Elements and shadcn files (byte-pinned) may carry a backdrop utility (`backdrop-blur-sm` on the
 * attachment remove button) ONLY while a rule outside every layer switches it off for any element that carries one.
 * Their own files cannot be edited; the stylesheet is where the blur is taken out, and it is held from both ends.
 */
const VENDORED = /^apps\/web\/src\/components\/(?:ai-elements|ui)\//;
const NEUTRALISER_SHEET = 'apps/web/src/styles/ai-elements.css';
const neutralised = () => /\[class\*=['"]backdrop-[^'"]*['"]\]\s*\{[^}]*backdrop-filter\s*:\s*none/.test(stripComments(readText({ path: join(ROOT, NEUTRALISER_SHEET) })));

test('no backdrop filter is drawn by any file of either app, in any spelling: a property, a Tailwind utility, a style object, a script write', () => {
  const hits = [];
  const vendored = [];
  for (const f of FILES) {
    for (const hit of backdropUses(f.rel, readText(f))) (VENDORED.test(f.rel) ? vendored : hits).push(hit);
  }
  assert.ok(FILES.some((f) => f.rel === 'apps/web/index.html'), 'apps/web/index.html is not in the walk');
  assert.ok(vendored.length >= 1, 'no vendored backdrop utility was found; the scan cannot see Tailwind classes (attachments.tsx carries backdrop-blur-sm)');
  assert.deepEqual(hits, [], `frosted glass is back (first-party files may not blur what is behind them):\n  ${hits.join('\n  ')}`);
  // The rule switches the filter off on the element that CARRIES the class. A variant that aims it at another element
  // (`[&>x]:backdrop-blur`, `group-hover:`, `*:`) would slip past it, so a vendored file may only use the plain form.
  const aimed = vendored.filter((v) => /the class .*(?:\[&|\*:|group-|peer-|has-\[|\bin-)/.test(v));
  assert.deepEqual(aimed, [], `a vendored file blurs another element than the one that carries the class, which the stylesheet rule cannot switch off:\n  ${aimed.join('\n  ')}`);
  assert.ok(neutralised(), `${vendored.length} vendored backdrop utility(ies) remain (${[...new Set(vendored.map((v) => v.split(':')[0]))].join(', ')}) and ${NEUTRALISER_SHEET} no longer switches them off with a [class*='backdrop-...'] rule that sets backdrop-filter: none`);
});

test('the guard has teeth: every spelling of a backdrop filter is seen, and a feature query, `none` and an ordinary class are not', () => {
  for (const [src, what, file] of [
    ['a { backdrop-filter: blur(8px); }', 'the CSS property', 'x.css'],
    ['a { -webkit-backdrop-filter: saturate(1.4) blur(2px); }', 'the prefixed CSS property', 'x.css'],
    ['<div class="p-2 backdrop-blur" />', 'a bare Tailwind utility', 'x.tsx'],
    ['cn("bg-card/90", "backdrop-blur-sm")', 'a sized utility in a cn() call', 'x.tsx'],
    ['"[&>[data-slot=input-group]]:bg-card/90 [&>[data-slot=input-group]]:backdrop-blur"', 'a variant-prefixed utility (the composer)', 'x.tsx'],
    ['className={`rounded ${open ? "md:backdrop-blur-xl" : ""}`}', 'a utility inside a conditional', 'x.tsx'],
    ['<i className="backdrop-blur-[2px]" />', 'an arbitrary-value utility', 'x.tsx'],
    ['<i className="supports-[backdrop-filter]:backdrop-saturate-150" />', 'another backdrop function behind a feature query', 'x.tsx'],
    ["const s = { backdropFilter: 'blur(20px)' };", 'a style object key', 'x.tsx'],
    ["<div style={{ WebkitBackdropFilter: `blur(${n}px)` }} />", 'a prefixed style object key', 'x.tsx'],
    ["const s = { 'backdrop-filter': 'blur(4px)' };", 'a quoted hyphenated key', 'x.ts'],
    ["el.style.setProperty('backdrop-filter', 'blur(4px)');", 'a script write', 'x.ts'],
    ['<style>.a { backdrop-filter: blur(3px) }</style>', 'a <style> block', 'x.astro'],
    ['<style>html { -webkit-backdrop-filter: blur(1px); }</style>', 'a first-paint style in the app document', 'index.html'],
    ['<div class="card backdrop-blur-md"></div>', 'a class attribute in markup', 'x.astro'],
  ]) assert.ok(backdropUses(file, src).length >= 1, `not seen: ${what}`);
  for (const [src, what, file] of [
    ['a { backdrop-filter: none; }', 'none', 'x.css'],
    ['<div className="supports-[backdrop-filter]:bg-background/60 bg-background" />', 'a feature-query variant with no backdrop utility', 'x.tsx'],
    ['<div className="backdrop-blur-none" />', 'backdrop-blur-none', 'x.tsx'],
    ["const s = { backdropFilter: 'none' };", 'a style object that switches it off', 'x.tsx'],
    ['// the old composer used backdrop-blur\nconst a = 1;', 'a comment', 'x.tsx'],
    ['<div className="bg-backdrop text-backdrop-ink" />', 'an unrelated class that names a backdrop', 'x.tsx'],
    ['.cmdk-backdrop { background: red; }', 'the veil class names a backdrop but filters nothing', 'x.css'],
    ["[class*='backdrop-blur'] { backdrop-filter: none; }", 'the rule that switches the utility off', 'x.css'],
    ['<style>.a[class*="backdrop-blur"] { backdrop-filter: none }</style><p class="a">x</p>', 'a <style> block that switches it off', 'x.astro'],
  ]) assert.deepEqual(backdropUses(file, src), [], `reported as a backdrop filter: ${what}`);
});

/** A rule that is a keyframe step (`from`, `to`, `40%`): motion, which may pass through a blur. */
const isKeyframeStep = (selector) => /^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d+(?:\.\d+)?%))*$/i.test(selector);
/**
 * A blur that is only ever seen while an element fades away: the same rule sets `opacity: 0`. The landing's activity
 * line blurs for 220 ms as it swaps one phrase for the next (`.is-changing { opacity: 0; filter: blur(4px) }`); a blur
 * that is visible at rest (an aurora, a glow) is not that.
 */
const fadesToNothing = (body) => /(?:^|[;\s])opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)/.test(body);
const blursAtRest = (selector, body) => !isKeyframeStep(selector) && !fadesToNothing(body) && /blur\(\s*[0-9.]*[1-9]/.test(body);

test('no element is blurred statically: `filter: blur()` outside a keyframe is the aurora under another name', () => {
  const hits = [];
  let rules = 0;
  for (const f of FILES.filter(isStyle)) {
    for (const m of cssOf(f).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].split(';').pop().trim().replace(/\s+/g, ' ');
      if (!selector || selector.startsWith('@')) continue;
      rules += 1;
      if (isKeyframeStep(selector) || fadesToNothing(m[2])) continue;
      for (const d of m[2].matchAll(/(?:^|[;\s])(?:-webkit-)?filter\s*:\s*([^;}]+)/gi)) if (/blur\(\s*[0-9.]*[1-9]/.test(d[1])) hits.push(`${f.rel}: ${selector.slice(0, 60)} { filter: ${d[1].trim().slice(0, 40)} }`);
    }
  }
  assert.ok(rules > 3000, `only ${rules} rules read; the parse has drifted`);
  assert.deepEqual(hits, [], `an element is blurred outside a keyframe:\n  ${hits.join('\n  ')}`);
  // The guard sees the shape the removed .auth__aura had, under another name, and does not mistake a keyframe's blur for it.
  const shape = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => blursAtRest(m[1].trim(), m[2])).length;
  assert.equal(shape('.usage-ambient { filter: blur(60px); background: radial-gradient(circle, var(--accent), transparent); animation: drift 22s infinite; }'), 1, 'a blurred drifting gradient under a new name was not seen');
  assert.equal(shape('@keyframes pop { from { opacity: 0; filter: blur(6px); } to { opacity: 1; filter: none; } }'), 0, 'a blur inside a keyframe was reported');
  assert.equal(shape('.a { filter: blur(0); } .b { filter: none; }'), 0, 'a zero blur was reported');
  assert.equal(shape('.line.is-changing { opacity: 0; transform: translateY(-7px); filter: blur(4px); }'), 0, 'a blur that only shows while the element fades away was reported');
  assert.equal(shape('.glow { opacity: .6; filter: blur(40px); }'), 1, 'a blur on a visible element was passed because it sets an opacity');
});

test('no glass or aurora token, class, component or file exists in either app', () => {
  const hits = [];
  for (const f of FILES) {
    if (/(^|\/)(glass|aurora|aura|studio-atmosphere)[^/]*$/i.test(f.rel)) hits.push(`${f.rel}: a glass or aurora file`);
    const src = code(f);
    for (const m of src.matchAll(/--(?:glass|aurora|aura)[a-z0-9-]*/gi)) hits.push(`${f.rel}: ${m[0]}`);
    if (isStyle(f)) for (const m of src.matchAll(/\.([a-z_][\w-]*)/gi)) if (isLayerClass(m[1])) hits.push(`${f.rel}: .${m[1]}`);
    for (const m of src.matchAll(/\b(?:StudioAtmosphere|Aura)\b|pk-glide--glass/g)) hits.push(`${f.rel}: ${m[0]}`);
  }
  assert.deepEqual([...new Set(hits)], [], `a glass or aurora layer is back:\n  ${[...new Set(hits)].join('\n  ')}`);
});

test('the three duplicated sheets are deleted and nothing names them', () => {
  for (const rel of ['apps/site/src/styles/studpilot-minimal.css', 'apps/web/src/design/studpilot-minimal.css', 'apps/web/src/design/glass.css']) {
    assert.ok(!existsSync(join(ROOT, rel)), `${rel} must stay deleted`);
  }
  const hits = FILES.filter((f) => /studpilot-minimal|design\/glass\.css/.test(readText(f))).map((f) => f.rel);
  assert.deepEqual(hits, [], `a file still names a deleted sheet:\n  ${hits.join('\n  ')}`);
});

test('no file but tokens.css writes a colour on a theme root, in any nesting, selector or colour syntax, in a sheet, a <style>, an inline style or a script', () => {
  const stray = [];
  let rulesRead = 0;
  for (const f of FILES.filter(isStyle)) {
    rulesRead += [...cssOf(f).matchAll(/[^{}]+\{[^{}]*\}/g)].length;
    for (const c of themeRootColours(cssOf(f))) stray.push(`${f.rel}: ${c.selector} { ${c.prop}: ${c.value} }`);
  }
  for (const f of FILES) {
    if (/\.(?:astro|html)$/.test(f.rel)) for (const c of inlineRootColours(readText(f))) stray.push(`${f.rel}: <${c.tag} style="${c.prop}: ${c.value}">`);
    if (/\.(?:tsx?|jsx?|mjs)$/.test(f.rel)) for (const c of scriptRootColours(stripScriptComments(readText(f)))) stray.push(`${f.rel}: ${c.text}`);
  }
  assert.ok(rulesRead > 3000, `only ${rulesRead} rules read; the parse has drifted`);
  assert.ok(flatRules(FILES.filter(isStyle).map((f) => ({ ...f, css: cssOf(f) }))).some((r) => r.selector === ':root'), 'no :root rule was found at all; the selector match is blind');
  assert.ok(FILES.some((f) => f.rel === 'apps/web/index.html'), 'apps/web/index.html is not read');
  // RESTATED 2026-10-05 (M2 site rebuild): the floor was TWO document layouts (Base.astro and the old Landing.astro, deleted by the rebuild). It is
  // one now, and it must be Base: the scan has to have read the layout that owns <html>.
  const htmlLayouts = FILES.filter((f) => /\.astro$/.test(f.rel) && /<html\b/.test(readText(f)));
  assert.ok(htmlLayouts.length >= 1, 'the site layouts are not read for an inline style on <html>');
  assert.ok(htmlLayouts.some((f) => f.rel.endsWith('layouts/Base.astro')), 'Base.astro, the one layout that owns <html>, was not read');
  assert.deepEqual(stray, [], `a colour is written on a theme root outside tokens.css:\n  ${stray.join('\n  ')}`);
});

test('the guard has teeth: every blind spot of the first version is seen, and a component scope is not', () => {
  const found = (css) => themeRootColours(css).map((c) => `${c.selector} ${c.prop}`);
  for (const [css, what] of [
    ['@media (prefers-color-scheme: dark) { :root { --paper: #000; } }', 'a colour inside @media'],
    ["@layer base { :root[data-theme='light'] { --x: oklch(0.7 0.1 250); } }", 'a colour inside @layer'],
    ['@supports (color: oklch(0 0 0)) { @media (min-width: 1px) { :root { --x: oklch(1 0 0); } } }', 'a colour two at-rules deep'],
    ['html.dark { --surface: lab(10 0 0); }', 'html.dark and lab()'],
    [':root.light { --surface: lch(90 5 250); }', ':root.light and lch()'],
    ['[data-theme=light] { --ink: rgb(0 0 0); }', 'an unquoted [data-theme=light] and rgb()'],
    ['html[data-theme=dark] { --a: hsl(0 0% 10%); }', 'an unquoted attribute on html and hsl()'],
    [":root:not([data-theme='light']) { --paper: #111; }", 'a guarded dark default'],
    ['html { --accent: rebeccapurple; }', 'a named colour'],
    [':root { --muted: color-mix(in srgb, white 50%, black); }', 'color-mix of named colours'],
    ['html { background: #fff; }', 'a hex background written straight on html'],
    [':root { --x: var(--y, red); }', 'a named colour as a var() fallback'],
    // THE SECOND ROUND: forms the matcher listed qualifiers for, and so missed.
    ['html.no-js { background: #fff; }', 'html.no-js (the class the site layouts put on <html>)'],
    ['html.js { color: #000; }', 'html.js'],
    ['html.dark-mode { --surface: #000; }', 'html.dark-mode'],
    [':root.dark-mode { --surface: #000; }', ':root.dark-mode'],
    ['html.is-dark { --paper: #000; }', 'html.is-dark'],
    ['.dark-mode { --surface: #000; }', 'a head-less .dark-mode'],
    ['.theme-dark { --surface: #000; }', 'a head-less .theme-dark'],
    [':root[data-mode="dark"] { --paper: #000; }', ':root[data-mode]'],
    ['[data-mode=dark] { --paper: #000; }', 'a head-less [data-mode]'],
    ['[data-bs-theme=dark] { --paper: #000; }', '[data-bs-theme]'],
    ['html[data-color-scheme=dark] { --paper: #000; }', 'html[data-color-scheme]'],
    ['html[dir=rtl] { background: #fff; }', 'html[dir=rtl]'],
    [':root[dir=rtl] { --paper: #fff; }', ':root[dir=rtl]'],
    ['html[lang=en] { color: black; }', 'html[lang=en] and a named colour'],
    ['body.no-js { background: #fff; }', 'body.no-js'],
    ['html > body.x { background: #fff; }', 'a combinator whose subject is the body'],
    ['@media print { html.print { background: white; } }', 'html.print inside @media'],
  ]) assert.ok(found(css).length >= 1, `not seen: ${what}`);
  for (const [css, what] of [
    [":root { --content: 1120px; --font: 'Red Hat Display', sans-serif; --e: cubic-bezier(.16,1,.3,1); color-scheme: dark light; }", 'layout, type and motion tokens'],
    ['html { background: var(--paper); color: var(--ink); } body { color: var(--ink); }', 'tokens spent on the root'],
    ['.card { --x: #fff; } html .card { --x: red; } [data-theme=light] .card { --y: rgb(0 0 0); }', 'a component scoping its own value'],
    ["@font-face { font-family: X; src: url('data:font/woff2;base64,AAAA'); }", 'an at-rule'],
    ['.dark-card { background: #000; } .theme-btn { color: #fff; } .theme-toggle { color: #fff; }', 'component classes that name a theme'],
    ['html::selection { background: #fff; }', 'a pseudo-element of the root'],
    ['html .card { background: #fff; } html body main { color: #000; }', 'descendants of the root'],
    ['[data-bs-theme=dark] .card { --x: #000; } .dark .card { background: #fff; }', 'a component under a theme switch'],
  ]) assert.deepEqual(found(css), [], `reported as a root colour: ${what}`);
  // The selector reader on its own: the subject is what counts.
  for (const sel of ['html.no-js', 'body.is-dark', ':root[dir=rtl]', '[data-bs-theme=dark]', '.dark-mode']) assert.ok(isThemeRoot(sel), `${sel} is not read as a theme root`);
  for (const sel of ['.card', 'html .card', '.dark .card', 'a:hover', '.theme-btn']) assert.equal(isThemeRoot(sel), false, `${sel} is read as a theme root`);
  // The two places a stylesheet guard never looked: markup (an inline style on <html> or <body>) and a script.
  assert.equal(inlineRootColours('<html lang="en" style="--paper:#000"><body class="x" style="background: white; margin:0">').length, 2, 'an inline style on <html> or <body> was not read');
  assert.equal(inlineRootColours('<html lang="en" data-theme="dark"><body><div style="--paper:#000"></div></body>').length, 0, 'a style on a descendant was read as a root');
  assert.equal(scriptRootColours("document.documentElement.style.setProperty('--paper', '#000'); document.body.style.background = 'white'; document.documentElement.style.setProperty('--x', 'var(--y)')").length, 2, 'a script writing a colour on the document element was not read, or a var() was');
});

test('the guard has teeth: the glass and aurora class names it must catch, including the one that got past it', () => {
  for (const name of ['glass', 'aurora', 'aura', 'auth__aura', 'hero-aurora', 'aura--soft', 'card__glass', 'studio-atmosphere', 'is-glass']) {
    assert.ok(isLayerClass(name), `.${name} is not recognised as a glass or aurora class`);
  }
  for (const name of ['laura', 'aurally', 'auth__atmosphere', 'glassware', 'btn-primary', 'auth__grid']) {
    assert.equal(isLayerClass(name), false, `.${name} was reported as a glass or aurora class`);
  }
});
