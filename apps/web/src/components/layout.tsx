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
import { supabase, type ProjectRow } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { GolemGlyph } from './glyphs';
import { Icon, PATH, Popover } from './ws/primitives';

/** How many conversations the rail lists before deferring to "View all chats". */
const RAIL_LIMIT = 8;

async function fetchRecentProjects(): Promise<ProjectRow[]> {
  if (MOCK_MODE) return mockProjects;
  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name, description, place_name, place_id, memory_summary, created_at, updated_at, last_activity_at')
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
            Usage and Sparks
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

      <Link to="/settings" className="gx-icon-btn gx-user-card__gear" aria-label="Settings" title="Settings">
        <Icon d={PATH.settings} size={16} />
      </Link>
    </div>
  );
}

/* ----------------------------------------------------------------- rail --- */

function Rail({ name, email, isAdmin }: { name: string | null; email: string; isAdmin: boolean }) {
  const { railOpen, closeRail, railCollapsed, toggleRailCollapsed, openCheckpoints } = useShell();

  const projects = useQuery({ queryKey: ['projects-nav'], queryFn: fetchRecentProjects, staleTime: 30_000, retry: 1 });
  const chats = projects.data ?? [];
  const shown = chats.slice(0, RAIL_LIMIT);

  return (
    <aside
      className={`gx-rail${railOpen ? ' is-open' : ''}${railCollapsed ? ' is-collapsed' : ''}`}
      aria-label="Conversations"
    >
      <div className="gx-rail__head">
        <Link to="/" className="gx-wordmark" aria-label="Golem — home">
          <GolemGlyph size={28} />
          <span className="gx-wordmark__text">Golem</span>
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

      <Link to="/" className="gx-new" title="New chat">
        <Icon d={PATH.compose} size={16} />
        <span className="gx-new__label">New chat</span>
        <kbd className="gx-kbd" aria-hidden="true">
          ⌘K
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

        <AccountMenu name={name} email={email} isAdmin={isAdmin} />
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------- shell --- */

function Shell() {
  const { session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { railOpen, closeRail, railCollapsed } = useShell();

  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000, retry: 1 });
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
      // The ⌘K badge on "New chat" has to mean something, so it does.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        closeRail();
        navigate('/');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [railOpen, closeRail, navigate]);

  const email = session?.user.email ?? me.data?.email ?? (MOCK_MODE ? 'builder@example.com' : '');
  const name = me.data?.profile?.display_name ?? null;

  return (
    <div className={`gx gx-shell${railCollapsed ? ' is-rail-collapsed' : ''}`}>
      <a className="gx-sr" href="#main-content">
        Skip to content
      </a>

      <Rail name={name} email={email} isAdmin={isAdmin} />

      {railOpen && (
        <button type="button" className="gx-scrim" onClick={closeRail} aria-label="Close navigation" />
      )}

      <main id="main-content" className="gx-main">
        <Outlet />
      </main>
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
