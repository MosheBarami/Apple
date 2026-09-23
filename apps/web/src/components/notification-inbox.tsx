// The bell, and the only place in the product where something that happened while you were away
// is still there when you come back.
//
// Everything this app could tell you, it told you over a WebSocket to a tab that happened to be
// open: `msg_end` for a finished run, an `error` frame for a failed one. Close the tab and the
// outcome was not delayed, it was gone. The worker has had the other half — a stored inbox, an
// unread count, a collapsed view, quiet hours and a deep link per row — and nothing here ever
// asked it for any of it.
//
// THREE DECISIONS WORTH KNOWING, all of them the server's and copied here on purpose:
//
//   * ONE REQUEST. `items`, `groups` and `unread` ride together because a collapsed heading read at
//     one instant and a list read at another disagree often enough for somebody to file it.
//   * THE COUNT COMES BACK FROM THE WRITE. `mark all read` does not touch a row quiet hours is
//     still holding, so "everything" frequently leaves something unread and the badge has to say
//     so rather than assume zero.
//   * COLLAPSED FIRST. Twelve failures of one run are one row with a count on it; twelve mentions
//     across a project are twelve things a person wants to read. The grouping decides which, and it
//     was decided on the server where the rows are.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNotifications, markNotificationsRead } from '../lib/api';
import {
  badgeText,
  kindLabel,
  markedInbox,
  rowsOfGroup,
  routePathFor,
  severityClass,
  unreadIdsOf,
  type InboxResponse,
  type NotificationRow,
} from '../lib/notification-inbox.ts';
import { shortRelative } from '../lib/format';
import { Icon, PATH, Popover } from './ws/primitives';
import './notification-inbox.css';
import './picks/settings/bell-ring.css';
// The account popover's spring entrance (picks: Motion "Clerk: User Button"). The popover is drawn
// by components/layout.tsx; its sheet is loaded here, beside the other half of the account card.
import './picks/settings/user-button.css';
import { reducedMotion } from './picks/settings/motion';

/** The cache key. The badge and the list read the SAME one — see the header. */
export const INBOX_KEY = ['notifications'];

/** How often the bell asks again. Long enough not to be a poll nobody asked for. */
const POLL_MS = 60_000;

