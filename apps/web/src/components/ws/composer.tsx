// The composer: the message box, the mode chip and the provider chip.
//
// Mode and provider are DIFFERENT AXES and are deliberately shown as two
// separate controls. Clay / Stone / Rune are product modes — how much autonomy
// and budget a request gets. GLM / GPT / Gemini / DeepSeek are model backends.
// Collapsing them into one menu would make "Stone" and "Gemini" look like
// alternatives to each other, which they are not.
//
// The provider control is secondary by design: compact, unlabelled until
// opened, and defaulted to Auto.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { GolemMode } from '@golem/shared';
import { Icon, PATH, Popover } from './primitives';

export interface ProviderOption {
  id: string;
  provider: string;
  label: string;
  available: boolean;
  reason: string | null;
  supportsVision: boolean;
}

const MODES: { id: GolemMode; label: string; blurb: string; sparks: string; tone: string }[] = [
  { id: 'clay', label: 'Clay', blurb: 'Questions and small edits', sparks: '1 spark', tone: '#9c8f7c' },
  { id: 'stone', label: 'Stone', blurb: 'Builds a feature end to end', sparks: '4 sparks', tone: '#6f8fa3' },
  { id: 'rune', label: 'Rune', blurb: 'Plans, builds, tests and fixes', sparks: '10 sparks', tone: '#8b74c4' },
];

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  running: boolean;
  disabled?: boolean;
  mode: GolemMode;
  onModeChange: (m: GolemMode) => void;
  providers: ProviderOption[];
  providerId: string | 'auto';
  onProviderChange: (id: string | 'auto') => void;
  autoReasoning?: string;
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
  providers,
  providerId,
  onProviderChange,
  autoReasoning,
  seed,
  placeholder,
}: Props) {
  const [text, setText] = useState('');
  const [modeOpen, setModeOpen] = useState(false);
  const [provOpen, setProvOpen] = useState(false);
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

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[1]!;
  const activeProvider = providers.find((p) => p.id === providerId);
  const providerLabel = providerId === 'auto' ? 'Auto' : (activeProvider?.label ?? 'Auto');

  return (
    <form className="gx-composer" onSubmit={submit}>
      <div className="gx-composer__inner">
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
          placeholder={placeholder ?? 'Describe what you want to build…'}
          disabled={disabled}
        />

        <div className="gx-composer__bar">
          {/* ------------------------------------------------- mode ----- */}
          <div className="gx-pop-wrap">
            <button
              type="button"
              className="gx-chip"
              aria-haspopup="menu"
              aria-expanded={modeOpen}
              onClick={() => {
                setProvOpen(false);
                setModeOpen((v) => !v);
              }}
            >
              <span className="gx-chip__swatch" style={{ background: activeMode.tone }} />
              {activeMode.label}
              <span className="gx-chip__caret">
                <Icon d="M6 9l6 6 6-6" size={11} />
              </span>
            </button>
            <Popover open={modeOpen} onClose={() => setModeOpen(false)} label="Mode">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={m.id === mode}
                  className="gx-pop__item"
                  onClick={() => {
                    onModeChange(m.id);
                    setModeOpen(false);
                  }}
                >
                  <span className="gx-chip__swatch" style={{ background: m.tone }} />
                  <span className="gx-pop__main">
                    {m.label}
                    <span className="gx-pop__sub">
                      {m.blurb} · {m.sparks}
                    </span>
                  </span>
                </button>
              ))}
            </Popover>
          </div>

          {/* --------------------------------------------- provider ----- */}
          <div className="gx-pop-wrap">
            <button
              type="button"
              className="gx-chip"
              aria-haspopup="menu"
              aria-expanded={provOpen}
              title="Model backend"
              onClick={() => {
                setModeOpen(false);
                setProvOpen((v) => !v);
              }}
            >
              {providerLabel}
              <span className="gx-chip__caret">
                <Icon d="M6 9l6 6 6-6" size={11} />
              </span>
            </button>
            <Popover open={provOpen} onClose={() => setProvOpen(false)} label="Model backend">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={providerId === 'auto'}
                className="gx-pop__item"
                onClick={() => {
                  onProviderChange('auto');
                  setProvOpen(false);
                }}
              >
                <span className="gx-pop__main">
                  Auto
                  <span className="gx-pop__sub">
                    {autoReasoning ?? 'Picks the best available model for the task'}
                  </span>
                </span>
              </button>

              <div className="gx-pop__sep" />

              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={p.id === providerId}
                  aria-disabled={!p.available}
                  className="gx-pop__item"
                  onClick={() => {
                    if (!p.available) return;
                    onProviderChange(p.id);
                    setProvOpen(false);
                  }}
                >
                  {/* Text labels, not logos. No official, licensed brand asset
                      could be obtained for these providers, and inventing or
                      scraping one would be worse than a clean word. */}
                  <span className="gx-pop__main">
                    {p.label}
                    <span className="gx-pop__sub">
                      {p.available ? 'Available' : (p.reason ?? 'Unavailable')}
                    </span>
                  </span>
                </button>
              ))}

              {providers.length === 0 && (
                <p className="gx-pop__note">Couldn&rsquo;t load the model list. Auto still works.</p>
              )}
            </Popover>
          </div>

          {/* ------------------------------------------------- send ----- */}
          <div className="gx-composer__send">
            {running ? (
              <button type="button" className="gx-btn gx-btn--outline" onClick={onStop}>
                <Icon d={PATH.stop} size={13} />
                Stop
              </button>
            ) : (
              <button type="submit" className="gx-btn gx-btn--solid" disabled={!text.trim() || disabled}>
                Send
                <Icon d={PATH.send} size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
