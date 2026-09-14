// Searching the conversation.
//
// The results come from the worker, over every message, not from filtering what the workspace
// happens to hold — see apps/worker/src/do/session.ts. That distinction is invisible until it
// matters, and when it matters it is the difference between "no results" and "no results in the
// last hundred messages", which the user cannot tell apart.
//
// The typing behaviour is the part that needs care. A request per keystroke is both wasteful and
// wrong-looking: results flash through intermediate states as the query grows, and a slow response
// for "do" can land after the response for "door" and overwrite it. So: debounce, and drop any
// response that is not for the query currently in the box.
import { useEffect, useRef, useState } from 'react';
import { ApiError, searchConversation, type SearchHit } from '../../lib/api';
import { shortRelative } from '../../lib/format';

const DEBOUNCE_MS = 220;
const MIN_QUERY = 2;

export function SearchPanel({
  projectId,
  onJump,
}: {
  projectId: string;
  onJump: (messageId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [more, setMore] = useState(false);
  // What the newest request was for. A response for anything else is stale and is dropped.
  const inFlight = useRef('');

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setState('idle');
      setHits([]);
      setMore(false);
      inFlight.current = '';
      return;
    }
    setState('loading');
    const timer = setTimeout(async () => {
      inFlight.current = q;
      try {
        const res = await searchConversation(projectId, q);
        if (inFlight.current !== q) return; // a newer query is already outstanding
        setHits(res.results);
        setMore(res.more);
        setState('done');
      } catch (e) {
        if (inFlight.current !== q) return;
        setError(e instanceof ApiError ? e.message : 'Search failed');
        setState('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, projectId]);

  return (
    <div className="cs">
      <input
        className="cs__input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search this conversation…"
        aria-label="Search this conversation"
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />

      {/* Every state is named. A panel that shows nothing while it is thinking is indistinguishable
          from one that found nothing. */}
      {state === 'idle' && (
        <p className="cs__note">
          {query.trim().length ? `Keep typing — ${MIN_QUERY} characters at least.` : 'Searches every message, not just the ones on screen.'}
        </p>
      )}

      {state === 'loading' && (
        <p className="cs__note" aria-busy="true">
          Searching…
        </p>
      )}

      {state === 'error' && (
        <p className="cs__note cs__note--bad" role="alert">
          {error}
        </p>
      )}

      {state === 'done' && hits.length === 0 && (
        <p className="cs__note">
          Nothing in this conversation matches “{query.trim()}”.
        </p>
      )}

      {state === 'done' && hits.length > 0 && (
        <>
          <p className="cs__count">
            {hits.length} {hits.length === 1 ? 'message' : 'messages'}
            {more ? ' (showing the most recent — there are more)' : ''}
          </p>
          <ul className="cs__list">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button type="button" className="cs__hit" onClick={() => onJump(hit.id)}>
                  <span className="cs__meta">
                    {hit.role === 'user' ? 'You' : 'Apple'} · {shortRelative(hit.createdAt)}
                    {hit.occurrences > 1 && ` · ${hit.occurrences} matches`}
                  </span>
                  <span className="cs__snippet">
                    <Marked text={hit.snippet} start={hit.matchStart} length={hit.matchLength} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Highlight by the offset the server reported rather than searching the snippet again.
 *
 * Re-finding it here would be a second implementation of "what matched", and the two would
 * disagree on the first case-folding edge — the server matched case-insensitively, so a naive
 * client-side `indexOf` finds nothing and silently highlights nothing.
 */
function Marked({ text, start, length }: { text: string; start: number; length: number }) {
  if (length <= 0 || start < 0 || start + length > text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, start + length)}</mark>
      {text.slice(start + length)}
    </>
  );
}