export function NotificationInbox() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const inbox = useQuery({
    queryKey: INBOX_KEY,
    queryFn: () => fetchNotifications(),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
    retry: 1,
  });

  const data = inbox.data;
  const badge = badgeText(data?.unread ?? 0);

  // THE BELL RINGS WHEN SOMETHING NEW ARRIVES (picks: React Bits "Bell Toggle", re-implemented):
  // only when the unread count RISES between two answers — never on the first read, never when
  // something is marked read — so a swing always means "there is news", not "the page loaded".
  const lastUnread = useRef<number | null>(null);
  const [ring, setRing] = useState(0);
  useEffect(() => {
    const now = data?.unread;
    if (now === undefined) return;
    const before = lastUnread.current;
    lastUnread.current = now;
    if (before !== null && now > before && !reducedMotion()) setRing((r) => r + 1);
  }, [data?.unread]);

  const mark = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => markNotificationsRead(body),
    // Applied to the cache rather than refetched, so the badge moves on the same frame as the
    // click. The poll corrects anything this got wrong inside the minute.
    onSuccess: (result, body) => {
      qc.setQueryData<InboxResponse>(INBOX_KEY, (prev) =>
        prev ? markedInbox(prev, body, result, Date.now()) : prev,
      );
    },
  });

  // A row does two things at once: it marks itself read and it opens what it is about. Marking is
  // fire-and-forget — a navigation that waited for a write would feel broken on a slow connection,
  // and the worst case is a badge that is one too high for a minute.
  const openRow = useCallback(
    (r: NotificationRow) => {
      if (r.readAt === null) mark.mutate({ ids: [r.id] });
      const path = routePathFor(r.href);
      setOpen(false);
      // No path means the stored href does not address a route this app serves. Sending the person
      // to the dashboard instead would be a link that looks like it worked.
      if (path) navigate(path);
    },
    [mark, navigate],
  );

  const groups = data?.groups ?? [];
  const items = data?.items ?? [];
  const shown = expanded ? rowsOfGroup(items, expanded) : [];

  return (
    <div className="gx-pop-wrap gx-inbox">
      <button
        type="button"
        className="gx-icon-btn gx-inbox__bell"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={badge ? `Notifications — ${data?.unread} unread` : 'Notifications'}
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <span key={ring} className={`pk-bell${ring > 0 ? ' is-ringing' : ''}`} aria-hidden="true">
          <span className="pk-bell__glyph">
            <Icon d={PATH.bell} size={16} />
          </span>
          <svg className="pk-bell__wave pk-bell__wave--l" viewBox="0 0 14 14">
            <path d="M10 2.5a7 7 0 0 0-6 9" />
          </svg>
          <svg className="pk-bell__wave pk-bell__wave--r" viewBox="0 0 14 14">
            <path d="M4 2.5a7 7 0 0 1 6 9" />
          </svg>
        </span>
        {badge && (
          <span key={badge} className="gx-inbox__badge pk-bell__badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} placement="up" label="Notifications">
        <div className="gx-inbox__head">
          <span className="gx-inbox__title">Notifications</span>
          <button
            type="button"
            className="gx-inbox__all"
            disabled={mark.isPending || (data?.unread ?? 0) === 0}
            onClick={() => mark.mutate({ all: true })}
          >
            Mark all read
          </button>
        </div>

        {/* A FAILED FETCH IS NOT AN EMPTY INBOX, and rendering "You are all caught up" over one
            would be this repository's own house defect on its own notification surface. */}
        {inbox.isError && (
          <p className="gx-inbox__none" role="alert">
            Could not reach your notifications.{' '}
            <button type="button" className="gx-inbox__all" onClick={() => void inbox.refetch()}>
              Try again
            </button>
          </p>
        )}

        {inbox.isPending && (
          <p className="gx-inbox__none" aria-busy="true">
            Reading your inbox…
          </p>
        )}

        {inbox.isSuccess && groups.length === 0 && (
          <p className="gx-inbox__none">Nothing yet. Apple will tell you here when a build finishes or needs you.</p>
        )}

        {expanded === null &&
          groups.map((g) => (
            <button
              key={g.groupKey}
              type="button"
              className="gx-inbox__group"
              onClick={() => setExpanded(g.groupKey)}
            >
              <span className={`gx-inbox__dot ${severityClass(rowsOfGroup(items, g.groupKey)[0]?.severity)}`} aria-hidden="true" />
              <span className="gx-inbox__gtext">
                <span className="gx-inbox__gkind">{kindLabel(g.kind)}</span>
                {g.projectName && <span className="gx-inbox__gproject">{g.projectName}</span>}
              </span>
              <span className="gx-inbox__gcount">
                {g.unread > 0 ? `${g.unread} new of ${g.total}` : `${g.total}`}
              </span>
            </button>
          ))}

        {expanded !== null && (
          <>
            <button type="button" className="gx-inbox__back" onClick={() => setExpanded(null)}>
              <Icon d={PATH.chevronDown} size={13} />
              All notifications
            </button>
            {shown.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`gx-inbox__row${r.readAt === null ? ' is-unread' : ''}`}
                onClick={() => openRow(r)}
              >
                <span className={`gx-inbox__dot ${severityClass(r.severity)}`} aria-hidden="true" />
                <span className="gx-inbox__text">
                  <span className="gx-inbox__rtitle">{r.title}</span>
                  {r.body && <span className="gx-inbox__body">{r.body}</span>}
                  <span className="gx-inbox__meta">
                    {shortRelative(r.deliverAt)}
                    {/* The count is the whole point of coalescing: without it, "your build failed"
                        read once looks like it happened once. */}
                    {r.occurrences > 1 && <span className="gx-inbox__times">×{r.occurrences}</span>}
                  </span>
                </span>
              </button>
            ))}
            {shown.length > 0 && unreadIdsOf(shown).length > 0 && (
              <button
                type="button"
                className="gx-inbox__all gx-inbox__all--group"
                disabled={mark.isPending}
                onClick={() => mark.mutate({ ids: unreadIdsOf(shown) })}
              >
                Mark these read
              </button>
            )}
          </>
        )}
      </Popover>
    </div>
  );
}
