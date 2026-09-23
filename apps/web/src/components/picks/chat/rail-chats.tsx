// THE CHATS IN THE CONVERSATIONS DRAWER.
//
// Six picks meet in this one list, each doing the part it is good at:
//   * Animate UI "Pin List" (MIT + Commons Clause, re-implemented) — pinned chats sit in their own
//     section, and pinning or unpinning glides the row between sections (FLIP) instead of making it
//     vanish from one place and appear in another;
//   * React Bits "Animated List" (same licence, re-implemented) — rows arrive with a short stagger,
//     the arrow keys walk the list, and the scroll area fades at an edge that has more behind it;
//   * Motion "Swipe actions" (Motion+ licence, re-implemented from what it does) — on a touch screen
//     a row swipes aside to show Pin and Archive, and a long swipe archives;
//   * React Bits "Fuse Button" — archiving happens at once and leaves an Undo with a burning fuse;
//   * Animate UI "Icon Button" — pinning throws a small burst of dots from the pin;
//   * the context menu (Motion's two context-menu picks) — right-click a chat for everything above,
//     plus opening it in a new tab and copying its link.
//
// THE DATA RULES ARE THE DASHBOARD'S, not new ones: pin and archive write the same two columns the
// dashboard's own menu writes, invalidate the same three caches (lib/archive.ts PROJECT_LIST_KEYS),
// and a pinned chat is not offered Archive — the dashboard makes you unpin first, and two surfaces
// disagreeing about what is allowed would be worse than either rule.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useIsomorphicLayoutEffect } from '../../ai-elements/lib/use-isomorphic-layout-effect';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, type ProjectRow } from '../../../lib/supabase';
import { PROJECT_LIST_KEYS } from '../../../lib/archive';
import { createUndoable, type Undoable } from '../../../lib/undo';
import { shortRelative } from '../../../lib/format';
import { MOCK_MODE } from '../../../lib/mock';
import { useToast } from '../../toast';
import { ContextMenu, useContextMenu, type MenuItem } from './context-menu';
import { FuseUndo } from './fuse-undo';
import { writeClipboard } from './copy-button';
import { burst } from './particles';
import { flip, reducedMotion } from './motion';
import './rail-chats.css';

const PIN = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M9.6 1.2 14.8 6.4l-1.1 1.1-1.2-.3-2.6 2.6.2 2.3-1.1 1.1-3-3-3.3 3.3-.8-.8L5.2 9.4l-3-3L3.3 5.3l2.3.2 2.6-2.6-.3-1.2z" />
  </svg>
);

/** How far a row must travel before it stays open on its actions, and before it archives. */
const OPEN_AT = 48;
const ARCHIVE_AT = 150;
const ACTIONS_W = 112;

