/**
 * THE MODEL'S CHAT LINES ARE MARKUP, AND DRAWING THE MARKUP LIBELS THE MODEL.
 *
 * THE DEFECT, measured 2026-09-21 on docs/evidence/ui-showcase/screen-social--tycoon.luau line 225.
 * The model set `t.RichText = true` and wrote
 *
 *     <font color="#78C8FF">[CARTL]</font> <b>ConveyorKing:</b> upgraded my second dropper
 *
 * which is exactly how a shipped Roblox game writes a clan tag. `render-ui-tree.mjs` knew nothing
 * about RichText, drew the string verbatim, and the owner's showcase card showed a chat window
 * full of raw `<font color=...>` and `</b>`. The model was right and the picture was wrong — the
 * same failure shape this repository keeps finding: a gap in the harness recorded as a defect in
 * the model.
 *
 * Every expectation below is read off Roblox/creator-docs `content/en-us/ui/rich-text.md`
 * (supported tags, the two colour spellings, the five escape forms), not off memory.
 *
 * THE SECOND HALF OF THIS FILE MATTERS MORE THAN THE FIRST. A parser that is too eager is worse
 * than none: it would swallow angle brackets that the engine draws as characters, and quietly make
 * a real defect in the model's output invisible. So malformed markup must come back null, and the
 * caller must fall back to the raw string.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRichText, renderTreeToSvg } from './render-ui-tree.mjs';

const textOf = (parsed) => parsed.runs.map((r) => r.text).join('');

test('the chat line that started this renders as words, with the tag coloured and the name bold', () => {
  const parsed = parseRichText(
    '<font color="#78C8FF">[CARTL]</font> <b>ConveyorKing:</b> upgraded my second dropper',
  );
  assert.ok(parsed, 'well-formed markup must parse');
  assert.equal(
    textOf(parsed),
    '[CARTL] ConveyorKing: upgraded my second dropper',
    'no angle bracket may survive into the drawing',
  );
  const tag = parsed.runs.find((r) => r.text === '[CARTL]');
  assert.equal(tag.color, '#78C8FF');
  assert.equal(tag.bold, false);
  const who = parsed.runs.find((r) => r.text === 'ConveyorKing:');
  assert.equal(who.bold, true);
  assert.equal(who.color, null, 'the font tag closed before the name — its colour must not leak');
  const msg = parsed.runs.find((r) => r.text.includes('upgraded'));
  assert.equal(msg.bold, false, 'the bold tag closed before the message');
});

test('the space between two tags survives — it is what separates a name from its message', () => {
  // A parser that trims runs would produce "[CARTL]ConveyorKing:upgraded", which reads as a
  // different bug in the model's strings.
  const parsed = parseRichText('<b>A</b> <b>B</b>');
  assert.equal(textOf(parsed), 'A B');
});

test('both documented colour spellings are accepted and anything else is refused', () => {
  assert.equal(parseRichText('<font color="#FF7800">x</font>').runs[0].color, '#FF7800');
  assert.equal(parseRichText('<font color="rgb(255,125,0)">x</font>').runs[0].color, 'rgb(255,125,0)');
  // `red` is not a spelling the reference gives; the tag is still consumed, but no colour is
  // invented for it — drawing an invented colour would be the renderer making something up.
  assert.equal(parseRichText('<font color="red">x</font>').runs[0].color, null);
});

test('nested tags compose and unwind', () => {
  const parsed = parseRichText('<b><i><u>all three</u></i></b>');
  assert.equal(parsed.runs.length, 1);
  assert.deepEqual(
    { b: parsed.runs[0].bold, i: parsed.runs[0].italic, u: parsed.runs[0].underline },
    { b: true, i: true, u: true },
  );
});

test('tags the renderer cannot draw lose the tag and keep the words', () => {
  // `stroke` is documented and real; this process has no stroke to draw. The words must still be
  // right — an unmodelled effect is not a licence to show the reader `<stroke color="#00A2FF">`.
  assert.equal(
    textOf(parseRichText('You won <stroke color="#00A2FF" thickness="2">25 gems</stroke>.')),
    'You won 25 gems.',
  );
  assert.equal(textOf(parseRichText('My name is <smallcaps>Diva</smallcaps>.')), 'My name is Diva.');
});

test('uppercase is applied, because it changes the letters the reader sees', () => {
  assert.equal(textOf(parseRichText('<uc>loudly</uc> spoken')), 'LOUDLY spoken');
});

test('a comment is removed, as the engine removes it', () => {
  assert.equal(textOf(parseRichText('After this<!--hidden--> more text')), 'After this more text');
});

test('the five escape forms become their characters, ampersand last', () => {
  assert.equal(textOf(parseRichText('10 &lt; 100 &amp;&amp; 100 &gt; 10')), '10 < 100 && 100 > 10');
  assert.equal(textOf(parseRichText('Meet &quot;Diva&apos;s&quot; falcon')), 'Meet "Diva\'s" falcon');
  // THE ORDERING CASE. `&amp;lt;` is an escaped ampersand followed by the letters `lt;`, so the
  // reader must see the literal text `&lt;`. Unescaping `&amp;` first would turn it into `<`.
  assert.equal(textOf(parseRichText('escape form <b>&amp;lt;</b> here')), 'escape form &lt; here');
});

// ---------------------------------------------------------------------------------------------
// REFUSALS. Each of these must come back null so the caller draws the raw string — which is what
// Roblox itself shows for markup that does not parse.
// ---------------------------------------------------------------------------------------------

test('an unclosed tag is refused rather than guessed at', () => {
  assert.equal(parseRichText('<b>never closed'), null);
});

test('closing out of nesting order is refused', () => {
  // The reference requires reverse-order nesting. `<b><i>x</b></i>` is malformed and Studio shows
  // it raw; repairing it here would hide a real defect in a model's output.
  assert.equal(parseRichText('<b><i>x</b></i>'), null);
});

test('a lone `<` with no `>` after it is a character, not a tag', () => {
  assert.equal(parseRichText('score 5 <3 wins'), null);
  assert.equal(parseRichText('if hp < max then'), null);
});

test('a well-formed tag that Roblox does not support is still refused', () => {
  // THE AIMED CASE FOR OVER-EAGERNESS, and the one that matters. A model that confuses HTML for
  // rich text emits `<span>`; the engine has no such tag and draws the brackets, so the owner sees
  // the mistake. A parser that accepted any balanced tag would silently tidy it away and the
  // showcase would credit the model with a clean label it did not write — hiding a real defect
  // instead of inventing one, which is the same sin facing the other way.
  //
  // An earlier version of this test used `<3` and `hp < max`, which never reach the tag check at
  // all: they are refused earlier, for having no `>`. The mutation that removes the supported-tag
  // list left that version green, and falsification is what found it. Both cases are kept, in
  // separate tests, because they defend different lines.
  assert.equal(parseRichText('<span>25 gems</span>'), null);
  assert.equal(parseRichText('<div><b>x</b></div>'), null);
});

test('an unterminated comment is refused', () => {
  assert.equal(parseRichText('text <!-- never ends'), null);
});

test('a plain string with no markup at all takes the caller’s plain path', () => {
  // Not an error — there is simply nothing to interpret, and returning runs here would make every
  // ordinary label travel through the tspan path for no reason.
  assert.equal(parseRichText('Play now'), null);
  assert.equal(parseRichText(''), null);
  assert.equal(parseRichText(null), null);
});

test('a line break is counted, because this renderer lays out no second line', () => {
  // `<br/>` is drawn as a space and COUNTED. The count is what lets a caption admit the break was
  // not laid out; silently dropping it would be the renderer asserting a layout it did not do.
  const parsed = parseRichText('first line<br/>second line');
  assert.equal(parsed.breaks, 1);
  assert.equal(textOf(parsed), 'first line second line');
});

// ---------------------------------------------------------------------------------------------
// PLACEHOLDERS. A DIFFERENT PROPERTY, THE SAME DEFECT.
//
// MEASURED 2026-09-21, same screen. The model wrote `chatInput.Text = ""` with
// `PlaceholderText = "Say something to All, Clan or Party…"` — how every chat and search field in
// Roblox is built — and the renderer drew text only when `Text` was non-empty, so the input came
// out as a blank grey bar. The card read as a model that forgot to label its own input. The engine
// reference for TextBox.PlaceholderColor3 says it is "the text color that gets used when no text
// has been entered", so the placeholder is exactly what a player sees.
//
// These drive the renderer rather than the parser, because the rule lives in the drawing path.
// ---------------------------------------------------------------------------------------------

const node = (cls, props, children = []) => ({
  id: `n${Math.random().toString(36).slice(2)}`, class: cls, props, children, parentNode: null,
});
const str = (v) => ({ k: 'str', v });
const col = (r, g, b) => ({ k: 'Color3', r: r / 255, g: g / 255, b: b / 255 });

/** One node, one rect, straight through the renderer. */
const draw = (n) => renderTreeToSvg({
  guiNodes: [n],
  rects: new Map([[n.id, { x: 10, y: 10, w: 300, h: 34 }]]),
  viewport: { id: 'desktop', w: 800, h: 600 },
});

