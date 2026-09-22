/**
 * THE COMPOSER'S PAPERCLIP, AND THE FOUR ROWS THAT HUNG OFF IT.
 *
 * What was there: a `<button disabled title="Attachments aren’t supported yet">`. That was the
 * honest half — there was no route to post to and no state to hold a file in — and it is the half
 * this file replaces. Six checklist rows were blocked on it: file upload, pasted image handling,
 * drag-and-drop, upload progress, upload cancellation, retry and removal before sending.
 *
 * These are source-level assertions for the wiring and unit assertions for the parts that can be
 * called. The repository's own convention (composer-send.test.mjs, files-drawer-wiring.test.mjs):
 * a control asserted by reading a component's source is at least asserted, and the alternative —
 * a browser harness this project does not have — is asserted never.
 *
 * WHAT EACH ONE IS DEFENDING:
 *
 *   The paperclip must not be disabled while a route exists, and it must not be enabled where
 *   there is no project to upload to — the specimen book and any surface with no socket.
 *
 *   A PASTE OF TEXT MUST STILL BE A PASTE OF TEXT. An onPaste that calls preventDefault
 *   unconditionally breaks the most-used gesture in the product to catch the rarest one.
 *
 *   The drop target is the composer, not the window, and the dragged thing being a file is
 *   checked before the box is lit up — dragging selected text across the composer must not
 *   promise an upload that will not happen.
 *
 *   An in-flight upload is ABORTED when its row is removed, not merely hidden. A cancel that only
 *   hides the row leaves the bytes going up and the orphan in the store.
 *
 *   A sent message CARRIES the attachments. This is the one that makes the rest real: the socket
 *   frame has had an `attachments` field since the protocol was written and nothing ever set it.
 *
 * Run with:  node --test tests/composer-attachments.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ATTACHMENT_ACCEPT } from '@golem/shared';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const src = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');

const COMPOSER = src('components', 'ws', 'composer.tsx');
const WORKSPACE = src('routes', 'workspace.tsx');
const SOCKET = src('lib', 'use-project-socket.ts');
const API = src('lib', 'api.ts');
const CSS = readFileSync(join(WEB, 'src', 'design', 'system.css'), 'utf8');

/** Source with comments removed, so a negative assertion cannot be tripped by prose. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CODE = stripComments(COMPOSER);
// Since 2026-09-22 the file input, the paste and the drop plumbing are AI Elements' PromptInput
// (vendored, components/ai-elements/prompt-input.tsx). The composer gives it `onAddFiles`, so every
// file it collects comes to the composer's own admission door; the properties below are asserted
// where each now lives.
const INPUT = stripComments(src('components', 'ai-elements', 'prompt-input.tsx'));
const INPUT_CSS = readFileSync(join(WEB, 'src', 'components', 'ai-elements', 'prompt-input.css'), 'utf8');

/* ------------------------------------------------------------------ the control ---- */

