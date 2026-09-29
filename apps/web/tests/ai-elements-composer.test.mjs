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
import { ATTACHMENT_ACCEPT } from '@golem/shared';
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
  } from './src/components/ai-elements/ui/dropdown-menu';
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
  assert.ok(classes(area).includes('ai-prompt-input__textarea'), 'the textarea is not the vendored PromptInputTextarea');
  // It is named by the visible-to-AT label, not by the placeholder.
  assert.match(html, /<label class="gx-sr" for="gx-composer-input">/);
});

test('the file input is PromptInput’s: one, hidden, outside the form, with the shared allowlist', () => {
  const html = composer();
  const inputs = tags(html, 'input').filter((t) => attr(t, 'type') === 'file');
  assert.equal(inputs.length, 1, `expected one file input, found ${inputs.length}`);
  const [input] = inputs;
  assert.equal(attr(input, 'accept'), ATTACHMENT_ACCEPT, 'the dialog must offer exactly what the server takes');
  assert.ok(has(input, 'multiple'));
  assert.ok(classes(input).includes('ai-prompt-input__file'), 'hidden by the class this app styles, not by Tailwind');
  // Before the form, as upstream renders it: a reset of the form can never touch it.
  assert.ok(html.indexOf(input) < html.search(/<form\b/), 'the file input moved inside the form');
});

test('the measured outer panel wraps the form, so the published height includes the note', () => {
  const html = composer();
  const panel = element(html, /<div class="gx-composer(?:\s[^"]*)?"/);
  assert.ok(panel, 'no outer .gx-composer panel');
  assert.match(panel, /<form\b[^>]*class="[^"]*gx-composer__inner/);
  assert.match(panel, /class="gx-composer__note"/);
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
  assert.ok(classes(submits[0]).includes('ai-prompt-input__submit'), 'Send is not the vendored PromptInputSubmit');
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
  //[[ RESTATED for V3 gate G01. Apple is the only engine, so the model chip and its picker are
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

test('an open menu: radio rows checked from the group value, and a row can be aria-disabled yet reachable', () => {
  const html = render(
    h(ui.PromptInputActionMenu, { defaultOpen: true }, [
      h(ui.PromptInputActionMenuTrigger, { key: 't' }, 'Model'),
      h(ui.PromptInputActionMenuContent, { key: 'c', 'aria-label': 'Model' }, [
        h(ui.DropdownMenuRadioGroup, { key: 'g', value: 'apple' }, [
          h(ui.DropdownMenuRadioItem, { key: 'a', value: 'apple' }, 'Apple'),
          h(ui.DropdownMenuRadioItem, { key: 'm', value: 'apple-max', 'aria-disabled': true }, 'Apple MAX'),
        ]),
        h(ui.DropdownMenuCheckboxItem, { key: 'x', checked: false, disabled: true }, '3D'),
      ]),
    ]),
  );
  const menu = tags(html, 'div').find((t) => attr(t, 'role') === 'menu');
  assert.ok(menu, 'the open menu did not render');
  assert.equal(attr(menu, 'aria-label'), 'Model');
  const radios = tags(html, 'div').filter((t) => attr(t, 'role') === 'menuitemradio');
  assert.equal(radios.length, 2);
  assert.deepEqual(radios.map((r) => attr(r, 'aria-checked')), ['true', 'false']);
  // The MAX row: says it cannot be had, and is still in the roving order (tabindex -1, no data-disabled).
  assert.equal(attr(radios[1], 'aria-disabled'), 'true');
  assert.equal(attr(radios[1], 'tabindex'), '-1');
  assert.equal(has(radios[1], 'data-disabled'), false, 'an aria-disabled row became a hard-disabled one');
  // A hard-disabled item is out of it.
  const box = tags(html, 'div').find((t) => attr(t, 'role') === 'menuitemcheckbox');
  assert.equal(attr(box, 'aria-disabled'), 'true');
  assert.ok(has(box, 'data-disabled'));
  assert.equal(attr(box, 'tabindex'), null);
  // The chosen row's indicator renders; the others' do not.
  assert.equal(count(html, 'lucide-circle'), 1);
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

test('the composer’s and the vendored components’ sheets carry no raw colour', () => {
  const files = [
    join(SRC, 'components', 'ws', 'composer.css'),
    ...readdirSync(join(SRC, 'components', 'ai-elements')).filter((f) => f.endsWith('.css')).map((f) => join(SRC, 'components', 'ai-elements', f)),
    join(SRC, 'components', 'ai-elements', 'ui', 'ui.css'),
  ];
  assert.ok(files.length >= 8, `only ${files.length} sheets found`);
  const offenders = [];
  for (const file of files) {
    for (const r of rules(readFileSync(file, 'utf8'))) {
      const hex = r.body.match(/#[0-9a-fA-F]{3,8}\b/g);
      const fn = r.body.match(/\b(?:rgba?|hsla?)\(/g);
      if (hex || fn) offenders.push(`${relative(SRC, file)}: ${r.selector} -> ${[...(hex ?? []), ...(fn ?? [])].join(' ')}`);
    }
  }
  assert.deepEqual(offenders, [], 'colour must come from the app tokens');
});

test('every transition in composer.css stops under prefers-reduced-motion', () => {
  const css = decss(readFileSync(join(SRC, 'components', 'ws', 'composer.css'), 'utf8'));
  const at = css.indexOf('@media (prefers-reduced-motion:reduce)');
  assert.ok(at !== -1, 'composer.css has no reduced-motion block');
  const reduced = css.slice(at);
  const optedOut = new Set(
    rules(reduced).filter((r) => /transition:\s*none/.test(r.body)).flatMap((r) => r.selector.split(',').map((s) => s.trim())),
  );
  const moving = rules(css.slice(0, at))
    .filter((r) => /transition:(?!\s*none)/.test(r.body))
    .flatMap((r) => r.selector.split(',').map((s) => s.trim()));
  assert.ok(moving.length >= 5, `only ${moving.length} transitioned selectors found`);
  const missing = moving.filter((s) => !optedOut.has(s));
  assert.deepEqual(missing, [], 'a transition with no reduced-motion opt-out');
});
