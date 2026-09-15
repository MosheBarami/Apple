// Auth context: tracks the Supabase session and exposes guard components.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Forge } from '../components/loading';
import { MOCK_MODE } from './mock';
import { clearAllDrafts } from './draft';
import { clearAllSearchHistory } from './search-history';
import { clearAllViewState } from './view-state';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Ends every session this account has, on every device. See below. */
  signOutEverywhere: () => Promise<{ ok: boolean; message?: string }>;
  /** When this tab last watched a password re-entered, as epoch ms. See lib/auth-flows.ts. */
  reauthenticatedAt: number | null;
  markReauthenticated: () => void;
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  signOut: async () => {},
  signOutEverywhere: async () => ({ ok: false }),
  reauthenticatedAt: null,
  markReauthenticated: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * When this TAB last watched a password re-entered.
   *
   * In memory only, and that is the point rather than an omission: persisting it would mean a
   * re-authentication survives a reload, which is the same as not having one. It exists because a
   * refreshed access token carries the ORIGINAL `last_sign_in_at`, so without it someone who has
   * just typed their password into the re-auth dialog would be asked for it again by the very next
   * action. See `freshestAuth` in lib/auth-flows.ts.
   */
  const [reauthenticatedAt, setReauthenticatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (MOCK_MODE) {
      // Design-review mode: pretend a session exists so the signed-in surfaces
      // can be reviewed. Never reachable in a production build.
      setSession({ user: { id: 'mock-user', email: 'builder@example.com' } } as unknown as Session);
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Drafts are not the only user content this product keeps outside Postgres and outside RLS:
      // the user's own unsent words, in localStorage, on a device that may not be theirs. Nothing
      // cleared them, so a prompt typed by one person was waiting in the composer for whoever
      // signed in next. Hooked to the EVENT rather than to the signOut button so that a token
      // expiry and a session replaced by another account clear them too.
      //
      // SEARCH HISTORY IS THE SAME KIND OF THING and was added later: what someone searched for is
      // their words about their project, and a list of recent queries sitting in the panel for the
      // next person to sign in is the same leak wearing different clothes. The stored view state
      // goes with them — it is only preferences, but it names the projects they had open.
      if (event === 'SIGNED_OUT') {
        clearAllDrafts();
        clearAllSearchHistory();
        clearAllViewState();
      }
      setSession(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // Deliberately local scope. "Sign out" on this machine means this machine — someone signing out
    // of a borrowed laptop should not also be logging themselves out of the desktop at home, and a
    // button that silently did would be the product overreaching.
    await supabase.auth.signOut({ scope: 'local' });
  };

  /**
   * The other one, and it is a different action rather than a stronger version of the same one.
   *
   * `scope: 'global'` revokes every refresh token this account has, so every other browser and
   * every other device is signed out at its next request. This is what someone reaches for after
   * losing a laptop or finding a session they do not recognise, which is why the settings page
   * gates it behind a re-authentication: it is exactly the action an attacker sitting at an
   * unlocked machine would want, in reverse — lock the real owner out of everything.
   *
   * The error is RETURNED rather than swallowed. A "signed out everywhere" toast over a request
   * that failed is the worst outcome available here: the user believes the stolen session is dead
   * and stops looking.
   */
  const signOutEverywhere = async (): Promise<{ ok: boolean; message?: string }> => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  };

  const markReauthenticated = () => setReauthenticatedAt(Date.now());

  return (
    <AuthContext.Provider
      value={{ session, loading, signOut, signOutEverywhere, reauthenticatedAt, markReauthenticated }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Full-screen splash while the initial session loads. */
function AuthSplash() {
  return (
    <div className="auth-splash">
      <Forge kind="recalling" label="Waking the apple" compact />
    </div>
  );
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthSplash />;
  // PATHNAME AND SEARCH, not pathname alone. A share link is `/app/join?token=…` and the token is
  // the entire content of it: stashing only the path sent a signed-out recipient back to an empty
  // Join box after logging in, with nothing on screen explaining where their invitation went.
  // `safeInternalPath` at the other end already accepts a query string and rejects anything that
  // is not a rooted same-origin path.
  if (!session) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <>{children}</>;
}

/** Wraps /login and /signup: bounce authed users back into the app. */
export function GuestGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <AuthSplash />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}
