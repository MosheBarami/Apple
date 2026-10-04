/**
 * THE COMPOSER, ON AI ELEMENTS' PROMPTINPUT — RENDERED, AND ITS STYLE GUARDED.
 *
 * The composer (components/ws/composer.tsx) is built from the vendored PromptInput, Attachments and
 * dropdown-menu (components/ai-elements/). Its neighbours read the composer's source; this suite
 * renders the real components with react-dom/server and asserts on the markup a browser receives:
 *
 *   * one textarea, the one the product and the tour address (id, data-tour, dir=auto);
 *   * one file input — PromptInput's, hidden, outside the form, carrying the shared allowlist;
 *   * there is no mode switch and no Autonomous switch (V3 G01): every message runs the one
 *     behaviour, so the bar offers no choice about how;
 *   * Send is a submit named "Send"; while a run is live the same slot is a plain button named
 *     "Stop this run", and there is no submit to press;
 *   * Create is a menu trigger, and there is no model control (V3 G01: one engine); a menu's
 *     radio rows carry aria-checked from the group's value, and a row can be
 *     aria-disabled yet reachable.
 *
 * And the sheets: no violet token is declared or spent; the composer's and the vendored components'
 * stylesheets carry no raw colour; every transition in composer.css has a reduced-motion opt-out.
 * Each list below is derived (from the markup, from a directory walk, from the rules themselves) and
 * asserts it found something.
 *
 * NOT CHECKED HERE: key handling and paste/drop behaviour, which need a DOM. They are held by
 * composer-send, mentions and composer-attachments (the source of the vendored textarea) and were
 * measured in a browser when this was written.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ATTACHMENT_ACCEPT } from '@studpilot/shared';
import { WEB, bundle, count, decomment, element, renderWith, unescape } from './ui-bundle.mjs';

const ui = await bundle(
  `
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { Composer } from './src/components/ws/composer';
  import {
    PromptInputActionMenu, PromptInputActionMenuContent, PromptInputActionMenuTrigger,
  } from './src/components/ai-elements/prompt-input';
  import {
    DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  } from './src/components/ui/dropdown-menu';
  export { h, renderToStaticMarkup, Composer, PromptInputActionMenu, PromptInputActionMenuContent,
    PromptInputActionMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem };
`,
  { name: 'ai-elements-composer', resolveDir: WEB },
);
const { h, renderToStaticMarkup } = ui;
const render = (element) => renderWith(renderToStaticMarkup, element);

const noop = () => {};
function composer(overrides = {}) {
  return render(
    h(ui.Composer, {
      onSend: () => true,
      onStop: noop,
      running: false,
      projectId: 'p-test',
      ...overrides,
    }),
  );
}

/** Every opening tag of an element, with its attributes, so a test can ask about one control. */
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescape(m[1]) : null;
};
const has = (tag, name) => new RegExp(`\\s${name}(?:="[^"]*")?[\\s>/]`).test(tag);
const classes = (tag) => (attr(tag, 'class') ?? '').split(/\s+/);

// ----------------------------------------------------------------- the box ---

test('there is one textarea, and it is the one the product addresses', () => {
  const html = composer();
  const areas = tags(html, 'textarea');
  assert.equal(areas.length, 1, `expected one textarea, found ${areas.length}`);
  const [area] = areas;
  assert.equal(attr(area, 'id'), 'gx-composer-input');
  assert.equal(attr(area, 'data-tour'), 'composer');
  assert.equal(attr(area, 'dir'), 'auto');
  assert.equal(attr(area, 'maxLength'), '8000');
  // RESTATED 2026-10-01: the home-made `ai-prompt-input__textarea` class is gone with the home-made
  // component. Upstream's PromptInputTextarea is the InputGroup's control and carries the form field
  // name upstream's form reads the message from.
  assert.equal(attr(area, 'data-slot'), 'input-group-control', 'the textarea is not upstream\'s PromptInputTextarea');
  assert.equal(attr(area, 'name'), 'message');
  // It is named by the visible-to-AT label, not by the placeholder.
  assert.match(html, /<label class="sr-only" for="gx-composer-input">/);
});

