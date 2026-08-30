// App shell: a quiet left rail with navigation and the user's projects, and a
// single scroll-free main area that each route fills as it sees fit.
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { fetchMe } from '../lib/api';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { GolemGlyph, ICONS, NavIcon } from './glyphs';

async function fetchRecentProjects(): Promise<ProjectRow[]> {
  if (MOCK_MODE) return mockProjects;
  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name, description, place_name, place_id, memory_summary, created_at, updated_at, last_activity_at')
    .order('updated_at', { ascending: false })
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectRow[];
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

export function AppLayout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000, retry: 1 });
  const projects = useQuery({ queryKey: ['projects-nav'], queryFn: fetchRecentProjects, staleTime: 30_000, retry: 1 });
  const isAdmin = me.data?.profile?.is_admin === true;
  const showLab = import.meta.env.DEV || MOCK_MODE;

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const email = session?.user.email ?? (MOCK_MODE ? 'builder@example.com' : '');
  const navClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? ' active' : ''}`;

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {sidebarOpen ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
        <span className="topbar-brand">
          <GolemGlyph size={20} /> Golem
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <ThemeSwitch />
        </span>
      </header>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`} aria-label="Primary">
        <Link to="/" className="sidebar-brand">
          <GolemGlyph size={26} />
          <span className="wordmark">Golem</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Main">
          <NavLink to="/" end className={navClass}>
            <NavIcon d={ICONS.projects} />
            Projects
          </NavLink>
          <NavLink to="/usage" className={navClass}>
            <NavIcon d={ICONS.usage} />
            Usage
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            <NavIcon d={ICONS.settings} />
            Settings
          </NavLink>
          <a className="nav-item" href="/docs" target="_blank" rel="noopener noreferrer">
            <NavIcon d={ICONS.docs} />
            Docs
            <span className="nav-ext" aria-hidden="true">
              ↗
            </span>
            <span className="visually-hidden">(opens in a new tab)</span>
          </a>
          {showLab && (
            <NavLink to="/ui-lab" className={navClass}>
              <NavIcon d={ICONS.lab} />
              UI lab
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin" className={navClass}>
              <NavIcon d={ICONS.admin} />
              Admin
            </NavLink>
          )}
        </nav>

        {projects.data && projects.data.length > 0 && (
          <div className="sidebar-projects">
            <div className="sidebar-section-head">
              <span className="eyebrow">Recent</span>
            </div>
            <ul className="sidebar-project-list">
              {projects.data.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <NavLink
                    to={`/projects/${p.id}`}
                    className={({ isActive }) => `sidebar-project${isActive ? ' active' : ''}`}
                    title={p.name}
                  >
                    {p.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="sidebar-foot">
          <div className="user-row" title={email}>
            <span className="user-avatar" aria-hidden="true">
              {(email[0] ?? '?').toUpperCase()}
            </span>
            <span className="user-email">{email}</span>
            <span style={{ marginLeft: 'auto' }}>
              <ThemeSwitch />
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main id="main-content" className="main">
        <Outlet />
      </main>
    </div>
  );
}
