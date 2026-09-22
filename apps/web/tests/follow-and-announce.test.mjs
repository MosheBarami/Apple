/**
 * THE LIVE EDGE: seeing it, leaving it, coming back — and hearing it.
 *
 * Two gaps, both of the same shape: the product knew where the reader was and never told them.
 *
 *   * FOLLOWING was a `useRef` set from a scroll handler and re-armed on send. The heuristic was
 *     right; being invisible was the problem. Scrolling up to re-read step 3 on a sixteen-step
 *     build silently left the live edge, nothing said so, and the way back was to scroll by hand
 *     past everything the agent had written since. A ref does not re-render, so no control could
 *     have been offered from it even in principle. The explicit version of this pattern was
 *     already in the product — the playtest surface keeps an explicit frame-freshness boundary —
 *     and the transcript did not have an equivalent return control.
 *
 *   * ANNOUNCEMENTS covered the WAIT and not the ANSWER. `thinking.tsx` has an sr-only polite
 *     region carrying the phase hint while a run is in flight, so a blind user knew Apple was
 *     working; the reply itself arrived as text mutated into an existing node, which no live
 *     region reports, so the run went quiet and stayed quiet.
 *
 * The obvious fix for the second is worse than the bug — `aria-live="polite"` on the transcript
 * with the default `aria-relevant="additions text"` queues every streaming delta as its own
 * announcement — so what is asserted below is the restraint, not just the presence.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NEAR_BOTTOM_PX, distanceFromBottom, isNearBottom, jumpLabel, unseenCount } from '../src/lib/follow-latest.ts';
import { ANNOUNCE_MAX, replyAnnouncement, speakableBody } from '../src/lib/announce.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
// The follow state now lives in the AI Elements Conversation: the lock is the stick-to-bottom
// stand-in's, the control is upstream's ConversationScrollButton. The workspace keeps the count.
const STICK = readFileSync(join(WEB, 'src', 'components', 'ai-elements', 'stick-to-bottom.tsx'), 'utf8');
const CONVERSATION = readFileSync(join(WEB, 'src', 'components', 'ai-elements', 'conversation.tsx'), 'utf8');

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const at = (scrollTop, scrollHeight = 1000, clientHeight = 400) => ({ scrollTop, scrollHeight, clientHeight });

// ------------------------------------------------------------------ following ---

test('at the bottom is following; well above it is not', () => {
  assert.equal(isNearBottom(at(600)), true, 'exactly at the end');
  assert.equal(isNearBottom(at(0)), false, 'at the top of a long transcript');
});

test('the slack is what it always was — one line of prose, not zero', () => {
  // "At the bottom" is never exact: sub-pixel layout, a composer that grows, and the browser's own
  // scroll anchoring all leave a few pixels. A zero-slack check would report the reader as having
  // left the edge while they were sitting at it, and the jump button would never go away.
  assert.equal(NEAR_BOTTOM_PX, 90);
  assert.equal(isNearBottom(at(600 - (NEAR_BOTTOM_PX - 1))), true);
  assert.equal(isNearBottom(at(600 - NEAR_BOTTOM_PX)), false);
});

test('a transcript shorter than the viewport is always at the bottom', () => {
  // Otherwise a brand-new conversation opens with a "jump to latest" pointing at itself.
  assert.equal(isNearBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 400 }), true);
});

test('the distance is never negative, whatever the browser reports', () => {
  // Over-scroll (rubber banding on a trackpad) makes scrollTop exceed the maximum, and a negative
  // distance compared against a positive slack is an accident waiting for a `Math.abs`.
  assert.equal(distanceFromBottom(at(900)), 0);
  assert.equal(isNearBottom(at(900)), true);
});

// ------------------------------------------------------------ what arrived since ---

test('turns that arrived while away are counted from the watermark', () => {
  assert.equal(unseenCount(12, 9), 3);
  assert.equal(unseenCount(9, 9), 0);
});

test('A REWOUND CONVERSATION REPORTS ZERO, NOT A NEGATIVE', () => {
  // The transcript SHRINKS: edit-and-resend truncates it, and `history_truncated` drops rows the
  // server has deleted. An accumulating counter would keep announcing messages that no longer
  // exist and would never come back down.
  assert.equal(unseenCount(4, 11), 0);
});

test('the label names a count only when there is one', () => {
  assert.equal(jumpLabel(0), 'Jump to latest');
  assert.equal(jumpLabel(-2), 'Jump to latest');
  assert.equal(jumpLabel(1), '1 new message — jump to latest');
  assert.equal(jumpLabel(5), '5 new messages — jump to latest');
});

// ----------------------------------------------------------- wired to the view ---

/** The body of a function or component, from its declaration to the next top-level declaration. */
const body = (src, start) => {
  const from = src.indexOf(start);
  assert.notEqual(from, -1, `${start} was not found — this test checks nothing`);
  const rest = src.slice(from + start.length);
  const end = rest.search(/\n(?:function |export |const [A-Z])/);
  return src.slice(from, from + start.length + (end === -1 ? rest.length : end));
};

