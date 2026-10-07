// StudKit's grid (U01 critique, 2026-10-06): cards fit the box they are in, never overlap, and scroll with a visible
// bar only when they would get too small; a tintable icon takes its item's colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gridLayout, rowsLayout, expandKit, TOKENS, CONTOUR, PHONE_MIN_CARD } from '../src/studkit.ts';

const overlap = (a, b) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

test('a featured card and up to two rows fit the box without scrolling, inside it and apart', () => {
  for (const [n, cols] of [[1, 3], [3, 3], [5, 3], [6, 3], [8, 4]]) {
    const L = gridLayout(n, true, cols);
    assert.equal(L.scroll, false, `${n} cards in ${cols} columns`);
    const all = [L.featured, ...L.cards];
    for (const b of all) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1 + 1e-9 && b.y + b.h <= 1 + 1e-9, `${n}: a card leaves the box`);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(!overlap(all[i], all[j]), `${n}: cards ${i} and ${j} overlap`);
  }
});

test('THE CONTROL: many cards scroll, with the canvas taller than the box', () => {
  const L = gridLayout(24, false, 4);
  assert.equal(L.scroll, true);
  assert.ok(L.height > 1);
  assert.ok(L.cards.every((c) => c.y + c.h <= 1 + 1e-9));
});

test('the grid sizes the cards the recipe gives it, and shows the bar only when it scrolls', () => {
  const card = (name) => ({ kit: 'card', name, token: 'sky', children: [] });
  const g = expandKit({ kit: 'grid', columns: 3, children: [card('Featured'), card('Item1'), card('Item2')] });
  assert.equal(g.className, 'ScrollingFrame');
  assert.deepEqual(g.children.map((c) => c.name), ['Featured', 'Item1', 'Item2']);
  assert.ok(g.children.every((c) => c.props.Size && c.props.Position));
  assert.equal(g.props.ScrollBarThickness, 0);
  const many = expandKit({ kit: 'grid', columns: 4, children: Array.from({ length: 24 }, (_, i) => card(`Item${i + 1}`)) });
  assert.equal(many.props.ScrollBarThickness, 10);
});

test('a tintable icon takes the pale (rim) shade of its token, so it stands out on a card of that colour; a fixed one keeps its picture', () => {
  const egg = expandKit({ kit: 'icon', icon: 'egg', tint: 'grape' });
  assert.equal(egg.props.ImageColor3, TOKENS.grape.rim);
  assert.notEqual(egg.props.ImageColor3, TOKENS.grape.mid, 'never the card face colour it sits on');
  const gem = expandKit({ kit: 'icon', icon: 'gem', tint: 'grape' });
  assert.equal(gem.props.ImageColor3, undefined);
  assert.equal(expandKit({ kit: 'icon', icon: 'egg' }).props.ImageColor3, TOKENS.sun.rim, 'untinted, a tintable icon is pale gold');
});

test('UI Spec v2: every face has the navy contour outside and a pale rim inside; the window body is cloud, never navy', () => {
  const strokes = (sp) => [...(sp.className === 'UIStroke' ? [sp] : []), ...(sp.children ?? []).flatMap(strokes)];
  const card = expandKit({ kit: 'card', token: 'sky', children: [] });
  const all = strokes(card);
  assert.ok(all.some((st) => st.props.Color === CONTOUR && st.props.BorderStrokePosition.v.endsWith('Outer')), 'contour outside');
  assert.ok(all.some((st) => st.props.Color === TOKENS.sky.rim && st.props.BorderStrokePosition.v.endsWith('Inner')), 'rim inside');
  assert.ok(all.every((st) => st.props.Color === CONTOUR || st.props.Color === TOKENS.sky.rim), 'no stroke in the face hue');
  const names = (sp) => [sp.name, ...(sp.children ?? []).flatMap(names)];
  assert.ok(!names(card).includes('Shine') && !names(card).includes('Shadow'), 'no shine band, no black shadow');
  const win = expandKit({ kit: 'window', title: 'Shop', icon: 'gem', token: 'sky' });
  const body = win.children.find((c) => c.name === 'Body');
  assert.equal(body.children.find((c) => c.name === 'Gradient').props.Color.v[0][1].length, 3);
  assert.ok(!JSON.stringify(win).includes('#16233F'), 'no navy well');
  const text = expandKit({ kit: 'text', text: 'Hi', max: 44 });
  assert.equal(text.children.find((c) => c.name === 'Outline').props.Color, CONTOUR);
  assert.equal(expandKit({ kit: 'button', token: 'lime', text: 'R$ 99' }).children.find((c) => c.name === 'Fill').children.find((c) => c.name === 'Label').props.Text, '\uE002 99', 'R$ becomes the Robux glyph');
});