async function writeColumn(id: string, column: 'pinned_at' | 'archived_at', on: boolean): Promise<void> {
  if (MOCK_MODE) return;
  const { error } = await supabase.from('projects').update({ [column]: on ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Fades the scroll container at whichever edge has more behind it (the Animated List gradients). */
export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.scrollTop > 2;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
      el.dataset.edge = top && bottom ? 'both' : top ? 'top' : bottom ? 'bottom' : 'none';
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);
  return ref;
}

export function RailChats({ chats }: { chats: readonly ProjectRow[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const list = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);
  const [pinOverride, setPinOverride] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [fuse, setFuse] = useState<{ project: ProjectRow; undo: Undoable } | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);
  const menu = useContextMenu();
  const [menuFor, setMenuFor] = useState<ProjectRow | null>(null);

  const isPinned = (p: ProjectRow) => pinOverride[p.id] ?? Boolean(p.pinned_at);
  const rows = chats.filter((p) => !hidden.has(p.id));
  const pinnedRows = rows.filter(isPinned);
  const restRows = rows.filter((p) => !isPinned(p));

  // An override is only a bridge until the list refetches with the same answer.
  useEffect(() => {
    setPinOverride((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of chats) {
        if (p.id in next && next[p.id] === Boolean(p.pinned_at)) {
          delete next[p.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [chats]);

  const capture = () => {
    const map = new Map<string, DOMRect>();
    list.current?.querySelectorAll<HTMLElement>('[data-chat-id]').forEach((el) => map.set(el.dataset.chatId!, el.getBoundingClientRect()));
    before.current = map;
  };

  // FLIP: every row that moved plays from where it was.
  useIsomorphicLayoutEffect(() => {
    const was = before.current;
    before.current = null;
    if (!was || !list.current) return;
    list.current.querySelectorAll<HTMLElement>('[data-chat-id]').forEach((el) => {
      const rect = was.get(el.dataset.chatId!);
      if (rect) flip(el, rect);
    });
  });

  const invalidate = useCallback(() => {
    for (const key of PROJECT_LIST_KEYS) void qc.invalidateQueries({ queryKey: key });
  }, [qc]);

  const togglePin = (p: ProjectRow, from?: HTMLElement) => {
    const next = !isPinned(p);
    capture();
    setSwiped(null);
    setPinOverride((o) => ({ ...o, [p.id]: next }));
    if (next && from) burst(from);
    writeColumn(p.id, 'pinned_at', next)
      .then(invalidate)
      .catch((e: Error) => {
        capture();
        setPinOverride((o) => ({ ...o, [p.id]: !next }));
        toast(`Could not ${next ? 'pin' : 'unpin'}: ${e.message}`, 'error');
      });
  };

  const archive = (p: ProjectRow) => {
    capture();
    setSwiped(null);
    setHidden((h) => new Set(h).add(p.id));
    writeColumn(p.id, 'archived_at', true)
      .then(() => {
        invalidate();
        const undo = createUndoable({
          label: 'Undo',
          reverse: () =>
            writeColumn(p.id, 'archived_at', false).then(() => {
              setHidden((h) => {
                const n = new Set(h);
                n.delete(p.id);
                return n;
              });
              invalidate();
            }),
        });
        setFuse({ project: p, undo });
      })
      .catch((e: Error) => {
        setHidden((h) => {
          const n = new Set(h);
          n.delete(p.id);
          return n;
        });
        toast(`Could not archive: ${e.message}`, 'error');
      });
  };

  const menuItems = (p: ProjectRow): MenuItem[] => {
    const href = `/projects/${p.id}`;
    const items: MenuItem[] = [
      { id: 'open', label: 'Open', onSelect: () => navigate(href) },
      { id: 'tab', label: 'Open in a new tab', onSelect: () => window.open(`${window.location.origin}${href}`, '_blank', 'noopener') },
      {
        id: 'link',
        label: 'Copy link',
        onSelect: () => void writeClipboard(`${window.location.origin}${href}`).then((ok) => toast(ok ? 'Link copied' : 'Could not copy the link', ok ? 'success' : 'error')),
      },
      { id: 'pin', label: isPinned(p) ? 'Unpin' : 'Pin to top', separatorBefore: true, onSelect: () => togglePin(p) },
    ];
    if (!isPinned(p)) items.push({ id: 'archive', label: 'Archive', danger: true, onSelect: () => archive(p) });
    return items;
  };

  // Arrow keys walk the chats, the way the Animated List's keyboard selection does.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    const links = Array.from(list.current?.querySelectorAll<HTMLAnchorElement>('a.gx-conv') ?? []);
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (at === -1) return;
    event.preventDefault();
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : event.key === 'ArrowDown' ? Math.min(links.length - 1, at + 1) : Math.max(0, at - 1);
    links[next]?.focus();
  };

  const row = (p: ProjectRow, index: number) => (
    <ChatRow
      key={p.id}
      project={p}
      index={index}
      pinned={isPinned(p)}
      open={swiped === p.id}
      onSwipe={(openIt) => setSwiped(openIt ? p.id : null)}
      onPin={(el) => togglePin(p, el)}
      onArchive={() => archive(p)}
      onContextMenu={(e) => {
        setMenuFor(p);
        menu.onContextMenu(e);
      }}
    />
  );

  return (
    <div ref={list} className="pk-chats" onKeyDown={onKeyDown}>
      {fuse && (
        <FuseUndo
          key={fuse.project.id}
          text={`“${fuse.project.name}” archived`}
          onUndo={() => {
            void fuse.undo.undo().then((r) => {
              if (!r.ok && r.status !== 'undone') toast('Could not bring it back. It is in Archived on your projects page.', 'error');
            });
            setFuse(null);
          }}
          onDone={() => setFuse(null)}
        />
      )}
      {pinnedRows.length > 0 && (
        <>
          <div className="gx-rail__label pk-chats__label">Pinned</div>
          <ul className="gx-rail__list pk-chats__list" aria-label="Pinned chats">
            {pinnedRows.map(row)}
          </ul>
        </>
      )}
      {/* The label fades rather than jumps when the last pin goes (Pin List's 0.22s label fade). */}
      <div className="gx-rail__label pk-chats__label" key={pinnedRows.length ? 'all' : 'chats'}>
        {pinnedRows.length ? 'All chats' : 'Chats'}
      </div>
      {restRows.length > 0 && (
        <ul className="gx-rail__list pk-chats__list" aria-label={pinnedRows.length ? 'Other chats' : 'Chats'}>
          {restRows.map((p, i) => row(p, i + pinnedRows.length))}
        </ul>
      )}
      <ContextMenu at={menu.at} items={menuFor ? menuItems(menuFor) : []} label={menuFor ? `${menuFor.name} options` : 'Chat options'} onClose={menu.close} />
    </div>
  );
}

function ChatRow({
  project: p,
  index,
  pinned,
  open,
  onSwipe,
  onPin,
  onArchive,
  onContextMenu,
}: {
  project: ProjectRow;
  index: number;
  pinned: boolean;
  open: boolean;
  onSwipe: (open: boolean) => void;
  onPin: (from: HTMLElement) => void;
  onArchive: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
}) {
  const at = p.last_activity_at ?? p.updated_at;
  const when = shortRelative(at);
  const face = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; id: number; axis: 'x' | 'y' | null } | null>(null);
  const moved = useRef(false);

  const sign = () => (face.current && getComputedStyle(face.current).direction === 'rtl' ? -1 : 1);
  const setX = (x: number, animate: boolean) => {
    const el = face.current;
    if (!el) return;
    el.style.transition = animate && !reducedMotion() ? 'transform .28s cubic-bezier(.34,1.3,.64,1)' : 'none';
    el.style.transform = x ? `translateX(${x * sign()}px)` : '';
    // The actions underneath are drawn only while the face is off them.
    if (el.parentElement) el.parentElement.dataset.swipe = x ? 'on' : '';
  };

  useEffect(() => setX(open ? -ACTIONS_W : 0, true), [open]);

  // SWIPE — touch and pen only. A mouse user has the pin button and the menu; dragging a link with a
  // mouse is how people drag it to the bookmarks bar.
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId, axis: null };
    moved.current = false;
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = (e.clientX - d.x) * sign();
    const dy = e.clientY - d.y;
    if (!d.axis && Math.abs(dx) + Math.abs(dy) > 8) {
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'x') (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (d.axis !== 'x') return;
    moved.current = true;
    d.dx = Math.min(0, dx + (open ? -ACTIONS_W : 0));
    setX(Math.max(d.dx, -ARCHIVE_AT - 40), false);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x') return;
    if (d.dx <= -ARCHIVE_AT && !pinned) {
      setX(0, false);
      onArchive();
    } else {
      const openIt = d.dx <= -OPEN_AT;
      onSwipe(openIt);
      setX(openIt ? -ACTIONS_W : 0, true);
    }
  };

  return (
    <li className="pk-chat" data-chat-id={p.id} style={{ '--i': Math.min(index, 12) } as CSSProperties} onContextMenu={onContextMenu}>
      {/* The actions under the row, revealed by the swipe. Hidden from the focus order while the row
          is closed — they are the same two actions the pin button and the menu already offer. */}
      <div className="pk-chat__actions" aria-hidden={!open}>
        <button type="button" className="pk-chat__action" tabIndex={open ? 0 : -1} onClick={(e) => onPin(e.currentTarget)}>
          {pinned ? 'Unpin' : 'Pin'}
        </button>
        {!pinned && (
          <button type="button" className="pk-chat__action is-danger" tabIndex={open ? 0 : -1} onClick={onArchive}>
            Archive
          </button>
        )}
      </div>
      <div
        ref={face}
        className="pk-chat__face"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          // A swipe that ended over the link is not a click on it, and a tap on an open row closes it.
          if (moved.current || open) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
            if (open) onSwipe(false);
          }
        }}
      >
        <NavLink to={`/projects/${p.id}`} className={({ isActive }) => `gx-conv${isActive ? ' is-active' : ''}`} title={p.name} draggable={false}>
          {pinned && (
            <span className="gx-conv__pin" aria-label="Pinned" title="Pinned to the top">
              {PIN}
            </span>
          )}
          <span className="gx-conv__name">{p.name}</span>
          {when && (
            <span className="gx-conv__time" title={at ? new Date(at).toLocaleString() : undefined}>
              {when}
            </span>
          )}
        </NavLink>
        <button
          type="button"
          className="pk-chat__pin"
          aria-label={pinned ? `Unpin ${p.name}` : `Pin ${p.name} to the top`}
          title={pinned ? 'Unpin' : 'Pin to the top'}
          aria-pressed={pinned}
          onClick={(e) => onPin(e.currentTarget)}
        >
          {PIN}
        </button>
      </div>
    </li>
  );
}
