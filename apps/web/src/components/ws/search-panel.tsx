// Searching a project.
//
// The results come from the worker, over every record, not from filtering what the workspace
// happens to hold — see apps/worker/src/do/session.ts. That distinction is invisible until it
// matters, and when it matters it is the difference between "no results" and "no results in the
// last hundred messages", which the user cannot tell apart.
//
// FOUR THINGS HERE ARE EASY TO GET WRONG IN WAYS NOBODY NOTICES.
//
//   THE RACE. A request per keystroke is both wasteful and wrong-looking: results flash through
//   intermediate states as the query grows, and a slow response for "do" can land after the
//   response for "door" and overwrite it. So: debounce, and drop any response that is not for the
//   query currently in the box — filters included, since changing a filter is a new question.
//
//   THE FACETS. The count beside each type comes from the server computed with every filter EXCEPT
//   the type filter, so choosing "Checkpoints" does not zero every other count and strand the user
//   inside the facet they picked.
//
//   THE FILTER THE SERVER REFUSED. A value the worker could not read comes back in `ignored`, and
//   the panel says so out loud. The alternative is the failure this whole feature is built to
//   avoid: an answer to a question nobody asked, rendered as though it were the answer to theirs.
//
//   THE KEYBOARD. Results used to be plain buttons, so reaching the third one meant three tabs and
//   there was no way to open anything from the input. Arrow keys move a roving selection, Enter
//   opens it, and focus stays in the box where the typing is.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ApiError, searchProject, type SearchHit, type SearchResponse } from '../../lib/api';
import { shortRelative } from '../../lib/format';
import {
  AUTHOR_LABELS,
  EMPTY_FILTER,
  RANGE_LABELS,
  SEARCH_AUTHORS,
  SEARCH_TYPES,
  TYPE_LABELS,
  DATE_RANGES,
  MIN_QUERY,
  isFiltered,
  normaliseFilter,
  searchParams,
  toggleAuthor,
  toggleType,
  type DateRange,
  type PanelFilter,
  type SearchType,
} from '../../lib/search-filters';
import { readSearchHistory, rememberSearch, forgetSearch } from '../../lib/search-history';
import { readViewState, writeViewState } from '../../lib/view-state';
import './search-panel.css';

const DEBOUNCE_MS = 220;

/** What each kind of hit is called in the result list, in the singular the user reads. */
const TYPE_NOUN: Record<SearchType, string> = {
  message: 'Message',
  artifact: 'Artifact',
  checkpoint: 'Checkpoint',
  activity: 'Activity',
  memory: 'Memory',
};

// `teammate` is a result LABEL and not a filter chip: only checkpoints can carry it (messages
// still store a role and not a user id), and a chip that matches one record type reads as broken.
// Without the noun the raw token would render — see the `?? hit.author` fallback below.
const AUTHOR_NOUN: Record<string, string> = { you: 'You', apple: 'Apple', system: 'System', teammate: 'Someone else' };

