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
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { fetchMe } from '../lib/api';
import { shortRelative } from '../lib/format';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { ShellProvider, useShell } from '../lib/shell';
import { useCommands } from '../lib/commands';
import { PROJECT_COLUMNS } from '../lib/archive';
import { CommandPalette } from './command-palette';
import { UsageMeter } from './usage-meter';
import { ShortcutsDialog, useGlobalShortcut } from './shortcuts-dialog';
import { SHORTCUTS, matchesShortcut, shortcutLabel } from '../lib/shortcuts';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { AppleGlyph } from './glyphs';
import { Icon, PATH, Popover } from './ws/primitives';
import { NotificationInbox } from './notification-inbox';
import { OfflineBanner } from './offline-banner';
import { OnboardingTour } from './onboarding-tour';
import { restartTour, writeProgress } from '../lib/onboarding';

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
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();
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
    </div>
  );
}

/* ----------------------------------------------------------------- rail --- */

function Rail({ name, email, isAdmin, quota, quotaPending, quotaFailed }:
  { name: string | null; email: string; isAdmin: boolean; quota: unknown; quotaPending: boolean; quotaFailed: boolean }) {
  const { railOpen, closeRail, railCollapsed, toggleRailCollapsed, openCheckpoints } = useShell();

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
      className={`gx-rail${railOpen ? ' is-open' : ''}${railCollapsed ? ' is-collapsed' : ''}`}
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
    </aside>
  );
}

/* ---------------------------------------------------------------- shell --- */

function Shell() {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { railOpen, closeRail, railCollapsed, toggleRailCollapsed, newProject } = useShell();
  const { theme, setTheme } = useTheme();
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Remounting the tour is how "Show me around" restarts it: the component reads its progress on
  // mount, and the command has just written a fresh one.
  const [tourNonce, setTourNonce] = useState(0);

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
    { id: 'toggle-rail', title: railCollapsed ? 'Expand the sidebar' : 'Collapse the sidebar', section: 'View', keywords: ['nav', 'panel'], run: toggleRailCollapsed },
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
    <div className={`gx gx-shell${railCollapsed ? ' is-rail-collapsed' : ''}`}>
      <a className="gx-sr" href="#main-content">
        Skip to content
      </a>

      {/* Renders nothing unless something was actually observed — see lib/connectivity.ts. */}
      <OfflineBanner />

      <Rail
        name={name}
        email={email}
        isAdmin={isAdmin}
        quota={me.data?.quota}
        quotaPending={me.isPending}
        quotaFailed={me.isError}
      />

      {railOpen && (
        <button type="button" className="gx-scrim" onClick={closeRail} aria-label="Close navigation" />
      )}

      <main id="main-content" className="gx-main">
        <Outlet />
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
