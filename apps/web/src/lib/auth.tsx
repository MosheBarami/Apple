// Auth context: tracks the Supabase session and exposes guard components.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Forge } from '../components/loading';
import { MOCK_MODE } from './mock';
import { clearAllDrafts } from './draft';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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
      // Drafts are the only user content this product keeps outside Postgres and outside RLS: the
      // user's own unsent words, in localStorage, on a device that may not be theirs. Nothing
      // cleared them, so a prompt typed by one person was waiting in the composer for whoever
      // signed in next. Hooked to the EVENT rather than to the signOut button so that a token
      // expiry and a session replaced by another account clear them too.
      if (event === 'SIGNED_OUT') clearAllDrafts();
      setSession(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>;
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
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Wraps /login and /signup: bounce authed users back into the app. */
export function GuestGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <AuthSplash />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}