export function SearchPanel({
  projectId,
  onOpen,
}: {
  projectId: string;
  /** Routed by the workspace: a message is jumped to, a checkpoint opens its drawer. */
  onOpen: (hit: SearchHit) => void;
}) {
  // Restored per project. A drawer that forgets the question you were in the middle of asking is
  // a drawer you stop using for anything that takes two looks.
  const [query, setQuery] = useState(() => readViewState(`search.q.${projectId}`, (raw) => (typeof raw === 'string' ? raw : '')));
  const [filter, setFilter] = useState<PanelFilter>(() => readViewState(`search.filter.${projectId}`, normaliseFilter));
  const [showFilters, setShowFilters] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [selected, setSelected] = useState(0);
  const [history, setHistory] = useState<string[]>(() => readSearchHistory(projectId));
  const listRef = useRef<HTMLDivElement>(null);
  // What the newest request was for. A response for anything else is stale and is dropped.
  const inFlight = useRef('');

  const hits = res?.results ?? [];
  const index = Math.min(selected, Math.max(0, hits.length - 1));

  useEffect(() => {
    writeViewState(`search.q.${projectId}`, query);
  }, [projectId, query]);
  useEffect(() => {
    writeViewState(`search.filter.${projectId}`, filter);
  }, [projectId, filter]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setState('idle');
      setRes(null);
      inFlight.current = '';
      return;
    }
    setState('loading');
    const params = searchParams(filter, q, Date.now());
    // The key includes the filters: changing one is a different question, and a response to the
    // previous question must not paint over the answer to this one.
    const key = params.toString();
    const timer = setTimeout(async () => {
      inFlight.current = key;
      try {
        const out = await searchProject(projectId, params);
        if (inFlight.current !== key) return; // a newer query is already outstanding
        setRes(out);
        setSelected(0);
        setState('done');
      } catch (e) {
        if (inFlight.current !== key) return;
        setError(e instanceof ApiError ? e.message : 'Search failed');
        setState('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, filter, projectId]);

  // Remember the question, not the typing. Every keystroke passes through the box, so recording
  // what was TYPED fills the list with "d", "do", "doo" and buries the entry worth keeping.
  // A query is committed when the user acts on it — opens a result, presses Enter — or when the
  // panel closes with that question still on screen.
  const commit = useRef<() => void>(() => {});
  commit.current = () => {
    if (query.trim().length >= MIN_QUERY && state === 'done') setHistory(rememberSearch(projectId, query));
  };
  useEffect(() => () => commit.current(), []);

  const open = useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return;
      commit.current();
      onOpen(hit);
    },
    [onOpen],
  );

  // Layout effect so the scroll lands in the same frame as the highlight; in a passive effect the
  // row visibly jumps after the fact.
  useLayoutEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, hits.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => (hits.length ? (Math.min(i, hits.length - 1) + 1) % hits.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => (hits.length ? (Math.min(i, hits.length - 1) + hits.length - 1) % hits.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      open(hits[index]);
    } else if (e.key === 'Home' && hits.length) {
      e.preventDefault();
      setSelected(0);
    } else if (e.key === 'End' && hits.length) {
      e.preventDefault();
      setSelected(hits.length - 1);
    }
  };

  const counts = res?.counts;
  const filtered = isFiltered(filter);
  const clearFilters = () => setFilter(EMPTY_FILTER);

  const ignoredText = useMemo(() => (res?.ignored?.length ? res.ignored.join(', ') : ''), [res]);

  return (
    <div className="cs">
      <div className="cs__bar">
        <input
          className="cs__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search this project…"
          aria-label="Search this project"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="cs-results"
          aria-activedescendant={hits[index] ? `cs-hit-${hits[index].id}` : undefined}
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className={`cs__filters-toggle${filtered ? ' is-on' : ''}`}
          aria-expanded={showFilters}
          aria-controls="cs-filters"
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters{filtered ? ' ·' : ''}
          {filtered && <span className="cs__filters-dot" aria-label="filters are applied" />}
        </button>
      </div>

      {/* The type facets sit outside the collapsed panel: they are the filter people reach for, and
          each one carries what it would find, so choosing is informed rather than a guess. */}
      <div className="cs__facets" role="group" aria-label="Filter by kind">
        <button
          type="button"
          className={`cs__facet${filter.types.length === 0 ? ' is-on' : ''}`}
          aria-pressed={filter.types.length === 0}
          onClick={() => setFilter({ ...filter, types: [] })}
        >
          Everything
        </button>
        {SEARCH_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`cs__facet${filter.types.includes(t) ? ' is-on' : ''}`}
            aria-pressed={filter.types.includes(t)}
            onClick={() => setFilter(toggleType(filter, t))}
          >
            {TYPE_LABELS[t]}
            {counts ? <span className="cs__facet-count">{counts[t] ?? 0}</span> : null}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="cs__filters" id="cs-filters">
          <div className="cs__filter-row" role="group" aria-label="Filter by who wrote it">
            <span className="cs__filter-label">Written by</span>
            <button
              type="button"
              className={`cs__facet${filter.authors.length === 0 ? ' is-on' : ''}`}
              aria-pressed={filter.authors.length === 0}
              onClick={() => setFilter({ ...filter, authors: [] })}
            >
              Anyone
            </button>
            {SEARCH_AUTHORS.map((a) => (
              <button
                key={a}
                type="button"
                className={`cs__facet${filter.authors.includes(a) ? ' is-on' : ''}`}
                aria-pressed={filter.authors.includes(a)}
                onClick={() => setFilter(toggleAuthor(filter, a))}
              >
                {AUTHOR_LABELS[a]}
              </button>
            ))}
          </div>

          <div className="cs__filter-row">
            <label className="cs__filter-label" htmlFor="cs-range">
              When
            </label>
            <select
              id="cs-range"
              className="cs__select"
              value={filter.range}
              onChange={(e) => setFilter({ ...filter, range: e.target.value as DateRange })}
            >
              {DATE_RANGES.map((r) => (
                <option key={r} value={r}>
                  {RANGE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {filter.range === 'custom' && (
            <div className="cs__filter-row">
              <label className="cs__filter-label" htmlFor="cs-from">
                From
              </label>
              <input
                id="cs-from"
                type="date"
                className="cs__date"
                value={filter.from}
                onChange={(e) => setFilter({ ...filter, from: e.target.value })}
              />
              <label className="cs__filter-label" htmlFor="cs-to">
                To
              </label>
              <input
                id="cs-to"
                type="date"
                className="cs__date"
                value={filter.to}
                onChange={(e) => setFilter({ ...filter, to: e.target.value })}
              />
            </div>
          )}

          {filtered && (
            <button type="button" className="cs__clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Every state is named. A panel that shows nothing while it is thinking is indistinguishable
          from one that found nothing. */}
      {state === 'idle' && (
        <>
          <p className="cs__note">
            {query.trim().length
              ? `Keep typing — ${MIN_QUERY} characters at least.`
              : 'Searches every message, artifact, checkpoint and memory in this project — not just what is on screen.'}
          </p>
          {history.length > 0 && (
            <div className="cs__history">
              <p className="cs__history-head">Recent searches</p>
              <ul className="cs__history-list">
                {history.map((h) => (
                  <li key={h}>
                    <button type="button" className="cs__history-item" onClick={() => setQuery(h)}>
                      {h}
                    </button>
                    <button
                      type="button"
                      className="cs__history-forget"
                      aria-label={`Forget “${h}”`}
                      onClick={() => setHistory(forgetSearch(projectId, h))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
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

      {/* A filter the server could not read is announced before any result count, because a blank
          list under a broken filter reads as "there is nothing here". */}
      {state === 'done' && res?.impossible && (
        <p className="cs__note cs__note--bad" role="alert">
          Nothing was searched — {ignoredText} could not be read as a filter.{' '}
          <button type="button" className="cs__inline-btn" onClick={clearFilters}>
            Clear filters
          </button>
        </p>
      )}

      {state === 'done' && !res?.impossible && ignoredText && (
        <p className="cs__note cs__note--warn" role="status">
          Ignored: {ignoredText}. Everything else was applied.
        </p>
      )}

      {state === 'done' && !res?.impossible && hits.length === 0 && (
        <p className="cs__note">
          Nothing in this project matches “{query.trim()}”
          {filtered ? ' with these filters' : ''}.
          {filtered && (
            <>
              {' '}
              <button type="button" className="cs__inline-btn" onClick={clearFilters}>
                Search everything
              </button>
            </>
          )}
        </p>
      )}

      {state === 'done' && hits.length > 0 && (
        <>
          <p className="cs__count">
            {res && res.total > hits.length
              ? `${hits.length} best of ${res.total} matches`
              : `${hits.length} ${hits.length === 1 ? 'result' : 'results'}`}
          </p>
          {res?.scanTruncated && (
            <p className="cs__note cs__note--warn" role="status">
              This project is large enough that the oldest records were not scanned — there may be
              more.
            </p>
          )}
          <div className="cs__list" id="cs-results" role="listbox" aria-label="Search results" ref={listRef}>
            {hits.map((hit, i) => (
              <div
                key={hit.id}
                id={`cs-hit-${hit.id}`}
                role="option"
                aria-selected={i === index}
                data-selected={i === index ? 'true' : 'false'}
                className={`cs__hit${i === index ? ' is-selected' : ''}`}
                // mousedown, not click: click fires after blur, and the selection would have
                // already moved out from under the pointer.
                onMouseDown={(e) => {
                  e.preventDefault();
                  open(hit);
                }}
                onMouseMove={() => setSelected(i)}
              >
                <span className="cs__meta">
                  <span className="cs__kind">{TYPE_NOUN[hit.type]}</span>
                  {' · '}
                  {AUTHOR_NOUN[hit.author] ?? hit.author} · {shortRelative(hit.createdAt)}
                  {hit.occurrences > 1 && ` · ${hit.occurrences} matches`}
                </span>
                {hit.title && hit.matchedIn !== 'title' && <span className="cs__title">{hit.title}</span>}
                <span className="cs__snippet">
                  <Marked text={hit.snippet} start={hit.matchStart} length={hit.matchLength} />
                </span>
              </div>
            ))}
          </div>
          <p className="cs__foot" dir="ltr">
            <kbd>↑</kbd>
            <kbd>↓</kbd> move · <kbd>↵</kbd> open
          </p>
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
