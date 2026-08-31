// The composer: the message box, the model chip, the mode chip and send.
//
// The reference renders the left-hand chip as a model name. In this product
// that control is the PROVIDER picker, whose availability is computed
// server-side from the credentials this deployment actually holds — so the form
// is the reference's, and the meaning is this product's. A backend with no
// credential is listed and disabled with the server's own reason; it is never
// shown as usable, and if the selected one stops being reachable the chip falls
// back to Auto rather than lying about what will run.
//
// Mode and provider are DIFFERENT AXES and stay two separate controls. Clay /
// Stone / Rune are product modes — how much autonomy and budget a request gets.
// The providers are model backends. Collapsing them into one menu would make
// "Stone" and "Gemini" look like alternatives to each other, which they are not.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { GolemMode } from '@golem/shared';
import { GolemGlyph } from '../glyphs';
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

const PLACEHOLDER = 'Ask anything about your project...';

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

  // If the picked backend stops being reachable, drop back to Auto instead of
  // displaying a model that cannot run. Only acts on a loaded list, so a
  // pending fetch never clears a valid choice.
  useEffect(() => {
    if (providerId === 'auto' || providers.length === 0) return;
    const chosen = providers.find((p) => p.id === providerId);
    if (!chosen || !chosen.available) onProviderChange('auto');
  }, [providers, providerId, onProviderChange]);

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
  const chosenProvider = providers.find((p) => p.id === providerId);
  const providerLabel = providerId === 'auto' || !chosenProvider?.available ? 'Auto' : chosenProvider.label;

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
          {/* ------------------------------------------------- model ---- */}
          <div className="gx-pop-wrap">
            <button
              type="button"
              className="gx-chip gx-chip--model"
              aria-haspopup="menu"
              aria-expanded={provOpen}
              aria-label={`Model backend: ${providerLabel}`}
              onClick={() => {
                setModeOpen(false);
                setProvOpen((v) => !v);
              }}
            >
              <span className="gx-chip__mark" aria-hidden="true">
                <GolemGlyph size={13} />
              </span>
              {providerLabel}
              <span className="gx-chip__caret" aria-hidden="true">
                <Icon d={PATH.chevronDown} size={11} />
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

          {/* -------------------------------------------------- mode ---- */}
          <div className="gx-pop-wrap">
            <button
              type="button"
              className="gx-chip"
              aria-haspopup="menu"
              aria-expanded={modeOpen}
              aria-label={`Mode: ${activeMode.label}`}
              onClick={() => {
                setProvOpen(false);
                setModeOpen((v) => !v);
              }}
            >
              <span className="gx-chip__swatch" style={{ background: activeMode.tone }} aria-hidden="true" />
              {activeMode.label}
              <span className="gx-chip__caret" aria-hidden="true">
                <Icon d={PATH.chevronDown} size={11} />
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
                  <span className="gx-chip__swatch" style={{ background: m.tone }} aria-hidden="true" />
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