test('following is state, so a control can exist at all', () => {
  // This is the defect in one line: it was a ref, and a ref does not re-render. RESTATED: the lock
  // is the Conversation's `isAtBottom`, which is React state, and the jump control reads it.
  assert.match(STICK, /const \[isAtBottom, setIsAtBottom\] = useState\(/);
  assert.match(STICK, /const setLock = useCallback\(\(next: boolean\) => \{[\s\S]*?setIsAtBottom\(next\)/);
  const jump = body(WS, 'function LatestEdgeJump(');
  assert.match(jump, /const \{ isAtBottom \} = useStickToBottomContext\(\)/);
});

test('the jump control appears only when the reader has left the live edge', () => {
  // Upstream's ConversationScrollButton renders nothing while at the bottom.
  const button = body(CONVERSATION, 'export const ConversationScrollButton = (');
  assert.match(button, /!isAtBottom && \(/);
  assert.match(button, /onClick=\{handleScrollToBottom\}/);
  // The workspace places it INSIDE the conversation (it reads the conversation's context) and
  // names it with the count.
  const jump = body(WS, 'function LatestEdgeJump(');
  assert.match(jump, /<ConversationScrollButton\b/);
  assert.match(jump, /aria-label=\{jumpLabel\(unseen\)\}/);
  // An onClick here would REPLACE upstream's scroll-to-bottom (props spread after it) and leave a
  // button that does nothing.
  assert.equal(/onClick=/.test(stripComments(jump)), false, 'the workspace must not override the button\'s own click');
  const code = stripComments(WS);
  const open = code.search(/<Conversation[\s>]/);
  assert.notEqual(open, -1, 'the workspace renders no <Conversation>');
  assert.match(code.slice(open, code.indexOf('</Conversation>')), /<LatestEdgeJump total=\{messages\.length\} \/>/);
});

test('jumping scrolls to the end AND re-arms following', () => {
  // Scrolling without re-arming leaves the reader at the bottom with the button still there and
  // new turns still not followed — which looks like the button did not work.
  const fn = STICK.slice(STICK.indexOf('const scrollToBottom = useCallback'), STICK.indexOf('const stopScroll'));
  assert.ok(fn.length > 0, 'scrollToBottom was not found — this test checks nothing');
  assert.match(fn, /setLock\(true\)/, 'the lock is re-armed');
  assert.match(fn, /jump\(/, 'and the view moves');
  const jump = STICK.slice(STICK.indexOf('const jump = useCallback'), STICK.indexOf('const scrollToBottom'));
  assert.match(jump, /el\.scrollTop = el\.scrollHeight/);
  assert.match(jump, /el\.scrollTo\(\{ top: el\.scrollHeight/);
  // And the count starts again from zero: while following, the watermark tracks the total.
  const edge = body(WS, 'function LatestEdgeJump(');
  assert.match(edge, /if \(isAtBottom\) seen\.current = total/);
  assert.match(edge, /const unseen = isAtBottom \? 0 : unseenCount\(total, seen\.current\)/);
});

test('sending re-arms following too', () => {
  const fn = WS.slice(WS.indexOf('const send = (text: string'), WS.indexOf('const lastAssistantId'));
  assert.match(fn, /conversation\.current\?\.scrollToBottom\(\)/);
  assert.match(WS, /contextRef=\{conversation\}/, 'and the ref it calls through is the Conversation\'s');
});

test('a jump to an older message releases following before it scrolls there', () => {
  // Otherwise a reply streaming in during the smooth scroll pulls the reader straight back down
  // past the message they asked for.
  const fn = /const jumpToMessage = useCallback\(([\s\S]*?)\n  \);/.exec(WS)?.[1] ?? '';
  const stop = fn.indexOf('conversation.current?.stopScroll()');
  const scroll = fn.indexOf('el.scrollIntoView(');
  assert.ok(stop !== -1 && scroll > stop, 'stopScroll must come before scrollIntoView');
});

test('the scroll handler decides with the shared predicate, not a copy of the arithmetic', () => {
  const code = stripComments(STICK);
  assert.match(code, /import \{ isNearBottom, type ScrollMetrics \} from '\.\.\/\.\.\/lib\/follow-latest'/);
  assert.match(code, /if \(isNearBottom\(metrics\)\) return true/);
  assert.match(code, /lockAfterScroll\(locked\.current, lastTop\.current, el\)/, 'the scroll listener asks the rule');
  for (const [name, src] of [['stick-to-bottom.tsx', code], ['workspace.tsx', stripComments(WS)]]) {
    assert.equal(
      /scrollHeight - \w+\.scrollTop - \w+\.clientHeight < 90/.test(src),
      false,
      `${name}: the inline arithmetic must not survive beside the named predicate`,
    );
  }
});

// -------------------------------------------------------------- the live region ---

test('the transcript is a log, and reports ADDITIONS rather than text mutations', () => {
  // `aria-relevant="additions text"` is the default, and it is the trap: streaming a 900-character
  // reply a delta at a time would queue hundreds of announcements, each out of date before the
  // reader hears it, with nothing else able to speak until the queue drains.
  //
  // Asserted against source with COMMENTS STRIPPED. The first version of this scanned the raw file
  // and went red when a falsification landed on the comment that explains the trap — a guard that
  // fails on prose is noise, and the same guard would have passed on a comment that said the right
  // thing above markup that did the wrong one.
  const code = stripComments(WS);
  assert.match(code, /role="log"/);
  assert.match(code, /aria-relevant="additions"/);
  assert.equal(/aria-relevant="additions text"/.test(code), false);
});

test('exactly ONE element is the log, and it is the list of turns', () => {
  // Upstream's Conversation root defaults to role="log". The root also holds the jump control, and
  // a control appearing inside a live region is announced as if it were a turn — so the workspace
  // switches the root's role off and puts the log on the content, which holds only the turns.
  assert.match(CONVERSATION, /role="log"/, 'upstream default — if this moved, re-read the override below');
  const code = stripComments(WS);
  const open = code.search(/<Conversation[\s>]/);
  assert.notEqual(open, -1, 'the workspace renders no <Conversation>');
  const root = code.slice(open, code.indexOf('>', open));
  assert.match(root, /role=\{undefined\}/, 'the Conversation root must not also be a log');
  assert.equal(code.split('role="log"').length - 1, 1, 'one log in the workspace');
  const content = code.slice(code.indexOf('<ConversationContent'), code.indexOf('>', code.indexOf('<ConversationContent')));
  assert.match(content, /role="log"/);
  assert.match(content, /aria-relevant="additions"/);
});

test('the transcript log is named, so it is not an unlabelled region', () => {
  assert.match(WS, /aria-label="Conversation"/);
});

test('the settled reply gets its own polite, atomic region', () => {
  assert.match(WS, /replyAnnouncement\(lastTurn\)/);
  const region = WS.slice(WS.indexOf('{announcement}') - 400, WS.indexOf('{announcement}'));
  assert.match(region, /aria-live="polite"/);
  assert.match(region, /aria-atomic="true"/);
  assert.equal(/aria-live="assertive"/.test(region), false, 'a reply must never interrupt');
});

// ---------------------------------------------------------- what is said aloud ---

const turn = (over = {}) => ({ role: 'assistant', content: 'The door is built.', streaming: false, ...over });

test('nothing is said while the turn is still being written', () => {
  // The Thinking card's own region covers that window. Two regions describing one run is one too
  // many, and the half-written text would be announced and then contradicted.
  assert.equal(replyAnnouncement(turn({ streaming: true })), '');
});

test('a settled reply is announced once, with its text', () => {
  assert.equal(replyAnnouncement(turn()), 'Apple replied. The door is built.');
});

test('a user turn is never announced', () => {
  // They typed it. Reading it back is noise.
  assert.equal(replyAnnouncement(turn({ role: 'user' })), '');
  assert.equal(replyAnnouncement(null), '');
  assert.equal(replyAnnouncement(undefined), '');
});

test('an empty reply announces nothing rather than announcing emptiness', () => {
  assert.equal(replyAnnouncement(turn({ content: '' })), '');
  assert.equal(replyAnnouncement(turn({ content: '   \n  ' })), '');
});

test('CODE IS NOT READ OUT — its presence and size are', () => {
  // A screen reader reciting 200 lines of Luau is hostile, and the code is right there in the
  // transcript in a block the reader can reach and copy.
  const content = 'Here you go:\n```luau\nlocal part = Instance.new("Part")\npart.Parent = workspace\n```\nDone.';
  const said = replyAnnouncement(turn({ content }));
  assert.equal(/Instance\.new/.test(said), false, 'the code leaked into the announcement');
  assert.match(said, /A code block of 2 lines\./);
  assert.match(said, /Here you go:/);
  assert.match(said, /Done\./);
});

test('a one-line block is said in the singular', () => {
  assert.match(speakableBody('```js\nx\n```'), /A code block of 1 line\./);
});

test('an unclosed block — a streamed reply that failed partway — is still described, not recited', () => {
  const said = speakableBody('trying:\n```luau\nlocal secret = "x"');
  assert.equal(/secret/.test(said), false);
  assert.match(said, /A code block of 1 line\./);
});

test('a long reply is cut at a word boundary and SAYS it was cut', () => {
  // A sentence that simply stops sounds like the product broke.
  const content = `${'word '.repeat(400)}end`;
  const said = replyAnnouncement(turn({ content }));
  assert.ok(said.length < content.length);
  assert.match(said, /The rest of the reply is in the conversation\./);
  assert.equal(/word wor\b/.test(said), false, 'cut mid-word');
});

test('a reply just inside the cap is not marked as cut', () => {
  const said = replyAnnouncement(turn({ content: 'a'.repeat(ANNOUNCE_MAX) }));
  assert.equal(/The rest of the reply/.test(said), false);
});

test('A RUN THAT FAILED SAYS SO', () => {
  // Silence after a failure is indistinguishable from silence after success, and telling those
  // apart is the entire reason anyone is listening to this region.
  assert.match(replyAnnouncement(turn({ content: '', stopReason: 'error' })), /went wrong/);
  assert.match(
    replyAnnouncement(turn({ content: '', stopReason: 'error', error: 'the model dropped that step' })),
    /the model dropped that step/,
  );
});

test('every non-success stop reason has something to say', () => {
  for (const reason of ['stopped', 'error', 'quota', 'incomplete']) {
    const said = replyAnnouncement(turn({ content: '', stopReason: reason }));
    assert.ok(said.length > 0, `${reason} announces nothing`);
  }
});

test('a clean run is not described as an outcome', () => {
  assert.equal(replyAnnouncement(turn({ stopReason: 'done' })), 'Apple replied. The door is built.');
});

test('a partial reply that then failed announces both', () => {
  // The words that did arrive are worth having, and so is the fact that they are all there is.
  const said = replyAnnouncement(turn({ content: 'I got as far as the frame.', stopReason: 'error' }));
  assert.match(said, /I got as far as the frame\./);
  assert.match(said, /went wrong/);
});
