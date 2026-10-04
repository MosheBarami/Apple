/**
 * THE CHAT-CORE PICKS ARE IN THE PRODUCT, NOT BESIDE IT.
 *
 * The owner ticked components for the chat thread and the left rail. Each one below is held to the
 * surface it was built into: the component is imported where it belongs, and it is MOUNTED there
 * (rendered as an element, or its hook called), and that surface is itself mounted by the page the
 * customer sees. Removing any mount fails this file. Comments are stripped before matching, so a
 * mount that survives only in a comment does not count.
 *
 * RESTATED 2026-10-01, when the home-made AI Elements were replaced by the genuine upstream files.
 * Several picks had been merged INTO the home-made components (the code block's copy tip, the jump
 * button's live count, the transcript's overscroll guard, the tool call chips, the attachment
 * entrance). The genuine files cannot carry them, so each is either applied by the surface that uses
 * the component now, or — where upstream already does the job — held as upstream's behaviour. Each
 * test below says which.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(WEB, rel), 'utf8');
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\{\s*\}/g, '');

const TURN = code('src/components/ws/turn.tsx');
const LAYOUT = code('src/components/layout.tsx');
const LAYOUT_CSS = read('src/components/layout.css');
const RAIL = code('src/components/picks/chat/rail-chats.tsx');
const WS = code('src/routes/workspace.tsx');
const WS_BLOCK = code('src/components/ws/code-block.tsx');
const WS_BLOCK_CSS = read('src/components/ws/code-block.css');
const AI_BLOCK = code('src/components/ai-elements/code-block.tsx');
const CONVERSATION = code('src/components/ai-elements/conversation.tsx');
const STEPS = code('src/components/ws/run-steps.tsx');
const ANSWER = code('src/components/ws/answer.tsx');
const SYSTEM_CSS = read('src/design/system.css');
const RUN_STEPS = code('src/components/ws/run-steps.tsx');
const WELCOME = code('src/components/ws/chat-welcome.tsx');
const COMPOSER = code('src/components/ws/composer.tsx');
const REVISIONS = code('src/components/ws/revisions-dialog.tsx');
const EDIT = code('src/components/ws/edit-message-dialog.tsx');

/** `name` is imported into `src` from `from`, and rendered there as <name ...>. */
function mounted(src, name, from, where) {
  assert.match(src, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from ['"]${from.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}['"]`), `${where}: ${name} is not imported from ${from}`);
  assert.match(src, new RegExp(`<${name}\\b`), `${where}: ${name} is imported but never rendered`);
}

// ------------------------------------------------------------- the surfaces ---

test('the surfaces themselves are on screen: the workspace renders the turn, the welcome, the jump, the dialogs', () => {
  mounted(WS, 'Turn', '../components/ws/turn', 'workspace');
  mounted(WS, 'ChatWelcome', '../components/ws/chat-welcome', 'workspace');
  mounted(WS, 'ConversationScrollButton', '../components/ai-elements/conversation', 'workspace');
  mounted(WS, 'RevisionsDialog', '../components/ws/revisions-dialog', 'workspace');
  mounted(WS, 'EditMessageDialog', '../components/ws/edit-message-dialog', 'workspace');
  //[[ RESTATED 2026-10-01 (owner): the status pill (thinking.tsx) is removed; the turn renders the
  //   AI Elements steps, whose live rows are the Shimmer. ]]
  mounted(TURN, 'RunSteps', './run-steps', 'turn');
  assert.match(RUN_STEPS, /<Shimmer\b/, 'the live steps render their moving words');
  assert.match(COMPOSER, /<Attachment\b/, 'the composer renders attachment chips');
});

// --------------------------------------------------------- the chat thread ---

// RESTATED: the reply's Copy is AI Elements' MessageAction (CopyAction). It keeps the three states —
// the icon swaps to a tick, or a cross when the clipboard refused — and the tooltip says which. The
// width-tweening word badge (Motion Multi state badge) was the home-made control's and is gone.
test('copy: three states on the reply\'s AI Elements MessageAction, including the refused copy', () => {
  mounted(TURN, 'MessageAction', '../ai-elements/message', 'turn');
  const copy = TURN.slice(TURN.indexOf('function CopyAction'), TURN.indexOf('function ShareAction'));
  assert.match(copy, /state === 'copied' \? CheckIcon : state === 'failed' \? XIcon : CopyIcon/);
  assert.match(copy, /state === 'copied' \? 'Copied' : state === 'failed' \? "Couldn't copy"/);
  assert.match(copy, /writeClipboard\(getText\(\)\)\.then\(\(ok\) => setState\(ok \? 'copied' : 'failed'\)\)/);
});

// RESTATED: upstream's CodeBlockCopyButton swaps its own icon to a tick once the copy resolved; the
// rising "Copied" tip was the home-made block's. The screen-reader half is the block's status line.
test('copy on the code block: the tick swaps in, and a status says it (ae-code-block)', () => {
  assert.match(AI_BLOCK, /const Icon = isCopied \? CheckIcon : CopyIcon/);
  assert.match(WS_BLOCK, /<CodeBlockCopyButton\b/);
  assert.match(WS_BLOCK, /copied \? 'Copied to clipboard' : ''/);
});

test('the code block writes itself: a caret while open, a file mark, a placeholder while empty (Animate UI Code + UI Layouts Code Block)', () => {
  assert.match(WS_BLOCK, /data-writing=\{closed \? undefined : ''\}/);
  assert.match(WS_BLOCK, /<FileTextIcon\b[^>]*gx-code__icon/);
  assert.match(WS_BLOCK, /!closed && !code && \(\s*<div className="gx-code__skeleton"/);
  assert.match(WS_BLOCK_CSS, /\.gx-code\[data-writing\] pre code > span:last-child::after/);
  assert.match(WS_BLOCK_CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*gx-code__skeleton span \{ animation:none; \}/);
});

// RESTATED: the unseen count is drawn by the workspace beside upstream's ConversationScrollButton
// (upstream's button is an arrow only), so the rolling number lives there now.
test('the rolling number (Motion Engagement stats + UI Layouts Motion Number Upvotes) counts Credits and unseen replies', () => {
  mounted(TURN, 'RollingNumber', '../picks/chat/rolling-number', 'turn');
  mounted(WS, 'RollingNumber', '../components/picks/chat/rolling-number', 'workspace');
  const jump = WS.slice(WS.indexOf('function LatestEdgeJump'), WS.indexOf('export function WorkspacePage'));
  assert.match(jump, /<RollingNumber value=\{unseen\} \/>/);
});

test('the jump to latest is a live button (Eldora Live Button + ae-conversation)', () => {
  mounted(WS, 'ConversationScrollButton', '../components/ai-elements/conversation', 'workspace');
  const jump = WS.slice(WS.indexOf('function LatestEdgeJump'), WS.indexOf('export function WorkspacePage'));
  assert.match(jump, /animate-ping[^"]*motion-reduce:animate-none/, 'the ping, which stops for reduced motion');
  assert.match(jump, /\{!isAtBottom && unseen > 0 && \(/, 'the count is drawn only when there is one, beside the arrow');
  assert.match(jump, /<span aria-hidden="true"/, 'and drawn once for the eye; the button\'s name already says it');
});

// RESTATED: the home-made scroller's touchstart nudge is gone with it. The transcript's scroller
// (StickToBottom's, given `gx-scroll`) contains its overscroll instead, so the page does not scroll
// or bounce through the end of the conversation.
test('no rubber band at the ends of the transcript', () => {
  assert.match(WS, /scrollClassName="gx-scroll"/);
  assert.match(SYSTEM_CSS, /\.gx-scroll \{[^}]*overscroll-behavior:contain/);
});

// RESTATED: the reply is upstream MessageResponse (Streamdown). A reply this client watched arrive
// lands word by word through Streamdown's own `animated` cascade, split on words; code blocks are
// Streamdown's own blocks and are not split.
test('words land one after another (Streamdown animated, by word)', () => {
  assert.match(TURN, /animated=\{\{ animation: 'blurIn', sep: 'word', stagger: \d+ \}\}/);
  assert.match(TURN, /isAnimating=\{landing\}/);
  assert.match(TURN, /const landing = useLanding\(arrivedLive,/);
});

test('a menu at the pointer on every turn (Motion Context Menu + Radix Context Menu)', () => {
  mounted(TURN, 'ContextMenu', '../picks/chat/context-menu', 'turn');
  assert.ok(TURN.split('<ContextMenu').length - 1 >= 2, 'both the user turn and the reply carry the menu');
  assert.match(TURN, /onContextMenu=\{menu\.onContextMenu\}/);
  mounted(RAIL, 'ContextMenu', './context-menu', 'rail chats');
});

// RESTATED: Share and More are AI Elements MessageActions in the MessageToolbar; on an older reply
// the toolbar shows under the pointer or on focus, and on the newest it is simply there.
test('the reply toolbar: AI Elements MessageToolbar + MessageActions, with Share and More', () => {
  mounted(TURN, 'MessageToolbar', '../ai-elements/message', 'turn');
  mounted(TURN, 'MessageActions', '../ai-elements/message', 'turn');
  const toolbar = TURN.slice(TURN.indexOf('<MessageToolbar'), TURN.indexOf('</MessageToolbar>'));
  assert.match(toolbar, /<ShareAction\b/);
  assert.match(toolbar, /aria-haspopup="menu"/);
  assert.match(toolbar, /!isLast && 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'/);
});

//[[ RESTATED 2026-10-01 (owner order). This held "no documentation sources and no step list under a
//   reply" (D-THINK-1, 2026-09-24). On 2026-10-01 the owner asked for exactly those, as the genuine
//   AI Elements: Sources ("Used N sources") and a Task per step. What stays true: they are upstream's
//   components, fed only by what the worker sent — the `sources` frame and the tool frames — and the
//   home-made SourcePreview and TurnCheckpoint are gone. ]]
test('a reply\'s sources and steps are AI Elements Sources and Task, from the worker\'s frames only', () => {
  mounted(TURN, 'RunSources', './answer', 'turn');
  assert.match(TURN, /<RunSources sources=\{item\.sources\} \/>/);
  mounted(ANSWER, 'Sources', '../ai-elements/sources', 'answer');
  mounted(TURN, 'RunSteps', './run-steps', 'turn');
  mounted(STEPS, 'Task', '../ai-elements/task', 'run steps');
  mounted(STEPS, 'Reasoning', '../ai-elements/reasoning', 'run steps');
  for (const gone of ['source-preview.tsx', 'turn-checkpoint.tsx']) {
    assert.equal(existsSync(join(WEB, 'src', 'components', 'picks', 'chat', gone)), false, `${gone} is back`);
  }
});

test('the way back stays reachable: the Checkpoints drawer restores', () => {
  assert.match(WS, /title: 'Checkpoints'/);
  assert.match(WS, /restoreCheckpoint\(/, 'the drawer can restore a checkpoint');
});

test('there is no Plan-mode reply card and no "Build it" approval (V3 G01, UI08)', () => {
  // The public plan is the Thinking card's checklist, and the run proceeds on its own; the old
  // ae-plan card wrapped a Plan-mode reply behind a "Build it" button, and Plan mode is gone.
  assert.doesNotMatch(TURN, /PlanCard|onBuildPlan|item\.mode === 'plan'/);
  assert.equal(existsSync(join(WEB, 'src', 'components', 'picks', 'chat', 'plan-card.tsx')), false);
});

test('an image StudPilot made opens larger (GSAP Flip expand + ae-image)', () => {
  mounted(TURN, 'ExpandableImages', '../picks/chat/expandable-images', 'turn');
});

// RESTATED: the steps are rows of the turn's AI Elements Task. Each row says the step in words, wears
// the object it touched (or a plain tool mark), and its mark says whether it is running or done.
test('tool steps are Task rows: words, the object, and a running or finished mark', () => {
  assert.match(STEPS, /<TaskItem key=\{tool\.toolId\}[^>]*data-outcome=\{outcome\}/);
  assert.match(STEPS, /<OutcomeMark outcome=\{outcome\} \/>/);
  assert.match(STEPS, /<StepObject tool=\{tool\} \/>/);
  assert.match(STEPS, /\{toolPhrase\(tool\.tool, tool\.target\)\}/);
  assert.match(STEPS, /ACTIVITY_LABEL\[kindForTool\(tool\.tool\)\]/, 'the Task title names the kinds of work');
});

// RESTATED: the stagger is tw-animate's `animate-in` with a per-seed delay (chat-welcome.css is gone).
test('the welcome seeds arrive in turn (ae-suggestion)', () => {
  mounted(WELCOME, 'AnimatedIcon', '../picks/chat/animated-icon', 'welcome');
  mounted(WELCOME, 'Suggestion', '../ai-elements/suggestion', 'welcome');
  assert.match(WELCOME, /animate-in fade-in-0 slide-in-from-bottom-1[^"]*motion-reduce:animate-none/);
  assert.match(WELCOME, /style=\{\{ animationDelay: `\$\{120 \+ i \* 60\}ms` \}\}/);
});

// RESTATED: upstream's Attachment has no entrance of its own, so the composer gives each chip one.
test('attachment chips arrive (ae-attachments)', () => {
  assert.match(COMPOSER, /<Attachment\b[\s\S]{0,400}animate-in fade-in-0 zoom-in-95[^']*motion-reduce:animate-none/);
});

test('earlier versions page with MessageBranch (ae-message MessageBranch)', () => {
  for (const name of ['MessageBranch', 'MessageBranchContent', 'MessageBranchSelector', 'MessageBranchPrevious', 'MessageBranchPage', 'MessageBranchNext']) {
    mounted(REVISIONS, name, '../ai-elements/message', 'revisions dialog');
  }
});

// RESTATED: the Confirmation is the genuine upstream component now, in its approval-requested state.
test('the destructive edit asks in one Confirmation block (ae-confirmation)', () => {
  for (const name of ['Confirmation', 'ConfirmationTitle', 'ConfirmationRequest', 'ConfirmationActions', 'ConfirmationAction']) {
    mounted(EDIT, name, '../ai-elements/confirmation', 'edit dialog');
  }
  assert.match(EDIT, /state="approval-requested"/);
  assert.match(EDIT, /<ConfirmationAction type="submit"/);
  assert.equal(existsSync(join(WEB, 'src', 'components', 'picks', 'chat', 'confirmation.tsx')), false, 'the home-made Confirmation is back');
});

// ------------------------------------------------------------- the left rail ---

test('the rail lists chats as a pin list (Animate UI Pin List + React Bits Animated List + Motion Swipe actions)', () => {
  mounted(LAYOUT, 'RailChats', './picks/chat/rail-chats', 'layout');
  assert.match(LAYOUT, /useScrollEdges<[^>]*>\(\)/, 'the scroll-edge fade is on the rail');
  assert.match(RAIL, /aria-label="Pinned chats"/);
  assert.match(RAIL, /onSwipe=\{/);
  assert.match(RAIL, /flip\(/, 'rows glide between the sections');
});

test('archive offers Undo on a fuse (React Bits Fuse Button), pinning bursts (Animate UI Icon Button)', () => {
  mounted(RAIL, 'FuseUndo', './fuse-undo', 'rail chats');
  assert.match(RAIL, /import \{ burst \} from '\.\/particles'/);
  assert.match(RAIL, /burst\(from\)/);
});

test('the dock: a sliding bed and marker (Animate UI Sidebar + Motion Shared layout) and moving icons (Animate UI Animated Icons)', () => {
  mounted(LAYOUT, 'DockHighlights', './picks/chat/dock-highlights', 'layout');
  mounted(LAYOUT, 'AnimatedIcon', './picks/chat/animated-icon', 'layout');
  assert.ok(LAYOUT.split('<AnimatedIcon').length - 1 >= 4, 'each dock row has its moving icon');
  assert.ok(LAYOUT_CSS.length > 0);
});

test('every pick sheet in the lane turns its motion off under reduced motion', () => {
  // RESTATED: copy-button, confirmation, share-button and turn-checkpoint left with their components.
  const sheets = ['context-menu', 'rail-chats', 'animated-icon', 'dock-highlights', 'fuse-undo'];
  for (const name of sheets) {
    const path = join(WEB, 'src', 'components', 'picks', 'chat', `${name}.css`);
    assert.ok(existsSync(path), `${name}.css is missing`);
    const css = readFileSync(path, 'utf8');
    if (/animation:|transition:/.test(css)) assert.match(css, /prefers-reduced-motion: reduce/, `${name}.css moves and never stops for reduced motion`);
  }
});