test('an empty TextBox draws its placeholder, not nothing', () => {
  const out = draw(node('TextBox', {
    Text: str(''),
    PlaceholderText: str('Say something to All, Clan or Party…'),
    TextColor3: col(235, 238, 245),
  }));
  assert.match(out.svg, /Say something to All, Clan or Party/, 'the prompt a player reads must be drawn');
  assert.equal(out.placeholders, 1, 'and counted, so no caption can call it text somebody typed');
  assert.equal(out.textNodes, 1);
});

test('entered text wins over the placeholder, as it does in the engine', () => {
  const out = draw(node('TextBox', {
    Text: str('gg wp'),
    PlaceholderText: str('Say something…'),
    TextColor3: col(235, 238, 245),
  }));
  assert.match(out.svg, /gg wp/);
  assert.doesNotMatch(out.svg, /Say something/, 'a filled box never shows its placeholder');
  assert.equal(out.placeholders, 0);
});

test('a placeholder is dimmer than entered text, and no colour is invented for it', () => {
  // THE AIMED CASE. Drawing the prompt at full strength makes it read as typed input. Roblox's
  // own default placeholder colour is a specific grey this process has no way to know, so the
  // node's own TextColor3 is reduced instead of a value being made up.
  const props = { PlaceholderText: str('Search items'), TextColor3: col(255, 255, 255) };
  const dim = draw(node('TextBox', { ...props, Text: str('') }));
  const full = draw(node('TextBox', { ...props, Text: str('Search items') }));
  // The opacity of the <text> ELEMENT, not the first one in the document. The node's background
  // rect carries a fill-opacity too, and a regex that took the first match read 1 for both cases
  // and reported the guard green-then-red for the wrong reason.
  const op = (out) => {
    const m = /<text[^>]*fill-opacity="([\d.]+)"/.exec(out.svg);
    assert.ok(m, 'the text element must carry an opacity for this test to mean anything');
    return Number(m[1]);
  };
  assert.ok(op(dim) < op(full), `placeholder ${op(dim)} must be fainter than entered ${op(full)}`);
  assert.match(dim.svg, /fill="rgb\(255,255,255\)"/, 'the node’s own colour, not an invented grey');
});

