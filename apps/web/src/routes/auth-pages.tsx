// /login, /signup, /forgot, /reset and /confirm — a carved split layout with email/password auth.
//
// Every decision on these screens lives in lib/auth-flows.ts, and the reason is the bug this file
// used to carry: `friendlyAuthError` answered "already registered" with "That email already has an
// account. Sign in instead." — which turned the sign-up form into a free membership lookup for
// anyone with a list of addresses. A message table inside a component is a message table nothing
// can test, so the table moved out and the screens below only render what the model decided.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { safeInternalPath } from '../lib/safe-redirect';
import { PRODUCT_MODE_INFO, type ProductMode } from '@golem/shared';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { AppleGlyph } from '../components/glyphs';
import {
  CHECK_EMAIL_LINE,
  PASSWORD_MIN,
  type AuthOutcome,
  authErrorMessage,
  emailRedirectTo,
  parseAuthLink,
  passwordProblem,
  resetRequestOutcome,
  signInOutcome,
  signupOutcome,
} from '../lib/auth-flows';

const MODES: ProductMode[] = ['plan', 'agent', 'super'];

function ThemeCorner() {
  const { theme, setTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <div className="auth-theme-toggle">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setTheme(next)}
        aria-label={`Switch to ${next} theme`}
      >
        {theme === 'dark' ? 'Daylight' : 'Night'}
      </button>
    </div>
  );
}

