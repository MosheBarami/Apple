// Auth context: tracks the Supabase session and exposes guard components.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Forge } from '../components/loading';
import { MOCK_MODE } from './mock';
import { clearAllDrafts } from './draft';
import { clearAllSearchHistory } from './search-history';
import { clearAllViewState } from './view-state';
import { secondStep, type SignInStep } from './mfa';
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
  /**
   * Whether this session has finished signing in, or still owes a verification code.
   *
   * NULL MEANS NOT YET KNOWN, and that is a third state rather than a convenience: `{step:'in'}`
   * is a claim that this session is complete, and the moment before the answer arrives is not the
   * moment to make it. The guards treat null as "wait", never as "yes".
   */
  stepOwed: SignInStep | null;
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  signOut: async () => {},
  signOutEverywhere: async () => ({ ok: false }),
  reauthenticatedAt: null,
  markReauthenticated: () => {},
  stepOwed: null,
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

  /**
   * TWO-STEP VERIFICATION IS ENFORCED HERE, NOT ONLY ON THE SIGN-IN FORM.
   *
   * A password that works produces a session immediately — at assurance level aal1 — and that
   * session is persisted. So a check that lived only in the sign-in handler would be finished by
   * closing the tab: reload, and the restored aal1 session walks into the app past a factor its
   * owner enrolled precisely to stop that. The question therefore belongs to whatever holds the
   * session, and the guards below ask it on every render.
   *
   * The read is local: `getAuthenticatorAssuranceLevel` decodes the access token's `aal` claim and
   * compares it against the factors on the persisted user. No network, so this costs a tick, not a
   * round trip — and `secondStep` still treats an unreadable answer as a reason to stop rather than
   * as permission.
   *
   * WHAT THIS IS NOT. It is a gate on this product's own screens. apps/worker verifies the JWT and
   * does not inspect `aal`, so a stolen aal1 token still opens the API directly; closing that needs
   * the worker to know which accounts have a factor, which needs an admin key this deployment does
   * not hold. Said plainly here so the next reader does not mistake the scope.
   */
  const [stepOwed, setStepOwed] = useState<SignInStep | null>(null);
  const token = session?.access_token ?? null;
  useEffect(() => {
    if (MOCK_MODE) {
      setStepOwed({ step: 'in' });
      return;
    }
    if (!token) {
      setStepOwed(null);
      return;
    }
    let cancelled = false;
    supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data, error }) => {
        if (!cancelled) setStepOwed(secondStep(data, error));
      })
      .catch((e: unknown) => {
        // A throw is an unreadable answer like any other, and `secondStep` fails closed on it.
        if (!cancelled) setStepOwed(secondStep(null, e));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

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
      value={{ session, loading, signOut, signOutEverywhere, reauthenticatedAt, markReauthenticated, stepOwed }}
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
  const { session, loading, stepOwed } = useAuth();
  const location = useLocation();
  if (loading) return <AuthSplash />;
  //[[ THE QUERY STRING TRAVELS WITH THE PATH.
  //
  //   `location.pathname` alone was enough while every guarded route was addressed by its path.
  //   /join is not: the whole content of a share link is `?token=…`, so stashing the path by
  //   itself sent someone who clicked a link to /login and then to a /join with nothing in it —
  //   the link silently losing its payload at the one moment the person is least able to tell
  //   what went wrong. `safeInternalPath` at the sink already admits a query and refuses an
  //   off-origin target, so this widens what is remembered and not what is trusted.
  //
  //   BOTH return paths carry it. The second one is the step-up branch below, and a share link
  //   that survives the sign-in redirect only to lose its token at the second-factor redirect is
  //   the same bug with a longer walk to it.
  const from = `${location.pathname}${location.search}`;
  if (!session) return <Navigate to="/login" replace state={{ from }} />;
  // A SESSION IS NOT A FINISHED SIGN-IN. Until the assurance level has been read this waits, and
  // when it says a code is still owed — or could not be read at all — the person goes back to the
  // page that can finish it. Rendering the app in either case would be the whole feature undone.
  if (!stepOwed) return <AuthSplash />;
  if (stepOwed.step !== 'in') return <Navigate to="/login" replace state={{ from }} />;
  return <>{children}</>;
}

/** Wraps /login and /signup: bounce authed users back into the app. */
export function GuestGuard({ children }: { children: ReactNode }) {
  const { session, loading, stepOwed } = useAuth();
  if (loading) return <AuthSplash />;
  // Only a COMPLETE sign-in is bounced. While the level is being read, and while a code is owed,
  // this IS where the person belongs: /login is the screen that asks for the code. Bouncing them
  // on the mere existence of a session would unmount that screen mid-challenge.
  if (session && stepOwed?.step === 'in') return <Navigate to="/" replace />;
  return <>{children}</>;
}
