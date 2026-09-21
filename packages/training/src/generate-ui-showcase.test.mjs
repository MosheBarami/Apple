/**
 * A FAILURE OF THE HARNESS MUST NOT BE FILED AS A FAILURE OF THE MODEL.
 *
 * THE DEFECT THIS GUARDS, measured 2026-09-20 against docs/evidence/ui-showcase/manifest.json.
 * screen-social — the sixteenth screen, the only one of the sixteen that did not build — carried:
 *
 *     "outcome": "no_code_block",
 *     "detail":  "answer was 15908 chars of prose"
 *
 * Nothing in the pipeline had looked at the answer's content. All `runTarget` knew was that
 * `fencedLuau` returned null, and `fencedLuau`'s regex REQUIRES a closing ```. An answer that the
 * token ceiling cut off half-way through a perfectly good Luau block fails that regex in exactly
 * the same way an essay does. The word "prose" was invented at the point of reporting.
 *
 * The two readings are opposite in who is at fault, which is the whole reason to separate them:
 * "the model would not write code" is a verdict on the model, "the answer stopped mid-block at
 * maxTokens" is a verdict on this harness's budget. One is worth re-running with more room; the
 * other is not.
 *
 * `classifyNoLuau` is called only where `fencedLuau` has already returned null, so every case
 * below is a string that `fencedLuau` does not match — asserted here too, because a test whose
 * inputs never reach the code under test proves nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankRenderVerdict, classifyNoLuau } from './generate-ui-showcase.mjs';
import { buildUiTree, fencedLuau, guiDescendants, indexTree, resolveLayout, screenGuisInPlayerGui } from './score-ui.mjs';
import { renderTreeToSvg } from './render-ui-tree.mjs';

/** Every input must be one `fencedLuau` rejects, or the classifier would never see it. */
const unmatched = (text) => {
  assert.equal(fencedLuau(text), null, 'fixture must be a string fencedLuau rejects');
  return text;
};

test('an answer cut off inside an open luau fence is truncation, not prose', () => {
  // The literal shape screen-social produced: heading, fence, code, and then nothing — no closing
  // fence, because the completion ran out of room.
  const truncated = unmatched(
    ['Here is the social screen.', '', '```luau', 'local Players = game:GetService("Players")',
      'local gui = Instance.new("ScreenGui")', 'gui.Name = "SocialScreen"'].join('\n'),
  );
  assert.equal(classifyNoLuau(truncated), 'truncated_code_block');
});

test('a bare ``` fence with no language word still counts as opened', () => {
  // The model is told to write ```luau and usually does, but an unlabelled fence that then gets
  // cut off is the same failure and must not be re-filed as prose.
  assert.equal(
    classifyNoLuau(unmatched('```\nlocal frame = Instance.new("Frame")')),
    'truncated_code_block',
  );
});

test('an answer that never opens a fence is the model declining to write code', () => {
  const essay = unmatched(
    'A social screen in a tycoon needs a friends list, a party panel and a chat window. '
    + 'I would build it with three tabs across the top and a roster beneath. '
    + 'Backticks like `TextChatService` appear inline but never open a block.',
  );
  assert.equal(classifyNoLuau(essay), 'no_code_block');
});

test('prose that merely mentions a fence mid-sentence is not truncation', () => {
  // THE AIMED CASE, and the reason the pattern demands a NEWLINE after the language word.
  //
  // A fence only opens a block when the next thing is a line break; three backticks in the middle
  // of a sentence are the model TALKING ABOUT code instead of writing it. Dropping the newline
  // from the pattern makes this essay read as "we cut the model off" — the flattering error, the
  // mirror image of the original defect, and the one nobody would go looking for. An earlier
  // version of this test used single-backtick spans, which the pattern never had a chance to
  // match: the mutation that removes \n left it green and the gap was found by falsification.
  const essay = unmatched(
    'You asked for one fenced block. I would normally answer with a ```luau fence here, but the '
    + 'construction guide lists twenty references and I want to know which chat configuration '
    + 'you use before I commit to a layout.',
  );
  assert.equal(classifyNoLuau(essay), 'no_code_block');
});

test('inline code spans are not fences either', () => {
  assert.equal(
    classifyNoLuau(unmatched('Use `Instance.new("ScreenGui")` and then set `Parent` to PlayerGui.')),
    'no_code_block',
  );
});

test('an empty or missing answer is not truncation', () => {
  assert.equal(classifyNoLuau(''), 'no_code_block');
  assert.equal(classifyNoLuau(null), 'no_code_block');
  assert.equal(classifyNoLuau(undefined), 'no_code_block');
});

