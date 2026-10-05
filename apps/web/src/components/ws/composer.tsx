// One engine, StudPilot (V3 gate G01): there is no model picker and no model-gated control here.
// The workspace sends `productModel: 'apple'` on the wire; the server serves every value as StudPilot.
//
// BUILT FROM VERCEL AI ELEMENTS (components/ai-elements/prompt-input.tsx and attachments.tsx, the
// genuine upstream files — see that directory's NOTICE). PromptInputProvider holds the box's text and
// files; PromptInput is the form, the hidden file input and the paste/drop plumbing;
// PromptInputTextarea is the box; PromptInputFooter, PromptInputTools, PromptInputButton,
// PromptInputSubmit and PromptInputActionMenu are the bar. Their look is upstream's Tailwind classes. What stays HERE is what
// this product decides: which key sends (the person's preference), what a file is allowed to be and
// where it goes (uploaded to the project as it is staged), when a send is refused and that the
// refusal keeps the draft and the @-mention picker. There is no mode switch (V3 G01): every message
// runs the one StudPilot behaviour.
import { useEffect, useReducer, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  ATTACHMENT_ACCEPT,
  MESSAGE_MAX_CHARS,
  MESSAGE_WARN_CHARS,
  UI_THEMES,
  type ChatAttachment,
  type UiTheme,
  type StudioEventSelection,
} from '@studpilot/shared';
import { Icon, PATH } from './primitives';
import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
} from '../ai-elements/prompt-input';
import { Attachment, AttachmentInfo, AttachmentPreview, AttachmentRemove, Attachments, type AttachmentData } from '../ai-elements/attachments';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { ArrowUpIcon, CheckIcon, PaperclipIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dropAttachment, uploadAttachment, UploadAborted } from '../../lib/api';
import {
  admitFiles,
  attachmentFailure,
  blockingReason,
  progressPercent,
  readyAttachments,
  stageReducer,
  type StagedAttachment,
} from '../../lib/attachments';
import { observeComposerHeight } from '../../lib/composer-height';
import { sendBinding, sendHint } from '../../lib/send-key';
import { matchesShortcut } from '../../lib/shortcuts';
import { readDraft, writeDraft, clearDraft } from '../../lib/draft';
import { readUiTheme, writeUiTheme } from '../../lib/ui-theme';
import { insertAtCursor, selectionChipLabel, selectionReference, type Insertion } from '../../lib/selection-reference';
import { insertableTemplates } from '../../lib/project-templates';
import { applyMention, matchMentions, mentionQuery } from '../../lib/mentions';
import { fetchProjectFiles } from '../../lib/api';
import {
  TYPING_IDLE_MS,
  initialPresence,
  onComposerIdle,
  onComposerInput,
  onComposerLeave,
  onComposerSubmit,
  type SentActivity,
} from '../../lib/presence-signal';
import { usePrefs } from '../../lib/theme';
import { CREATION_INTENTS, creationMessage, type CreationIntent } from '../../lib/creation-intent';
//[[ THE OWNER'S PICKS, ON THE PARTS THEY BELONG TO (components/picks/composer/). Each file names
//   the pick it came from and what was rebuilt; the short version, part by part:
//     the card        Border Glow (the edge that lights toward the pointer), CSSPlugin focus ring
//                     and hairline wipe, the File Upload + Chat Form Dropzone drop picture
//     the empty box   Typing Text + Text Type (examples typed as the placeholder)
//     the bar         Folder Float + Inertia + utils.random (Ideas), Multi Selector
//                     (Files), Create Button (the Create menu), Radix Tooltip (one tip for all)
//     the tools       Context + Sliding Number (Credits), speech-input + Voice Pill +
//                     transcription + mic-selector (talk), Magnetic Dock (the swell), and on Send
//                     Button Hover Right, Spotlight, Press, Ripple, Hover and Animate UI Button
//   None of the libraries is installed; every behaviour is rebuilt on the platform. ]]
import { usePressFx } from '../picks/composer/press-fx';
import { useMagneticDock } from '../picks/composer/magnetic-dock';
import { TipGroup } from '../picks/composer/tip-group';
import { BorderGlow } from '../picks/composer/border-glow';
import { TypingPlaceholder } from '../picks/composer/typing-placeholder';
import { DropHint } from '../picks/composer/drop-hint';
import { SlidingNumber } from '../picks/composer/sliding-number';
import { IdeaFolder } from '../picks/composer/idea-folder';
import { FilePicker } from '../picks/composer/file-picker';
import { CreditsRing } from '../picks/composer/credits-ring';
import { VoiceInput } from '../picks/composer/voice-input';
import './composer.css';
import '../picks/composer/composer-fx.css';

// WHAT THIS BOX IS FOR, IN THE WORDS OF THE JOB. "Ask anything about your project…" is the line
// every chat product ships with, and it describes a question-answering service: this one builds,
// changes and fixes a Roblox place, which is the whole of what a person is here to ask for. The
// three verbs are the three things the worker can actually be told to do.
const PLACEHOLDER = 'Describe what to build, change or fix in your place';

/**
 * The starting points the picker offers.
 *
 * Read once at module scope rather than per render: the list is static data and rebuilding it on
 * every keystroke in the most-used control in the product would be a filter per keystroke for a
 * list that cannot change.
 */
const TEMPLATES = insertableTemplates();

const UI_THEME_LABEL: Record<UiTheme, string> = { studded: 'Studded', cartoony: 'Cartoony', none: 'None' };
const UI_THEME_BLURB: Record<UiTheme, string> = {
  studded: 'Classic studded look (default)',
  cartoony: 'Soft, rounded, playful',
  none: 'StudPilot picks the style',
};

