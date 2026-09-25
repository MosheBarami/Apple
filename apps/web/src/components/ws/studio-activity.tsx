/** A readable Studio history. Raw diagnostics stay out of the customer view. */
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStudioOpLog, type StudioOpLog } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import { OP_LABEL, activityRows, type ActivityRow, type OpLogRow } from './op-vocabulary';
import { StudioIcon } from '../studio-icon';
import { classForOp } from '../studio-icon-model';

/** A typed failure gives guidance without exposing the worker or Studio's raw text. */
function failureGuidance(failure: string | null): string {
  switch (failure) {
    case 'transport': return 'This step did not reach Studio. Check the Studio connection, then ask Apple to try again.';
    case 'timeout': return 'Studio did not confirm this step. Check your place before trying again; the change may already be there.';
    case 'not_found': return 'Apple could not find what it needed. Check that it is still in your place, then ask Apple to try again.';
    case 'conflict': return 'Your place changed before this step finished. Ask Apple to look again and adjust its plan.';
    case 'refused': return 'Studio did not allow this step. Ask Apple what needs to change before trying again.';
    case 'invalid': return 'Apple could not use this step as requested. Ask Apple to try another way.';
    default: return 'Apple could not finish this step. Ask Apple to try another way.';
  }
}

const PAGE = 40;

export function StudioActivity({ projectId, onOpenRun }: { projectId: string; onOpenRun?: (runId: string) => void }) {
  // Pages already fetched, appended. Held here rather than in the query key so "show more" adds to
  // the list the user is reading instead of replacing it.
  const [older, setOlder] = useState<OpLogRow[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  const first = useQuery<StudioOpLog>({
    queryKey: ['studio-activity', projectId],
    queryFn: () => fetchStudioOpLog(projectId, { limit: PAGE }),
    enabled: projectId !== '',
    retry: false,
  });

  const nextBefore = cursor ?? first.data?.nextBefore ?? null;

  const loadMore = useCallback(async () => {
    if (nextBefore === null) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await fetchStudioOpLog(projectId, { limit: PAGE, before: nextBefore });
      setOlder((list) => [...list, ...page.recentOps]);
      setCursor(page.nextBefore);
      // The worker answers `nextBefore: null` for the last page, and that is the ONLY thing that
      // ends this list. Inferring the end from a short page would stop early on the day the
      // database returns fewer rows than asked for a different reason.
      if (page.nextBefore === null) setEnded(true);
    } catch {
      // A page that failed to load must not look like the end of the history.
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [nextBefore, projectId]);

  if (first.isPending) return <p className="gx-empty">Reading what Apple did in Studio…</p>;
  if (first.isError) return (
    <div role="alert">
      <p>Apple could not load your Studio history. Your place has not been changed by opening this list.</p>
      <button type="button" className="gx-btn gx-btn--outline" onClick={() => void first.refetch()}>Try again</button>
    </div>
  );

  const raw: OpLogRow[] = [...(first.data?.recentOps ?? []), ...older];
  const rows: ActivityRow[] = activityRows(raw);

  if (rows.length === 0) {
    return (
      <p className="gx-empty">
        Nothing yet. Every change Apple makes inside Studio is recorded here — connect Studio and ask
        for something.
      </p>
    );
  }

  const atEnd = ended || nextBefore === null;

  return (
    <div>
      {rows.map((r) => (
        <div key={r.id} className={`gx-row gx-op${r.ok ? '' : ' is-bad'}`}>
          <span className="gx-row__main">
            {/* The object the op acted on, as Studio draws it. An op on no object has none. */}
            {classForOp(r.kind) && <StudioIcon robloxClass={classForOp(r.kind)} />}
            {r.ok ? (OP_LABEL[r.kind] ? r.sentence : 'Worked in Studio') : 'A Studio step could not be completed'}
            <span className="gx-row__meta">
              {relativeTime(r.at)}
            </span>
            {!r.ok && <span className="gx-op__detail">{failureGuidance(r.failure)}</span>}
          </span>
          {/* Only when the row really belongs to a run. An op taken between runs — a manual
              checkpoint — belongs to no conversation, and a button that scrolls nowhere is worse
              than no button. */}
          {r.runId && onOpenRun && (
            <button type="button" className="gx-btn gx-btn--outline" onClick={() => onOpenRun(r.runId as string)}>
              Open the run
            </button>
          )}
        </div>
      ))}

      {moreError && (
        <p className="gx-pop__note" role="alert" style={{ padding: 0 }}>
          Apple could not load older activity. Your history may be longer than what is shown. Try again.
        </p>
      )}

      {atEnd ? (
        <p className="gx-pop__note" style={{ padding: 0 }}>
          That is the whole record.
        </p>
      ) : (
        <button type="button" className="gx-btn gx-btn--outline" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Reading…' : 'Show older activity'}
        </button>
      )}
    </div>
  );
}
