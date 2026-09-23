// Which days you built on, as a grid of squares.
//
// Pick: Componentry "Github Calendar" (MIT — adapted). Upstream draws a year of GitHub
// contributions: one column per week, one square per day, darker for busier days, squares
// springing in on a diagonal stagger, a tooltip on hover.
//
// ONLY THE WEEKS APPLE ACTUALLY KNOWS. The usage ledger is pruned at 35 days (lib/api.ts), so a
// full year here would be eleven months of empty squares claiming "you built nothing" about days
// nobody measured. The grid covers the five weeks the server can answer for, and says so.
import { useState, type CSSProperties } from 'react';
import { spring } from './motion';
import './activity-calendar.css';

export interface CalendarDay {
  day: string; // YYYY-MM-DD
  events: number;
  credits: number;
}

const WEEKS = 5;

function level(events: number, max: number): number {
  if (events <= 0) return 0;
  const f = events / Math.max(1, max);
  return f > 0.75 ? 4 : f > 0.5 ? 3 : f > 0.25 ? 2 : 1;
}

const longDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function ActivityCalendar({ days, today = new Date() }: { days: CalendarDay[]; today?: Date }) {
  const [tip, setTip] = useState<{ i: number; text: string } | null>(null);
  const byDay = new Map(days.map((d) => [d.day, d]));
  // End on today's column; start on the Sunday WEEKS-1 weeks before this week's.
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (WEEKS - 1) * 7 - end.getUTCDay());
  const cells: { day: string; events: number; credits: number; future: boolean }[] = [];
  for (let d = new Date(start), i = 0; i < WEEKS * 7; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const hit = byDay.get(key);
    cells.push({ day: key, events: hit?.events ?? 0, credits: hit?.credits ?? 0, future: d > end });
  }
  const max = Math.max(1, ...cells.map((c) => c.events));
  const active = cells.filter((c) => c.events > 0).length;
  const s = spring(260, 20);

  return (
    <div className="pk-cal" style={{ '--pk-cal-ease': s.easing, '--pk-cal-dur': `${s.duration}ms` } as CSSProperties}>
      <p className="pk-cal__head">
        <span>Days you built</span>
        <span className="pk-cal__total">
          {active} {active === 1 ? 'day' : 'days'} in the last {WEEKS} weeks
        </span>
      </p>
      <div className="pk-cal__grid" role="list" aria-label={`Building activity for the last ${WEEKS} weeks`} onMouseLeave={() => setTip(null)}>
        {cells.map((c, i) => {
          const text = c.future ? `${longDay(c.day)}: still to come` : `${longDay(c.day)}: ${c.events} ${c.events === 1 ? 'request' : 'requests'}, ${c.credits} Credits`;
          return (
            <span
              key={c.day}
              role="listitem"
              aria-label={text}
              className={`pk-cal__day l${c.future ? 0 : level(c.events, max)}${c.future ? ' is-future' : ''}`}
              style={{ '--w': Math.floor(i / 7), '--d': i % 7 } as CSSProperties}
              onMouseEnter={() => setTip({ i, text })}
            />
          );
        })}
        {tip && (
          <span
            className="pk-cal__tip"
            aria-hidden="true"
            style={{ '--w': Math.floor(tip.i / 7), '--d': tip.i % 7 } as CSSProperties}
          >
            {tip.text}
          </span>
        )}
      </div>
      <p className="pk-cal__legend" aria-hidden="true">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`pk-cal__day l${l}`} />
        ))}
        More
      </p>
    </div>
  );
}