interface Props {
  /**
   * TRUE WHEN THE MESSAGE ACTUALLY LEFT. This used to be `void`, and the type was the bug: with
   * nothing to check, the guard that keeps a refused send from emptying the box could not be
   * written even by someone who wanted to. A socket that closed mid-sentence took the sentence
   * with it and the person watched their own words disappear.
   */
  onSend: (text: string, attachments: ChatAttachment[]) => boolean;
  onStop: () => void;
  running: boolean;
  studioConnected?: boolean;
  disabled?: boolean;
  /**
   * G03: the paired Studio place is not connected. Nothing can be typed or sent and the build
   * controls are off; history stays readable and Stop stays live, because neither needs Studio.
   */
  locked?: boolean;
  /** G03: the run is paused because Studio went away. */
  paused?: boolean;
  /** G03: resume the paused run. Passed only once the place is back; a reconnect never resumes on its own. */
  onContinue?: () => void;
  seed?: string;
  /**
   * Bumped by the parent when a message this composer handed over, and was told had NOT left (a
   * `false` from onSend), leaves later on its own — the asset-source question holds the first
   * build's message and releases it after the answer. The composer then clears exactly as a send
   * would have; without this the sent words stayed in the box (F-052).
   */
  sentLater?: number;
  placeholder?: string;
  /** The project this draft belongs to. Empty means "do not persist" — draft.ts no-ops on it. */
  draftKey?: string;
  /**
   * The project a file would be uploaded to.
   *
   * SEPARATE FROM `draftKey` on purpose even though the workspace passes the same value to both.
   * A draft key is a storage namespace and may be any string; this is an authorisation target that
   * is sent to a server. The specimen book and any mock surface pass neither, and the paperclip
   * there is off with a reason on it rather than opening a picker whose upload cannot work.
   */
  projectId?: string;
  /** Somewhere to say why a file was refused. Absent means the refusal is shown on the row itself. */
  onNotice?: (message: string) => void;
  /** What is selected in Studio right now, so the person can say "this one" instead of a path. */
  selection?: StudioEventSelection | null;
  /**
   * Tell the room what this person is doing.
   *
   * Optional, and absent means the composer sends nothing — a workspace with no socket (mock mode,
   * the specimen book) must not be made to invent presence. The throttling is in
   * lib/presence-signal.ts so it can be driven with a clock rather than a keyboard.
   */
  onPresence?: (activity: SentActivity) => void;
  /**
   * Rows to start with. FOR THE DEV-ONLY SPECIMEN ROUTE (routes/studio-preview.tsx), which has to
   * show an uploading and a failed chip without a real upload. The workspace never passes it, so a
   * real composer always starts empty and every row it shows came through addFiles.
   */
  initialStaged?: readonly StagedAttachment[];
}

/**
 * THE PAPERCLIP. A component of its own only because the hook that opens PromptInput's file dialog
 * can be called from inside PromptInput and nowhere else.
 */
function AttachButton({ projectId, disabled }: { projectId?: string; disabled?: boolean }) {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton
      className="rounded-full text-muted-foreground"
      size="icon-sm"
      onClick={() => attachments.openFileDialog()}
      disabled={!projectId || disabled}
      // The bar's tip when it can be pressed; the native title when it cannot, because a disabled
      // button receives no pointer events and the reason would otherwise go unsaid.
      data-tip={projectId ? 'Attach a file — PNG or JPEG image, text, Markdown, CSV, JSON or Luau' : undefined}
      title={projectId ? undefined : 'Attachments need an open project'}
      aria-label="Attach a file"
      data-dock=""
      data-fx="press ripple lift"
    >
      <PaperclipIcon className="size-4" />
    </PromptInputButton>
  );
}

/**
 * THE BRIDGE BETWEEN UPSTREAM'S PLUMBING AND THIS PRODUCT'S RULES. Rendered inside PromptInput, where
 * its hooks reach the provider:
 *
 *   * TEXT. The product's `text` is the truth (drafts, mentions, inserted phrases all write it); the
 *     provider's input follows it, so upstream's controlled textarea shows exactly what will be sent.
 *   * FILES. Upstream gathers files from its file dialog, a drop on the form and a paste into the box,
 *     and holds them as blob URLs. Each one is handed straight to the product's own staging (admitted,
 *     uploaded to the project as it is staged) and removed from upstream's list, so the chips drawn are
 *     the product's — with their progress, failure and Retry.
 *   * THE DIALOG'S FILTER. The file input carries the shared allowlist. It is not given to PromptInput
 *     as `accept`: upstream's own filter matches MIME types only, and would refuse a `.luau` or `.md`
 *     file whose browser-reported type is empty before the product ever saw it.
 */
function PromptInputBridge({ text, onFiles }: { text: string; onFiles: (files: File[]) => void }) {
  const controller = usePromptInputController();
  const attachments = usePromptInputAttachments();
  const setInput = controller.textInput.setInput;
  useEffect(() => {
    if (controller.textInput.value !== text) setInput(text);
  }, [text, controller.textInput.value, setInput]);
  useEffect(() => {
    attachments.fileInputRef.current?.setAttribute('accept', ATTACHMENT_ACCEPT);
  }, [attachments.fileInputRef]);
  const handed = useRef(new Set<string>());
  useEffect(() => {
    const fresh = attachments.files.filter((file) => !handed.current.has(file.id));
    if (fresh.length === 0) return;
    for (const file of fresh) handed.current.add(file.id);
    void Promise.all(
      fresh.map(async (part) => {
        const blob = await fetch(part.url).then((r) => r.blob());
        return new File([blob], part.filename ?? 'file', { type: part.mediaType || blob.type });
      }),
    )
      .then(onFiles)
      .catch(() => undefined)
      .finally(() => { for (const file of fresh) attachments.remove(file.id); });
  }, [attachments, onFiles]);
  return null;
}

