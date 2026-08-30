// /login and /signup — branded split layout with email/password auth.
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { GolemGlyph } from '../components/glyphs';

function AuthHero() {
  return (
    <div className="auth-hero" aria-hidden="true">
      <div className="auth-hero-inner">
        <div className="auth-hero-brand">
          <GolemGlyph size={44} />
          <span className="wordmark wordmark-lg">Golem</span>
        </div>
        <h1 className="auth-hero-title">
          Describe it.
          <br />
          Golem builds it.
        </h1>
        <p className="auth-hero-sub">
          Tell Golem what your Roblox game should do — it writes the scripts, places the parts, and wires it all up,
          live in Studio.
        </p>
        <ul className="auth-hero-points">
          <li>
            <span className="mode-dot mode-dot-clay" /> Clay — fast answers and small edits
          </li>
          <li>
            <span className="mode-dot mode-dot-stone" /> Stone — builds features across your project
          </li>
          <li>
            <span className="mode-dot mode-dot-rune" /> Rune — plans, builds, tests and fixes autonomously
          </li>
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

  const from = (location.state as { from?: string } | null)?.from ?? '/';

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
      <AuthHero />
      <div className="auth-form-col">
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
      <AuthHero />
      <div className="auth-form-col">
        {sentTo ? (
          <div className="auth-card" role="status">
            <div className="auth-mail-icon" aria-hidden="true">
              ✉️
            </div>
            <h2 className="auth-card-title">Check your email</h2>
            <p className="auth-card-sub">
              We sent a confirmation link to <strong>{sentTo}</strong>. Click it, then come back and sign in — your
              golem will be waiting.
            </p>
            <Link to="/login" className="btn btn-primary btn-block">
              Go to sign in
            </Link>
          </div>
        ) : (
          <form className="auth-card" onSubmit={onSubmit} noValidate>
            <h2 className="auth-card-title">Summon your golem</h2>
            <p className="auth-card-sub">Free to start — 80 Sparks a day.</p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
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