function AuthHero() {
  return (
    <div className="auth-hero">
      <div className="auth-hero-inner">
        <div className="auth-hero-brand">
          <AppleGlyph size={38} />
          <span className="wordmark wordmark-lg">Apple</span>
        </div>
        <h1 className="auth-hero-title carved">
          Describe it.
          <br />
          Apple builds it.
        </h1>
        <p className="auth-hero-sub">
          Tell Apple what your Roblox game should do. It writes the scripts, places the parts and wires it all up —
          live in Studio, while you watch.
        </p>
        <ul className="auth-hero-points">
          {MODES.map((m) => (
            <li key={m}>
              <span className={`mode-dot mode-dot-${m}`} aria-hidden="true" />
              <strong>{PRODUCT_MODE_INFO[m].name}</strong> — {PRODUCT_MODE_INFO[m].blurb}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The shell every one of these screens sits in. Extracted so five pages cannot drift apart. */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <ThemeCorner />
      <AuthHero />
      <div className="auth-form-col">
        {/* The hero is hidden below 900px; without this the signed-out mobile
            page would carry no brand at all. */}
        <div className="auth-mobile-brand" aria-hidden="true">
          <AppleGlyph size={26} />
          <span className="wordmark">Apple</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * The "we may have sent you mail" card.
 *
 * ONE COMPONENT FOR ALL FOUR FLOWS, and that is the load-bearing part rather than tidiness: sign-up,
 * reset, address change and resend all end here, saying the same conditional sentence. Four
 * separately worded cards is four chances for one of them to be written as "we sent it", which is
 * the leak again in a different font.
 */
function CheckEmailCard({
  title,
  address,
  children,
  onResend,
  resending,
  resent,
}: {
  title: string;
  address: string;
  children?: ReactNode;
  onResend?: () => void;
  resending?: boolean;
  resent?: boolean;
}) {
  return (
    <div className="auth-card" role="status">
      <div className="auth-mail-icon" aria-hidden="true">
        ✉
      </div>
      <h2 className="auth-card-title">{title}</h2>
      <p className="auth-card-sub">
        {CHECK_EMAIL_LINE} We used <strong>{address}</strong>.
      </p>
      {children}
      {onResend && (
        <>
          <button type="button" className="btn btn-block" onClick={onResend} disabled={resending || resent}>
            {resending ? 'Sending…' : resent ? 'Sent — check again in a minute' : 'Send it again'}
          </button>
          {/* Said out loud rather than discovered: the second link invalidates the first, and
              someone with two mails open will otherwise click the older one and land on an
              "expired" screen they have no way to explain. */}
          <p className="field-hint">A new link replaces the old one, so use the most recent mail.</p>
        </>
      )}
      <Link to="/login" className="btn btn-primary btn-block">
        Go to sign in
      </Link>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}

/* ------------------------------------------------------------------- sign in --- */

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validated, not trusted: the catch-all route sits INSIDE AuthGuard, so this
  // path may have been chosen by whoever sent the link. See lib/safe-redirect.
  const from = safeInternalPath((location.state as { from?: string } | null)?.from);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    const outcome = signInOutcome(err);
    if (outcome.kind === 'retry') {
      setError(outcome.message);
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <h2 className="auth-card-title">Welcome back</h2>
        <p className="auth-card-sub">Sign in to keep building.</p>
        <FormError message={error} />
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth-switch">
          {/* Carries the address they have already typed, so the next screen does not ask for it
              again. A "forgot password" link that restarts the form is how people give up. */}
          <Link to={`/forgot${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}>
            Forgot your password?
          </Link>
        </p>
        <p className="auth-switch">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------- sign up --- */

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent'>('idle');
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const bad = passwordProblem(password, { email });
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    const address = email.trim();
    const { data, error: err } = await supabase.auth.signUp({
      email: address,
      password,
      // WITHOUT THIS the confirmation link points at Supabase's own site_url, which is not
      // necessarily this app — the link "works" and drops the user somewhere that cannot finish
      // the job. /confirm is the route that can.
      options: { emailRedirectTo: emailRedirectTo('/confirm') },
    });
    setBusy(false);
    const outcome: AuthOutcome = signupOutcome(data, err, address);
    if (outcome.kind === 'retry') {
      setError(outcome.message);
      return;
    }
    if (outcome.kind === 'signed-in') {
      navigate('/', { replace: true });
      return;
    }
    setSentTo(outcome.address);
  };

  const resendConfirmation = async () => {
    if (!sentTo || resend !== 'idle') return;
    setResend('sending');
    // The outcome is not read, and that is deliberate: `resend` for an address with nothing to
    // resend errors, and reporting that error is the enumeration oracle wearing a third hat.
    await supabase.auth.resend({
      type: 'signup',
      email: sentTo,
      options: { emailRedirectTo: emailRedirectTo('/confirm') },
    });
    setResend('sent');
  };

  return (
    <AuthShell>
      {sentTo ? (
        <CheckEmailCard
          title="Check your email"
          address={sentTo}
          onResend={resendConfirmation}
          resending={resend === 'sending'}
          resent={resend === 'sent'}
        >
          <p className="auth-card-sub">Click the link to confirm your address, then come back and sign in.</p>
        </CheckEmailCard>
      ) : (
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <h2 className="auth-card-title">Summon your apple</h2>
          <p className="auth-card-sub">Free to start. No card, no Studio setup beyond one plugin.</p>
          <FormError message={error} />
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${PASSWORD_MIN} characters`}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email.trim() || !password}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

/* ------------------------------------------------------------ forgot password --- */

export function ForgotPasswordPage() {
  const location = useLocation();
  const initial = new URLSearchParams(location.search).get('email') ?? '';
  const [email, setEmail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const request = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const address = email.trim();
    const { error: err } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: emailRedirectTo('/reset'),
    });
    setBusy(false);
    const outcome = resetRequestOutcome(err, address);
    if (outcome.kind === 'retry') {
      setError(outcome.message);
      return;
    }
    setSentTo(address);
  };

  return (
    <AuthShell>
      {sentTo ? (
        <CheckEmailCard title="Check your email" address={sentTo}>
          <p className="auth-card-sub">The link lets you set a new password. It is good for one hour.</p>
        </CheckEmailCard>
      ) : (
        <form className="auth-card" onSubmit={request} noValidate>
          <h2 className="auth-card-title">Reset your password</h2>
          <p className="auth-card-sub">Give us the address you signed up with and we will send a link.</p>
          <FormError message={error} />
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Send the link'}
          </button>
          <p className="auth-switch">
            Remembered it? <Link to="/login">Sign in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

/* -------------------------------------------------------------- reset password --- */

/**
 * Where a recovery link lands.
 *
 * NOT BEHIND `GuestGuard`, and this is the detail that makes the difference between a working reset
 * and an infuriating one. `detectSessionInUrl` turns the token in the fragment into a real session
 * before this component renders — so a guard that bounces signed-in visitors to the dashboard would
 * bounce the person holding a valid reset link, leaving them signed in with the password they came
 * here to change and no screen to change it on.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  // Read ONCE, on mount. supabase-js strips the fragment after it consumes the token, so a later
  // read of window.location sees an empty hash and would call a good link "no link at all".
  const [link] = useState(() => parseAuthLink(window.location));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // A recovery token only becomes a session asynchronously; until it has, "no session" is not yet
  // evidence that the link failed.
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setHasSession(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setHasSession(Boolean(session));
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const bad = passwordProblem(password);
    if (bad) {
      setError(bad);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(authErrorMessage(err));
      return;
    }
    setDone(true);
  };

  if (link.failure) {
    return (
      <AuthShell>
        <ExpiredLinkCard failure={link.failure} detail={link.detail} what="reset" />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <div className="auth-card" role="status">
          <h2 className="auth-card-title">Password changed</h2>
          <p className="auth-card-sub">
            You are signed in on this device. Any other device using the old password will have to sign in again.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/', { replace: true })}>
            Continue
          </button>
        </div>
      </AuthShell>
    );
  }

  // Arrived with no link and no session: there is nothing to reset here.
  if (!link.ok && hasSession === false) {
    return (
      <AuthShell>
        <div className="auth-card">
          <h2 className="auth-card-title">Nothing to reset</h2>
          <p className="auth-card-sub">
            This page is where a password-reset link lands. Ask for one and we will send it.
          </p>
          <Link to="/forgot" className="btn btn-primary btn-block">
            Send me a link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h2 className="auth-card-title">Choose a new password</h2>
        <p className="auth-card-sub">At least {PASSWORD_MIN} characters. Make it one you have not used elsewhere.</p>
        <FormError message={error} />
        <label className="field">
          <span className="field-label">New password</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            autoFocus
            minLength={PASSWORD_MIN}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">New password again</span>
          <input
            type="password"
            name="passwordConfirm"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password || !confirm}>
          {busy ? 'Saving…' : 'Set the new password'}
        </button>
      </form>
    </AuthShell>
  );
}

/* -------------------------------------------------------------- the dead link --- */

/**
 * The screen for a link that did not work — and it exists because "expired" and "invalid" must not
 * be the same screen.
 *
 * `collab.ts` already draws this line for invitations, with a comment saying why: "you were never
 * invited" and "your invitation ran out" have to stay separable, because only one of them has a way
 * forward. A reset link is the same shape of fact. Someone who opened their mail an hour late needs
 * one button, and it is not "contact support".
 */
function ExpiredLinkCard({
  failure,
  detail,
  what,
}: {
  failure: 'expired' | 'invalid' | 'denied' | 'server';
  detail?: string;
  what: 'reset' | 'confirm';
}) {
  const expired = failure === 'expired';
  const where = what === 'reset' ? '/forgot' : '/signup';
  return (
    <div className="auth-card" role="status">
      <h2 className="auth-card-title">{expired ? 'That link has expired' : 'That link did not work'}</h2>
      <p className="auth-card-sub">
        {expired
          ? 'Links are good for one hour, and each new one replaces the last. Ask for a fresh one and it will work.'
          : failure === 'server'
            ? 'The identity service had a problem, not you. Try again in a moment.'
            : 'It may have already been used, or it may have been cut short by your mail client.'}
      </p>
      {detail && <p className="field-hint">The service said: {detail}</p>}
      <Link to={where} className="btn btn-primary btn-block">
        {what === 'reset' ? 'Send me a new reset link' : 'Send me a new confirmation link'}
      </Link>
      <p className="auth-switch">
        <Link to="/login">Back to sign in</Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- confirm email --- */

/**
 * Where a sign-up confirmation link lands.
 *
 * Outside the guards for the same reason `/reset` is: a confirmation link establishes a session, and
 * `GuestGuard` would redirect this away before it could say whether the confirmation worked. The
 * user would arrive at a dashboard having never been told that the thing they clicked succeeded.
 */
export function ConfirmEmailPage() {
  const navigate = useNavigate();
  const [link] = useState(() => parseAuthLink(window.location));
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [address, setAddress] = useState('');

  const failed = link.failure !== undefined;

  useEffect(() => {
    if (failed) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) {
        // Confirmed AND signed in. Nothing to decide, so do not make them press a button that
        // means "yes, I would like the thing I already asked for".
        navigate('/', { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [failed, navigate]);

  const sendAnother = async () => {
    const to = address.trim();
    if (!to || resend !== 'idle') return;
    setResend('sending');
    await supabase.auth.resend({
      type: 'signup',
      email: to,
      options: { emailRedirectTo: emailRedirectTo('/confirm') },
    });
    setResend('sent');
  };

  if (failed) {
    return (
      <AuthShell>
        {resend === 'sent' ? (
          <CheckEmailCard title="On its way" address={address.trim()} />
        ) : (
          <div className="auth-card">
            <h2 className="auth-card-title">
              {link.failure === 'expired' ? 'That link has expired' : 'That link did not work'}
            </h2>
            <p className="auth-card-sub">
              {link.failure === 'expired'
                ? 'Confirmation links are good for one hour. Tell us the address and we will send another.'
                : 'It may have already been used. Tell us the address and we will send another.'}
            </p>
            {link.detail && <p className="field-hint">The service said: {link.detail}</p>}
            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={sendAnother}
              disabled={!address.trim() || resend !== 'idle'}
            >
              {resend === 'sending' ? 'Sending…' : 'Send a new confirmation link'}
            </button>
            <p className="auth-switch">
              <Link to="/login">Back to sign in</Link>
            </p>
          </div>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-card" role="status">
        <h2 className="auth-card-title">Address confirmed</h2>
        <p className="auth-card-sub">That is everything. Sign in and your apple is waiting.</p>
        <Link to="/login" className="btn btn-primary btn-block">
          Go to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

/** Exported for the settings page, which shows the same "check your email" card after a change. */
export { CheckEmailCard };
