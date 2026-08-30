// Chat composer: mode picker, autosizing textarea, Stop, and the honest cost
// hint. Sparks numbers come from @golem/shared and the live quota — nothing is
// hard-coded here, because a run is billed from the compute it actually uses.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MODE_INFO, type GolemMode, type QuotaState } from '@golem/shared';
import { countdownTo } from '../lib/format';

const MODES: GolemMode[] = ['clay', 'stone', 'rune'];

interface ComposerProps {
  disabledReason: string | null;
  running: boolean;
  quota: QuotaState | null;
  onSend: (text: string, mode: GolemMode) => void;
  onStop: () => void;
  onModeChange?: (mode: GolemMode) => void;
  /** Text injected from a suggestion chip. */
  seed?: string;
}

function useCountdown(iso: string | null): string | null {
  const [text, setText] = useState<string | null>(iso ? countdownTo(iso) : null);
  useEffect(() => {
    if (!iso) {
      setText(null);
      return;
    }
    setText(countdownTo(iso));
    const t = window.setInterval(() => setText(countdownTo(iso)), 1000);
    return () => window.clearInterval(t);
  }, [iso]);
  return text;
}

export function Composer({ disabledReason, running, quota, onSend, onStop, onModeChange, seed }: ComposerProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<GolemMode>('stone');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(192, el.scrollHeight)}px`;
  };

  useEffect(() => {
    if (!seed) return;
    setText(seed);
    const el = areaRef.current;
    if (el) {
      el.focus();
      requestAnimationFrame(autoGrow);
    }
  }, [seed]);

  const info = MODE_INFO[mode];
  const cost = info.sparksPerRequest;
  const quotaExhausted = quota !== null && quota.sparksRemaining < cost;
  const resetIn = useCountdown(quotaExhausted && quota ? quota.resetsAtIso : null);

  const blocked = disabledReason !== null || running || quotaExhausted;
  const reason =
    disabledReason ?? (quotaExhausted ? `Out of Sparks for this mode — resets in ${resetIn ?? 'a moment'}` : null);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || blocked) return;
    onSend(trimmed, mode);
    setText('');
    if (areaRef.current) areaRef.current.style.height = 'auto';
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const pickMode = (m: GolemMode) => {
    setMode(m);
    onModeChange?.(m);
  };

  return (
    <div className={`composer is-${mode}`}>
      <div className="composer-inner">
        <div className="composer-toolbar">
          <div className="mode-select" role="radiogroup" aria-label="Golem mode">
            {MODES.map((m) => {
              const meta = MODE_INFO[m];
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  className={`mode-btn${mode === m ? ' mode-btn-active' : ''}`}
                  onClick={() => pickMode(m)}
                  title={`${meta.name} — ${meta.blurb} (typically ${meta.typicalSparks} Sparks)`}
                >
                  <span className={`mode-dot mode-dot-${m}`} aria-hidden="true" />
                  {meta.name}
                </button>
              );
            })}
          </div>
          <span className="sparks-hint" title={info.blurb}>
            typically {info.typicalSparks} Sparks
            {quota && <span className="sparks-remaining"> · {quota.sparksRemaining} left today</span>}
          </span>
        </div>

        {reason && !running && (
          <p className="composer-reason" role="status">
            {reason}
          </p>
        )}

        <div className="composer-row">
          <textarea
            ref={areaRef}
            id="golem-composer"
            name="message"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow();
            }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={running ? 'Golem is working — you can stop it' : `Describe what to build… (${info.name})`}
            aria-label="Message to Golem"
            disabled={disabledReason !== null}
          />
          {running ? (
            <button type="button" className="btn btn-danger btn-sm composer-send" onClick={onStop}>
              <span aria-hidden="true">■</span> Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm composer-send"
              onClick={send}
              disabled={blocked || !text.trim()}
            >
              Send
            </button>
          )}
        </div>
        <p className="composer-hint">Enter to send · Shift + Enter for a new line</p>
      </div>
    </div>
  );
}
