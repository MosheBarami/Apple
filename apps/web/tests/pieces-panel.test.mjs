/**
 * THE PER-PIECE SETTINGS PANEL (M2 step 2.3, item C5), BUILT AGAINST A STUB.
 *
 *   1. WHAT A CONTROL MAY HOLD. A number inside its range and on its step, a colour in either hex form, a switch, a few words up to a
 *      length. A value a control cannot hold is refused (never silently turned into a different one) and the control keeps what it had.
 *   2. THE PANEL, rendered: the four kinds of control, each with a name a screen reader announces; SPECIMEN on the panel and on every
 *      card that is sample data; and, with no pieces, exactly "Pieces appear here after a build" and nothing to edit.
 *   3. THE CONTROLS, run: typing, an out-of-range number, a half-typed colour, the switch, the length cap.
 *   4. KEYBOARD AND FOCUS: every control is a real input or button, reachable in order, and carries the focus ring rule.
 *   5. NOTHING LEAVES THE PANEL: no request, no storage; a change is held in the panel's own state.
 *
 * The production build must not contain the stub: tests/pieces-production.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, element, renderWith, text } from './ui-bundle.mjs';
import { findAll, loadPage, textOf } from './page-harness.mjs';
import ts from 'typescript';
import { STUB_PIECES, PIECES_STUB_MARKER } from '../src/lib/pieces-stub.ts';

// The helpers live in lib/pieces.ts, which imports React for its hook; bundled for node like the components are.
const lib = await bundle(`export * from './src/lib/pieces';`, { name: 'pieces-lib', resolveDir: WEB });
const { acceptValue, normaliseColour, normaliseNumber } = lib;

/* ------------------------------------------------------------------ what a control holds --- */

test('a number is held only inside its range, snapped to its step, and a refused one is not turned into another value', () => {
  const p = { min: 1, max: 6, step: 1 };
  assert.equal(normaliseNumber(p, 3), 3);
  assert.equal(normaliseNumber(p, '4'), 4, 'typed text is a number');
  assert.equal(normaliseNumber(p, 2.4), 2, 'between two steps goes to the nearest');
  assert.equal(normaliseNumber(p, 2.6), 3);
  for (const refused of [0, 7, -1, 6.6, 0.4, '', '  ', 'abc', '1e9', NaN, Infinity, null, undefined, {}, [], true]) {
    assert.equal(normaliseNumber(p, refused), null, `${JSON.stringify(refused)} is refused, not clamped`);
  }
  assert.equal(normaliseNumber(p, 6), 6, 'the ends are in range');
  assert.equal(normaliseNumber(p, 1), 1);
});

test('a number with a fractional step comes back as a clean number, not 0.30000000000000004', () => {
  const p = { min: 1, max: 300, step: 0.5 };
  assert.equal(normaliseNumber(p, 30.3), 30.5);
  assert.equal(normaliseNumber(p, 30.2), 30);
  const tenth = { min: 0, max: 1, step: 0.1 };
  assert.equal(normaliseNumber(tenth, 0.3), 0.3);
  assert.equal(normaliseNumber(tenth, '0.30000000000000004'), 0.3);
  assert.equal(normaliseNumber({ min: 0, max: 10, step: 0.25 }, 7.4), 7.5);
});

test('a colour is #rgb or #rrggbb in any case, held as lower-case #rrggbb; anything else is not a colour', () => {
  assert.equal(normaliseColour('#D9A441'), '#d9a441');
  assert.equal(normaliseColour('#fa0'), '#ffaa00');
  assert.equal(normaliseColour(' #ABCDEF '), '#abcdef');
  for (const refused of ['', '#', '#12', '#12345', '#1234567', 'red', 'rgb(1,2,3)', '7c5cff', '#gggggg', '#12 345', null, undefined, 5, {}]) {
    assert.equal(normaliseColour(refused), null, `${JSON.stringify(refused)}`);
  }
});

