/**
 * THE ONE SENTENCE UNDER THE STUDIO PILL.
 *
 * The pill answers a boolean. This answers the questions a person actually has when the answer is
 * no — when did Studio last poll, how much work is waiting for it, how slow is the round trip, and
 * is Studio even holding the right place open. The worker has measured every one of those for a
 * long time and put them on the wire; nothing in this app read them, and every formatter in
 * lib/studio-connection.ts had exactly one caller in the repository, its own test.
 *
 * WHY THIS IS A COMPONENT AND NOT A LINE IN workspace.tsx. The dated sentence has to re-render on a
 * clock — "Studio last connected 4 minutes ago" frozen at four minutes for an hour is worse than no
 * timestamp at all, because it is a stale measurement presented as a live one. Keeping the interval
 * here means the tick re-renders one paragraph rather than the whole workspace.
 *
 * WHY THE LIVE REGION IS CONDITIONAL. A `role="status"` that updates every thirty seconds reads
 * "Studio last connected 5 minutes ago… 6 minutes ago…" aloud forever. The mismatch sentence is the
 * one that does not tick — `linkDetail`'s mismatch branch never touches the clock — and it is also
 * the one worth interrupting for, because it is the state where the pill is green and nothing will
 * ever build. So exactly that sentence is announced and the ticking one is not.
 */
import { useEffect, useState } from 'react';
import { linkDetail, type StudioConnection, type StudioLinkFacts } from '../../lib/studio-connection';
import './studio-link-note.css';

export function StudioLinkNote({
  status,
  facts,
  onRebind,
}: {
  status: StudioConnection;
  facts: StudioLinkFacts;
  /** Bind this project to whatever place Studio has open now. Absent while nothing can be rebound. */
  onRebind?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const detail = linkDetail(status, facts, now);
  // Nothing worth saying is said. A healthy, quiet link draws no strip at all rather than a row
  // reading "everything is fine", which is the kind of chrome that trains people to stop looking.
  if (!detail) return null;

  const mismatch = facts.placeMismatch !== null;
  return (
    <div
      className={`gx-link-note${mismatch ? ' gx-link-note--warn' : ''}`}
      {...(mismatch ? { role: 'status' as const } : {})}
    >
      <span className="gx-link-note__text">{detail}</span>
      {mismatch && onRebind && (
        // The sentence names a problem the user is the only one who can fix, and until now it
        // named it with nowhere to click. The route behind this has existed since the place guard
        // shipped: POST /api/projects/:id/studio/place/rebind.
        <button type="button" className="gx-btn gx-btn--outline gx-link-note__act" onClick={onRebind}>
          Use this place instead
        </button>
      )}
    </div>
  );
}
