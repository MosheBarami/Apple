// The project's history in the Checkpoints drawer: its real checkpoints, grouped by the request that made them
// (lib/checkpoint-history.ts says how, and what it will not guess). Every row is a checkpoint the API returned, with the fields it
// returned: who took it, when, what it holds, and a Restore. Nothing is invented to fill a group.
import type { CheckpointMeta } from '@studpilot/shared';
import { checkpointAuthorView } from '../../lib/checkpoint-author';
import { clockOrDate, formatSettings, fullStamp } from '../../lib/format';
import { fidelityLine, restoreSentence, restoreTone, type RestoreStatus } from '../../lib/restore-status';
import type { HistoryGroup } from '../../lib/checkpoint-history';
import './checkpoint-history.css';

export const HISTORY_NOTE = 'Each request, and the checkpoints StudPilot took while it ran. Checkpoints you saved yourself are kept apart.';

function CheckpointRow({
  c,
  userId,
  memberNames,
  restoreStatus,
  restoreBusy,
  studioConnected,
  onRestore,
}: { c: CheckpointMeta } & Omit<CheckpointHistoryProps, 'groups'>) {
  return (
    <div className="gx-row">
      <span className="gx-row__main">
        {c.label}
        <span className="gx-row__meta">
          {/* WHO, first. The row carried a timestamp and two counts and never said whose work it was — and the one surface that claimed an
              author guessed it from the kind, so on a shared project a teammate's checkpoint read as yours. This says "Another member" or
              "Author not recorded" rather than picking the reader, which is the wrong guess in exactly the argument the field exists for. */}
          {checkpointAuthorView(c, userId, memberNames).label} · {new Date(c.createdAt).toLocaleString(formatSettings().locale)} ·{' '}
          {c.instanceCount} objects · {c.scriptCount} scripts
        </span>
        {/* The authored sentence, under the derived numbers. Shown verbatim and never truncated in the markup: the worker already caps it
            at 500 characters, and a second cap here would hide the end of somebody's own words for no reason. */}
        {c.description && <span className="gx-cp__desc">{c.description}</span>}
        {c.coverage === 'supported-subset' && (
          <span className="gx-cp__desc">Restores supported objects; protected engine objects are preserved rather than rolled back.</span>
        )}
        {/* THE RESTORE, WHILE IT IS HAPPENING AND WHEN IT IS OVER. Anchored under the checkpoint it belongs to rather than floating at the top
            of the drawer: a list of twenty rows and one status line elsewhere makes the reader work out which one it is about. */}
        {restoreStatus?.checkpointId === c.id && (
          <span className={`gx-restore is-${restoreTone(restoreStatus)}`} role="status">
            {restoreSentence(restoreStatus)}
            {fidelityLine(restoreStatus.fidelity) && <span className="gx-restore__counts">{fidelityLine(restoreStatus.fidelity)}</span>}
          </span>
        )}
      </span>
      <button type="button" className="gx-btn gx-btn--outline" disabled={!studioConnected || restoreBusy} onClick={() => onRestore(c)}>
        {restoreBusy && restoreStatus?.checkpointId === c.id ? 'Restoring…' : 'Restore'}
      </button>
    </div>
  );
}

export interface CheckpointHistoryProps {
  groups: readonly HistoryGroup[];
  userId: string | null;
  memberNames: Record<string, string | null>;
  restoreStatus: RestoreStatus | null;
  restoreBusy: boolean;
  studioConnected: boolean;
  /** The person pressed Restore on this checkpoint. The caller confirms and restores; this draws only. */
  onRestore: (checkpoint: CheckpointMeta) => void;
}

export function CheckpointHistory({ groups, ...row }: CheckpointHistoryProps) {
  return (
    <div className="gx-history">
      {groups.map((group, index) => {
        const key = group.kind === 'request' ? `r:${group.request.id}` : group.kind;
        const headingId = `gx-history-${index}`;
        return (
          <section key={key} className="gx-history__group" aria-labelledby={headingId}>
            <h3 className="gx-history__heading" id={headingId}>
              {group.kind === 'request' ? (
                <>
                  <span className="gx-history__request" dir="auto">{group.request.text}</span>
                  <time className="gx-history__when" dateTime={new Date(group.request.at).toISOString()} title={fullStamp(group.request.at)}>
                    {/* The time alone when it is today, with the date when it is not: a history spans days, and two requests
                        at "4:27 PM" are two different afternoons. */}
                    {clockOrDate(group.request.at)}
                  </time>
                </>
              ) : group.kind === 'saved' ? (
                'Saved by you'
              ) : (
                'Earlier work'
              )}
            </h3>
            {group.checkpoints.map((c) => (
              <CheckpointRow key={c.id} c={c} {...row} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
