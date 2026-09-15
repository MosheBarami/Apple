// The faces in the topbar. Everything it decides lives in presence-model.ts; this draws the answer.
import { presenceView, type PresenceRow } from './presence-model';

export function PresenceBar({ present, selfUserId }: { present: readonly unknown[] | undefined; selfUserId: string | null }) {
  const view = presenceView(present, selfUserId);
  // Nothing at all when you are alone. A row that says "0 others" is a row that costs space to
  // report the absence of news.
  if (view.rows.length === 0) return null;
  return (
    <div className="gx-presence" role="group" aria-label={view.summary}>
      {view.rows.map((row: PresenceRow) => (
        <span key={row.userId} className={`gx-presence__face is-${row.activity}`} title={row.title} aria-hidden="true">
          {row.initials}
        </span>
      ))}
      {view.overflow > 0 && (
        <span className="gx-presence__more" title={view.summary} aria-hidden="true">
          +{view.overflow}
        </span>
      )}
    </div>
  );
}
