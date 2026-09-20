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
import { classifyNoLuau } from './generate-ui-showcase.mjs';
import { fencedLuau } from './score-ui.mjs';

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
