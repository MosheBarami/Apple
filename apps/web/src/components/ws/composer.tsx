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
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  MESSAGE_MAX_CHARS,
  MESSAGE_WARN_CHARS,
  PRODUCT_MODES,
  PRODUCT_MODE_INFO,
  type ProductMode,
  type StudioEventSelection,
} from '@golem/shared';
import { Icon, PATH, Popover } from './primitives';
import { matchesShortcut } from '../../lib/shortcuts';
import { sendBinding, sendHint } from '../../lib/send-key';
import { readDraft, writeDraft, clearDraft } from '../../lib/draft';
import { insertAtCursor, selectionChipLabel, selectionReference } from '../../lib/selection-reference';
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
  onSend: (text: string) => boolean;
  onStop: () => void;
  running: boolean;
  disabled?: boolean;
  mode: ProductMode;
  onModeChange: (m: ProductMode) => void;
  seed?: string;
  placeholder?: string;
  /** The project this draft belongs to. Empty means "do not persist" — draft.ts no-ops on it. */
  draftKey?: string;
  /** What is selected in Studio right now, so the person can say "this one" instead of a path. */
  selection?: StudioEventSelection | null;
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
  selection,
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

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || running || disabled) return;
    // THE REFUSAL SHORT-CIRCUITS BEFORE ANYTHING IS THROWN AWAY. A send the socket refused must
    // leave the box and the draft exactly as they were: the words are still the person's, and the
    // only thing that failed is the delivery.
    if (!onSend(value)) return;
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
      <form className="gx-composer__inner" onSubmit={submit}>
        <label className="gx-sr" htmlFor="gx-composer-input">
          Describe what you want Golem to build
        </label>
        <textarea
          id="gx-composer-input"
          ref={box}
          value={text}
          // maxLength alone is not enough: browsers disagree about whether an over-long PASTE is
          // truncated or dropped, and the box must always hold exactly what will be sent.
          onChange={(e) => setText(e.target.value.slice(0, MESSAGE_MAX_CHARS))}
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
              {PRODUCT_MODES.map((id) => {
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
            {/* Attachments and dictation are in the reference's composer, and
                this build has no backend for either. They are therefore shown
                as unavailable rather than wired to nothing: a control that
                silently does nothing is a worse lie than one that says so. */}
            <button
              type="button"
              className="gx-icon-btn"
              disabled
              title="Attachments aren’t supported yet"
              aria-label="Attach a file — not supported yet"
            >
              <Icon d={PATH.attach} size={16} />
            </button>
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
              <button type="submit" className="gx-send" disabled={!text.trim() || disabled} aria-label="Send">
                <Icon d={PATH.send} size={16} />
              </button>
            )}
          </div>
        </div>
      </form>

      <p className="gx-composer__note">
        {sendHint(prefs.sendKey)} Golem can make mistakes. Always review important information.
      </p>
    </div>
  );
}