test('acceptValue offers a value to a parameter and keeps the old one when the parameter cannot hold it', () => {
  const number = { kind: 'number', id: 'n', label: 'N', value: 3, min: 1, max: 6, step: 1 };
  const colour = { kind: 'colour', id: 'c', label: 'C', value: '#112233' };
  const toggle = { kind: 'toggle', id: 't', label: 'T', value: true };
  const words = { kind: 'text', id: 'w', label: 'W', value: 'Shop', maxLength: 5 };
  assert.equal(acceptValue(number, 5), 5);
  assert.equal(acceptValue(number, 99), 3);
  assert.equal(acceptValue(colour, '#FFF'), '#ffffff');
  assert.equal(acceptValue(colour, 'nope'), '#112233');
  assert.equal(acceptValue(toggle, false), false);
  assert.equal(acceptValue(toggle, 'false'), true, 'a string is not a switch position');
  assert.equal(acceptValue(words, 'Market'), 'Marke', 'cut at the limit');
  assert.equal(acceptValue(words, 7), 'Shop');
});

/* ------------------------------------------------------------------ the stub --- */

test('the stub holds sample pieces of the four control kinds, every one marked a specimen, every value inside its own limits', () => {
  assert.ok(STUB_PIECES.length >= 3);
  const kinds = new Set();
  for (const piece of STUB_PIECES) {
    assert.equal(piece.specimen, true, `${piece.name} is not marked a specimen`);
    assert.ok(piece.id.startsWith(PIECES_STUB_MARKER), 'the marker the production checks look for is on every id');
    assert.ok(piece.params.length > 0);
    for (const param of piece.params) {
      kinds.add(param.kind);
      assert.equal(acceptValue(param, param.value), param.value, `${piece.name}: "${param.label}" holds a value its own control would refuse`);
    }
  }
  assert.deepEqual([...kinds].sort(), ['colour', 'number', 'text', 'toggle'], 'number, colour, toggle and text are all exercised');
  assert.equal(new Set(STUB_PIECES.flatMap((p) => p.params.map((q) => `${p.id}/${q.id}`))).size, STUB_PIECES.flatMap((p) => p.params).length, 'no two parameters share an id');
});

