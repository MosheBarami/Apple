// App shell: a calm 320px rail and one main area.
//
// The rail holds the mark, a way to start something new, the conversations you
// already have, checkpoints, and you. Usage, Settings, Docs, Admin and the
// theme switch used to sit here as permanent navigation; they now live in the
// account menu at the foot of the rail. None of that functionality was removed,
// only re-homed, because a product where every subsystem gets a permanent nav
// row reads as a dashboard rather than a tool.
//
// Checkpoints appears twice by design — a card here and a button in the
// conversation header — but the drawer itself belongs to the workspace route,
// which is the only place that knows whose checkpoints these are. The workspace
// lends the shell an opener (see lib/shell.tsx); with no workspace mounted the
// card is inert and says why rather than pretending to be live.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { fetchMe } from '../lib/api';
import { shortRelative } from '../lib/format';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { ShellProvider, useShell } from '../lib/shell';
import { useCommands } from '../lib/commands';
import { PROJECT_COLUMNS } from '../lib/archive';
import { RAIL_MAX, RAIL_MIN, clampRailWidth, nudgeRailWidth, widthFromPointer } from '../lib/rail-width';
import { readViewState, writeViewState } from '../lib/view-state';
import { CommandPalette } from './command-palette';
import { ErrorBoundary } from './error-boundary';
import { UsageMeter } from './usage-meter';
import { ShortcutsDialog, useGlobalShortcut } from './shortcuts-dialog';
import { SHORTCUTS, matchesShortcut, shortcutLabel } from '../lib/shortcuts';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { AppleGlyph } from './glyphs';
import { Icon, PATH, Popover } from './ws/primitives';
import { NotificationInbox } from './notification-inbox';
import { SupportDialog } from './support-dialog';
import { projectIdFromPath } from './support-model';
import { OfflineBanner } from './offline-banner';
import { OnboardingTour } from './onboarding-tour';
import { StudioAtmosphere } from './studio-atmosphere';
import { ModelMark } from './ws/model-mark';
import { restartTour, writeProgress } from '../lib/onboarding';
import './layout.css';

/** How many conversations the rail lists before deferring to "View all chats". */
const RAIL_LIMIT = 8;

async function fetchRecentProjects(): Promise<ProjectRow[]> {
  if (MOCK_MODE) return mockProjects;
  // Archived projects are excluded here as well as on the dashboard. An archived project that
  // still sits in the sidebar has not been archived from the user's point of view — the sidebar is
  // the list they actually look at.
  // Pinned first, then recency — the same order the dashboard uses, because a sidebar that
  // disagrees with the page it sits beside is worse than one that is merely stale.
  //
  // `nullsFirst: false` is the whole feature: Postgres sorts `desc` NULLS FIRST by default, which
  // would put every UNPINNED project above every pinned one.
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .is('archived_at', null)
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectRow[];
}

/* ------------------------------------------------------------ user card --- */