test('the file input is PromptInput’s: one, hidden, outside the form, with the shared allowlist', () => {
  const html = composer();
  const inputs = tags(html, 'input').filter((t) => attr(t, 'type') === 'file');
  assert.equal(inputs.length, 1, `expected one file input, found ${inputs.length}`);
  const [input] = inputs;
  assert.ok(has(input, 'multiple'));
  assert.equal(attr(input, 'aria-label'), 'Upload files', 'upstream PromptInput\'s own input');
  assert.ok(classes(input).includes('hidden'), 'hidden by upstream\'s class');
  // RESTATED 2026-10-01. THE DIALOG STILL OFFERS EXACTLY WHAT THE SERVER TAKES, but the attribute is
  // set after mount: PromptInput is deliberately NOT given `accept`, because upstream's own filter
  // matches MIME types only and would refuse a .luau or .md file whose browser type is empty before
  // the product's admitFiles ever saw it. The bridge writes the shared allowlist onto upstream's input.
  assert.equal(attr(input, 'accept'), null, 'PromptInput was handed `accept`, so its MIME-only filter is back');
  const src = decomment(readFileSync(join(WEB, 'src', 'components', 'ws', 'composer.tsx'), 'utf8'));
  assert.match(src, /attachments\.fileInputRef\.current\?\.setAttribute\('accept', ATTACHMENT_ACCEPT\)/);
  assert.doesNotMatch(src.slice(src.indexOf('<PromptInput\n')), /^\s*accept=/m, 'PromptInput must not filter by accept');
  assert.ok(ATTACHMENT_ACCEPT.includes('.luau'), 'the allowlist names Luau by extension — the case upstream\'s filter drops');
  // Before the form, as upstream renders it: a reset of the form can never touch it.
  assert.ok(html.indexOf(input) < html.search(/<form\b/), 'the file input moved inside the form');
});

test('the measured outer panel wraps the form, so the published height includes the note', () => {
  const html = composer();
  const panel = element(html, /<div class="gx-composer(?:\s[^"]*)?"/);
  assert.ok(panel, 'no outer .gx-composer panel');
  assert.match(panel, /<form\b[^>]*class="[^"]*gx-composer__form/);
  assert.match(panel, /class="gx-composer__note\b/);
});

// ------------------------------------------------------------- no modes ---

test('there is no mode switch and no Autonomous switch, whatever a caller still passes', () => {
  // V3 G01 / UI contract: no Plan/Agent/Autonomous selector. Legacy props are ignored, not drawn.
  for (const legacy of [{}, { mode: 'plan', autonomous: true }, { mode: 'agent', autonomous: true, running: true }]) {
    const html = composer(legacy);
    assert.equal(tags(html, 'button').filter((t) => attr(t, 'role') === 'switch').length, 0, 'a switch is on the bar');
    assert.equal(tags(html, 'div').filter((t) => attr(t, 'role') === 'radiogroup').length, 0, 'a radio group is on the bar');
    assert.doesNotMatch(html, /Autonomous|>Plan<|>Agent<|gx-autonomous|is-autonomous/);
  }
});

// --------------------------------------------------------------- send/stop ---

test('Send is the form’s submit, named, and off while there is nothing to send', () => {
  const html = composer();
  const submits = tags(html, 'button').filter((t) => attr(t, 'type') === 'submit');
  assert.equal(submits.length, 1, `expected one submit, found ${submits.length}`);
  assert.equal(attr(submits[0], 'aria-label'), 'Send');
  assert.ok(has(submits[0], 'disabled'), 'an empty box must not offer a send');
  // Upstream PromptInputSubmit is an InputGroupButton: the shadcn Button inside the input group.
  assert.equal(attr(submits[0], 'data-slot'), 'button', 'Send is not upstream\'s PromptInputSubmit');
  assert.ok(html.indexOf(submits[0]) > html.indexOf('data-slot="input-group-addon"'), 'Send sits in the PromptInputFooter');
});