test('the paperclip is no longer disabled, and no longer says attachments are unsupported', () => {
  assert.ok(!COMPOSER.includes('Attachments aren’t supported yet'), 'the disabled title is still there');
  assert.match(INPUT, /<input[\s\S]*?type="file"/, 'a real file input is what a paperclip opens');
  // The paperclip opens THAT input: PromptInput's openFileDialog, reached through its own hook.
  assert.match(CODE, /onClick=\{\(\) => attachments\.openFileDialog\(\)\}/);
  assert.match(INPUT, /const openFileDialogLocal = useCallback\(\(\) => \{\s*inputRef\.current\?\.click\(\);/);
  // Hidden, not absent — and hidden by a rule this app actually has (it has no `.hidden` utility).
  assert.match(INPUT, /className="hidden ai-prompt-input__file"/);
  assert.match(INPUT_CSS.replace(/\/\*[\s\S]*?\*\//g, ''), /\.ai-prompt-input__file\s*\{\s*display:\s*none;?\s*\}/);
});

test('the picker offers exactly the types the server takes', () => {
  // A dialog that offers a type the worker refuses is a dialog that lies about what it takes. The
  // accept string is built from the shared allowlist, never written out beside it.
  assert.match(CODE, /<PromptInput\b[^>]*?\baccept=\{ATTACHMENT_ACCEPT\}/, 'the composer must give PromptInput the shared list');
  assert.match(INPUT, /<input\s+accept=\{accept\}/, 'and PromptInput must put it on the input the dialog opens from');
  assert.ok(ATTACHMENT_ACCEPT.includes('text/markdown'));
});

test('a surface with no project cannot attach, and says which of the two it is', () => {
  // The specimen book and the mock workspace render a Composer with no socket behind it. A
  // paperclip that opens a picker there and then fails on upload is worse than one that is off.
  assert.match(CODE, /projectId/, 'the composer has to know what it would be uploading to');
  assert.match(COMPOSER, /Attach a file/);
});

test('unsupported voice input is not advertised as a dead composer control', () => {
  assert.doesNotMatch(COMPOSER, /Voice input/);
  assert.doesNotMatch(COMPOSER, /not supported yet/);
});

/* ------------------------------------------------------------------ paste ---- */

test('a paste is inspected for files and left alone when it has none', () => {
  // The vendored textarea's own paste handler; the composer must not replace it with one of its
  // own (a caller's onPaste would override it, and then two rules would decide what a paste is).
  assert.match(INPUT, /onPaste=\{handlePaste\}/, 'nothing reads the clipboard');
  const tag = CODE.slice(CODE.indexOf('<PromptInputTextarea'), CODE.indexOf('/>', CODE.indexOf('<PromptInputTextarea')));
  assert.equal(/\bonPaste=/.test(tag), false, 'the composer overrides the vendored paste handler');
  const handler = INPUT.slice(INPUT.indexOf('const handlePaste'), INPUT.indexOf('const handleCompositionEnd'));
  assert.match(handler, /clipboardData/);
  assert.match(handler, /kind [!=]== ['"]file['"]/);
  // preventDefault has to be INSIDE the branch that found files. Unconditional, it breaks the
  // most-used gesture in the product to catch the rarest one.
  const beforeGuard = handler.slice(0, handler.indexOf('preventDefault'));
  assert.ok(/if\s*\(/.test(beforeGuard), 'preventDefault is not guarded by anything');
});

test('a pasted image is refused in words rather than silently ignored', () => {
  // Images are not supported on this build. The path a pasted screenshot takes must end in the
  // same sentence a picked one does, or the person concludes the paste itself is broken.
  // Paste, pick and drop all call PromptInput's `add`, which — given onAddFiles — hands the files to
  // the caller untouched; the composer's onAddFiles IS its one admission door.
  assert.match(INPUT, /attachments\.add\(files\)/, 'a pasted file must go to PromptInput\'s add');
  assert.match(INPUT, /const add = onAddFiles\s*\?\s*addToCaller/, 'with onAddFiles, add must be the hand-over');
  const handOver = INPUT.slice(INPUT.indexOf('const addToCaller'), INPUT.indexOf('const add = onAddFiles'));
  assert.match(handOver, /onAddFilesRef\.current\?\.\(incoming\)/);
  assert.equal(/createObjectURL|matchesAccept|maxFileSize/.test(handOver), false, 'the hand-over must not filter or copy the files itself');
  assert.match(CODE, /onAddFiles=\{addFiles\}/, 'paste has to reach the same admission path as the picker');
  assert.match(CODE, /const addFiles = \(incoming: readonly File\[\]\) => \{[\s\S]*?admitFiles\(staged, incoming\)/);
});

/* ------------------------------------------------------------------ drag and drop ---- */

test('the composer is the drop target, and it lights up only for a dragged FILE', () => {
  assert.match(CODE, /onDragOver=/);
  assert.match(CODE, /onDrop=/);
  assert.match(CODE, /onDragLeave=/);
  assert.match(CODE, /dataTransfer/);
  // Dragging selected text across the box must not promise an upload that will not happen.
  assert.match(CODE, /types\??\.?(includes|indexOf)|'Files'/, 'nothing checks that the drag carries files');
});

test('the drop state has a style, so the promise the box makes is visible', () => {
  assert.match(CODE, /is-dropping/);
  assert.match(CSS, /\.gx-composer__inner\.is-dropping/);
});

/* ------------------------------------------------------------------ the rows ---- */

test('a staged file is rendered with its name, a determinate bar and a way out', () => {
  assert.match(CODE, /progressPercent\(/, 'a bar drawn from anything but the real byte count is a decoration');
  assert.match(CODE, /gx-attach/, 'the staged rows need their own class to be styled at all');
  assert.match(CSS, /\.gx-attach/);
  assert.match(CODE, /Remove/);
  assert.match(CODE, /Retry/);
});

test('the bar is a real progress element, not a div a screen reader cannot read', () => {
  assert.match(CODE, /role="progressbar"|<progress/);
  assert.match(CODE, /aria-valuenow/);
});

test('removing a row aborts the request as well as hiding it', () => {
  assert.match(CODE, /AbortController/, 'nothing can cancel an upload');
  assert.match(CODE, /\.abort\(\)/);
  // And the orphan is dropped when the bytes had already landed, or it sits in the store for a week.
  assert.match(CODE, /dropAttachment\(/);
});

test('retry re-posts the same File object rather than asking for it again', () => {
  // The File is held beside the row precisely so a retry costs the person nothing. Re-opening the
  // picker to retry is not a retry.
  assert.match(CODE, /type: 'retry'/);
  assert.match(CODE, /files\.current|fileFor|filesRef/, 'the File itself has to be kept somewhere');
});

/* ------------------------------------------------------------------ the send ---- */

test('send is blocked, with the reason shown, while a file is unfinished', () => {
  assert.match(CODE, /blockingReason\(/);
  // Shown, not merely computed: a disabled Send with no explanation is how a product wastes an
  // afternoon.
  assert.match(CODE, /aria-live/);
});

test('the message carries the attachments all the way to the socket frame', () => {
  // THE ROW THAT MAKES THE REST REAL. `ClientMsg` has had `attachments` since the protocol was
  // written and nothing ever set it.
  assert.match(CODE, /readyAttachments\(/);
  assert.match(COMPOSER, /onSend: \(text: string, attachments: ChatAttachment\[\]\) => boolean/);
  // Mode, model and autonomy metadata must not invalidate the attachment boundary.
  assert.match(WORKSPACE, /sendChat\(text, mode, attachments, productModel, autonomous\)/);
  assert.match(SOCKET, /sendRaw\(\{ type: 'chat'[^\n]+attachments/);
});

test('a refused send leaves the staged files exactly where they were', () => {
  // The same rule the text already lives by: the words are still the person's and the only thing
  // that failed is the delivery. Losing four uploaded files to a closed socket is worse.
  const submit = CODE.slice(CODE.indexOf('const submit'), CODE.indexOf('const onKeyDown'));
  const refusal = submit.indexOf('if (!onSend(');
  const clear = submit.indexOf("type: 'clear'");
  assert.ok(refusal > 0 && clear > 0, 'both the refusal guard and the clear must be in submit');
  assert.ok(refusal < clear, 'the staged list is cleared before the send is known to have left');
});

/* ------------------------------------------------------------------ the client ---- */

test('the upload reports progress through XHR, because fetch cannot', () => {
  assert.match(API, /xhr\.upload\.onprogress/);
  assert.match(API, /lengthComputable/, 'a bar that animates without knowing the total is a lie');
  assert.match(API, /class UploadAborted/, 'a cancel must not be reported as a failure');
});
