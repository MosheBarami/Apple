// App shell: left sidebar (brand, nav, user), collapsible on mobile.
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { fetchMe } from '../lib/api';
import { GolemGlyph } from './glyphs';

function NavIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  projects: 'M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  usage: 'M5 20V10m7 10V4m7 16v-7',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm8 3a8 8 0 0 0-.2-1.7l2-1.5-2-3.4-2.3 1a8 8 0 0 0-2.9-1.7L14.2 2h-4l-.4 2.4a8 8 0 0 0-2.9 1.7l-2.3-1-2 3.4 2 1.5A8 8 0 0 0 4 12c0 .6.1 1.1.2 1.7l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 2.9 1.7l.4 2.4h4l.4-2.4a8 8 0 0 0 2.9-1.7l2.3 1 2-3.4-2-1.5c.1-.6.2-1.1.2-1.7z',
  docs: 'M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm9 0v4h4M9 12h6M9 16h6',
  admin: 'M12 3l7 4v5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V7z',
};

export function AppLayout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000, retry: 1 });
  const isAdmin = me.data?.profile?.is_admin === true;

  // Close the mobile sidebar on navigation.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const email = session?.user.email ?? '';

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar">
        <button
          type="button"
          className="icon-btn menu-btn"
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
          <GolemGlyph size={22} /> Golem
        </span>
      </header>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`} aria-label="Primary">
        <div className="sidebar-brand">
          <GolemGlyph size={30} />
          <span className="wordmark">Golem</span>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <NavIcon d={ICONS.projects} />
            Projects
          </NavLink>
          <NavLink to="/usage" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <NavIcon d={ICONS.usage} />
            Usage
          </NavLink>
          <a className="nav-item" href="/docs" target="_blank" rel="noopener noreferrer">
            <NavIcon d={ICONS.docs} />
            Docs
            <span className="nav-ext" aria-label="(opens in a new tab)">
              ↗
            </span>
          </a>
          <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <NavIcon d={ICONS.settings} />
            Settings
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <NavIcon d={ICONS.admin} />
              Admin
            </NavLink>
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="user-row" title={email}>
            <span className="user-avatar" aria-hidden="true">
              {(email[0] ?? '?').toUpperCase()}
            </span>
            <span className="user-email">{email}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm signout-btn"
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
