/**
 * WHAT APPLE DID TO YOUR PLACE, AS A LIST.
 *
 * The worker has recorded every Studio op since the oplog existed — the op, whether it worked, the
 * typed failure kind when it did not, and the run that asked for it — and served the whole thing at
 * `/api/projects/:id/studio/diagnostics`. Nothing in this app had ever called that route. The only
 * way a user could reach a single oplog row was to search for a word from the error text of a
 * failure, which requires already knowing what went wrong.
 *
 * The one thing it must never do is claim to be complete when it is not. The worker now says
 * whether there is another page; when there is, this shows the button, and when the list truly ends
 * it says so. "Show more" quietly disappearing and "that is everything" are different sentences and
 * this panel keeps them apart.
 */
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStudioDiagnostics, type StudioDiagnostics } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import { Failure } from '../failure';
import { activityRows, type ActivityRow, type OpLogRow } from './op-vocabulary';

const PAGE = 40;

export function StudioActivity({ projectId, onOpenRun }: { projectId: string; onOpenRun?: (runId: string) => void }) {
  // Pages already fetched, appended. Held here rather than in the query key so "show more" adds to
  // the list the user is reading instead of replacing it.
  const [older, setOlder] = useState<OpLogRow[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const first = useQuery<StudioDiagnostics>({
    queryKey: ['studio-activity', projectId],
    queryFn: () => fetchStudioDiagnostics(projectId, { limit: PAGE }),
    enabled: projectId !== '',
    retry: false,
  });

  const nextBefore = cursor ?? first.data?.nextBefore ?? null;

  const loadMore = useCallback(async () => {
    if (nextBefore === null) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchStudioDiagnostics(projectId, { limit: PAGE, before: nextBefore });
      setOlder((list) => [...list, ...page.recentOps]);
      setCursor(page.nextBefore);
      // The worker answers `nextBefore: null` for the last page, and that is the ONLY thing that
      // ends this list. Inferring the end from a short page would stop early on the day the
      // database returns fewer rows than asked for a different reason.
      if (page.nextBefore === null) setEnded(true);
    } catch (e) {
      // A page that failed to load must not look like the end of the history.
      setMoreError(e instanceof Error ? e.message : 'Could not read more activity.');
    } finally {
      setLoadingMore(false);
    }
  }, [nextBefore, projectId]);

  if (first.isPending) return <p className="gx-empty">Reading what Apple did in Studio…</p>;
  if (first.isError) return <Failure error={first.error} onRetry={() => void first.refetch()} compact />;

  const rows: ActivityRow[] = activityRows([...(first.data?.recentOps ?? []), ...older]);

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
            {r.sentence}
            <span className="gx-row__meta">
              {relativeTime(r.at)}
              {/* The typed failure kind, not a guess from the sentence. op-failure.ts is what
                  decides whether something was refused, timed out or never left the worker, and
                  that distinction is the difference between "try again" and "do not". */}
              {!r.ok && ` · failed${r.failure ? ` (${r.failure})` : ''}`}
            </span>
            {r.detail && <span className="gx-op__detail">{r.detail}</span>}
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
          {moreError} — the history is longer than what is shown.
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