test('a PlaceholderColor3 the model set is used verbatim', () => {
  const out = draw(node('TextBox', {
    Text: str(''),
    PlaceholderText: str('Search items'),
    TextColor3: col(255, 255, 255),
    PlaceholderColor3: col(120, 200, 255),
  }));
  assert.match(out.svg, /fill="rgb\(120,200,255\)"/, 'a colour the model chose is never overridden');
  // Dimming on top of a chosen colour would be this renderer second-guessing the model. Read off
  // the <text> element specifically: the background rect carries a fill-opacity of 1 whatever the
  // text does, and matching the first one in the document made this assertion unfalsifiable — a
  // mutation that dimmed a model-chosen colour passed it.
  const m = /<text[^>]*fill-opacity="([\d.]+)"/.exec(out.svg);
  assert.ok(m, 'the text element must carry an opacity for this test to mean anything');
  assert.equal(Number(m[1]), 1, 'a placeholder the model coloured is drawn at full strength');
});

test('an empty box with no placeholder stays empty', () => {
  const out = draw(node('TextBox', { Text: str(''), TextColor3: col(255, 255, 255) }));
  assert.doesNotMatch(out.svg, /<text/, 'nothing to draw is still nothing to draw');
  assert.equal(out.placeholders, 0);
  assert.equal(out.textNodes, 0);
});
