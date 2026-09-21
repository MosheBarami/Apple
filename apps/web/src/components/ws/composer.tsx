// One model picker: Apple for limited free use, Apple MAX for subscribers.
// Model identity is independent of the legacy autonomy/specialist wire fields.
// The server owns entitlements; this surface prevents avoidable rejected sends.
import { useEffect, useReducer, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import {
  ATTACHMENT_ACCEPT,
  MESSAGE_MAX_CHARS,
  MESSAGE_WARN_CHARS,
  PRODUCT_MODELS,
  PRODUCT_MODEL_INFO,
  PRODUCT_MODES_OFFERED,
  PRODUCT_MODE_INFO,
  canUseProductModel,
  type ChatAttachment,
  type ProductMode,
  type ProductModel,
  type StudioEventSelection,
} from '@golem/shared';
import { Icon, PATH, Popover } from './primitives';
import { dropAttachment, uploadAttachment, UploadAborted } from '../../lib/api';
import {
  admitFiles,
  attachmentFailure,
  blockingReason,
  progressPercent,
  readyAttachments,
  stageReducer,
} from '../../lib/attachments';
import { matchesShortcut } from '../../lib/shortcuts';
import { observeComposerHeight } from '../../lib/composer-height';
import { sendBinding, sendHint } from '../../lib/send-key';
import { readDraft, writeDraft, clearDraft } from '../../lib/draft';
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
import { CREATION_INTENTS, creationMessage, maxAccessNotice, type CreationIntent } from '../../lib/creation-intent';
import { ModelMark } from './model-mark';
import './composer.css';

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
  productModel: ProductModel;
  modelPlan?: string;
  onModelChange: (model: ProductModel) => void;
  /**
   * PLAN OR AGENT — the choice between looking and building, made by the person sending the
   * message.
   *
   * It was never a missing feature. `PRODUCT_MODE_INFO` has named both since the vocabulary was
   * written, `workspace.tsx` has held the state and sent it with every message, and the worker
   * routes it: Plan is `clay`, whose toolset is `PLAN_TOOLS` — no `edit_script`, no
   * `create_instances`, no `run_luau` — and whose system prompt says "the user chose this mode
   * because they want thinking, not changes". All of that shipped with no control anywhere in the
   * chat to reach it, so the only people who could choose were the ones filling in an Automation
   * form. The composer is where a person decides what this message is going to do, so the choice
   * belongs here.
   */
  mode: ProductMode;
  onModeChange: (mode: ProductMode) => void;
  onUpgrade?: () => void;
  maxUpgradeAvailable?: boolean | null;
  seed?: string;
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
}