/* ------------------------------------------------------------------ the panel, rendered --- */

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { PiecesPanel, PIECES_EMPTY, SPECIMEN_NOTE } from './src/components/ws/pieces-panel';
`, { name: 'pieces-panel', resolveDir: WEB });
const render = (pieces) => renderWith(ui.renderToStaticMarkup, ui.h(ui.PiecesPanel, { pieces }));

test('WITH NO PIECES (production today) the panel says one sentence and offers nothing to edit', () => {
  const html = render([]);
  assert.equal(text(html), 'Pieces appear here after a build');
  assert.equal(ui.PIECES_EMPTY, 'Pieces appear here after a build');
  assert.doesNotMatch(html, /<input|<button|<select|<textarea|SPECIMEN/, 'a control or a specimen stamp with nothing behind it');
});

test('WITH SAMPLE PIECES the panel says SPECIMEN as a sentence on the panel and as a stamp on every card', () => {
  const html = render(STUB_PIECES);
  assert.equal((html.match(/SPECIMEN/g) ?? []).length, 1 + STUB_PIECES.length, 'one on the panel, one per card');
  assert.ok(text(html).includes(ui.SPECIMEN_NOTE));
  assert.match(ui.SPECIMEN_NOTE, /not saved/);
  assert.match(ui.SPECIMEN_NOTE, /nothing in Studio/);
  assert.equal((html.match(/<section class="pieces__piece"/g) ?? []).length, STUB_PIECES.length);
  for (const piece of STUB_PIECES) assert.ok(text(html).includes(piece.name));
});

test('a piece that is not a specimen is not stamped one (real pieces in M5 are not labelled as samples)', () => {
  const real = [{ id: 'p', name: 'Real piece', kind: 'zone', params: [{ kind: 'toggle', id: 't', label: 'Switch', value: false }] }];
  assert.doesNotMatch(render(real), /SPECIMEN/);
});

test('the four kinds of control are drawn with the right element and the right limits', () => {
  const html = render(STUB_PIECES);
  const shop = element(html, /<section class="pieces__piece"[^>]*>(?=[\s\S]{0,200}Sample shop screen)/);
  assert.match(shop, /<input[^>]*type="number"[^>]*min="1"[^>]*max="6"[^>]*step="1"[^>]*value="3"/, 'a number input with its range and step');
  assert.match(shop, /inputMode="decimal"/);
  assert.match(shop, /<input type="color"[^>]*value="#1a1d22"/, 'a native colour picker');
  assert.match(shop, /<input[^>]*type="text"[^>]*maxLength="7"[^>]*value="#1a1d22"/, 'and a hex field beside it');
  assert.match(shop, /<button[^>]*role="switch"[^>]*aria-checked="true"/, 'a switch is a button with the switch role');
  assert.match(shop, /<input[^>]*type="text"[^>]*maxLength="24"[^>]*value="Shop"/, 'words, capped');
  assert.match(text(shop), /px/, 'a unit is shown beside its number');
});

test('EVERY CONTROL HAS A NAME a screen reader announces: a label bound to it, or an aria-label', () => {
  const html = render(STUB_PIECES);
  const labelled = new Set([...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]));
  const controls = [...html.matchAll(/<(input|button)\b([^>]*)>/g)].map((m) => m[2]);
  assert.ok(controls.length >= 12, `${controls.length} controls: the check would be vacuous`);
  for (const attrs of controls) {
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    const named = /aria-label="[^"]+"/.test(attrs) || (id && labelled.has(id));
    assert.ok(named, `a control has no name: <${attrs.trim()}>`);
  }
  // No two controls share an id (a label would point at the wrong one).
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'an id is used twice');
  // The colour picker has its own name, distinct from the hex field's label.
  assert.match(html, /aria-label="Panel colour, colour picker"/);
});

test('each card is a labelled region headed by its name, with its kind in words', () => {
  const html = render(STUB_PIECES);
  assert.equal((html.match(/<section class="pieces__piece" aria-labelledby=/g) ?? []).length, STUB_PIECES.length);
  assert.deepEqual([...html.matchAll(/<span class="pieces__kind">([^<]*)</g)].map((m) => m[1]), ['Screen', 'System', 'Zone']);
});

/* ------------------------------------------------------------------ the controls, run --- */

const Page = await loadPage({ entry: 'src/components/ws/pieces-panel.tsx', name: 'pieces-panel-page', real: ['lib/pieces.ts'] });

/** A control mounted alone: the element tree it renders, and the values it reported. */
function control(name, props) {
  const reported = [];
  const page = Page.mountStub(() => Page[name]({ ...props, onChange: (v) => reported.push(v) }));
  const input = (predicate) => findAll(page.result, (n) => n.type === 'input' && predicate(n.props))[0];
  return { page, reported, input };
}

test('NUMBER: a valid value is reported at once; a number out of range marks the field and reports nothing; leaving puts the last good value back', async () => {
  const param = { kind: 'number', id: 'n', label: 'Columns', value: 3, min: 1, max: 6, step: 1 };
  const { page, reported, input } = control('NumberControl', { id: 'x', param, value: 3 });
  const field = () => input((p) => p.type === 'number');
  field().props.onChange({ target: { value: '5' } });
  await page.settle();
  assert.deepEqual(reported, [5]);
  assert.equal(field().props['aria-invalid'], undefined);
  field().props.onChange({ target: { value: '99' } });
  await page.settle();
  assert.deepEqual(reported, [5], 'nothing is reported for a value the parameter cannot hold');
  assert.equal(field().props['aria-invalid'], 'true', 'the field is marked');
  assert.equal(field().props.value, '99', 'what was typed stays as typed while it is being corrected');
  field().props.onBlur();
  await page.settle();
  assert.equal(field().props.value, '3', 'leaving restores the last good value');
  assert.equal(field().props['aria-invalid'], undefined);
});

test('NUMBER: a half-typed decimal is kept as typed, so typing "3.5" is not interrupted at "3."', async () => {
  const param = { kind: 'number', id: 'n', label: 'Seconds', value: 30, min: 1, max: 300, step: 0.5 };
  const { page, input } = control('NumberControl', { id: 'x', param, value: 30 });
  const field = () => input((p) => p.type === 'number');
  field().props.onChange({ target: { value: '3.' } });
  await page.settle();
  assert.equal(field().props.value, '3.');
  field().props.onChange({ target: { value: '3.5' } });
  await page.settle();
  assert.equal(field().props.value, '3.5');
});

test('COLOUR: the picker and the hex field both report a colour in the one canonical form, and a half-typed hex marks the field and reports nothing', async () => {
  const { page, reported, input } = control('ColourControl', { id: 'x', label: 'Panel colour', value: '#1a1d22' });
  const picker = () => input((p) => p.type === 'color');
  const hex = () => input((p) => p.type === 'text');
  picker().props.onChange({ target: { value: '#FF0000' } });
  await page.settle();
  assert.deepEqual(reported, ['#ff0000']);
  assert.equal(hex().props.value, '#ff0000', 'the hex field follows the picker');
  hex().props.onChange({ target: { value: '#12' } });
  await page.settle();
  assert.deepEqual(reported, ['#ff0000'], 'two digits is not a colour yet');
  assert.equal(hex().props['aria-invalid'], 'true');
  hex().props.onChange({ target: { value: '#1AF' } });
  await page.settle();
  assert.deepEqual(reported, ['#ff0000', '#11aaff'], '#rgb is accepted and expanded');
  assert.equal(hex().props['aria-invalid'], undefined);
  hex().props.onBlur();
  await page.settle();
  assert.equal(hex().props.value, '#1a1d22', 'leaving puts the held colour back (the held value is the prop: the panel owns it)');
});

test('TOGGLE: pressing flips it, and it says which position it is in with the word and the state', () => {
  const reported = [];
  const off = Page.ToggleControl({ id: 'x', label: 'Show prices', value: false, onChange: (v) => reported.push(v) });
  assert.equal(off.type, 'button');
  assert.equal(off.props.role, 'switch');
  assert.equal(off.props['aria-checked'], false);
  assert.equal(off.props.type, 'button');
  off.props.onClick();
  assert.deepEqual(reported, [true]);
  const on = Page.ToggleControl({ id: 'x', label: 'Show prices', value: true, onChange: (v) => reported.push(v) });
  assert.equal(on.props['aria-checked'], true);
  assert.equal(textOf(on), 'On');
  on.props.onClick();
  assert.deepEqual(reported, [true, false]);
  assert.equal(textOf(off), 'Off');
});

test('TEXT: capped at its length, and what is typed is what is held', () => {
  const reported = [];
  const field = Page.TextControl({ id: 'x', param: { kind: 'text', id: 't', label: 'Title', value: 'Shop', maxLength: 5 }, value: 'Shop', onChange: (v) => reported.push(v) });
  assert.equal(field.props.maxLength, 5);
  field.props.onChange({ target: { value: 'Market' } });
  assert.deepEqual(reported, ['Marke']);
});

test('THE PANEL holds a change in its own state and hands each control the value it holds; another piece’s parameter is not touched', async () => {
  const page = Page.mountStub(() => Page.PiecesPanel({ pieces: STUB_PIECES }));
  await page.settle();
  const numbers = () => findAll(page.result, (n) => n.type === Page.NumberControl);
  assert.equal(numbers()[0].props.value, 3, 'the sample value');
  numbers()[0].props.onChange(5);
  await page.settle();
  assert.equal(numbers()[0].props.value, 5, 'the change is held');
  assert.equal(numbers()[1].props.value, 8, 'a different parameter of the same piece is untouched');
  assert.equal(numbers()[2].props.value, 5, 'and the same-named kind of control on another piece is its own');
  numbers()[0].props.onChange(500);
  await page.settle();
  assert.equal(numbers()[0].props.value, 5, 'a value the control cannot hold changes nothing');
  const switches = () => findAll(page.result, (n) => n.type === Page.ToggleControl);
  assert.equal(switches()[0].props.value, true);
  switches()[0].props.onChange(false);
  await page.settle();
  assert.equal(switches()[0].props.value, false);
});

test('two pieces may name a parameter alike (both have a "size"): a change to one never reaches the other', async () => {
  const size = (id, value) => ({ id, name: id, kind: 'prop', params: [{ kind: 'number', id: 'size', label: 'Size', value, min: 1, max: 10, step: 1 }] });
  const page = Page.mountStub(() => Page.PiecesPanel({ pieces: [size('first', 2), size('second', 7)] }));
  await page.settle();
  const numbers = () => findAll(page.result, (n) => n.type === Page.NumberControl);
  numbers()[0].props.onChange(9);
  await page.settle();
  assert.deepEqual(numbers().map((n) => n.props.value), [9, 7]);
});

/* ------------------------------------------------------------------ keyboard and focus (source and CSS) --- */

const css = readFileSync(join(WEB, 'src', 'components', 'ws', 'pieces-panel.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const panelSrc = readFileSync(join(WEB, 'src', 'components', 'ws', 'pieces-panel.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

test('every control is a native input or button (so Tab reaches it, and Space and Enter work), with no tabindex of its own', () => {
  assert.doesNotMatch(panelSrc, /tabIndex|onKeyDown|onKeyPress|role="button"|<div[^>]*onClick|<span[^>]*onClick/, 'a control is built from a non-control');
  assert.equal((panelSrc.match(/<input/g) ?? []).length, 4, 'number, colour picker, hex field, text: and the count is known');
  assert.match(panelSrc, /<button type="button" id=\{id\} role="switch"/);
});

test('the focus ring is drawn on every control of the panel, in the ring token, outside the control', () => {
  assert.match(css, /\.pieces :is\(input, button\):focus-visible\s*\{\s*outline:\s*2px solid var\(--accent-ring\);\s*outline-offset:\s*2px;\s*\}/);
  assert.doesNotMatch(css, /outline:\s*(none|0)\b/, 'a rule removes the ring');
  assert.doesNotMatch(css, /box-shadow|backdrop-filter|gradient|blur/, 'the panel is flat');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsl/i, 'a colour is written in the sheet instead of a token');
});

test('the state of a switch is never carried by colour alone: it says On or Off', () => {
  assert.match(panelSrc, /\{value \? 'On' : 'Off'\}/);
});

/* ------------------------------------------------------------------ nothing leaves the panel --- */

test('the panel makes no request and touches no storage; a change is held in its own state', () => {
  assert.doesNotMatch(panelSrc, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|supabase|from '\.\.\/\.\.\/lib\/api'/);
  assert.match(panelSrc, /const \[edits, setEdits\] = useState/);
});

/* ------------------------------------------------------------------ where it is reachable (workspace source) --- */

//[[ RESTATED 2026-10-05 (M2 fix cycle 1, owner decision: the Pieces entry points are not shown in production before M5). These two tests read the
//   topbar button, the palette command and the drawer as always present. The property they keep is "the panel is reachable in the build that has
//   pieces, and the drawer is a real one"; the property added is the one the decision made: EVERY way in (the button, the palette command, the
//   drawer's mount) sits behind PIECES_OFFERED, which is `import.meta.env.DEV`, so a production build offers none of them. Found by walking the
//   syntax tree for every `setDrawer('pieces')` and every <PiecesDrawer />, so a fourth way in that forgets the gate goes red too. ]]
const ws = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
const wsFull = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
const wsTree = ts.createSourceFile('workspace.tsx', wsFull, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const walk = (root) => { const all = []; const visit = (n) => { all.push(n); ts.forEachChild(n, visit); }; visit(root); return all; };
/** True when `node` can only run or draw when PIECES_OFFERED is true: it sits in the `&&` right side or the true branch of a test that names it. */
const behindGate = (node) => {
  for (let child = node, up = node.parent; up; child = up, up = up.parent) {
    if (ts.isBinaryExpression(up) && up.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && up.right === child && /\bPIECES_OFFERED\b/.test(up.left.getText())) return true;
    if (ts.isConditionalExpression(up) && up.whenTrue === child && /\bPIECES_OFFERED\b/.test(up.condition.getText())) return true;
  }
  return false;
};

test('the panel is reachable in a build that has pieces, three ways, and the drawer is a real one: a button, a palette command, and the remembered-drawer list', () => {
  assert.match(ws, /<button[^>]*onClick=\{\(\) => setDrawer\('pieces'\)\}[^>]*aria-label="Pieces and their settings"/, 'the topbar button');
  assert.match(ws, /id: 'ws-pieces',\s*title: 'Pieces and their settings'[\s\S]{0,200}run: \(\) => setDrawer\('pieces'\)/, 'the palette command');
  // A drawer missing from the list restores as "none": the union and the list must both know it.
  assert.match(ws, /type Drawer = null \| [^;]*'pieces'/);
  assert.match(ws, /type DrawerName = [^;]*'pieces'/);
  assert.match(ws, /const DRAWERS = \[[^\]]*'pieces'[^\]]*\] as const/);
});

test('PRODUCTION OFFERS NO WAY IN: the button, the palette command and the drawer all sit behind PIECES_OFFERED, and PIECES_OFFERED is the build\'s DEV flag', () => {
  const opens = walk(wsTree).filter((n) => ts.isCallExpression(n) && n.expression.getText() === 'setDrawer' && n.arguments[0]?.getText() === "'pieces'");
  const mounts = walk(wsTree).filter((n) => (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText() === 'PiecesDrawer');
  assert.equal(opens.length, 2, 'the way-in count changed: the topbar button and the palette command are the two, and a third needs a gate and a line here');
  assert.equal(mounts.length, 1, 'the drawer mounts the panel once');
  for (const node of [...opens, ...mounts]) assert.equal(behindGate(node), true, `${node.getText().slice(0, 60)} can run in a production build`);
  // The flag is the build's own constant, from the one module that decides it, and nothing else decides it.
  assert.match(wsFull, /import \{ PIECES_OFFERED \} from '\.\.\/lib\/pieces';/);
  const piecesSrc = readFileSync(join(WEB, 'src', 'lib', 'pieces.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  assert.match(piecesSrc, /export const PIECES_OFFERED: boolean = import\.meta\.env\.DEV;/);
  // The CONTROL: in the production shape the bundle sees (`import.meta.env.DEV` false), it is false; so none of the ways in is offered.
  assert.equal(lib.PIECES_OFFERED, false);
  // A drawer left open and remembered from a build that had pieces restores as closed where the panel is not offered.
  assert.match(ws, /stored === 'pieces' && !PIECES_OFFERED/);
});

test('the drawer mounts the panel only while it is open, so edits do not outlive the drawer that was closed to abandon them', () => {
  assert.match(ws, /<Drawer open=\{drawer === 'pieces'\} onClose=\{\(\) => setDrawer\(null\)\} title="Pieces">\s*\{PIECES_OFFERED && drawer === 'pieces' && <PiecesDrawer \/>\}\s*<\/Drawer>/);
});

/* ------------------------------------------------------------------ the drawer waits for the answer --- */

// usePieces and PiecesDrawer, run: `loaded` is false until the answer is in, so the panel never claims "none" before it knows, and an answer that
// arrives after the drawer is closed sets nothing.
const Drawer = await loadPage({ entry: 'src/components/ws/pieces-panel.tsx', name: 'pieces-drawer', real: ['lib/pieces.ts'] });

test('THE DRAWER SHOWS A LOADING LINE, NOT "NONE", UNTIL THE ANSWER IS IN; then the panel', async () => {
  const page = Drawer.mountStub(() => Drawer.PiecesDrawer());
  assert.match(page.result.props.className, /skeleton/, 'before the answer: the loading line');
  assert.equal(page.result.props['aria-busy'], 'true');
  assert.notEqual(page.result.type, Drawer.PiecesPanel, 'the panel (and its empty sentence) is drawn before the pieces were asked for');
  await page.settle();
  assert.equal(page.result.type, Drawer.PiecesPanel, 'after the answer: the panel');
  assert.deepEqual(page.result.props.pieces, [], 'production has no pieces');
});

test('an answer that arrives after the drawer was closed sets nothing', async () => {
  const page = Drawer.mountStub(() => Drawer.PiecesDrawer());
  // settle() commits the effect (the hook asks for the pieces) before its first await; the drawer is closed before the answer comes back.
  const settled = page.settle();
  page.unmount();
  await settled;
  assert.equal(page.setsAfterUnmount, 0, 'the hook set state after it was unmounted');
});