test('trailing spaces after the language word do not hide the fence', () => {
  // Observed from real completions: ```luau followed by spaces before the newline. Requiring the
  // newline to be immediate would file this as prose.
  assert.equal(
    classifyNoLuau(unmatched('```luau   \nlocal x = 1')),
    'truncated_code_block',
  );
});

/**
 * THE CARD THAT SAID "BUILT" OVER AN EMPTY PICTURE.
 *
 * MEASURED on the showcase's horror HUD, 2026-09-21, and it reached the live page. The model
 * wrote `UDim.new(0.5, 0, 0, 44)` — four arguments to a two-argument constructor — for every
 * Position and Size in the file, fifty times, and `UDim2.new` not once. `udim2` in score-ui.mjs
 * does not recognise a UDim and falls back to {0,0,0,0}, so all forty-four objects collapsed to
 * zero size at the origin. The row said `built`; the card showed a blank rectangle captioned
 * "instances on screen 0"; and nothing on the page said why. Every number was true and the card
 * was false.
 *
 * THE FIXTURE IS THE MODEL'S OWN LUAU, not a hand-written imitation of it. `horror-udim-sample`
 * is the answer that actually came back, trimmed to the shape that matters, so this guard is
 * pinned to a mistake a model really made rather than to one I imagined it making. The next run
 * of that same prompt used UDim2 correctly, which is exactly why this cannot be an integration
 * test: it would need a model to be wrong on demand.
 */
test('a screen where nothing reached the canvas is a failure that names its cause', () => {
  const built = buildUiTree(`
    local Players = game:GetService("Players")
    local gui = Instance.new("ScreenGui")
    gui.Name = "HorrorHud"
    gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
    local sanity = Instance.new("Frame")
    sanity.Name = "SanityMeter"
    sanity.Position = UDim.new(0.5, 0, 0, 44)
    sanity.Size = UDim.new(0, 260, 0, 30)
    sanity.Parent = gui
  `);
  assert.equal(built.status, 'ok', built.detail);
  const root = screenGuisInPlayerGui(indexTree(built.nodes))[0];
  const guiNodes = guiDescendants(root);
  const { rects } = resolveLayout(root, { id: 'desktop', w: 1600, h: 900 });
  const counters = renderTreeToSvg({ guiNodes, rects, viewport: { id: 'desktop', w: 1600, h: 900 } });

  // The premise: this really does render to nothing. If it ever stops doing so, this test is
  // measuring something else and should be re-aimed rather than trusted.
  assert.equal(counters.painted + counters.textNodes + counters.hidden, 0,
    'the fixture was supposed to render blank; it no longer does');

  const verdict = blankRenderVerdict({ guiNodes, counters });
  assert.ok(verdict, 'a blank render was reported as a success');
  assert.equal(verdict.outcome, 'nothing_reached_the_canvas');
  assert.match(verdict.detail, /UDim2/, 'the reason must name the type the engine required');
  assert.match(verdict.detail, /SanityMeter/, 'the reason must name an element the reader can find');
  assert.match(verdict.detail, /Position|Size/, 'the reason must name the slot');
});

test('a screen that DID draw is left alone, and so is one that is merely hidden', () => {
  // The false-positive direction, and it is the expensive one: a shop that opens from a button is
  // entirely hidden as scripted. Filing that as "nothing reached the canvas" would turn the most
  // common correct modal into a failure, and the two-picture render exists precisely for it.
  assert.equal(blankRenderVerdict({ guiNodes: [1, 2], counters: { painted: 3, textNodes: 0, hidden: 0 } }), null);
  assert.equal(blankRenderVerdict({ guiNodes: [1, 2], counters: { painted: 0, textNodes: 2, hidden: 0 } }), null);
  assert.equal(blankRenderVerdict({ guiNodes: [1, 2], counters: { painted: 0, textNodes: 0, hidden: 7 } }), null,
    'a screen that is hidden as scripted is the modal case, not a blank one');
  assert.equal(blankRenderVerdict({ guiNodes: [1], counters: { painted: 0, textNodes: 0, hidden: 0, imagePlaceholders: 1 } }), null,
    'an image that could not be fetched is still something on the canvas');
});

test('a blank render with no UDim misuse still fails, without inventing a cause', () => {
  const v = blankRenderVerdict({ guiNodes: [], counters: { painted: 0, textNodes: 0, hidden: 0 } });
  assert.ok(v, 'blank is blank whether or not the cause is known');
  assert.equal(v.outcome, 'nothing_reached_the_canvas');
  assert.doesNotMatch(v.detail, /UDim/, 'no cause may be asserted when none was found');
});