export function Composer({
  onSend,
  onStop,
  running,
  studioConnected = false,
  disabled: socketDisabled,
  locked = false,
  paused = false,
  onContinue,
  seed,
  sentLater = 0,
  placeholder,
  draftKey = '',
  projectId,
  onNotice,
  selection,
  onPresence,
  initialStaged,
}: Props) {
  // G03: a locked composer is a disabled one — no focus, no typing, no send — except for Stop.
  const disabled = socketDisabled || locked;
  // RESTORED ON THE FIRST RENDER, not in an effect. An effect paints an empty box first, and
  // people start retyping into it before the draft lands on top of what they just typed.
  const [text, setText] = useState(() => (draftKey ? readDraft(draftKey) : ''));
  const [creation, setCreation] = useState<CreationIntent>('build');
  // UI-only (the world stays studded). Kept per project by lib/ui-theme.ts; the workspace reads the
  // same store when it sends, so the choice and what goes on the wire cannot disagree.
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => readUiTheme(projectId ?? ''));
  const box = useRef<HTMLTextAreaElement>(null);
  // THE WHOLE BOX IS THE TARGET. A click on the composer's padding, above or beside the text, landed on
  // the panel and focused nothing — measured 2026-09-23: the message typed after that click went
  // nowhere. Anything interactive inside keeps its own click; empty box focuses the text.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('button, a, input, textarea, select, label, [contenteditable="true"]')) return;
      e.preventDefault();
      box.current?.focus();
    };
    el.addEventListener('mousedown', onDown);
    return () => el.removeEventListener('mousedown', onDown);
  });
  const lastKey = useRef(draftKey);
  const { prefs } = usePrefs();

  //[[ THE PANEL'S HEIGHT, PUBLISHED, SO THE TOAST STACK STOPS LANDING ON THE MESSAGE BOX.
  //
  //   components/toast.css lifted itself clear of this panel with a constant added up in a
  //   comment. Measured against the real thing it was short everywhere but 1440px, and at 375px
  //   the toast covered the top 49px of an 85px textarea — `elementFromPoint` at the field's first
  //   line returned the toast, not the field. The panel is also not one size: it grows with the
  //   tool bar wrapping, with a staged attachment, and with the draft somebody is typing.
  //
  //   So the height is MEASURED and published on the root for the floating surfaces to read; see
  //   lib/composer-height.ts, which toast.css's own header asked for by name. ]]
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => observeComposerHeight(panel.current, document.documentElement), []);

  // The picks' behaviour, delegated from the panel: every `data-fx` button answers a press, and the
  // round tools swell toward the pointer. See components/picks/composer/.
  const tools = useRef<HTMLDivElement>(null);
  usePressFx(panel);
  useMagneticDock(tools);
  const [boxFocused, setBoxFocused] = useState(false);
  const [typingShown, setTypingShown] = useState(false);

  // ONE source for the chord. The textarea's handler and the hint below both read this, so the
  // help can never describe a key the handler does not listen for — which is how the two diverged
  // before. The vendored PromptInputTextarea matches it with lib/shortcuts' shared matcher.
  const sendKeyBinding = sendBinding(prefs.sendKey);

  //[[ "SOMEONE ELSE IS TYPING", FROM THE ONE PLACE THAT KNOWS.
  //
  //   Kept in refs rather than state: a presence beat must not repaint the most-used control in
  //   the product, and none of this is ever rendered here — it is rendered on everybody ELSE's
  //   screen. The decision of what to send lives in lib/presence-signal.ts; this supplies the
  //   clock and the timer. ]]
  const presence = useRef(initialPresence());
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPresenceRef = useRef(onPresence);
  onPresenceRef.current = onPresence;

  const beat = (step: { state: ReturnType<typeof initialPresence>; send: SentActivity | null }) => {
    presence.current = step.state;
    if (step.send) onPresenceRef.current?.(step.send);
  };

  const typed = () => {
    if (!onPresenceRef.current) return;
    beat(onComposerInput(presence.current, Date.now()));
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => beat(onComposerIdle(presence.current, Date.now())), TYPING_IDLE_MS);
  };

  // A CLAIM IS WITHDRAWN WHEN THE PERSON LEAVES, not left standing on everyone else's screen
  // until the server's TTL happens to age it out.
  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      const step = onComposerLeave(presence.current);
      if (step.send) onPresenceRef.current?.(step.send);
    },
    [],
  );

  //[[ ONE WAY TO PUT A PHRASE IN THE BOX.
  //
  //   The Studio-selection chip already inserted at the caret, and the seed did `setText(seed)` —
  //   so a person who had begun typing and then clicked a suggestion, or who arrived on a handoff
  //   with a draft restored from a previous visit, watched their own sentence be replaced by
  //   somebody else's. The draft store persisted the replacement four hundred milliseconds later.
  //
  //   Three callers now share this: the chip, the seed and the template picker. Three copies of
  //   "insert at the caret, repair the spacing, put the caret after what was inserted" would
  //   disagree about at least one of the three, and the disagreement is invisible until somebody
  //   loses a sentence. ]]
  const applyInsertion = (next: Insertion) => {
    setText(next.text.slice(0, MESSAGE_MAX_CHARS));
    setCaret(next.caret);
    // Focus and caret are restored after React has painted the new value, or the browser puts the
    // caret back at the end and the person loses their place mid-sentence. After a paint also means
    // after a menu that was just chosen from has handed focus back to its trigger.
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const insertPhrase = (phrase: string) => {
    if (!phrase) return;
    const el = box.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    applyInsertion(insertAtCursor(text, phrase, start, end));
  };

  // A REF, NOT A DEPENDENCY. `insertPhrase` closes over `text`, so listing it here would re-run the
  // effect on every keystroke and re-insert the seed into the sentence being typed.
  const insertRef = useRef(insertPhrase);
  insertRef.current = insertPhrase;

  useEffect(() => {
    if (seed) insertRef.current(seed);
  }, [seed]);

  // Switching projects swaps the draft. Without the guard this would also fire on every render
  // that did not change the project and overwrite what the person is typing with what is stored.
  useEffect(() => {
    if (draftKey === lastKey.current) return;
    lastKey.current = draftKey;
    const next = draftKey ? readDraft(draftKey) : '';
    setText(next);
    setCaret(next.length);
    setCreation('build');
    setUiTheme(readUiTheme(projectId ?? ''));
  }, [draftKey]);

  // Debounced, because a write per keystroke is a synchronous localStorage call per keystroke in
  // the one control the whole product is typed into.
  useEffect(() => {
    if (!draftKey) return;
    const timer = setTimeout(() => writeDraft(draftKey, text), 400);
    return () => clearTimeout(timer);
  }, [draftKey, text]);

  // Grow with the content, up to the CSS max-height.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  //[[ THE FILES ON THIS MESSAGE.
  //
  //   A reducer, not five useStates, because every row here is a TRANSITION — staged, uploading,
  //   landed, failed, retried, removed — and the rules about which of those may ride on a message
  //   live in lib/attachments.ts where they can be driven without a browser.
  //
  //   Two refs beside it, and neither is state:
  //
  //     `files`   the File objects themselves, so a Retry re-posts the same bytes. Re-opening the
  //               picker to retry an upload is not a retry.
  //     `aborts`  one AbortController per in-flight row, so removing a row stops the request
  //               instead of merely hiding it. A cancel that only hides the row leaves the bytes
  //               going up and an orphan in the store.
  //
  //   PromptInput is given `onAddFiles`, so it keeps no attachment list of its own and makes no
  //   blob: or data: URL: every file it collects (picker, paste, drop) comes straight to addFiles. ]]
  const [staged, dispatch] = useReducer(stageReducer, initialStaged ?? [], (rows) => [...rows]);
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  const files = useRef(new Map<string, File>());
  const owners = useRef(new Map<string, string>());
  const aborts = useRef(new Map<string, { controller: AbortController; projectId: string }>());
  const activeProject = useRef(projectId ?? '');
  activeProject.current = projectId ?? '';
  const disposed = useRef(false);
  const [dropping, setDropping] = useState(false);

  /** Where a refusal goes. The caller's toast when there is one, the row's own line otherwise. */
  const notice = (message: string) => onNotice?.(message);

  const beginUpload = (rowId: string, file: File, ownerProjectId: string) => {
    if (!ownerProjectId) return;
    const controller = new AbortController();
    aborts.current.set(rowId, { controller, projectId: ownerProjectId });
    void uploadAttachment(ownerProjectId, file, {
      signal: controller.signal,
      onProgress: (sent) => {
        if (disposed.current || activeProject.current !== ownerProjectId || owners.current.get(rowId) !== ownerProjectId) return;
        dispatch({ type: 'progress', id: rowId, sent });
      },
    })
      .then((attachment) => {
        const pending = aborts.current.get(rowId);
        if (pending?.controller === controller) aborts.current.delete(rowId);
        // An abort can race a completed HTTP response. Once the composer left this project or the
        // row was removed, that successful upload is an orphan and must be deleted from the project
        // it ACTUALLY belongs to — never from whichever project is open now.
        if (disposed.current || activeProject.current !== ownerProjectId || owners.current.get(rowId) !== ownerProjectId) {
          void dropAttachment(ownerProjectId, attachment.attachmentId);
          return;
        }
        dispatch({ type: 'ready', id: rowId, attachment });
      })
      .catch((err: unknown) => {
        const pending = aborts.current.get(rowId);
        if (pending?.controller === controller) aborts.current.delete(rowId);
        // A CANCEL IS NOT A FAILURE. The row is already gone — the person removed it — and putting
        // an error where it was would ask them to react to their own decision.
        if (err instanceof UploadAborted) return;
        if (disposed.current || activeProject.current !== ownerProjectId || owners.current.get(rowId) !== ownerProjectId) return;
        const failure = attachmentFailure(err);
        dispatch({ type: 'failed', id: rowId, message: failure.message, retryable: failure.retryable });
      });
  };

  /**
   * One door for the picker, the paste and the drop.
   *
   * Everything that can produce a file comes through here — PromptInput hands each file over as it
   * arrived, through `onAddFiles` — so the rules about what is admitted, and the sentence a refused
   * file is refused with, cannot differ by how the file arrived.
   */
  const addFiles = (incoming: readonly File[]) => {
    if (!incoming.length) return;
    if (!projectId) {
      notice('Attachments need an open project.');
      return;
    }
    const { admitted, refused } = admitFiles(staged, incoming);
    for (const r of refused) notice(r.message);
    for (const file of admitted as File[]) {
      const rowId = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      files.current.set(rowId, file);
      owners.current.set(rowId, projectId);
      dispatch({ type: 'stage', id: rowId, name: file.name, size: file.size });
      beginUpload(rowId, file, projectId);
    }
  };

  const removeRow = (rowId: string) => {
    // Abort first, then forget: aborting after the row is gone still races the upload's own
    // resolution, and this ordering is what makes the `UploadAborted` branch above reachable.
    aborts.current.get(rowId)?.controller.abort();
    aborts.current.delete(rowId);
    const landed = staged.find((r) => r.id === rowId)?.attachment;
    const ownerProjectId = owners.current.get(rowId);
    if (landed && ownerProjectId) void dropAttachment(ownerProjectId, landed.attachmentId);
    owners.current.delete(rowId);
    files.current.delete(rowId);
    dispatch({ type: 'remove', id: rowId });
  };

  const retryRow = (rowId: string) => {
    const file = files.current.get(rowId);
    const ownerProjectId = owners.current.get(rowId);
    if (!file || !ownerProjectId || ownerProjectId !== activeProject.current) return;
    dispatch({ type: 'retry', id: rowId });
    beginUpload(rowId, file, ownerProjectId);
  };

  /**
   * A staged row as the data AI Elements' Attachment reads.
   *
   * `url` is empty ON PURPOSE. The file is on the server (or on its way there); a blob: URL made
   * here would be a second copy of the bytes in the tab, for a preview of files that are text. The
   * preview is therefore the media-category icon, which is the truth about what is attached.
   */
  const attachmentData = (row: StagedAttachment): AttachmentData => ({
    id: row.id,
    type: 'file',
    filename: row.name,
    mediaType: row.attachment?.mime ?? files.current.get(row.id)?.type ?? '',
    url: '',
  });

  /** True only for a drag that actually carries files — text dragged across must not light the box. */
  const dragHasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  // THE HIGHLIGHT ONLY. PromptInput listens for the drop on the same form and hands the files to
  // addFiles; adding them here as well would stage every dropped file twice.
  const onDragOver = (e: DragEvent<HTMLFormElement>) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    setDropping(true);
  };
  const onDragLeave = (e: DragEvent<HTMLFormElement>) => {
    // Only when the pointer has actually left the form. Dragging over a child fires dragleave on
    // the parent, and without this the highlight flickers the whole way across the box.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropping(false);
  };
  const onDrop = (e: DragEvent<HTMLFormElement>) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    setDropping(false);
  };

  //[[ @ — NAMING ONE OF THE PROJECT'S OWN FILES.
  //
  //   The rules are in lib/mentions.ts so they can be driven without a browser; this is the state
  //   the box needs to show them.
  //
  //   `mentionOff` exists because the token is DERIVED from the text and the caret, so there is no
  //   "closed" to store: dismissing the picker with Escape would be undone by the next render,
  //   which would find the same `@pla` still under the caret and open it again. The flag is
  //   cleared the moment the token changes, so Escape dismisses THIS mention and does not turn the
  //   feature off for the rest of the message.
  //
  //   The listing is fetched once per project and kept in a ref: a request per keystroke in the
  //   most-used control in the product, for a list that changes when the agent writes a file, is
  //   not a price worth paying for freshness measured in seconds. ]]
  const [caret, setCaret] = useState(0);
  const [mentionPick, setMentionPick] = useState(0);
  const [mentionOff, setMentionOff] = useState(false);
  const [paths, setPaths] = useState<string[] | null>(null);
  const asked = useRef('');

  const cleanupProjectUploads = (ownerProjectId: string) => {
    if (!ownerProjectId) return;
    for (const [rowId, pending] of [...aborts.current]) {
      if (pending.projectId !== ownerProjectId) continue;
      pending.controller.abort();
      aborts.current.delete(rowId);
    }
    for (const row of stagedRef.current) {
      if (owners.current.get(row.id) !== ownerProjectId) continue;
      if (row.attachment) void dropAttachment(ownerProjectId, row.attachment.attachmentId);
      owners.current.delete(row.id);
      files.current.delete(row.id);
    }
  };

  const lastProject = useRef(projectId ?? '');
  useEffect(() => {
    const nextProject = projectId ?? '';
    const previousProject = lastProject.current;
    if (nextProject === previousProject) return;
    lastProject.current = nextProject;
    cleanupProjectUploads(previousProject);
    dispatch({ type: 'clear' });
    setPaths(null);
    asked.current = '';
    setMentionOff(false);
    setMentionPick(0);
    setCaret((draftKey ? readDraft(draftKey) : '').length);
    setDropping(false);
  }, [projectId, draftKey]);

  useEffect(
    () => () => {
      disposed.current = true;
      for (const ownerProjectId of new Set(owners.current.values())) cleanupProjectUploads(ownerProjectId);
    },
    [],
  );

  const token = projectId && !mentionOff ? mentionQuery(text, caret) : null;
  const mentionHits = token && paths ? matchMentions(paths, token.query) : [];

  useEffect(() => {
    // Only once a mention is actually being typed. Fetching the file list on mount would put a
    // request behind every workspace open for a feature most messages never reach for.
    if (!token || !projectId || asked.current === projectId) return;
    asked.current = projectId;
    const requestedProjectId = projectId;
    void fetchProjectFiles(requestedProjectId)
      .then((res) => {
        if (disposed.current || activeProject.current !== requestedProjectId || asked.current !== requestedProjectId) return;
        setPaths(res.files.map((f) => f.path));
      })
      // A listing that did not arrive leaves the picker closed and the '@' as an ordinary
      // character. It must never become an empty picker, which reads as "this project has no
      // files" — an answer nobody computed.
      .catch(() => {
        if (disposed.current || activeProject.current !== requestedProjectId || asked.current !== requestedProjectId) return;
        asked.current = '';
        setPaths(null);
      });
  }, [token, projectId]);

  // A new token is a new decision. Without this, Escape on one mention would suppress every
  // mention for the rest of the message.
  useEffect(() => {
    setMentionOff(false);
    setMentionPick(0);
  }, [token?.at, token?.query]);

  const pickMention = (path: string) => {
    // THROUGH THE SAME TAIL as every other insertion. A second copy of "set the text, clamp it,
    // put the caret back after a paint" is a second place to get the caret wrong, and the symptom
    // — the cursor jumping to the end of the box — is the thing this arrangement exists to stop.
    if (!path || !token) return;
    applyInsertion(applyMention(text, token, path));
  };

  /** Where the caret is now, after any event that can move it. Read from the element, never guessed. */
  const trackCaret = () => setCaret(box.current?.selectionStart ?? 0);

  const blocked = blockingReason(staged);
  const creationUnavailable = creation === 'model' && !studioConnected;
  const chooseCreation = (next: CreationIntent) => {
    setCreation(creation === next ? 'build' : next);
    // After the menu has handed focus back to its trigger, so the box is where the typing goes.
    requestAnimationFrame(() => box.current?.focus());
  };

  /**
   * THE SEND, whichever way it was asked for: the person's send chord in the textarea (matched by
   * the vendored PromptInputTextarea), or the Send button — both submit PromptInput's form, and
   * PromptInput calls this. `false` is a REFUSAL, and PromptInput then leaves everything as it was.
   */
  const submit = (): boolean => {
    const value = text.trim();
    // A message sent while a run works is direction for that run (G10): the worker queues it for
    // the run's next step instead of starting a second one.
    if (!value || disabled) return false;
    if (creationUnavailable) {
      onNotice?.('Connect Roblox Studio before generating a 3D model. Your draft is kept.');
      return false;
    }
    // A file the person can still see on their screen has not been sent. Blocking here rather than
    // dropping it is the difference between "wait a moment" and a message that quietly arrived
    // without the log it was about.
    if (blocked) return false;
    // THE REFUSAL SHORT-CIRCUITS BEFORE ANYTHING IS THROWN AWAY. A send the socket refused must
    // leave the box, the draft and the staged files exactly as they were: the words are still the
    // person's, the uploads are still theirs, and the only thing that failed is the delivery.
    const message = creationMessage(creation, value, MESSAGE_MAX_CHARS);
    if (!message) {
      onNotice?.('This description is too long once the creation instructions are added. Shorten it and send again.');
      return false;
    }
    if (!onSend(message, readyAttachments(staged))) return false;
    afterSent();
    return true;
  };

  function afterSent() {
    // These files are no longer unsent composer state. Their attachment ids now belong to the sent
    // message, so a later project switch/unmount must not clean them up as orphans.
    for (const row of staged) owners.current.delete(row.id);
    files.current.clear();
    aborts.current.clear();
    dispatch({ type: 'clear' });
    // The typing is over whether or not we ever announced it — and the server is about to set
    // `building` on this socket, so this is the frame that stops the two claims overlapping.
    if (idleTimer.current) clearTimeout(idleTimer.current);
    beat(onComposerSubmit(presence.current, Date.now()));
    setText('');
    clearDraft(draftKey);
  }

  // A ref for the same reason as insertRef: the effect must fire on the bump, not on every render.
  const afterSentRef = useRef(afterSent);
  afterSentRef.current = afterSent;
  useEffect(() => {
    if (sentLater > 0) afterSentRef.current();
  }, [sentLater]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    //[[ THE PICKER CLAIMS THE KEY FIRST.
    //
    //   Before the send binding, and the order is the whole of it: a send chord that fires while
    //   the file picker is open sends a message with `@pla` in the middle of it and leaves the
    //   picker standing over the empty box. Arrow keys and Escape are claimed on the same terms —
    //   an ArrowDown that moved the caret instead of the highlight makes the list unusable
    //   without a mouse. The claim is `preventDefault`: PromptInputTextarea runs this handler
    //   first and does not look at the send binding for a key this has taken. ]]
    if (mentionHits.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        // Wraps, like the search panel's listbox: a list that stops at the end makes the last item
        // cost a full traversal to reach from the first.
        setMentionPick((i) => (i + step + mentionHits.length) % mentionHits.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOff(true);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(mentionHits[mentionPick] ?? mentionHits[0] ?? '');
        return;
      }
    }
    //[[ THE SEND KEY IS THE PERSON'S. Upstream's PromptInputTextarea hand-matches a bare Enter to send
    //   unless this handler has already claimed the key (it runs this first and yields to
    //   preventDefault). So every Enter is claimed HERE and decided by the app's shared matcher:
    //     * the person's send chord submits the form, as upstream would — unless Send is off;
    //     * any other Enter (Shift+Enter, or a bare Enter when "⌘Enter sends") is the new line,
    //       written at the caret, so upstream's own Enter test never decides a send. IME composition
    //       is left alone: that Enter belongs to the input method. ]]
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (matchesShortcut(e, sendKeyBinding)) {
      const submitButton = e.currentTarget.form?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!submitButton?.disabled) e.currentTarget.form?.requestSubmit();
      return;
    }
    const el = e.currentTarget;
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    applyInsertion({ text: `${text.slice(0, start)}\n${text.slice(end)}`, caret: start + 1 });
  };

  const selectionLabel = selectionChipLabel(selection);

  /** Files ticked in the Files picker go in as mentions do: each path in backticks, at the caret. */
  const insertFiles = (picked: readonly string[]) => insertPhrase(picked.map((p) => '`' + p + '`').join(' '));

  const insertSelection = () => {
    // Nothing selected produces no phrase, and inserting an empty one would move the caret for no
    // reason. The chip is hidden in that case anyway; this is the second door on the same room.
    insertPhrase(selectionReference(selection));
  };

  const showCount = text.length >= MESSAGE_WARN_CHARS;

  return (
    // `aie`: the AI Elements surface (styles/ai-elements.css). `gx-composer` is only the panel's place
    // in the workspace layout — its width and padding — and what composer-height measures.
    <div className={cn('gx-composer aie', running && 'is-running')} ref={panel}>
      <PromptInputProvider>
      <PromptInput
        className={cn(
          'gx-composer__form relative rounded-2xl',
          // A flat surface: an opaque card and a hairline edge. It was `bg-card/90` over `backdrop-blur`, a frosted pane
          // that let the thread show through blurred (the glass the design system removed, M2 2.1).
          '[&>[data-slot=input-group]]:rounded-2xl [&>[data-slot=input-group]]:bg-card [&>[data-slot=input-group]]:shadow-lg',
          dropping && '[&>[data-slot=input-group]]:border-dashed [&>[data-slot=input-group]]:border-primary [&>[data-slot=input-group]]:bg-primary/10',
        )}
        data-dropping={dropping || undefined}
        multiple
        // A send the product refuses THROWS, which is how upstream's form knows to keep the box and the
        // files as they are ("don't clear on error — user may want to retry"). A refusal must leave the
        // draft exactly where it was.
        onSubmit={() => {
          if (!submit()) throw new Error('send refused');
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <PromptInputBridge text={text} onFiles={addFiles} />
        <PromptInputBody>
          <label className="sr-only" htmlFor="gx-composer-input">
            What should StudPilot build in your place?
          </label>
          <PromptInputTextarea
            id="gx-composer-input"
            className={cn('gx-composer__field min-h-16 px-4 pt-4 text-[15px] leading-relaxed', typingShown && 'pk-has-typing')}
            onFocus={() => setBoxFocused(true)}
            onBlur={() => setBoxFocused(false)}
            ref={box}
            dir="auto"
            value={text}
            // THE PERSON'S SEND KEY, not upstream's bare Enter: prefs.sendKey, matched in onKeyDown.
            // maxLength alone is not enough: browsers disagree about whether an over-long PASTE is
            // truncated or dropped, and the box must always hold exactly what will be sent.
            onChange={(e) => {
              setText(e.target.value.slice(0, MESSAGE_MAX_CHARS));
              // The caret comes off the ELEMENT, after the browser has moved it. Deriving it from
              // the text length would put a mention picker over the end of the box whenever somebody
              // edits the middle of a sentence.
              setCaret(e.target.selectionStart ?? 0);
              typed();
            }}
            // Every other way a caret can move: arrow keys, clicking into the text, a selection made
            // with the mouse. Without these the picker opens from a position that is one gesture out
            // of date.
            onKeyUp={trackCaret}
            onClick={trackCaret}
            onSelect={trackCaret}
            onKeyDown={onKeyDown}
            role={mentionHits.length ? 'combobox' : undefined}
            aria-expanded={mentionHits.length ? true : undefined}
            aria-controls={mentionHits.length ? 'gx-mention-list' : undefined}
            aria-activedescendant={mentionHits.length ? `gx-mention-${mentionPick}` : undefined}
            rows={1}
            maxLength={MESSAGE_MAX_CHARS}
            placeholder={
              locked
                ? 'Connect Roblox Studio with the paired place open to build'
                : running
                  ? 'Add direction — StudPilot applies it after the current step'
                  : creation === 'build' ? (placeholder ?? PLACEHOLDER) : CREATION_INTENTS[creation].placeholder
            }
            disabled={disabled}
            data-tour="composer"
          />

          {/* The card's picks: the edge that lights toward the pointer, the examples the empty
              box types to itself, and the picture a file-carrying drag gets. All decoration,
              all aria-hidden; the box's own name and placeholder are unchanged. */}
          <BorderGlow hostRef={panel} />
          <TypingPlaceholder
            active={!text && !disabled && !boxFocused && creation === 'build' && !placeholder}
            onShowing={setTypingShown}
          />
          <DropHint active={dropping} />

          {/* ---------------------------------------------- @ mentions ----
              The project's own files, offered from the caret. A real listbox driven from the
              textarea — the same arrangement search-panel.tsx uses — so the whole thing is reachable
              from the keyboard: the input keeps focus and names the highlighted option through
              aria-activedescendant, rather than moving focus into a menu the caret has left. */}
          {mentionHits.length > 0 && (
            <ul className="gx-mention" id="gx-mention-list" role="listbox" aria-label="Project files">
              {mentionHits.map((path, i) => (
                <li
                  key={path}
                  id={`gx-mention-${i}`}
                  role="option"
                  aria-selected={i === mentionPick}
                  className={`gx-mention__row${i === mentionPick ? ' is-on' : ''}`}
                  // onMouseDown, not onClick: a click blurs the textarea first, and the blur would
                  // close the picker out from under the pointer before the click ever landed.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(path);
                  }}
                  onMouseEnter={() => setMentionPick(i)}
                >
                  {path}
                </li>
              ))}
            </ul>
          )}

          {showCount && (
            /* Polite, never assertive: a character count that interrupted a screen reader mid-word
               would be a worse problem than the one it is warning about.
               `is-full` HAS HAD A RULE IN system.css SINCE THE BEGINNING and nothing ever set it, so
               the counter read the same at 400 characters left as at none — the one moment it has
               something to report is the one moment it said nothing. */
            <p className={`gx-composer__count${text.length >= MESSAGE_MAX_CHARS ? ' is-full' : ''}`} aria-live="polite">
              {/* Animate UI's Sliding Number: the count rolls rather than flickers as it drops. */}
              <SlidingNumber value={MESSAGE_MAX_CHARS - text.length} /> characters left
            </p>
          )}

          {/* ---------------------------------------------- staged files ----
              AI Elements' Attachments, one chip per file, below the text where the eye already is.
              Each chip is its own state: a determinate bar while the bytes are moving, a mark once
              they have landed, the failure sentence and a Retry when they stopped — and a Remove on
              every one of them, including the ones that succeeded, because "I did not mean to attach
              that" arrives after the upload as often as during it. */}
          {staged.length > 0 && (
            <Attachments variant="inline" className="w-full px-3 pb-1" role="list" aria-label="Files on this message">
              {staged.map((row) => {
                const pct = progressPercent(row);
                return (
                  <Attachment
                    key={row.id}
                    role="listitem"
                    data={attachmentData(row)}
                    onRemove={() => removeRow(row.id)}
                    data-phase={row.phase}
                    // Each chip arrives (the owner's ae-attachments pick): it fades and grows in.
                    className={cn('animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none', row.phase === 'failed' && 'border-destructive/60')}
                  >
                    <AttachmentPreview />
                    <AttachmentInfo />
                    {row.phase === 'uploading' && (
                      <span
                        className="relative h-1 w-12 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label={`Uploading ${row.name}`}
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span className="absolute inset-y-0 start-0 bg-primary transition-[inline-size] motion-reduce:transition-none" style={{ inlineSize: `${pct}%` }} />
                      </span>
                    )}
                    {/* THE SUCCESS STATE, which was the one phase with no picture. A row that had
                        landed looked exactly like a row that had stalled at 100%, so the only way to
                        know a file was actually on the message was to send it. The mark is drawn for
                        the eye; the word beside it is what a screen reader gets. */}
                    {row.phase === 'ready' && (
                      <span className="text-emerald-500">
                        <CheckIcon className="size-3" aria-hidden="true" />
                        <span className="sr-only">Attached</span>
                      </span>
                    )}
                    {row.phase === 'failed' && <span className="text-destructive">{row.error}</span>}
                    {row.phase === 'failed' && row.retryable && (
                      <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => retryRow(row.id)}>
                        Retry
                      </button>
                    )}
                    <AttachmentRemove label={`Remove ${row.name}`} title="Remove" />
                  </Attachment>
                );
              })}
            </Attachments>
          )}

          {/* WHY SEND IS OFF, IN WORDS. Polite for the same reason the character count is, and
              present only while it is true — a disabled Send with no explanation beside it is the
              commonest way a product wastes somebody's afternoon. */}
          {blocked && (
            <p className="px-4 pb-1 text-muted-foreground text-xs" aria-live="polite">
              {blocked}
            </p>
          )}
        </PromptInputBody>

        <PromptInputFooter className="flex-wrap gap-y-2 px-3 pb-3">
          <PromptInputTools className="flex-wrap">
            {/* THE ASSET BROWSER IS GONE, on the owner's instruction of 2026-09-19, and what it means
                is a change of who does the looking. The customer describes what the place needs and
                StudPilot finds it; they do not shop in a catalogue. The agent's own path to the library
                is untouched; only this door is closed. */}
            {selectionLabel && (
              <PromptInputButton
                className="rounded-full text-muted-foreground"
                size="sm"
                onClick={insertSelection}
                disabled={disabled}
                data-tip="Refer to what is selected in Studio"
                data-fx="press ripple"
              >
                <Icon d={PATH.surface} size={11} />
                <span>{selectionLabel}</span>
              </PromptInputButton>
            )}

            {/* One secondary-creation menu instead of six permanent controls around the text box.
                Images, 3D and starting points are useful but they are not the primary act here:
                describing what StudPilot should do is. The chip names the intent while one is chosen. */}
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger
                className="rounded-full text-muted-foreground data-[active]:text-foreground"
                size="sm"
                data-active={creation === 'build' ? undefined : ''}
                disabled={locked}
                aria-label={creation === 'build' ? 'Create' : `Create: ${CREATION_INTENTS[creation].label}`}
                data-tip="Images, 3D and starting points"
                data-fx="press ripple"
              >
                <Icon d={PATH.compose} size={11} />
                <span>{creation === 'build' ? 'Create' : CREATION_INTENTS[creation].label}</span>
                <span className="opacity-60" aria-hidden="true">
                  <Icon d={PATH.chevronDown} size={11} />
                </span>
              </PromptInputActionMenuTrigger>
              <PromptInputActionMenuContent aria-label="Create" side="top" className="w-64">
                <DropdownMenuCheckboxItem
                  className="items-start"
                  checked={creation === 'image'}
                  disabled={running}
                  onCheckedChange={() => chooseCreation('image')}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm">Image</span>
                    <span className="text-muted-foreground text-xs">Generate an image</span>
                  </span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  className="items-start"
                  checked={creation === 'model'} disabled={running || !studioConnected}
                  onCheckedChange={() => chooseCreation('model')}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm">3D</span>
                    <span className="text-muted-foreground text-xs">{studioConnected ? 'Generate directly in Studio' : 'Connect Studio first'}</span>
                  </span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-muted-foreground text-xs">Starting points</DropdownMenuLabel>
                {TEMPLATES.map((t) => (
                  <PromptInputActionMenuItem key={t.id} className="items-start" onSelect={() => insertPhrase(t.prompt ?? '')}>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm">{t.label}</span>
                      <span className="text-muted-foreground text-xs">{t.blurb}</span>
                    </span>
                  </PromptInputActionMenuItem>
                ))}
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>

            {/* UI theme: how the interfaces StudPilot builds look. Not the world, not this website. `none`
                hands the choice to StudPilot; it never means "build no UI". Studded is the default. */}
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger
                className="rounded-full text-muted-foreground"
                size="sm"
                disabled={locked}
                aria-label={`UI theme: ${UI_THEME_LABEL[uiTheme]}`}
                data-tip="Style of the interfaces StudPilot builds"
                data-fx="press ripple"
              >
                <Icon d={PATH.layers} size={11} />
                <span>UI: {UI_THEME_LABEL[uiTheme]}</span>
                <span className="opacity-60" aria-hidden="true">
                  <Icon d={PATH.chevronDown} size={11} />
                </span>
              </PromptInputActionMenuTrigger>
              <PromptInputActionMenuContent aria-label="UI theme" side="top" className="w-64">
                <DropdownMenuRadioGroup
                  value={uiTheme}
                  onValueChange={(v) => {
                    const next = UI_THEMES.find((t) => t === v);
                    if (!next) return;
                    setUiTheme(next);
                    writeUiTheme(projectId ?? '', next);
                  }}
                >
                  {UI_THEMES.map((t) => (
                    <DropdownMenuRadioItem key={t} value={t} className="items-start">
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm">{UI_THEME_LABEL[t]}</span>
                        <span className="text-muted-foreground text-xs">{UI_THEME_BLURB[t]}</span>
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>

            {/* SOMEWHERE TO START, AND SOMETHING TO POINT AT. Ideas deals plain first requests out of a
                folder (idea-folder.tsx); Files is the @-mention for somebody who has never heard of
                the @ (file-picker.tsx), and exists only where there is a project to list. */}
            <IdeaFolder onPick={insertPhrase} dropTarget={box} disabled={disabled} />
            {projectId && <FilePicker projectId={projectId} onAdd={insertFiles} disabled={disabled} />}
          </PromptInputTools>

          <div className="ms-auto flex items-center gap-1" ref={tools}>
            {/* What is left to spend, beside the button that spends it (credits-ring.tsx). */}
            <CreditsRing />

            {/* THE PICKER ITSELF IS PromptInput's, hidden, and it carries the accept list built from
                the shared allowlist so the dialog cannot offer a type the worker refuses. */}
            <AttachButton projectId={projectId} disabled={disabled} />

            {/* Talk instead of type (voice-input.tsx). Absent in a browser that cannot hear; what
                was said goes in at the caret, never straight out. */}
            <VoiceInput onText={insertPhrase} onNotice={onNotice} disabled={disabled || running} />

            {paused && onContinue && (
              <PromptInputButton className="rounded-full" variant="outline" size="sm" onClick={onContinue} data-fx="press ripple">
                Continue
              </PromptInputButton>
            )}

            {running ? (
              // The title as well as the label: a pointer user gets no accessible name, and this
              // is the one control on the bar whose consequence is not obvious from its glyph.
              <PromptInputSubmit
                className="rounded-full"
                status="streaming"
                onStop={onStop}
                // Never `disabled`: that flag means the socket is down, and Stop also goes over HTTP
                // (F-069). Who may stop is checked by the workspace's onStop.
                title="Stop this run"
                aria-label="Stop this run"
                data-fx="press squish ripple"
                data-dock=""
              />
            ) : (
              <PromptInputSubmit
                // UI Layouts "Button Hover Right (Expand)": with something to send, the round button
                // widens on hover or keyboard focus and its word slides out beside the arrow.
                className="group/send h-8 w-auto min-w-8 gap-0 rounded-full px-2 transition-[gap,padding] hover:enabled:gap-1.5 hover:enabled:px-3 focus-visible:enabled:gap-1.5 focus-visible:enabled:px-3 motion-reduce:transition-none"
                status="ready"
                disabled={!text.trim() || disabled || blocked !== null || creationUnavailable}
                title={creationUnavailable ? 'Connect Roblox Studio to generate this 3D model' : (blocked ?? undefined)}
                aria-label="Send"
                // The Send picks: it widens to say "Send" (composer-fx.css), a light follows the
                // pointer across it, it gives under the press and springs back, a ring spreads from
                // the click, the arrow lifts, and it swells with the other round tools.
                data-fx="press squish ripple spotlight lift"
                data-dock=""
              >
                <span className="max-w-0 overflow-hidden whitespace-nowrap text-[13px] opacity-0 transition-[max-width,opacity] group-enabled/send:group-hover/send:max-w-[4em] group-enabled/send:group-hover/send:opacity-100 group-enabled/send:group-focus-visible/send:max-w-[4em] group-enabled/send:group-focus-visible/send:opacity-100 motion-reduce:transition-none" aria-hidden="true">Send</span>
                <ArrowUpIcon className="size-4" strokeWidth={2} />
              </PromptInputSubmit>
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>
      </PromptInputProvider>

      {/* The one tooltip every `data-tip` control in the panel shares (tip-group.tsx). */}
      <TipGroup rootRef={panel} />

      {locked && (
        <p className="mt-2 text-center text-muted-foreground text-xs" role="status">
          {paused
            ? 'Paused: Roblox Studio disconnected. Reopen the paired place with the StudPilot plugin running, then press Continue.'
            : 'Connect Roblox Studio with the paired place open to send a message. Your history stays here.'}
        </p>
      )}
      {!locked && paused && onContinue && (
        <p className="mt-2 text-center text-muted-foreground text-xs" role="status">Studio is back. Press Continue to resume the paused run.</p>
      )}
      {creation !== 'build' && <p className="mt-2 text-center text-muted-foreground text-xs" role="status">{creationUnavailable ? 'Studio disconnected. Reconnect using Studio above, or switch to Images or chat. Your draft is kept.' : CREATION_INTENTS[creation].note}</p>}
      {/* TWO FACTS, AND THEY WERE RUNNING INTO EACH OTHER. JSX collapses the line break into a
          single space, so this line rendered "⇧↵ for a new line StudPilot can get things wrong" — one
          sentence with a keyboard shortcut welded onto the front of it. The separator is the same
          middot `sendHint` already uses between its own two halves, so the strip reads as a list of
          facts about this box rather than as prose. */}
      <p className="gx-composer__note mt-3 text-center text-[10px] text-muted-foreground">
        {sendHint(prefs.sendKey)}
        {' · '}
        StudPilot can get things wrong. Check what it changed before you publish.
      </p>
    </div>
  );
}
