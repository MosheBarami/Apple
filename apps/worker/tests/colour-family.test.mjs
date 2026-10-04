/**
 * COLOUR FAMILIES: the one place where "this value is red" and "this word means red" meet.
 *
 * Property under test: a measured Color3 and a colour word land in the same family exactly when a person
 * looking at the pixels would call them the same colour, and a value that is clearly another colour never
 * matches. White paint must never pass for red (the owner's benchmark, 2026-10-02).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { familyOfRgb, familiesOfWord, familyOfLabel, colourWordsIn, sameColour } from '../src/colour-family.ts';

test('measured values fall in the family a person would name', () => {
  const cases = [
    [[1, 0, 0], 'red'], [[0.8, 0.1, 0.1], 'red'], [[1, 0.5, 0], 'orange'], [[1, 0.9, 0.1], 'yellow'],
    [[0.1, 0.8, 0.2], 'green'], [[0.1, 0.4, 1], 'blue'], [[0.5, 0.1, 0.8], 'purple'], [[1, 0.4, 0.7], 'pink'],
    [[1, 1, 1], 'white'], [[0.97, 0.97, 0.97], 'white'], [[0, 0, 0], 'black'], [[0.05, 0.05, 0.06], 'black'],
    [[0.5, 0.5, 0.5], 'grey'], [[0.4, 0.25, 0.1], 'brown'], [[0.1, 0.8, 0.85], 'cyan'],
  ];
  for (const [rgb, family] of cases) assert.equal(familyOfRgb(rgb), family, JSON.stringify(rgb));
});

test('values given as 0-255 are read as 0-255 and not as an overbright 0-1', () => {
  assert.equal(familyOfRgb([255, 0, 0]), 'red');
  assert.equal(familyOfRgb([255, 255, 255]), 'white');
  assert.equal(familyOfRgb([12, 200, 40]), 'green');
});

test('a value that cannot be a colour has no family', () => {
  assert.equal(familyOfRgb([NaN, 0, 0]), null);
  assert.equal(familyOfRgb([1, 2]), null);
  assert.equal(familyOfRgb(null), null);
});

test('words map to the families they can honestly mean, and modifiers do not change that', () => {
  assert.ok(familiesOfWord('red').has('red'));
  assert.ok(!familiesOfWord('red').has('white'));
  assert.deepEqual([...familiesOfWord('light blue')], [...familiesOfWord('blue')]);
  assert.ok(familiesOfWord('golden').has('yellow') && familiesOfWord('golden').has('orange'));
  assert.ok(familiesOfWord('silver').has('grey'));
  assert.ok(familiesOfWord('gray').has('grey') && familiesOfWord('grey').has('grey'));
  assert.equal(familiesOfWord('flibbertigibbet'), null);
});

test('Roblox BrickColor names resolve by the colour word they contain', () => {
  assert.equal(familyOfLabel('Bright red'), 'red');
  assert.equal(familyOfLabel('Really black'), 'black');
  assert.equal(familyOfLabel('Medium stone grey'), 'grey');
  assert.equal(familyOfLabel('Institutional white'), 'white');
  assert.equal(familyOfLabel('Reddish brown'), 'brown');
  assert.equal(familyOfLabel('Nothing like a colour'), null);
});

test('sameColour: a claimed word against a measured family', () => {
  assert.equal(sameColour('red', 'red'), true);
  assert.equal(sameColour('red', 'white'), false);
  assert.equal(sameColour('gold', 'yellow'), true);
  assert.equal(sameColour('pink', 'red'), false);
  assert.equal(sameColour('unknownish', 'red'), null, 'an unknown word is not a verdict');
});

test('colourWordsIn finds the words, with their modifiers, in reading order and ignores look-alikes', () => {
  assert.deepEqual(colourWordsIn('I painted the door bright red and the roof dark green.').map((m) => m.word), ['bright red', 'dark green']);
  assert.deepEqual(colourWordsIn('The shredded reduction is predicated on nothing.').map((m) => m.word), []);
  assert.deepEqual(colourWordsIn('A GOLDEN crown').map((m) => m.word), ['golden']);
});