test('rows share the box and scroll only when they would get too thin', () => {
  const few = rowsLayout(5);
  assert.equal(few.scroll, false);
  assert.ok(few.rows.every((r) => r.y + r.h <= 1 + 1e-9));
  for (let i = 1; i < few.rows.length; i++) assert.ok(few.rows[i].y >= few.rows[i - 1].y + few.rows[i - 1].h, 'rows overlap');
  const many = rowsLayout(12);
  assert.equal(many.scroll, true);
  assert.ok(many.height > 1);
});

/* ---------------------------------------- critic v3 round 1 (2026-10-07): the fixes it asked for stay fixed --- */
const find = (sp, name) => (sp.name === name ? sp : (sp.children ?? []).map((c) => find(c, name)).find(Boolean));
const card = (name) => ({ kit: 'card', name, token: 'sky', children: [
  { kit: 'rays', name: 'Rays', size: [0.4, 0, 1.2, 0], position: [0.19, 0, 0.5, 0] },
  { kit: 'icon', icon: 'gem', size: [0.36, 0, 1, 0], position: [0.19, 0, 0.5, 0] },
  { kit: 'text', name: 'Title', text: 'Gem', size: [0.58, 0, 0.3, 0], position: [0.39, 0, 0.06, 0] },
  { kit: 'button', name: 'Buy', token: 'lime', text: '10', size: [0.58, 0, 0.34, 0], position: [0.39, 0, 0.6, 0] },
] });

test('a grey button on a grey card stays grey: grey is the done or disabled state, never the call to action', () => {
  const b = expandKit({ kit: 'button', name: 'Buy', token: 'slate', on: 'slate', text: 'Claimed' });
  assert.equal(find(b, 'Fill').attributes.Token, 'slate');
  const live = expandKit({ kit: 'button', name: 'Buy', token: 'sky', on: 'sky', text: 'Claim!' });
  assert.notEqual(find(live, 'Fill').attributes.Token, 'sky', 'a coloured button on its own colour still contrasts');
});

test('a portrait card stacks title, a big centred icon and a full-width button; a landscape card keeps its row', () => {
  const tall = expandKit({ kit: 'grid', name: 'Grid', columns: 4, children: Array.from({ length: 8 }, (_, i) => card(`Item${i + 1}`)) });
  const icon = find(find(tall, 'Item1'), 'Icon');
  assert.deepEqual(icon.props.AnchorPoint.v, [0.5, 0.5]);
  assert.equal(icon.props.Position.v[0], 0.5, 'centred');
  assert.ok(find(find(tall, 'Item1'), 'Buy').props.Size.v[0] > 0.8, 'the button spans the card');
  const wide = expandKit({ kit: 'grid', name: 'Grid', columns: 3, children: [card('Featured'), ...Array.from({ length: 5 }, (_, i) => card(`Item${i + 1}`))] });
  assert.equal(find(find(wide, 'Item1'), 'Icon').props.Position.v[0], 0.19, 'a wide card keeps the recipe row');
});

test('every grid card carries a phone layout of at most two columns, and the grid its phone canvas', () => {
  const g = expandKit({ kit: 'grid', name: 'Grid', columns: 4, children: Array.from({ length: 8 }, (_, i) => card(`Item${i + 1}`)) });
  assert.equal(g.attributes.StudKitPhoneCanvas.t, 'UDim2');
  const xs = new Set(g.children.map((c) => c.attributes.StudKitPhonePos.v[0].toFixed(3)));
  assert.ok(xs.size <= 2, `phone columns: ${[...xs]}`);
  assert.ok(g.children.every((c) => c.attributes.StudKitPhoneSize.t === 'UDim2'));
  const P = gridLayout(8, false, 2, 1.74, PHONE_MIN_CARD, true);
  assert.ok(P.scroll, 'eight cards in two phone columns scroll');
});

test('UiFx reads the camera every time: Roblox replaces CurrentCamera when the character loads (E2/E6 square frames)', () => {
  const src = readFileSync(new URL('../../../packages/blocks/ui/ui-fx/src/UiFx.luau', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^local camera = workspace\.CurrentCamera/m, 'no camera cached at start');
  assert.match(src, /GetPropertyChangedSignal\("CurrentCamera"\)/);
});
