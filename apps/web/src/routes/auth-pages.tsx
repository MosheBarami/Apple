// /login and /signup — a carved split layout with email/password auth.
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { safeInternalPath } from '../lib/safe-redirect';
import { PRODUCT_MODE_INFO, type ProductMode } from '@golem/shared';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { AppleGlyph } from '../components/glyphs';

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

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password. Try again.';
  if (m.includes('email not confirmed')) return 'Confirm your email first — check your inbox for the link.';
  if (m.includes('already registered')) return 'That email already has an account. Sign in instead.';
  if (m.includes('rate limit')) return 'Too many attempts — wait a minute and try again.';
  return message;
}

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
    if (err) {
      setError(friendlyAuthError(err.message));
      return;
    }
    navigate(from, { replace: true });
  };

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
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <h2 className="auth-card-title">Welcome back</h2>
          <p className="auth-card-sub">Sign in to keep building.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
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
            New here? <Link to="/signup">Create an account</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      setError(friendlyAuthError(err.message));
      return;
    }
    // If email confirmation is disabled, a session comes back immediately.
    if (data.session) {
      navigate('/', { replace: true });
      return;
    }
    setSentTo(email.trim());
  };

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
        {sentTo ? (
          <div className="auth-card" role="status">
            <div className="auth-mail-icon" aria-hidden="true">
              ✉
            </div>
            <h2 className="auth-card-title">Check your email</h2>
            <p className="auth-card-sub">
              We sent a confirmation link to <strong>{sentTo}</strong>. Click it, then come back and sign in — your
              apple will be waiting.
            </p>
            <Link to="/login" className="btn btn-primary btn-block">
              Go to sign in
            </Link>
          </div>
        ) : (
          <form className="auth-card" onSubmit={onSubmit} noValidate>
            <h2 className="auth-card-title">Summon your apple</h2>
            <p className="auth-card-sub">Free to start. No card, no Studio setup beyond one plugin.</p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
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
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
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
      </div>
    </div>
  );
}
