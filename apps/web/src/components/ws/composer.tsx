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
import { PRODUCT_MODES, PRODUCT_MODE_INFO, type ProductMode } from '@golem/shared';
import { Icon, PATH, Popover } from './primitives';

/**
 * The swatch each mode carries. These are the existing charcoal-stone
 * accents — sand, slate, violet — so Super Agent reads as the heaviest option
 * by weight of colour rather than by shouting. Order comes from PRODUCT_MODES
 * so the menu can never disagree with the shared vocabulary.
 */
const TONE: Record<ProductMode, string> = {
  plan: '#9c8f7c',
  agent: '#6f8fa3',
  super: '#8b74c4',
};

const PLACEHOLDER = 'Ask anything about your project...';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  running: boolean;
  disabled?: boolean;
  mode: ProductMode;
  onModeChange: (m: ProductMode) => void;
  seed?: string;
  placeholder?: string;
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
}: Props) {
  const [text, setText] = useState('');
  const [modeOpen, setModeOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (seed) {
      setText(seed);
      box.current?.focus();
    }
  }, [seed]);

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
    onSend(value);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter makes a new line.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder ?? PLACEHOLDER}
          disabled={disabled}
        />

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
                        {info.blurb} Typically {info.typicalSparks} Sparks.
                      </span>
                    </span>
                  </button>
                );
              })}
            </Popover>
          </div>

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

      <p className="gx-composer__note">Golem can make mistakes. Always review important information.</p>
    </div>
  );
}