function AccountMenu({ name, email, isAdmin }: { name: string | null; email: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  /*
   * GET HELP LIVES BESIDE DOCS, NOT INSTEAD OF IT.
   *
   * Docs answers "how does this work" and goes to the static site. This answers "something is
   * wrong and I need a person", and it stays inside the app — because the surface a stuck person
   * can reach is the one on the screen they are stuck on, and every support surface this product
   * had before was on a marketing site they would have had to leave in order to find.
   */
  const [supportOpen, setSupportOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const here = useLocation();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  // Only ever the user's own data: a display name if the profile has one,
  // otherwise the address itself. Nothing is invented to fill the line.
  const primary = name ?? email ?? 'Account';
  const secondary = name ? email : null;
  const initial = (primary[0] ?? '?').toUpperCase();

  return (
    <div className="gx-user-card">
      <div className="gx-pop-wrap gx-user-card__wrap">
        <button
          type="button"
          className="gx-user-card__id"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="gx-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="gx-user-card__names">
            <span className="gx-user-card__name">{primary}</span>
            {secondary && <span className="gx-user-card__email">{secondary}</span>}
          </span>
          <span className="gx-user-card__caret" aria-hidden="true">
            <Icon d={PATH.chevronDown} size={14} />
          </span>
        </button>

        <Popover open={open} onClose={() => setOpen(false)} placement="up" label="Account">
          <Link to="/settings" className="gx-pop__item" role="menuitem" onClick={() => setOpen(false)}>
            <Icon d={PATH.settings} size={15} />
            Settings
          </Link>
          <Link to="/usage" className="gx-pop__item" role="menuitem" onClick={() => setOpen(false)}>
            <Icon d={PATH.gauge} size={15} />
            Usage and Credits
          </Link>
          <a className="gx-pop__item" role="menuitem" href="/docs" target="_blank" rel="noopener noreferrer">
            <Icon d={PATH.docs} size={15} />
            Docs
            <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>
              ↗
            </span>
            <span className="gx-sr">(opens in a new tab)</span>
          </a>
          <button
            type="button"
            className="gx-pop__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setSupportOpen(true);
            }}
          >
            <Icon d={PATH.lifebuoy} size={15} />
            Get help
          </button>

          <div className="gx-pop__sep" />

          <button type="button" className="gx-pop__item" role="menuitem" onClick={() => setTheme(nextTheme)}>
            <Icon d={theme === 'dark' ? PATH.sun : PATH.moon} size={15} />
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>

          {/* Admin stays reachable for those authorised, but it no longer
              occupies a permanent row in everyone's field of view. */}
          {isAdmin && (
            <Link to="/admin" className="gx-pop__item" role="menuitem" onClick={() => setOpen(false)}>
              <Icon d={PATH.shield} size={15} />
              Admin
            </Link>
          )}

          <div className="gx-pop__sep" />

          <button
            type="button"
            className="gx-pop__item"
            role="menuitem"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            <Icon d={PATH.logout} size={15} />
            Sign out
          </button>
        </Popover>
      </div>

      {/* The bell sits in the user card rather than in the topbar because what it holds is the
          person's, not the project's: a mention on one project and a failed card belong to the
          same list, and that list belongs beside the account. */}
      <NotificationInbox />

      <Link to="/settings" className="gx-icon-btn gx-user-card__gear" aria-label="Settings" title="Settings">
        <Icon d={PATH.settings} size={16} />
      </Link>

      {/* The route is passed in rather than read off `window` inside the dialog: this app can be
          sitting on /app#access_token=… after a magic link, and a support widget that reads the
          whole URL files a live session into a table somebody else reads. */}
      {supportOpen && (
        <SupportDialog
          onClose={() => setSupportOpen(false)}
          location={{ pathname: here.pathname }}
          projectId={projectIdFromPath(here.pathname)}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- rail --- */

function Rail({ name, email, isAdmin, quota, quotaPending, quotaFailed, width, onWidth }:
  { name: string | null; email: string; isAdmin: boolean; quota: unknown; quotaPending: boolean; quotaFailed: boolean;
    width: number; onWidth: (next: number, persist: boolean) => void }) {
  const { railOpen, closeRail, railCollapsed, toggleRailCollapsed, openCheckpoints } = useShell();

  //[[ THE DRAG, WHICH IS THE ONLY PART OF RESIZING THAT IS NOT ARITHMETIC.
  //
  //   Everything that can be wrong about a width — the clamp, what a cursor position means on
  //   either side of an RTL flip, what an arrow key does — lives in lib/rail-width.ts where it can
  //   be driven directly. This is the plumbing.
  //
  //   Pointer CAPTURE rather than window listeners: the moves keep arriving at the handle once the
  //   cursor leaves it, which is most of a drag, and the capture is released for us if the pointer
  //   is cancelled. Nothing is left attached to the window to leak.
  //
  //   Persisted on release and on each key, not on every move: a drag is sixty localStorage writes
  //   a second, and only the last one is a decision. ]]
  const dragging = useRef(false);
  const railEl = useRef<HTMLElement>(null);
  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const rail = railEl.current;
    // A focus trap alone does not hide background controls from screen readers.
    const background = document.getElementById('main-content');
    const previousInert = background?.inert ?? false;
    if (background) background.inert = true;
    const focusable = () => Array.from(rail?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input,select,[tabindex="0"]') ?? [])
      .filter(node => node.getClientRects().length > 0);
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    rail?.addEventListener('keydown', trap);
    return () => {
      rail?.removeEventListener('keydown', trap);
      if (background) background.inert = previousInert;
      restore?.focus?.();
    };
  }, []);
  const isRtl = () =>
    railEl.current ? window.getComputedStyle(railEl.current).direction === 'rtl' : false;

  const projects = useQuery({ queryKey: ['projects-nav'], queryFn: fetchRecentProjects, staleTime: 30_000, retry: 1 });
  const chats = projects.data ?? [];
  // A PINNED CONVERSATION SURVIVES THE LIMIT.
  //
  // Sorting pins to the top of a list that is then cut to eight works right up until someone pins
  // nine things — and the slice, not the order, is what the user actually sees. So the pinned rows
  // are kept whole and the limit applies to the recency tail beneath them. The query already caps
  // the fetch at 20, so this cannot grow without bound either.
  const pinned = chats.filter((p) => p.pinned_at);
  const shown = [...pinned, ...chats.filter((p) => !p.pinned_at).slice(0, RAIL_LIMIT)];

  return (
    <aside
      ref={railEl}
      className={`gx-rail${railOpen ? ' is-open' : ''}${railCollapsed ? ' is-collapsed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Conversations"
    >
      <div className="gx-rail__head">
        <Link to="/" className="gx-wordmark" aria-label="Apple — home">
          <AppleGlyph size={28} />
          <span className="gx-wordmark__text">Apple</span>
        </Link>

        <button
          type="button"
          className="gx-icon-btn gx-rail__collapse"
          onClick={toggleRailCollapsed}
          aria-label={railCollapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          title={railCollapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
        >
          <Icon d={PATH.panelLeft} size={17} />
        </button>

        <button
          type="button"
          className="gx-icon-btn gx-rail__close"
          onClick={closeRail}
          aria-label="Close navigation"
        >
          <Icon d={PATH.close} size={17} />
        </button>
      </div>

      <Link to="/" className="gx-new" title="New chat" data-tour="new-chat">
        <Icon d={PATH.compose} size={16} />
        <span className="gx-new__label">New chat</span>
        <kbd className="gx-kbd" dir="ltr" aria-hidden="true">
          {shortcutLabel(SHORTCUTS.newProject)}
        </kbd>
      </Link>

      <div className="gx-rail__scroll">
        <div className="gx-rail__label">Chats</div>

        {shown.length > 0 && (
          <ul className="gx-rail__list">
            {shown.map((p) => {
              const at = p.last_activity_at ?? p.updated_at;
              const when = shortRelative(at);
              return (
                <li key={p.id}>
                  <NavLink
                    to={`/projects/${p.id}`}
                    className={({ isActive }) => `gx-conv${isActive ? ' is-active' : ''}`}
                    title={p.name}
                  >
                    {/* Same reason as the dashboard card: without a mark, a conversation sitting
                        above newer ones is just a list in the wrong order. */}
                    {p.pinned_at && (
                      <span className="gx-conv__pin" aria-label="Pinned" title="Pinned to the top">
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                          <path d="M9.6 1.2 14.8 6.4l-1.1 1.1-1.2-.3-2.6 2.6.2 2.3-1.1 1.1-3-3-3.3 3.3-.8-.8L5.2 9.4l-3-3L3.3 5.3l2.3.2 2.6-2.6-.3-1.2z" />
                        </svg>
                      </span>
                    )}
                    <span className="gx-conv__name">{p.name}</span>
                    {when && (
                      <span className="gx-conv__time" title={at ? new Date(at).toLocaleString() : undefined}>
                        {when}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        )}

        {projects.isSuccess && chats.length === 0 && (
          <p className="gx-rail__none">Nothing here yet. Start a chat and it will show up in this list.</p>
        )}

        <Link to="/" className="gx-viewall">
          <Icon d={PATH.listAll} size={15} />
          View all chats
        </Link>
      </div>

      <div className="gx-rail__foot">
        <button
          type="button"
          className="gx-card-btn"
          data-tour="checkpoints"
          onClick={() => openCheckpoints?.()}
          disabled={openCheckpoints === null}
          title={
            openCheckpoints === null
              ? 'Open a chat to save or compare checkpoints'
              : 'Save and compare project states'
          }
        >
          <span className="gx-card-btn__mark" aria-hidden="true">
            <Icon d={PATH.layers} size={17} />
          </span>
          <span className="gx-card-btn__text">
            <span className="gx-card-btn__title">Checkpoints</span>
            <span className="gx-card-btn__sub">Save and compare project states</span>
          </span>
          <span className="gx-card-btn__chev" aria-hidden="true">
            <Icon d={PATH.chevronRight} size={14} />
          </span>
        </button>

        <UsageMeter quota={quota} pending={quotaPending} failed={quotaFailed} />
        <AccountMenu name={name} email={email} isAdmin={isAdmin} />
      </div>

      {/* Announced as a separator with a value, so a screen reader says what the width is as it
          moves; focusable, because a drag handle nobody can reach with a keyboard is a mouse-only
          feature. Hidden by CSS below 861px, where the rail is an overlay and its width is not
          part of the layout, and while collapsed, where there is nothing to size. */}
      <div
        className="gx-rail__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the sidebar"
        aria-valuenow={width}
        aria-valuemin={RAIL_MIN}
        aria-valuemax={RAIL_MAX}
        tabIndex={0}
        onPointerDown={(e) => {
          // Stops the drag selecting the conversation titles it passes over.
          e.preventDefault();
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current || !railEl.current) return;
          const box = railEl.current.getBoundingClientRect();
          onWidth(widthFromPointer(e.clientX, box, isRtl()), false);
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
          onWidth(width, true);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          onWidth(width, true);
        }}
        onKeyDown={(e) => {
          const next = nudgeRailWidth(width, e.key, isRtl());
          // Null means a key this control does not own. Swallowing Tab here would trap a keyboard
          // user on the handle with no way off it.
          if (next === null) return;
          e.preventDefault();
          onWidth(next, true);
        }}
      />
    </aside>
  );
}

/* ---------------------------------------------------------------- shell --- */

function Shell() {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { railOpen, openRail, closeRail, railCollapsed, newProject } = useShell();
  const { theme, setTheme } = useTheme();
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Remounting the tour is how "Show me around" restarts it: the component reads its progress on
  // mount, and the command has just written a fresh one.
  const [tourNonce, setTourNonce] = useState(0);

  //[[ THE RAIL'S WIDTH IS THE USER'S, AND IT SURVIVES A RELOAD.
  //
  //   Read through `clampRailWidth` rather than raw: the stored value was written by some build,
  //   possibly not this one, and a width restored blindly can be 0 — a sidebar that is present in
  //   the layout, holds the focus order, and cannot be seen. Persisted on release rather than on
  //   every pointermove, which would be sixty writes a second for one decision. ]]
  const [railWidth, setRailWidth] = useState(() => readViewState('rail.width', clampRailWidth));
  const setWidth = useCallback((next: number, persist: boolean) => {
    setRailWidth(next);
    if (persist) writeViewState('rail.width', next);
  }, []);

  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000, retry: 1 });
  // The same query the rail runs, by the same key, so this costs nothing and cannot disagree with
  // the list the user is looking at.
  const navProjects = useQuery({ queryKey: ['projects-nav'], queryFn: fetchRecentProjects, staleTime: 30_000, retry: 1 });
  // THE TOUR WAITS UNTIL THIS IS KNOWN. `isPending` and "you have no projects" are the same value
  // here — `undefined` — and the difference between them is the difference between a first step
  // that welcomes a new builder and one that tells someone with eleven projects to make their
  // first. Nothing is rendered until the fetch has actually answered.
  const knowsProjects = navProjects.isSuccess;
  const hasProjects = knowsProjects && (navProjects.data?.length ?? 0) > 0;
  // A FAILED PROFILE FETCH IS NOT "YOU ARE NOT AN ADMIN", and this reads as though it were.
  // Hiding the link is still the right default — offering one that 403s would be worse — but the
  // rail has to say the fetch failed rather than quietly rearranging itself. The usage meter,
  // which sits in the same rail and is handed `failed` below, is what says it.
  const isAdmin = me.data?.profile?.is_admin === true;

  useEffect(() => {
    closeRail();
  }, [location.pathname, closeRail]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && railOpen) {
        closeRail();
        return;
      }
      // ⌘K used to come here, to New chat. It now opens the command palette, which is what ⌘K
      // means everywhere else and therefore what people try first. New chat moved to ⌘⇧N and the
      // badge beside it says so — a shortcut nobody can see is one nobody uses.
      //
      // This used to end at navigate('/'), which is not what the binding is called: the user
      // pressed "New project" and landed on the shelf with nothing open, having to find the
      // button by hand. It now asks the shell, which opens the dialog here or arms it for the
      // dashboard to open as it mounts.
      if (matchesShortcut(e, SHORTCUTS.newProject)) {
        e.preventDefault();
        closeRail();
        if (location.pathname !== '/') navigate('/');
        newProject();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [railOpen, closeRail, navigate, newProject, location.pathname]);

  useGlobalShortcut(SHORTCUTS.help, () => setShowShortcuts(true));

  // Global commands: available on every route because the shell is mounted on every route.
  useCommands([
    { id: 'nav-projects', title: 'Go to projects', section: 'Navigate', keywords: ['dashboard', 'home'], run: () => navigate('/') },
    { id: 'new-project', title: 'New project', section: 'Navigate', keywords: ['create', 'chat', 'summon'], hint: shortcutLabel(SHORTCUTS.newProject), run: () => { if (location.pathname !== '/') navigate('/'); newProject(); } },
    { id: 'nav-usage', title: 'Usage', section: 'Navigate', keywords: ['credits', 'spend', 'billing'], run: () => navigate('/usage') },
    { id: 'nav-settings', title: 'Settings', section: 'Navigate', keywords: ['preferences', 'account', 'profile'], run: () => navigate('/settings') },
    ...(isAdmin ? [{ id: 'nav-admin', title: 'Admin', section: 'Navigate', keywords: ['ops'], run: () => navigate('/admin') }] : []),
    { id: 'toggle-rail', title: railOpen ? 'Close navigation' : 'Open navigation', section: 'View', keywords: ['nav', 'panel'], run: railOpen ? closeRail : openRail },
    { id: 'toggle-theme', title: theme === 'dark' ? 'Switch to light' : 'Switch to dark', section: 'View', keywords: ['theme', 'dark', 'light', 'appearance'], run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'shortcuts', title: 'Keyboard shortcuts', section: 'View', keywords: ['keys', 'hotkeys', 'bindings'], hint: shortcutLabel(SHORTCUTS.help), run: () => setShowShortcuts(true) },
    // A tour you get exactly one chance at is a tour people skip on their first nervous minute and
    // can never ask for again.
    { id: 'show-tour', title: 'Show me around', section: 'View', keywords: ['tour', 'onboarding', 'guide', 'tutorial', 'help'], run: () => { writeProgress(restartTour()); setTourNonce((n) => n + 1); } },
    { id: 'sign-out', title: 'Sign out', section: 'Account', keywords: ['logout', 'log out', 'leave'], run: () => void signOut() },
  ]);

  const email = session?.user.email ?? me.data?.email ?? (MOCK_MODE ? 'builder@example.com' : '');
  const name = me.data?.profile?.display_name ?? null;

  return (
    <div
      className={`gx gx-shell${railCollapsed ? ' is-rail-collapsed' : ''}`}
      // The grid reads this token for its first column, so the drag is one custom property away
      // from the layout rather than a second source of truth about the rail's width.
      style={{ '--gx-rail-w': `${railWidth}px` } as CSSProperties}
    >
      <a className="gx-sr" href="#main-content">
        Skip to content
      </a>

      {/* Renders nothing unless something was actually observed — see lib/connectivity.ts. */}
      <OfflineBanner />

      {railOpen && <Rail
        name={name}
        email={email}
        isAdmin={isAdmin}
        quota={me.data?.quota}
        quotaPending={me.isPending}
        quotaFailed={me.isError}
        width={railWidth}
        onWidth={setWidth}
      />}

      {railOpen && (
        <button type="button" className="gx-scrim" onClick={closeRail} tabIndex={-1} aria-hidden="true" />
      )}

      <main id="main-content" className="gx-main">
        <StudioAtmosphere />
        {/* THE ONLY WAY BACK TO THE RAIL ON A PHONE, SO IT CANNOT BELONG TO ONE ROUTE.
            Below 861px the rail is off-canvas and only `.is-open` returns it. This button used
            to live in the workspace topbar, which meant the dashboard, usage, settings, roadmap
            and admin had no rail at phone width — and therefore no account menu and no way to
            sign out. Nothing about those screens looked broken, which is why it lasted.
            It is `position: fixed` rather than a row of its own: a shell-owned header bar would
            stack a second bar above the workspace topbar, and this way the workspace looks
            exactly as it did while every other route gains the control. */}
        <nav className="studio-dock" aria-label="Workspace navigation">
          <Link to="/" className="studio-dock__brand" aria-label="Apple — projects"><ModelMark variant="apple" /></Link>
          <button type="button" aria-label="New chat" title="New chat" onClick={() => { if (location.pathname !== '/') navigate('/'); newProject(); }}><Icon d={PATH.compose} /></button>
          <button
          type="button"
          className="studio-navigation"
          onClick={openRail}
          aria-label="Open navigation"
          aria-expanded={railOpen}
          title="Conversations"
        >
          <Icon d={PATH.menu} />
        </button>
          <Link to="/usage" className="studio-dock__link" aria-label="Usage and Credits" title="Usage and Credits"><Icon d={PATH.gauge} /></Link>
          <Link to="/settings" className="studio-dock__account" aria-label="Settings" title="Settings"><Icon d={PATH.settings} /></Link>
        </nav>
        {/* A ROUTE THAT THROWS IS A PANE THAT FAILED, NOT AN APPLICATION THAT DIED.
            The root boundary in app.tsx sits outside the router, so a crash anywhere took the
            rail, the palette and the toasts with it — removing the one control that would
            actually get the reader out. This one keeps the shell up, and the key means that
            walking away from the broken route remounts it and clears the crash, which the root
            boundary cannot do: it has no route identity to reset against. */}
        <ErrorBoundary key={location.pathname} scope="route">
          <Outlet />
        </ErrorBoundary>
      </main>

      <CommandPalette />
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {knowsProjects && <OnboardingTour key={tourNonce} done={{ hasProject: hasProjects }} />}
    </div>
  );
}

export function AppLayout() {
  return (
    <ShellProvider>
      <Shell />
    </ShellProvider>
  );
}
