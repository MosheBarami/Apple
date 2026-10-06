// StudKit's grid (U01 critique, 2026-10-06): cards fit the box they are in, never overlap, and scroll with a visible
// bar only when they would get too small; a tintable icon takes its item's colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridLayout, rowsLayout, expandKit, TOKENS, CONTOUR } from '../src/studkit.ts';

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

test('a tintable icon takes its token colour; a fixed one keeps its picture', () => {
  const egg = expandKit({ kit: 'icon', icon: 'egg', tint: 'grape' });
  assert.equal(egg.props.ImageColor3, TOKENS.grape.top);
  const gem = expandKit({ kit: 'icon', icon: 'gem', tint: 'grape' });
  assert.equal(gem.props.ImageColor3, undefined);
  assert.equal(expandKit({ kit: 'icon', icon: 'egg' }).props.ImageColor3, TOKENS.sun.top, 'untinted, a tintable icon is gold');
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
