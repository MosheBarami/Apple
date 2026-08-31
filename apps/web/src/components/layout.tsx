// App shell: a narrow, calm rail and one main area.
//
// The rail holds four things and nothing else — the mark, a way to start
// something new, the conversations you already have, and you. Usage, Settings,
// Docs, Admin and the theme switch used to sit here as permanent navigation;
// they now live in the account menu at the foot of the rail. None of that
// functionality was removed, only re-homed, because a product where every
// subsystem gets a permanent nav row reads as a dashboard rather than a tool.
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { fetchMe } from '../lib/api';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { GolemGlyph } from './glyphs';
import { Icon, PATH, Popover } from './ws/primitives';

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

function AccountMenu({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className="gx-pop-wrap">
      <button
        type="button"
        className="gx-account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="gx-avatar" aria-hidden="true">
          {(email[0] ?? '?').toUpperCase()}
        </span>
        <span className="gx-account__email">{email || 'Account'}</span>
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
          <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>↗</span>
          <span className="gx-sr">(opens in a new tab)</span>
        </a>

        <div className="gx-pop__sep" />

        <button
          type="button"
          className="gx-pop__item"
          role="menuitem"
          onClick={() => setTheme(nextTheme)}
        >
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
  );
}

export function AppLayout() {
  const { session } = useAuth();
  const location = useLocation();
  const [railOpen, setRailOpen] = useState(false);

  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000, retry: 1 });
  const projects = useQuery({ queryKey: ['projects-nav'], queryFn: fetchRecentProjects, staleTime: 30_000, retry: 1 });
  const isAdmin = me.data?.profile?.is_admin === true;

  useEffect(() => {
    setRailOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!railOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRailOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [railOpen]);

  const email = session?.user.email ?? (MOCK_MODE ? 'builder@example.com' : '');

  return (
    <div className="gx gx-shell">
      <a className="gx-sr" href="#main-content">
        Skip to content
      </a>

      <aside className={`gx-rail${railOpen ? ' is-open' : ''}`} aria-label="Conversations">
        <Link to="/" className="gx-rail__head">
          <GolemGlyph size={22} />
          <span>Golem</span>
        </Link>

        <Link to="/" className="gx-new">
          <Icon d={PATH.plus} size={15} />
          New build
        </Link>

        {projects.data && projects.data.length > 0 && (
          <>
            <div className="gx-rail__label">Recent</div>
            <ul className="gx-rail__list">
              {projects.data.map((p) => (
                <li key={p.id}>
                  <NavLink
                    to={`/projects/${p.id}`}
                    className={({ isActive }) => `gx-conv${isActive ? ' is-active' : ''}`}
                    title={p.name}
                  >
                    {p.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        )}

        {projects.data && projects.data.length === 0 && (
          <p className="gx-empty" style={{ padding: '1.25rem 0.9rem' }}>
            Nothing here yet. Start a build and it will show up in this list.
          </p>
        )}

        <div className="gx-rail__foot">
          <AccountMenu email={email} isAdmin={isAdmin} />
        </div>
      </aside>

      {railOpen && (
        <button type="button" className="gx-scrim" onClick={() => setRailOpen(false)} aria-label="Close navigation" />
      )}

      <main id="main-content" className="gx-main">
        <Outlet context={{ openRail: () => setRailOpen(true) }} />
      </main>
    </div>
  );
}