test('while a run is live the same slot is Stop — a plain button, and nothing submits', () => {
  const html = composer({ running: true });
  assert.equal(tags(html, 'button').filter((t) => attr(t, 'type') === 'submit').length, 0, 'a submit is still on the bar');
  const stops = tags(html, 'button').filter((t) => attr(t, 'aria-label') === 'Stop this run');
  assert.equal(stops.length, 1);
  assert.equal(attr(stops[0], 'type'), 'button');
  assert.equal(attr(stops[0], 'title'), 'Stop this run', 'a pointer user gets the consequence too');
});

test('the paperclip is off, with the reason, where there is no project to upload to', () => {
  const find = (html) => tags(html, 'button').find((t) => attr(t, 'aria-label') === 'Attach a file');
  const off = find(composer({ projectId: undefined }));
  assert.ok(off && has(off, 'disabled'));
  assert.equal(attr(off, 'title'), 'Attachments need an open project');
  const on = find(composer());
  assert.ok(on && !has(on, 'disabled'));
});

// ------------------------------------------------------------------ menus ---

test('Create is named by what it holds, and there is no mode or model control', () => {
  //[[ RESTATED for V3 gate G01. StudPilot is the only engine, so the model chip and its picker are
  //   gone: nothing in the composer names or chooses a model. The property is unchanged for what
  //   remains: each control says what it currently holds. ]]
  //[[ RESTATED 2026-09-23 (composer picks). Mode is no longer a menu either: it is a two-way radio
  //   switch, so both words are on screen. It still says what it holds — its checked radio is the
  //   current mode — so the menu triggers are Create alone. ]]
  //[[ RESTATED (V3 UI contract, Q6/Q19): the UI theme control is the second menu, and it too says
  //   what it holds ("UI theme: Studded" by default). There is still no mode or model menu. ]]
  const html = composer();
  const triggers = tags(html, 'button').filter((t) => attr(t, 'aria-haspopup') === 'menu');
  const names = triggers.map((t) => attr(t, 'aria-label'));
  assert.deepEqual(names, ['Create', 'UI theme: Studded']);
  for (const t of triggers) assert.equal(attr(t, 'aria-expanded'), 'false');
  assert.equal(tags(html, 'button').some((t) => /^Model\b/.test(attr(t, 'aria-label') ?? '')), false, 'a model control is back');
  assert.doesNotMatch(html, /gx-chip--model/);
});

// RESTATED 2026-10-01. This rendered an OPEN menu inline, which the home-made dropdown did. The menus
// are now upstream's — shadcn's DropdownMenu over Radix — and Radix portals an open menu's content
// into <body> after mount, so react-dom/server cannot show it. What the server CAN show, and what a
// reader meets first, is the trigger: Radix's menu button, closed, with nothing of the menu in the
// page until it is opened. The roving focus and aria-disabled semantics are Radix's own (radix-ui is
// a declared dependency; tests/ai-elements-provenance.test.mjs proves the shadcn file is upstream's).
test('a menu trigger is Radix’s menu button, closed, and its menu is not in the page until opened', () => {
  const html = render(
    h(ui.PromptInputActionMenu, null, [
      h(ui.PromptInputActionMenuTrigger, { key: 't', 'aria-label': 'Create' }, 'Create'),
      h(ui.PromptInputActionMenuContent, { key: 'c', 'aria-label': 'Create' }, [
        h(ui.DropdownMenuRadioGroup, { key: 'g', value: 'a' }, [
          h(ui.DropdownMenuRadioItem, { key: 'a', value: 'a' }, 'A'),
        ]),
        h(ui.DropdownMenuCheckboxItem, { key: 'x', checked: false, disabled: true }, '3D'),
      ]),
    ]),
  );
  const [trigger] = tags(html, 'button');
  assert.ok(trigger, 'no trigger');
  assert.equal(attr(trigger, 'aria-haspopup'), 'menu');
  assert.equal(attr(trigger, 'aria-expanded'), 'false');
  assert.equal(attr(trigger, 'data-slot'), 'dropdown-menu-trigger');
  assert.equal(tags(html, 'div').some((t) => attr(t, 'role') === 'menu'), false, 'a closed menu is in the page');
  assert.doesNotMatch(html, /menuitemradio|menuitemcheckbox/);
});

