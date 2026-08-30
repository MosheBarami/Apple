// Chat composer: textarea (Enter sends), mode segmented control, Stop button,
// sparks cost hints, and a quota-exhausted state with reset countdown.
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

export function Composer({ disabledReason, running, quota, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<GolemMode>('stone');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const cost = MODE_INFO[mode].sparksPerRequest;
  const quotaExhausted = quota !== null && quota.sparksRemaining < cost;
  const resetIn = useCountdown(quotaExhausted && quota ? quota.resetsAtIso : null);

  const blocked = disabledReason !== null || running || quotaExhausted;
  const reason = disabledReason ?? (quotaExhausted ? `Out of Sparks for this mode — resets in ${resetIn ?? 'a moment'}` : null);

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

  const autoGrow = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(200, el.scrollHeight)}px`;
  };

  return (
    <div className="composer">
      <div className="composer-toolbar">
        <div className="mode-select" role="radiogroup" aria-label="Golem mode">
          {MODES.map((m) => {
            const info = MODE_INFO[m];
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={`mode-btn mode-btn-${m}${mode === m ? ' mode-btn-active' : ''}`}
                onClick={() => setMode(m)}
                title={`${info.name} — ${info.blurb} (${info.sparksPerRequest} ${info.sparksPerRequest === 1 ? 'spark' : 'sparks'})`}
              >
                <span className={`mode-dot mode-dot-${m}`} aria-hidden="true" />
                {info.name}
              </button>
            );
          })}
        </div>
        <span className="sparks-hint" title={`${MODE_INFO[mode].blurb}`}>
          <span aria-hidden="true">⚡</span> {cost} {cost === 1 ? 'spark' : 'sparks'}
          {quota && (
            <span className="sparks-remaining"> · {quota.sparksRemaining} left today</span>
          )}
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
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoGrow();
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={
            running
              ? 'Golem is working — you can stop it below'
              : `Describe what to build… (${MODE_INFO[mode].name} mode)`
          }
          aria-label="Message to Golem"
          disabled={disabledReason !== null}
        />
        {running ? (
          <button type="button" className="btn btn-danger composer-send" onClick={onStop}>
            ■ Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary composer-send"
            onClick={send}
            disabled={blocked || !text.trim()}
            aria-label="Send message"
          >
            Send
          </button>
        )}
      </div>
      <p className="composer-hint muted">Enter to send · Shift+Enter for a new line</p>
    </div>
  );
}
