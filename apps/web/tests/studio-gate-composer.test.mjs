/**
 * THE COMPOSER'S STUDIO GATE (V3 G03) AND MID-RUN DIRECTION (G10), RENDERED.
 *
 * Until the paired place is open in a connected Studio the composer is locked: its textarea cannot
 * be focused or typed into (disabled), nothing submits, and the build controls are off. Stop is the
 * one control that stays live, because stopping never needs Studio. A run paused by a disconnect
 * offers Continue only once the place is back; a reconnect never resumes it by itself.
 *
 * The worker enforces the same gate (apps/worker/tests/studio-gate-steer.test.mjs); this file holds
 * what the browser shows. NOT CHECKED HERE: key handling, which needs a DOM.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, decomment, renderWith, text, unescape } from './ui-bundle.mjs';

const ui = await bundle(
  `
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { Composer } from './src/components/ws/composer';
  import { composerLocked, continueOffered } from './src/lib/project-socket-state';
  export { h, renderToStaticMarkup, Composer, composerLocked, continueOffered };
`,
  { name: 'studio-gate-composer', resolveDir: WEB },
);
const { h, renderToStaticMarkup } = ui;
const noop = () => {};
const composer = (overrides = {}) =>
  renderWith(renderToStaticMarkup, h(ui.Composer, { onSend: () => true, onStop: noop, running: false, projectId: 'p-test', seed: 'build a castle', ...overrides }));

const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescape(m[1]) : null;
};
const has = (tag, name) => new RegExp(`\\s${name}(?:="[^"]*")?[\\s>/]`).test(tag);
const buttons = (html) => tags(html, 'button');
const byLabel = (html, label) => buttons(html).filter((t) => attr(t, 'aria-label') === label);
const continueButtons = (html) =>
  [...html.matchAll(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)].map((m) => m[0]).filter((b) => text(b).trim() === 'Continue');

test('unlocked control: the textarea is live', () => {
  const html = composer();
  const [area] = tags(html, 'textarea');
  assert.ok(area && !has(area, 'disabled'), 'the unlocked textarea is disabled — the control is wrong, not the gate');
});

test('locked: the textarea cannot be focused or typed into, and nothing submits', () => {
  const html = composer({ locked: true });
  const areas = tags(html, 'textarea');
  assert.equal(areas.length, 1);
  assert.ok(has(areas[0], 'disabled'), 'a locked textarea still takes focus and typing');
  const submits = buttons(html).filter((t) => attr(t, 'type') === 'submit');
  assert.equal(submits.length, 1);
  assert.ok(has(submits[0], 'disabled'), 'a locked composer still offers Send');
  // The build controls: the Create menu trigger is off.
  const create = buttons(html).filter((t) => (attr(t, 'class') ?? '').includes('gx-chip--create'));
  assert.equal(create.length, 1, 'no Create trigger found — this check would check nothing');
  assert.ok(has(create[0], 'disabled'), 'the Create menu opens on a locked composer');
  // And it says why, in English, where the person is looking.
  assert.match(text(html), /Connect Roblox Studio/);
});

test('the send path itself refuses while locked, not only the button', () => {
  // A disabled button does not stop a form submit from the keyboard. The composer's submit() is
  // what PromptInput calls, and it must refuse whenever the composer is locked.
  const src = decomment(readFileSync(join(WEB, 'src/components/ws/composer.tsx'), 'utf8'));
  const body = /const submit = \(\): boolean => \{([\s\S]*?)\n {2}\};/.exec(src)?.[1];
  assert.ok(body, 'submit() not found — this check would check nothing');
  const derived = /const disabled\s*=([^;]*);/.exec(src)?.[1];
  assert.ok(derived && /\blocked\b/.test(derived), 'the composer’s disabled flag no longer includes locked');
  assert.match(body.split('\n').find((l) => /return false/.test(l)) ?? '', /\bdisabled\b/, 'submit() does not refuse first on disabled');
});

test('locked with a run live: Stop is on the bar and enabled', () => {
  const html = composer({ locked: true, running: true });
  const stops = byLabel(html, 'Stop this run');
  assert.equal(stops.length, 1, 'Stop is gone while the composer is locked');
  assert.ok(!has(stops[0], 'disabled'), 'Stop is disabled while the composer is locked');
});

test('paused and Studio still away: no Continue, and the note says what to do', () => {
  const html = composer({ locked: true, running: true, paused: true });
  assert.equal(continueButtons(html).length, 0, 'Continue is offered before the place is back');
  assert.match(text(html), /Paused[\s\S]*Continue/);
});

test('paused and Studio back: Continue is shown and pressable; Stop is still there', () => {
  let pressed = 0;
  const html = composer({ running: true, paused: true, onContinue: () => (pressed += 1) });
  const cont = continueButtons(html);
  assert.equal(cont.length, 1, 'Continue is not shown after the reconnect');
  assert.ok(!has(cont[0], 'disabled'));
  assert.equal(byLabel(html, 'Stop this run').length, 1);
  assert.equal(pressed, 0, 'rendering pressed Continue — a reconnect must never resume by itself');
});

test('a run that is not paused never shows Continue', () => {
  assert.equal(continueButtons(composer({ running: true, onContinue: noop })).length, 0);
});

test('the gate follows the paired place: disconnected or the wrong place locks, the right place unlocks', () => {
  const mismatch = { expectedPlaceName: 'Castle', openPlaceName: 'Baseplate', openPlaceId: 1 };
  assert.equal(ui.composerLocked({ connected: false, link: { placeMismatch: null } }), true);
  assert.equal(ui.composerLocked({ connected: true, link: { placeMismatch: mismatch } }), true);
  assert.equal(ui.composerLocked({ connected: true, link: { placeMismatch: null } }), false);
  assert.equal(ui.continueOffered(true, true), false, 'Continue offered while Studio is still away');
  assert.equal(ui.continueOffered(true, false), true);
  assert.equal(ui.continueOffered(false, false), false);
});