// ------------------------------------------------------------------ sheets ---

const SRC = join(WEB, 'src');
const decss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

function sheets(dir = SRC, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'upstream') continue;
      sheets(path, out);
    } else if (entry.endsWith('.css')) out.push(path);
  }
  return out;
}

/** Every rule as { selector, body }, at any nesting depth (media blocks included). */
function rules(css) {
  const out = [];
  for (const m of decss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

test('NO VIOLET: the Autonomous tokens left with the Autonomous switch, and nothing spends them', () => {
  const found = sheets();
  assert.ok(found.length >= 3, `only ${found.length} sheets found — the reader is not reading`);
  const offenders = [];
  for (const file of found) {
    if (/--autonomous/.test(readFileSync(file, 'utf8'))) offenders.push(relative(SRC, file));
  }
  assert.deepEqual(offenders, [], 'a violet token is declared or spent');
});

// RESTATED 2026-10-01. The vendored components have no sheets any more — their look is upstream's
// Tailwind classes — so the colour rule now holds the sheets that DO carry colour for them: the
// composer's own sheet and styles/ai-elements.css, where upstream's theme tokens are mapped onto the
// app's. Both must take colour from the app's tokens.
test('the composer’s sheet and the AI Elements theme carry no raw colour', () => {
  const files = [join(SRC, 'components', 'ws', 'composer.css'), join(SRC, 'styles', 'ai-elements.css')];
  const offenders = [];
  let checked = 0;
  for (const file of files) {
    for (const r of rules(readFileSync(file, 'utf8'))) {
      checked++;
      const hex = r.body.match(/#[0-9a-fA-F]{3,8}\b/g);
      const fn = r.body.match(/\b(?:rgba?|hsla?|oklch)\(/g);
      if (hex || fn) offenders.push(`${relative(SRC, file)}: ${r.selector} -> ${[...(hex ?? []), ...(fn ?? [])].join(' ')}`);
    }
  }
  assert.ok(checked >= 10, `only ${checked} rules read`);
  assert.deepEqual(offenders, [], 'colour must come from the app tokens');
});

// RESTATED 2026-10-01: composer.css lost the chips, Send and the card to upstream's classes (whose
// motion stops under `motion-reduce:`), so the sheets with transitions are read together with the
// composer's picks. Every transition in them still has its reduced-motion opt-out.
test('every transition in the composer’s sheets stops under prefers-reduced-motion', () => {
  const files = [join(SRC, 'components', 'ws', 'composer.css'), ...readdirSync(join(SRC, 'components', 'picks', 'composer')).filter((f) => f.endsWith('.css')).map((f) => join(SRC, 'components', 'picks', 'composer', f))];
  let moving = 0;
  const missing = [];
  for (const file of files) {
    const css = decss(readFileSync(file, 'utf8'));
    const at = css.search(/@media \(prefers-reduced-motion:\s?reduce\)/);
    const before = at === -1 ? css : css.slice(0, at);
    const transitioned = rules(before).filter((r) => /transition:(?!\s*none)/.test(r.body)).flatMap((r) => r.selector.split(',').map((x) => x.trim()));
    moving += transitioned.length;
    if (transitioned.length === 0) continue;
    if (at === -1) { missing.push(`${relative(SRC, file)}: no reduced-motion block`); continue; }
    const optedOut = new Set(rules(css.slice(at)).filter((r) => /transition:\s*none|animation:\s*none/.test(r.body)).flatMap((r) => r.selector.split(',').map((x) => x.trim())));
    for (const sel of transitioned) if (!optedOut.has(sel)) missing.push(`${relative(SRC, file)}: ${sel}`);
  }
  assert.ok(moving >= 5, `only ${moving} transitioned selectors found — the reader is not reading`);
  assert.deepEqual(missing, [], 'a transition with no reduced-motion opt-out');
});
