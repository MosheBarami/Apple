/**
 * THE REFERENCE PROFILE WAS A DOCUMENT. THIS MAKES IT A CONTRACT.
 *
 * `packages/corpus/data/ui-references/simulator.json` holds ten inspected references from shipped
 * Roblox games, twelve numeric rules distilled from them, and a CLOSED/OPEN ledger of how the
 * shipped theme measures against them. It is the only thing in this repository that says what a
 * Roblox UI is supposed to look like.
 *
 * Nothing read it. `ui-kit.ts` mentions it twice, in comments, and a profile that is only mentioned
 * cannot stop a rule being undone — which is exactly what happened to the stroke once already: its
 * own `why` records that "the simulator theme shipped with stroke 3 applied inconsistently".
 *
 * So the five CLOSED gaps are asserted here, each against the mechanism the ledger says closed it,
 * and each failing with the profile's own sentence. The OPEN ones are asserted to be HONEST rather
 * than to be closed: a ledger that says OPEN about something already fixed is as wrong as one that
 * says CLOSED about something broken, and the second kind is the one that gets believed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const PROFILE = JSON.parse(readFileSync(join(ROOT, 'packages/corpus/data/ui-references/simulator.json'), 'utf8'));
const KIT = readFileSync(join(HERE, '..', 'src', 'ui-kit.ts'), 'utf8');
const THEMES = readFileSync(join(HERE, '..', 'src', 'ui-kit-themes.ts'), 'utf8');

const gaps = PROFILE.gapsAgainstShippedTheme;
const closed = gaps.filter((g) => g.startsWith('CLOSED:'));
const open = gaps.filter((g) => g.startsWith('OPEN:'));

test('THE PROFILE IS STILL THE SHAPE THIS FILE READS', () => {
  // Every assertion below is about the profile's own fields. If the file is restructured, this says
  // so instead of silently asserting about undefined.
  assert.ok(PROFILE.references.length >= 10, `only ${PROFILE.references.length} references`);
  assert.ok(gaps.length >= 8, `only ${gaps.length} ledger rows`);
  assert.equal(gaps.length, closed.length + open.length, 'a ledger row is neither CLOSED nor OPEN');
  for (const key of ['panelStroke', 'cornerRadius', 'buttonBevel', 'textStroke']) {
    assert.ok(PROFILE.rules[key], `rules.${key} is gone`);
  }
});

test('EVERY CLOSED GAP STILL HAS THE MECHANISM THAT CLOSED IT', () => {
  // Each pattern is the thing the ledger row names, so a failure points at the row rather than at a
  // regex. These are the five that were fixed by rendering the theme in Studio and looking at it;
  // losing one silently is how a product regresses to the version somebody already rejected.
  const mechanisms = [
    [/outline\(object, thickness, colour\)|local function outline/, 'thick dark stroke on cards and buttons'],
    [/strokeText\(/, 'stroke on text'],
    [/UIGradient/, 'the button bevel'],
    [/TitlePlaque/, 'the plaque header'],
    [/CloseShop/, 'the circular close button'],
    [/Name = "PriceTag"/, 'the price capsule'],
  ];
  assert.equal(mechanisms.length, closed.length,
    `the ledger has ${closed.length} CLOSED rows and this test knows ${mechanisms.length} mechanisms — add the new one`);
  for (const [pattern, what] of mechanisms) {
    assert.match(KIT, pattern, `${what} is gone from ui-kit.ts, and the profile still says it is CLOSED`);
  }
});

test('THE NUMERIC RULES ARE THE SHIPPED NUMBERS — stroke, radius, bevel', () => {
  const sim = /\{ id: 'simulator',[^}]*\}/.exec(THEMES);
  assert.ok(sim, 'the simulator theme row is gone');
  const radius = Number(/radius: (\d+)/.exec(sim[0])[1]);
  assert.equal(radius, PROFILE.rules.cornerRadius.panel,
    `panel radius ${radius} against the profile's ${PROFILE.rules.cornerRadius.panel}: ${PROFILE.rules.cornerRadius.why}`);

  // The bevel's two numbers, read out of the gradient the kit builds.
  const lighten = Number(/\+ 0\.(\d+)\)/.exec(KIT)[1]);
  assert.equal(lighten, PROFILE.rules.buttonBevel.topLightenPct,
    `the bevel lightens the top by ${lighten}% against the profile's ${PROFILE.rules.buttonBevel.topLightenPct}%`);

  // The stroke is the one the profile records as having shipped WRONG once, so it is pinned hardest.
  assert.match(KIT, /math\.max\(theme\.stroke, 2\)/, 'outline() no longer enforces a minimum stroke');
  assert.match(KIT, /math\.max\(theme\.stroke, 3\)/, 'button() no longer enforces its heavier stroke');
});

test('THE OPEN GAPS ARE HONEST — a ledger that lies about what is fixed is worse than one that lies about what is not', () => {
  // The price pill was closed on 2026-09-20 and the row must move with it; the other two are
  // genuinely open and this asserts the kit still does NOT do them, so the ledger cannot drift into
  // claiming work nobody did.
  assert.ok(!open.some((g) => /price/i.test(g)),
    'the price pill is built in ui-kit.ts (PriceTag) but the ledger still lists it as OPEN');
  assert.match(KIT, /Name = "PriceTag"/, 'the price pill is gone but the ledger no longer lists it as OPEN');

  assert.ok(open.some((g) => /icons/i.test(g)), 'the icon gap left the ledger — was it closed, or just deleted?');
  assert.ok(open.some((g) => /4-across|tiles are/i.test(g)), 'the tile-packing gap left the ledger');
});
