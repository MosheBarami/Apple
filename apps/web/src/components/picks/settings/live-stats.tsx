// "Right now": the few numbers that change while you watch, rolling as they change.
//
// Pick: Motion "Stats: Live panel" (Motion+ licence — re-implemented, nothing copied): a small
// panel with a pulsing Live mark, three figures whose digits roll to each new value, and a strip
// of bars where the newest one springs up at the end.
//
// "LIVE" IS ONLY SAID WHILE IT IS TRUE. The page re-asks the server on an interval (usage.tsx sets
// it) and this panel shows when it last heard back; if the last answer is older than two intervals
// the mark drops to "Paused" rather than pulsing over stale numbers.
import type { CSSProperties } from 'react';
import { formatNumber } from '../../../lib/format';
import { spring } from './motion';
import { RollingNumber } from './rolling-number';
import './live-stats.css';

export interface LiveStat {
  label: string;
  value: number;
}

export function LiveStats({
  stats,
  bars,
  updatedAt,
  intervalMs,
  now = Date.now(),
}: {
  stats: LiveStat[];
  /** Oldest first; the newest is drawn last and springs in. */
  bars: { key: string; value: number; label: string }[];
  updatedAt: number;
  intervalMs: number;
  now?: number;
}) {
  const live = updatedAt > 0 && now - updatedAt < intervalMs * 2;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const s = spring(300, 16);
  return (
    <section className="pk-live" aria-label="Right now" style={{ '--pk-live-ease': s.easing, '--pk-live-dur': `${s.duration}ms` } as CSSProperties}>
      <header className="pk-live__head">
        <h3 className="pk-live__title">Right now</h3>
        <span className={`pk-live__mark${live ? ' is-live' : ''}`}>
          <i aria-hidden="true" />
          {live ? 'Live' : 'Paused'}
        </span>
      </header>
      <dl className="pk-live__grid">
        {stats.map((st) => (
          <div key={st.label} className="pk-live__stat">
            <dt>{st.label}</dt>
            <dd>
              <RollingNumber value={formatNumber(st.value)} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="pk-live__bars" aria-hidden="true">
        {bars.map((b) => (
          <i key={b.key} title={b.label} style={{ '--h': Math.max(0.06, b.value / max) } as CSSProperties} />
        ))}
      </div>
    </section>
  );
}