export function Composer({
  onSend,
  onStop,
  running,
  studioConnected = false,
  disabled,
  productModel,
  modelPlan,
  onModelChange,
  mode,
  onModeChange,
  onUpgrade,
  maxUpgradeAvailable = null,
  seed,
  placeholder,
  draftKey = '',
  projectId,
  onNotice,
  selection,
  onPresence,
}: Props) {
  // RESTORED ON THE FIRST RENDER, not in an effect. An effect paints an empty box first, and
  // people start retyping into it before the draft lands on top of what they just typed.
  const [text, setText] = useState(() => (draftKey ? readDraft(draftKey) : ''));
  // `modeOpen` is the MODEL menu and has carried that name since before the product had two
  // vocabularies. The Plan/Agent menu is the one actually called a mode, so it gets the clearer
  // name rather than renaming a field five call sites read.
  const [modeOpen, setModeOpen] = useState(false);
  const [taskModeOpen, setTaskModeOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [creation, setCreation] = useState<CreationIntent>('build');
  const box = useRef<HTMLTextAreaElement>(null);
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

  // ONE source for the chord. The handler and the hint below both read this, so the help can
  // never describe a key the handler does not listen for — which is how the two diverged before.
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
    // caret back at the end and the person loses their place mid-sentence.
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
  //               going up and an orphan in the store. ]]
  const [staged, dispatch] = useReducer(stageReducer, []);
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  const files = useRef(new Map<string, File>());
  const owners = useRef(new Map<string, string>());
  const aborts = useRef(new Map<string, { controller: AbortController; projectId: string }>());
  const activeProject = useRef(projectId ?? '');
  activeProject.current = projectId ?? '';
  const disposed = useRef(false);
  const [dropping, setDropping] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

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
   * Everything that can produce a file comes through here, so the rules about what is admitted —
   * and the sentence a refused file is refused with — cannot differ by how the file arrived.
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
   * A paste that carried files.
   *
   * `preventDefault` lives INSIDE the branch that found one. Unconditional, it would break the
   * most-used gesture in the product to catch the rarest one — and a pasted screenshot on this
   * build ends in the same refusal a picked one does, because that sentence is the only thing
   * that stops the person concluding paste itself is broken.
   */
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const found = items.filter((i) => i.kind === 'file').flatMap((i) => {
      const f = i.getAsFile();
      return f ? [f] : [];
    });
    if (!found.length) return;
    e.preventDefault();
    addFiles(found);
  };

  /** True only for a drag that actually carries files — text dragged across must not light the box. */
  const dragHasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

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
    addFiles(Array.from(e.dataTransfer?.files ?? []));
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
  const modelUnavailable = !canUseProductModel(productModel, modelPlan);
  const maxAvailable = canUseProductModel('apple-max', modelPlan);
  const requestMaxAccess = () => {
    if (maxUpgradeAvailable === true) onUpgrade?.();
    else onNotice?.(maxAccessNotice(maxUpgradeAvailable));
  };
  const chooseCreation = (next: CreationIntent) => {
    if (!maxAvailable) { requestMaxAccess(); return; }
    setCreation(creation === next ? 'build' : next);
    onModelChange('apple-max');
    box.current?.focus();
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || running || disabled) return;
    if (modelUnavailable) {
      onNotice?.('Apple MAX requires a paid subscription. Choose Apple to continue free. Your draft is kept.');
      return;
    }
    if (creationUnavailable) {
      onNotice?.('Connect Roblox Studio before generating a 3D model. Your draft is kept.');
      return;
    }
    // A file the person can still see on their screen has not been sent. Blocking here rather than
    // dropping it is the difference between "wait a moment" and a message that quietly arrived
    // without the log it was about.
    if (blocked) return;
    // THE REFUSAL SHORT-CIRCUITS BEFORE ANYTHING IS THROWN AWAY. A send the socket refused must
    // leave the box, the draft and the staged files exactly as they were: the words are still the
    // person's, the uploads are still theirs, and the only thing that failed is the delivery.
    const message = creationMessage(creation, value, MESSAGE_MAX_CHARS);
    if (!message) {
      onNotice?.('This description is too long once the creation instructions are added. Shorten it and send again.');
      return;
    }
    if (!onSend(message, readyAttachments(staged))) return;
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
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    //[[ THE PICKER CLAIMS THE KEY FIRST.
    //
    //   Before the send binding, and the order is the whole of it: a send chord that fires while
    //   the file picker is open sends a message with `@pla` in the middle of it and leaves the
    //   picker standing over the empty box. Arrow keys and Escape are claimed on the same terms —
    //   an ArrowDown that moved the caret instead of the highlight makes the list unusable
    //   without a mouse. ]]
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
    // THROUGH THE SHARED MATCHER, never a hand-rolled key check. A chord matched by hand in one
    // component is exactly what lib/shortcuts.ts exists to prevent, and it survived here — in the
    // most-used control in the product — long enough for the help text and the behaviour to
    // disagree about which key sends.
    if (matchesShortcut(e, sendKeyBinding)) {
      e.preventDefault();
      submit();
    }
  };

  const selectionLabel = selectionChipLabel(selection);

  const insertSelection = () => {
    // Nothing selected produces no phrase, and inserting an empty one would move the caret for no
    // reason. The chip is hidden in that case anyway; this is the second door on the same room.
    insertPhrase(selectionReference(selection));
  };

  const showCount = text.length >= MESSAGE_WARN_CHARS;
  const activeModel = PRODUCT_MODEL_INFO[productModel];

  return (
    <div className={`gx-composer aw-composer${running ? ' is-running' : ' is-ready'}`} ref={panel}>
      <div className="aw-composer__aura" aria-hidden="true" />
      <form
        className={`gx-composer__inner aw-composer__deck${dropping ? ' is-dropping' : ''}`}
        onSubmit={submit}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="aw-composer__chrome" aria-hidden="true">
          <span className="aw-composer__chrome-label">{running ? 'LIVE RUN' : 'NEW INSTRUCTION'}</span>
          <span className="aw-composer__chrome-line" />
          <span className="aw-composer__chrome-pulse"><i /><i /><i /><i /></span>
        </div>
        <label className="gx-sr" htmlFor="gx-composer-input">
          What should Apple build in your place?
        </label>
        <textarea
          id="gx-composer-input"
          ref={box}
          dir="auto"
          value={text}
          onPaste={onPaste}
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
          placeholder={creation === 'build' ? (placeholder ?? PLACEHOLDER) : CREATION_INTENTS[creation].placeholder}
          disabled={disabled}
          data-tour="composer"
        />

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
            {MESSAGE_MAX_CHARS - text.length} characters left
          </p>
        )}

        {/* ---------------------------------------------- staged files ----
            Above the tool row and below the text, where the eye already is. Each row is its own
            state: a determinate bar while the bytes are moving, the failure sentence and a Retry
            when they stopped, and a Remove on every one of them — including the ones that
            succeeded, because "I did not mean to attach that" arrives after the upload as often
            as during it. */}
        {staged.length > 0 && (
          <ul className="gx-attach" aria-label="Files on this message">
            {staged.map((row) => {
              const pct = progressPercent(row);
              return (
                <li key={row.id} className={`gx-attach__row is-${row.phase}`}>
                  <Icon d={PATH.attach} size={12} />
                  <span className="gx-attach__name">{row.name}</span>
                  {row.phase === 'uploading' && (
                    <span
                      className="gx-attach__bar"
                      role="progressbar"
                      aria-label={`Uploading ${row.name}`}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span className="gx-attach__fill" style={{ inlineSize: `${pct}%` }} />
                    </span>
                  )}
                  {/* THE SUCCESS STATE, which was the one phase with no picture. A row that had
                      landed looked exactly like a row that had stalled at 100% — same name, same
                      ×, no bar on either — so the only way to know a file was actually on the
                      message was to send it. The tick is drawn for the eye; the word beside it is
                      what a screen reader gets, since `aria-live` is not on this list. */}
                  {row.phase === 'ready' && (
                    <span className="gx-attach__ok">
                      <Icon d="M4.5 12.5l4.5 4.5L19.5 7" size={12} />
                      <span className="gx-sr">Attached</span>
                    </span>
                  )}
                  {row.phase === 'failed' && <span className="gx-attach__error">{row.error}</span>}
                  {row.phase === 'failed' && row.retryable && (
                    <button type="button" className="gx-attach__act" onClick={() => retryRow(row.id)}>
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    className="gx-attach__act gx-attach__x"
                    onClick={() => removeRow(row.id)}
                    aria-label={`Remove ${row.name}`}
                    title="Remove"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* WHY SEND IS OFF, IN WORDS. Polite for the same reason the character count is, and
            present only while it is true — a disabled Send with no explanation beside it is the
            commonest way a product wastes somebody's afternoon. */}
        {blocked && (
          <p className="gx-attach__block" aria-live="polite">
            {blocked}
          </p>
        )}

        <div className="gx-composer__bar aw-composer__bar">
          {/*[[ ---------------------------------------- plan or agent ----
              FIRST IN THE BAR, because it is the only control here that decides whether this
              message CHANGES the place. The model chip picks how well the work is done; this
              picks whether work happens at all, and a person who wants to be told what is wrong
              before anything is touched has no other way to ask for that.

              Both entries are always selectable. Neither is gated on a plan, a subscription or a
              Studio connection — Plan maps to the same free specialist a free account already
              runs, so an entry that looked choosable and was not would repeat the defect the MAX
              row still has. ]]*/}
          <div className="gx-pop-wrap">
            <button
              type="button"
              className="gx-chip gx-chip--mode"
              aria-haspopup="menu"
              aria-expanded={taskModeOpen}
              aria-label={`Mode: ${PRODUCT_MODE_INFO[mode].name}`}
              title={PRODUCT_MODE_INFO[mode].blurb}
              onClick={() => setTaskModeOpen((v) => !v)}
            >
              <Icon d={mode === 'plan' ? PATH.docs : PATH.layers} size={13} />
              <span>{PRODUCT_MODE_INFO[mode].name}</span>
              <span className="gx-chip__caret" aria-hidden="true">
                <Icon d={PATH.chevronDown} size={11} />
              </span>
            </button>
            <Popover open={taskModeOpen} onClose={() => setTaskModeOpen(false)} label="Mode">
              {PRODUCT_MODES_OFFERED.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={id === mode}
                  className="gx-pop__item gx-pop__item--stack"
                  onClick={() => {
                    onModeChange(id);
                    setTaskModeOpen(false);
                  }}
                >
                  <Icon d={id === 'plan' ? PATH.docs : PATH.layers} size={14} />
                  <span className="gx-pop__main">
                    <span>{PRODUCT_MODE_INFO[id].name}</span>
                    {/* The blurb is the shared vocabulary's own sentence, not a second description
                        written here that could drift from what the worker actually does. */}
                    <span className="gx-pop__sub">{PRODUCT_MODE_INFO[id].blurb}</span>
                  </span>
                </button>
              ))}
            </Popover>
          </div>

          {/* -------------------------------------------------- model ---- */}
          <div className="gx-pop-wrap">
            <button
              type="button"
              className="gx-chip gx-chip--model"
              aria-haspopup="menu"
              aria-expanded={modeOpen}
              aria-label={`Model: ${activeModel.name}`}
              onClick={() => setModeOpen((v) => !v)}
            >
              <ModelMark variant={productModel === 'apple' ? 'apple' : 'max'} />
              <span>{productModel === 'apple-max' ? <>Apple <span className="apple-max-name">MAX</span></> : activeModel.name}</span>
              <span className="gx-chip__caret" aria-hidden="true">
                <Icon d={PATH.chevronDown} size={11} />
              </span>
            </button>
            <Popover open={modeOpen} onClose={() => setModeOpen(false)} label="Model">
              {PRODUCT_MODELS.map((id) => {
                const info = PRODUCT_MODEL_INFO[id];
                const available = canUseProductModel(id, modelPlan);
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={id === productModel}
                    //[[ A ROW THAT CANNOT BE CHOSEN SAYS SO.
                    //
                    //   B3 of the owner's definition of done is not closed by this and this file
                    //   cannot close it: MAX needs paid subscriptions, which do not exist yet. What
                    //   it fixes is the lie in the meantime. The row carried no disabled and no
                    //   aria-disabled, so it read as selectable to everyone and as selectable to a
                    //   screen reader, and a click left the chip unchanged with a notice elsewhere
                    //   on the screen explaining why.
                    //   `aria-disabled` rather than `disabled`: the button must stay focusable and
                    //   clickable, because the sentence it raises — what MAX is and that it is not
                    //   purchasable yet — is the only place that is said. A `disabled` button is
                    //   skipped by the tab order and says nothing at all.
                    aria-disabled={available ? undefined : true}
                    className={`gx-pop__item gx-pop__item--stack${available ? '' : ' is-unavailable'}`}
                    onClick={() => {
                      if (!available) { setModeOpen(false); requestMaxAccess(); return; }
                      onModelChange(id);
                      if (id !== 'apple-max') setCreation('build');
                      setModeOpen(false);
                    }}
                  >
                    <ModelMark variant={id === 'apple' ? 'apple' : 'max'} />
                    <span className="gx-pop__main">
                      <span>{id === 'apple-max' ? <>Apple <span className="apple-max-name">MAX</span></> : info.name}</span>
                      <span className="gx-pop__sub">
                        {id === 'apple' ? 'Free · limited daily usage' : available ? 'Subscribers · extended capabilities' : maxUpgradeAvailable === false ? 'Subscribers · not available yet' : 'Subscribers · check availability'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </Popover>
          </div>

          {/* THE ASSET BROWSER IS GONE, on the owner's instruction of 2026-09-19, and what it means
              is a change of who does the looking. The customer describes what the place needs and
              Apple finds it; they do not shop in a catalogue. A library the customer browses is a
              database with a product around it, and the rows in ours repeat, carry licences of
              different shapes, and include kinds nothing can place — which is a thing to hand an
              agent that can check, not a thing to hand a fifteen-year-old with a search box.
              The agent's own path to the library is untouched; only this door is closed. */}
          {selectionLabel && (
            <button
              type="button"
              className="gx-chip gx-chip--selection"
              onClick={insertSelection}
              title="Refer to what is selected in Studio"
            >
              <Icon d={PATH.surface} size={11} />
              {selectionLabel}
            </button>
          )}

          {/* One secondary-creation menu instead of six permanent controls around the text box.
              Images, 3D and starting points are useful but they are not the primary act here:
              describing what Apple should do is. Keeping them in one popover preserves every
              feature while keeping the resting composer visually quiet. */}
          <div className="gx-pop-wrap">
            <button
              type="button"
              className="gx-chip gx-chip--create"
              aria-haspopup="menu"
              aria-expanded={templatesOpen}
              title="Images, 3D and starting points"
              onClick={() => setTemplatesOpen((v) => !v)}
            >
              <Icon d={PATH.compose} size={11} />
              Create
              <span className="gx-chip__caret" aria-hidden="true">
                <Icon d={PATH.chevronDown} size={11} />
              </span>
            </button>
            <Popover open={templatesOpen} onClose={() => setTemplatesOpen(false)} label="Create">
              <button
                type="button"
                role="menuitem"
                className="gx-pop__item gx-pop__item--stack"
                aria-pressed={creation === 'image'}
                disabled={running}
                onClick={() => {
                  chooseCreation('image');
                  setTemplatesOpen(false);
                }}
              >
                <Icon d="M3 3h18v18H3z M3 16l5-5 4 4 4-6 5 7 M8 7h.01" size={14} />
                <span className="gx-pop__main">
                  <span>Image <span className="gx-pop__badge">MAX</span></span>
                  <span className="gx-pop__sub">{maxAvailable ? 'Generate an image' : 'Requires Apple MAX'}</span>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="gx-pop__item gx-pop__item--stack"
                aria-pressed={creation === 'model'}
                disabled={running || !studioConnected}
                onClick={() => {
                  chooseCreation('model');
                  setTemplatesOpen(false);
                }}
              >
                <Icon d="M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10" size={14} />
                <span className="gx-pop__main">
                  <span>3D <span className="gx-pop__badge">MAX</span></span>
                  <span className="gx-pop__sub">{studioConnected ? (maxAvailable ? 'Generate directly in Studio' : 'Requires Apple MAX') : 'Connect Studio first'}</span>
                </span>
              </button>
              <span className="gx-pop__section">Starting points</span>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  className="gx-pop__item gx-pop__item--stack"
                  onClick={() => {
                    insertPhrase(t.prompt ?? '');
                    setTemplatesOpen(false);
                  }}
                >
                  <span className="gx-pop__main">
                    {t.label}
                    <span className="gx-pop__sub">{t.blurb}</span>
                  </span>
                </button>
              ))}
            </Popover>
          </div>

          <div className="gx-composer__tools">
            {/* THE PICKER ITSELF IS HIDDEN, NOT ABSENT. A styled <label> over a real file input is
                the only way to open the OS dialog, and the input carries the accept list built
                from the shared allowlist so the dialog cannot offer a type the worker refuses. */}
            <input
              ref={picker}
              type="file"
              className="gx-sr"
              multiple
              accept={ATTACHMENT_ACCEPT}
              tabIndex={-1}
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                // Cleared so picking the SAME file twice in a row fires change the second time.
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="gx-icon-btn"
              onClick={() => picker.current?.click()}
              disabled={!projectId || disabled}
              title={projectId ? 'Attach a file — text, Markdown, CSV, JSON or Luau' : 'Attachments need an open project'}
              aria-label="Attach a file"
            >
              <Icon d={PATH.attach} size={16} />
            </button>

            {running ? (
              // The title as well as the label: a pointer user gets no accessible name, and this
              // is the one control on the bar whose consequence is not obvious from its glyph.
              <button type="button" className="gx-send is-stop" onClick={onStop} disabled={disabled} title="Stop this run" aria-label="Stop this run">
                <Icon d={PATH.stop} size={13} />
              </button>
            ) : (
              <button
                type="submit"
                className="gx-send"
                disabled={!text.trim() || disabled || blocked !== null || creationUnavailable || modelUnavailable}
                title={creationUnavailable ? 'Connect Roblox Studio to generate this 3D model' : (blocked ?? undefined)}
                aria-label="Send"
              >
                <Icon d={PATH.send} size={16} />
              </button>
            )}
          </div>
        </div>
      </form>

      {modelUnavailable && <p className="gx-creation-note" role="status">Apple MAX requires a subscription. Choose Apple to continue free. Your draft is kept.</p>}
      {creation !== 'build' && <p className="gx-creation-note" role="status">{creationUnavailable ? 'Studio disconnected. Reconnect using Studio above, or switch to Images or chat. Your draft is kept.' : CREATION_INTENTS[creation].note}</p>}
      {/* TWO FACTS, AND THEY WERE RUNNING INTO EACH OTHER. JSX collapses the line break into a
          single space, so this line rendered "⇧↵ for a new line Apple can get things wrong" — one
          sentence with a keyboard shortcut welded onto the front of it. The separator is the same
          middot `sendHint` already uses between its own two halves, so the strip reads as a list of
          facts about this box rather than as prose. */}
      <p className="gx-composer__note">
        {sendHint(prefs.sendKey)}
        {' · '}
        Apple can get things wrong. Check what it changed before you publish.
      </p>
    </div>
  );
}
