// The composer: the message box, the mode chip and send.
//
// ONE user-facing axis, not two. The reference renders a chip on the left of
// the bar that names a model; this product deliberately has no such control.
// Which foundation model answers is an implementation detail of the routing
// layer — it changes with availability, cost and task, and a user who pinned a
// named backend would be choosing a thing we reserve the right to move. The
// user sees "Golem". So the only choice offered here is how much autonomy and
// budget a request gets:
//
//   Plan        inspects, reasons and proposes — no project edits by default
//   Agent       the normal bounded builder
//   Super Agent long-horizon autonomous work
//
// Those three are the *product* modes. Internally each maps to a named
// specialist on the wire (see PRODUCT_MODE_TO_SPECIALIST in @golem/shared);
// that mapping happens where the chat message is built, not here, so the
// protocol, the stored sessions and budget accounting are untouched by this
// vocabulary. Nothing in this file may name a provider or a model id.
import { useEffect, useReducer, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import {
  ATTACHMENT_ACCEPT,
  MESSAGE_MAX_CHARS,
  MESSAGE_WARN_CHARS,
  PRODUCT_MODES_OFFERED,
  PRODUCT_MODE_INFO,
  type ChatAttachment,
  type ProductMode,
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
import { sendBinding, sendHint } from '../../lib/send-key';
import { readDraft, writeDraft, clearDraft } from '../../lib/draft';
import { insertAtCursor, selectionChipLabel, selectionReference } from '../../lib/selection-reference';
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

/**
 * The swatch each mode carries. These are the existing charcoal-stone
 * accents — sand, slate, violet — so Super Agent reads as the heaviest option
 * by weight of colour rather than by shouting. Order comes from PRODUCT_MODES
 * so the menu can never disagree with the shared vocabulary.
 */
/*
 * The real accent tokens, not literals. These were hardcoded mid-tones with a
 * comment claiming they were "the existing charcoal-stone accents" — they were
 * not: none of the three appears anywhere else in the repo. Being literals they
 * also could not flip with the theme, so the same three colours were painted on
 * both the light and the dark surface.
 *
 * The variables keep their internal --acc-clay/stone/rune names because that is
 * what styles.css defines; the mapping from product mode to specialist accent
 * lives here, at the one place a mode becomes a colour.
 */
const TONE: Record<ProductMode, string> = {
  plan: 'var(--acc-clay)',
  agent: 'var(--acc-stone)',
  super: 'var(--acc-rune)',
};

const PLACEHOLDER = 'Ask anything about your project...';

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
  disabled?: boolean;
  mode: ProductMode;
  onModeChange: (m: ProductMode) => void;
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
  disabled,
  mode,
  onModeChange,
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
  const [modeOpen, setModeOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const lastKey = useRef(draftKey);
  const { prefs } = usePrefs();

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

  useEffect(() => {
    if (seed) {
      setText(seed);
      box.current?.focus();
    }
  }, [seed]);

  // Switching projects swaps the draft. Without the guard this would also fire on every render
  // that did not change the project and overwrite what the person is typing with what is stored.
  useEffect(() => {
    if (draftKey === lastKey.current) return;
    lastKey.current = draftKey;
    setText(draftKey ? readDraft(draftKey) : '');
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
  const files = useRef(new Map<string, File>());
  const aborts = useRef(new Map<string, AbortController>());
  const [dropping, setDropping] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  /** Where a refusal goes. The caller's toast when there is one, the row's own line otherwise. */
  const notice = (message: string) => onNotice?.(message);

  const beginUpload = (rowId: string, file: File) => {
    if (!projectId) return;
    const controller = new AbortController();
    aborts.current.set(rowId, controller);
    void uploadAttachment(projectId, file, {
      signal: controller.signal,
      onProgress: (sent) => dispatch({ type: 'progress', id: rowId, sent }),
    })
      .then((attachment) => {
        aborts.current.delete(rowId);
        dispatch({ type: 'ready', id: rowId, attachment });
      })
      .catch((err: unknown) => {
        aborts.current.delete(rowId);
        // A CANCEL IS NOT A FAILURE. The row is already gone — the person removed it — and putting
        // an error where it was would ask them to react to their own decision.
        if (err instanceof UploadAborted) return;
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
      dispatch({ type: 'stage', id: rowId, name: file.name, size: file.size });
      beginUpload(rowId, file);
    }
  };

  const removeRow = (rowId: string) => {
    // Abort first, then forget: aborting after the row is gone still races the upload's own
    // resolution, and this ordering is what makes the `UploadAborted` branch above reachable.
    aborts.current.get(rowId)?.abort();
    aborts.current.delete(rowId);
    const landed = staged.find((r) => r.id === rowId)?.attachment;
    if (landed && projectId) void dropAttachment(projectId, landed.attachmentId);
    files.current.delete(rowId);
    dispatch({ type: 'remove', id: rowId });
  };

  const retryRow = (rowId: string) => {
    const file = files.current.get(rowId);
    if (!file) return;
    dispatch({ type: 'retry', id: rowId });
    beginUpload(rowId, file);
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

  const blocked = blockingReason(staged);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || running || disabled) return;
    // A file the person can still see on their screen has not been sent. Blocking here rather than
    // dropping it is the difference between "wait a moment" and a message that quietly arrived
    // without the log it was about.
    if (blocked) return;
    // THE REFUSAL SHORT-CIRCUITS BEFORE ANYTHING IS THROWN AWAY. A send the socket refused must
    // leave the box, the draft and the staged files exactly as they were: the words are still the
    // person's, the uploads are still theirs, and the only thing that failed is the delivery.
    if (!onSend(value, readyAttachments(staged))) return;
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
    const phrase = selectionReference(selection);
    // Nothing selected produces no phrase, and inserting an empty one would move the caret for no
    // reason. The chip is hidden in that case anyway; this is the second door on the same room.
    if (!phrase) return;
    const el = box.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    const next = insertAtCursor(text, phrase, start, end);
    setText(next.text.slice(0, MESSAGE_MAX_CHARS));
    // Focus and caret are restored after React has painted the new value, or the browser puts the
    // caret back at the end and the person loses their place mid-sentence.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
    });
  };

  const showCount = text.length >= MESSAGE_WARN_CHARS;
  const activeMode = PRODUCT_MODE_INFO[mode];

  return (
    <div className="gx-composer">
      <form
        className={`gx-composer__inner${dropping ? ' is-dropping' : ''}`}
        onSubmit={submit}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <label className="gx-sr" htmlFor="gx-composer-input">
          What should Apple build in your place?
        </label>
        <textarea
          id="gx-composer-input"
          ref={box}
          value={text}
          onPaste={onPaste}
          // maxLength alone is not enough: browsers disagree about whether an over-long PASTE is
          // truncated or dropped, and the box must always hold exactly what will be sent.
          onChange={(e) => {
            setText(e.target.value.slice(0, MESSAGE_MAX_CHARS));
            typed();
          }}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={MESSAGE_MAX_CHARS}
          placeholder={placeholder ?? PLACEHOLDER}
          disabled={disabled}
          data-tour="composer"
        />

        {showCount && (
          /* Polite, never assertive: a character count that interrupted a screen reader mid-word
             would be a worse problem than the one it is warning about. */
          <p className="gx-composer__count" aria-live="polite">
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

        <div className="gx-composer__bar">
          {/* -------------------------------------------------- mode ---- */}
          <div className="gx-pop-wrap">
            <button
              type="button"
              className="gx-chip"
              aria-haspopup="menu"
              aria-expanded={modeOpen}
              aria-label={`Mode: ${activeMode.name}`}
              onClick={() => setModeOpen((v) => !v)}
            >
              <span className="gx-chip__swatch" style={{ background: TONE[mode] }} aria-hidden="true" />
              {activeMode.name}
              <span className="gx-chip__caret" aria-hidden="true">
                <Icon d={PATH.chevronDown} size={11} />
              </span>
            </button>
            <Popover open={modeOpen} onClose={() => setModeOpen(false)} label="Mode">
              {PRODUCT_MODES_OFFERED.map((id) => {
                const info = PRODUCT_MODE_INFO[id];
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={id === mode}
                    className="gx-pop__item gx-pop__item--stack"
                    onClick={() => {
                      onModeChange(id);
                      setModeOpen(false);
                    }}
                  >
                    <span className="gx-chip__swatch" style={{ background: TONE[id] }} aria-hidden="true" />
                    <span className="gx-pop__main">
                      {info.name}
                      <span className="gx-pop__sub">
                        {info.blurb} Typically {info.typicalCredits} Credits.
                      </span>
                    </span>
                  </button>
                );
              })}
            </Popover>
          </div>

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
            {/* Dictation is still unwired, and still says so. Transcription needs a model decision
                the owner has not made, and a control that silently does nothing is a worse lie
                than one that admits it. */}
            <button
              type="button"
              className="gx-icon-btn"
              disabled
              title="Voice input isn’t supported yet"
              aria-label="Voice input — not supported yet"
            >
              <Icon d={PATH.mic} size={16} />
            </button>

            {running ? (
              <button type="button" className="gx-send is-stop" onClick={onStop} aria-label="Stop this run">
                <Icon d={PATH.stop} size={13} />
              </button>
            ) : (
              <button
                type="submit"
                className="gx-send"
                disabled={!text.trim() || disabled || blocked !== null}
                title={blocked ?? undefined}
                aria-label="Send"
              >
                <Icon d={PATH.send} size={16} />
              </button>
            )}
          </div>
        </div>
      </form>

      <p className="gx-composer__note">
        {sendHint(prefs.sendKey)} Apple can get things wrong. Check what it changed before you publish.
      </p>
    </div>
  );
}
