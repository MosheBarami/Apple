/**
 * THE CHAT-CORE PICKS ARE IN THE PRODUCT, NOT BESIDE IT.
 *
 * The owner ticked components for the chat thread and the left rail. Each one below is held to the
 * surface it was built into: the component is imported where it belongs, and it is MOUNTED there
 * (rendered as an element, or its hook called), and that surface is itself mounted by the page the
 * customer sees. Removing any mount fails this file. Comments are stripped before matching, so a
 * mount that survives only in a comment does not count.
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
const TURN_CSS = read('src/components/ws/turn.css');
const LAYOUT = code('src/components/layout.tsx');
const LAYOUT_CSS = read('src/components/layout.css');
const RAIL = code('src/components/picks/chat/rail-chats.tsx');
const WS = code('src/routes/workspace.tsx');
const WS_BLOCK = code('src/components/ws/code-block.tsx');
const WS_BLOCK_CSS = read('src/components/ws/code-block.css');
const AI_BLOCK = code('src/components/ai-elements/code-block.tsx');
const CONVERSATION = code('src/components/ai-elements/conversation.tsx');
const CONVERSATION_CSS = read('src/components/ai-elements/conversation.css');
const STICK = code('src/components/ai-elements/stick-to-bottom.tsx');
const TOOL = code('src/components/ai-elements/tool.tsx');
const TOOL_CSS = read('src/components/ai-elements/tool.css');
const THINKING = code('src/components/ws/thinking.tsx');
const WELCOME = code('src/components/ws/chat-welcome.tsx');
const WELCOME_CSS = read('src/components/ws/chat-welcome.css');
const ATTACH_CSS = read('src/components/ai-elements/attachments.css');
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
  assert.match(THINKING, /<ToolHeader\b/, 'the Thinking card renders the tool header');
  assert.match(COMPOSER, /<Attachment\b/, 'the composer renders attachment chips');
});

// --------------------------------------------------------- the chat thread ---

test('copy: Animate UI Copy Button + Motion Copy button + Motion Multi state badge, on the reply toolbar', () => {
  mounted(TURN, 'CopyButton', '../picks/chat/copy-button', 'turn');
  const copy = code('src/components/picks/chat/copy-button.tsx');
  assert.match(copy, /tweenWidth\(/, 'the badge width follows its word');
  assert.match(copy, /copied: 'Copied', failed: "Couldn't copy"/, 'three states, including the refused copy');
});

test('copy on the code block: the tick swaps in and the Copied tip rises (ae-code-block + Motion copy)', () => {
  assert.match(AI_BLOCK, /import "\.\.\/picks\/chat\/copy-button\.css"/);
  assert.match(AI_BLOCK, /<Icon key=\{String\(isCopied\)\}[^>]*className="pk-swap-in"/);
  assert.match(AI_BLOCK, /isCopied && <span className="pk-copy-tip"/);
  assert.match(WS_BLOCK, /<CodeBlockCopyButton\b/);
});

test('the code block writes itself: a caret while open, a file mark, a placeholder while empty (Animate UI Code + UI Layouts Code Block)', () => {
  assert.match(WS_BLOCK, /data-writing=\{closed \? undefined : ''\}/);
  assert.match(WS_BLOCK, /<FileTextIcon\b[^>]*gx-code__icon/);
  assert.match(WS_BLOCK, /!closed && !code && \(\s*<div className="gx-code__skeleton"/);
  assert.match(WS_BLOCK_CSS, /\.gx-code\[data-writing\] \.ai-code-block__line:last-child::after/);
  assert.match(WS_BLOCK_CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*gx-code__skeleton span \{ animation:none; \}/);
});

test('the rolling number (Motion Engagement stats + UI Layouts Motion Number Upvotes) counts Credits and unseen replies', () => {
  mounted(TURN, 'RollingNumber', '../picks/chat/rolling-number', 'turn');
  mounted(CONVERSATION, 'RollingNumber', '../picks/chat/rolling-number', 'conversation');
});

test('the jump to latest is a live button (Eldora Live Button + ae-conversation)', () => {
  assert.match(CONVERSATION, /<span className="ai-conversation__live" \/>/);
  mounted(CONVERSATION, 'AnimatedIcon', '../picks/chat/animated-icon', 'conversation');
  assert.match(CONVERSATION_CSS, /@keyframes ai-conversation-ping/);
  assert.equal(/content:attr\(data-unseen\)/.test(CONVERSATION_CSS), false, 'the count is drawn once, by the component');
});

test('no rubber band at the ends of the transcript (GSAP stopOverscroll, re-implemented)', () => {
  assert.match(STICK, /addEventListener\('touchstart', onTouchStart, \{ passive: true \}\)/);
  assert.match(STICK, /if \(el\.scrollTop <= 0\) el\.scrollTop = 1;/);
});

test('words land one after another (GSAP SplitText words + nestedLinesSplit + splitArabicText)', () => {
  assert.match(TURN, /import \{ useWordReveal \} from '\.\.\/picks\/chat\/word-reveal'/);
  assert.match(TURN, /useWordReveal\(replyRef, item\.content, item\.streaming\)/);
  assert.match(TURN, /<div ref=\{replyRef\} className="gx-turn__reply">/);
  const reveal = code('src/components/picks/chat/word-reveal.ts');
  assert.match(reveal, /\.Segmenter;/, 'split at word boundaries, so RTL letters stay joined');
  assert.match(reveal, /const SKIP = 'pre, code/, 'code is never split');
});

test('a menu at the pointer on every turn (Motion Context Menu + Radix Context Menu)', () => {
  mounted(TURN, 'ContextMenu', '../picks/chat/context-menu', 'turn');
  assert.ok(TURN.split('<ContextMenu').length - 1 >= 2, 'both the user turn and the reply carry the menu');
  assert.match(TURN, /onContextMenu=\{menu\.onContextMenu\}/);
  mounted(RAIL, 'ContextMenu', './context-menu', 'rail chats');
});

test('the reply toolbar: AI Elements MessageToolbar + Toolbar, with Share (Animate UI Share Button) and More', () => {
  mounted(TURN, 'MessageToolbar', '../ai-elements/message', 'turn');
  mounted(TURN, 'ShareButton', '../picks/chat/share-button', 'turn');
  assert.match(TURN, /className="gx-turn__more"/);
  assert.match(TURN_CSS, /\.gx-turn__more \{/);
  assert.match(TURN_CSS, /\.gx-turn \.gx-turn__tools:not\(\.is-last\)/);
});

test('sources preview where they go (ae-sources + Animate UI Hover Card + Preview Link Card + ae-inline-citation)', () => {
  mounted(TURN, 'Sources', '../ai-elements/sources', 'turn');
  mounted(TURN, 'SourcePreview', '../picks/chat/source-preview', 'turn');
  assert.match(code('src/components/picks/chat/source-preview.tsx'), /<HoverCard\b/);
});

test('what changed, with the way back (ae-checkpoint + ae-task + Motion Layout Anchor)', () => {
  mounted(TURN, 'TurnCheckpoint', '../picks/chat/turn-checkpoint', 'turn');
  mounted(code('src/components/picks/chat/turn-checkpoint.tsx'), 'Task', '../../ai-elements/task', 'turn checkpoint');
});

test('a Plan-mode reply is a plan card (ae-plan)', () => {
  mounted(TURN, 'PlanCard', '../picks/chat/plan-card', 'turn');
  assert.match(TURN, /item\.mode === 'plan'/);
});

test('an image Apple made opens larger (GSAP Flip expand + ae-image)', () => {
  mounted(TURN, 'ExpandableImages', '../picks/chat/expandable-images', 'turn');
});

test('tool steps are call chips (React Bits Call Chip + ae-tool)', () => {
  assert.match(TOOL, /import \{ kindForTool, type ActivityKind \} from "\.\.\/ws\/tool-vocabulary"/);
  assert.match(TOOL, /const KindIcon = KIND_ICON\[kindForTool\(derivedName\)\] \?\? WrenchIcon/);
  assert.match(TOOL, /<KindIcon\b/);
  assert.match(TOOL, /<span key=\{status\} className="ai-tool__state">/);
  assert.match(TOOL_CSS, /\.ai-tool__title\.is-running \{/);
});

test('the welcome seeds arrive in turn (ae-suggestion)', () => {
  mounted(WELCOME, 'AnimatedIcon', '../picks/chat/animated-icon', 'welcome');
  assert.match(WELCOME, /style=\{\{ '--i': i \} as CSSProperties\}/);
  assert.match(WELCOME_CSS, /animation:start-seed-in/);
});

test('attachment chips arrive (ae-attachments)', () => {
  assert.match(ATTACH_CSS, /\.ai-attachment--inline,\.ai-attachment--grid \{ animation:ai-attachment-in/);
});

test('earlier versions page with MessageBranch (ae-message MessageBranch)', () => {
  for (const name of ['MessageBranch', 'MessageBranchContent', 'MessageBranchSelector', 'MessageBranchPrevious', 'MessageBranchPage', 'MessageBranchNext']) {
    mounted(REVISIONS, name, '../ai-elements/message', 'revisions dialog');
  }
});

test('the destructive edit asks in one Confirmation block (ae-confirmation)', () => {
  for (const name of ['Confirmation', 'ConfirmationBody', 'ConfirmationActions', 'ConfirmationAction']) {
    mounted(EDIT, name, '../picks/chat/confirmation', 'edit dialog');
  }
  assert.match(EDIT, /<ConfirmationAction type="submit" variant="primary"/);
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
  const sheets = ['copy-button', 'context-menu', 'rail-chats', 'animated-icon', 'confirmation', 'dock-highlights', 'fuse-undo', 'plan-card', 'share-button', 'turn-checkpoint'];
  for (const name of sheets) {
    const path = join(WEB, 'src', 'components', 'picks', 'chat', `${name}.css`);
    assert.ok(existsSync(path), `${name}.css is missing`);
    const css = readFileSync(path, 'utf8');
    if (/animation:|transition:/.test(css)) assert.match(css, /prefers-reduced-motion: reduce/, `${name}.css moves and never stops for reduced motion`);
  }
});
