// /login, /signup, /forgot, /reset and /confirm — a carved split layout with email/password auth.
//
// Every decision on these screens lives in lib/auth-flows.ts, and the reason is the bug this file
// used to carry: `friendlyAuthError` answered "already registered" with "That email already has an
// account. Sign in instead." — which turned the sign-up form into a free membership lookup for
// anyone with a list of addresses. A message table inside a component is a message table nothing
// can test, so the table moved out and the screens below only render what the model decided.
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { safeInternalPath } from '../lib/safe-redirect';
import { capturePendingStart } from '../lib/pending-start';
import { STUDIO_PLUGIN_STORE_LIVE } from '@golem/shared';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { codeProblem, normaliseCode, secondStep, verifiedTotpFactors } from '../lib/mfa';
import { canSubmit as canSubmitRecovery, recoveryOutcome, type RecoveryOutcome } from '../lib/account-recovery';
import { submitRecoveryRequest } from '../lib/api';
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
import './auth.css';
import './nonworkspace-minimal.css';

/* ----------------------------------------------------------------- the three marks --- */

/**
 * The only iconography on this surface, and there are three of it.
 *
 * They are drawn here rather than imported from components/glyphs because they are not product
 * marks — they are the punctuation on a status card, and the alternative they replace was the
 * literal character `✉` set at whatever size the card inherited, which renders as a different
 * shape and a different weight in every font a customer's machine happens to resolve. A stroked
 * path at `currentColor` is the same object everywhere and inherits the one colour its container
 * is allowed to spend.
 */
function MailMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="5.5" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="m3.6 7 7.3 5.4a2 2 0 0 0 2.2 0L20.4 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function AlertMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 7.6v5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r=".95" fill="currentColor" />
    </svg>
  );
}

function DoneMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="m8.4 12.3 2.6 2.6 4.8-5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The disc a status card opens with.
 *
 * `alert` is the ONLY variant that takes a colour, and the reason is arithmetic rather than taste:
 * `--good` (#99d4b0) and `--accent` (#8fd3ab) are three points apart, so a green tick above the
 * green primary button is two green things on one screen — the exact defect docs/DESIGN-LOCK.md
 * rule 4 names. Success reads from the headline and from the single accented action beneath it.
 */
function CardMark({ kind }: { kind: 'mail' | 'alert' | 'done' }) {
  return (
    <span className={`auth-card__mark auth-card__mark--${kind}`} aria-hidden="true">
      {kind === 'mail' ? <MailMark /> : kind === 'alert' ? <AlertMark /> : <DoneMark />}
    </span>
  );
}

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
          <AppleGlyph size={28} />
          <span className="wordmark">Apple</span>
        </div>
        <p className="auth-hero-sub">
          Build directly in the Roblox Studio place you already have open.
        </p>
      </div>
    </div>
  );
}

/** The shell every one of these screens sits in. Extracted so five pages cannot drift apart. */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <ThemeCorner />
      <div className="auth-form-col">
        <AuthHero />
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
      <CardMark kind="mail" />
      <h2 className="auth-card-title">{title}</h2>
      {/* The address is the one word in this sentence a reader checks against what they typed, so it
          is set in the mono face rather than in `<strong>` — which is a weight this product does
          not have, and which the element rule in system.css never reset. */}
      <p className="auth-card-sub">
        {CHECK_EMAIL_LINE} We used <span className="mono">{address}</span>.
      </p>
      {children}
      {onResend && (
        <>
          <button
            type="button"
            className="btn btn-block"
            onClick={onResend}
            disabled={resending || resent}
            data-busy={resending ? 'true' : undefined}
            title={resent ? 'Already sent once — a second copy will not arrive any sooner' : undefined}
          >
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
      {/*[[ THE WAY OUT WHEN NO MAIL ARRIVES, WHICH IS A REAL CASE AND NOT AN EDGE ONE.
            Signing up with an address that ALREADY has an account returns 200 and sends nothing —
            deliberately, so that this screen cannot be used to discover who is registered. The
            owner of this product sat on this card four times in one hour waiting for a message
            that was never going to be sent, because the only thing it offered was patience.
            Nothing here reveals whether the account exists; it offers the two doors that work in
            the case where it does. */}
      <p className="auth-switch">
        No mail after a minute? You may already have an account —{' '}
        <Link to={`/forgot${address ? `?email=${encodeURIComponent(address)}` : ''}`}>reset your password</Link>.
      </p>
      {/* AND THE DOOR AFTER THAT ONE. The reset above fixes the common case — a sign-up against an
          address that already has an account, which returns 200 and sends nothing. It does not fix
          the case where the mail itself never arrives, and that person needs somewhere to go that
          is not this card again. */}
      <p className="auth-switch">
        Still nothing?{' '}
        <Link to={`/recovery${address ? `?email=${encodeURIComponent(address)}` : ''}`}>Tell us and we will look</Link>.
      </p>
    </div>
  );
}

/**
 * The one place a failure is reported on these screens.
 *
 * IT WAS A RED SENTENCE IN A COLUMN OF GREY ONES — 13px `--bad` between the subtitle and the first
 * label, which is the same size and the same position as more instructions. A person who mistypes
 * a password reads the card again looking for what changed. It is a panel now: the status token as
 * a hairline and an 8% tint, with a mark, so the thing that appeared is visibly a thing that
 * appeared. `role="alert"` was already right and stays.
 */
function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="form-error auth-card__error" role="alert">
      <AlertMark />
      <span>{message}</span>
    </p>
  );
}

/**
 * A password field with a way to see what you typed.
 *
 * WHY IT IS WORTH A COMPONENT. Every password on this surface is typed blind, and three of the five
 * screens ask for one that must be typed correctly the first time — a sign-up, and a reset that
 * asks twice. On a phone, with a soft keyboard that has already swallowed half the screen, a
 * mistyped character is invisible and the only feedback is a failure a minute later. The control is
 * a real button rather than an icon: it is announced, it is 34px tall, and `aria-pressed` says
 * which way it is currently set.
 *
 * The id is generated rather than hard-coded because ResetPasswordPage renders two of these on one
 * screen, and two labels pointing at the same id is a label pointing at the wrong field.
 */
function PasswordField({
  label,
  name,
  autoComplete,
  value,
  onChange,
  hint,
  invalid,
  autoFocus,
  minLength,
}: {
  label: string;
  name: string;
  autoComplete: 'current-password' | 'new-password';
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  minLength?: number;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="field__wrap">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          required
          autoFocus={autoFocus}
          minLength={minLength}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="field__reveal"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-controls={id}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- sign in --- */

/**
 * SIGN IN — and, for an account that has enrolled one, the second step.
 *
 * THE PASSWORD IS NOT THE END OF THIS PAGE. `signInWithPassword` succeeding produces a session at
 * assurance level aal1, which for an account with a verified factor is a half-finished sign-in. The
 * decision about that is `secondStep` in lib/mfa.ts, and it FAILS CLOSED: an assurance level that
 * cannot be read stops here and says so, rather than doing the comfortable thing and letting the
 * person in — which would turn any interference with the network into a password-only sign-in to an
 * account whose owner asked for a code every time.
 *
 * WHICH SCREEN IS SHOWING IS READ FROM THE SESSION, not from a local flag. `stepOwed` comes from
 * AuthProvider, so a reload in the middle of the challenge comes back to the code field rather than
 * to a password field for a password that has already been accepted.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { stepOwed, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the CODE is what was rejected, as opposed to the network or the account. The panel at
  // the top of the card says what went wrong; this is what puts the mark on the field the reader
  // has to change, and it is a separate fact because not every failure on that screen is the code's.
  const [codeBad, setCodeBad] = useState(false);

  // Validated, not trusted: the catch-all route sits INSIDE AuthGuard, so this
  // path may have been chosen by whoever sent the link. See lib/safe-redirect.
  const from = safeInternalPath((location.state as { from?: string } | null)?.from);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    const outcome = signInOutcome(err);
    if (outcome.kind === 'retry') {
      setBusy(false);
      setError(outcome.message);
      return;
    }
    // The password worked. Whether that is a sign-in depends on what this account asked for.
    const { data, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const next = secondStep(data, aalErr);
    setBusy(false);
    if (next.step === 'blocked') {
      setError(next.message);
      return;
    }
    // 'code' needs no branch here: AuthProvider read the same thing, and the code field below is
    // what this page renders while it is owed.
    if (next.step === 'in') navigate(from, { replace: true });
  };

  /**
   * The second step.
   *
   * The factor id is read fresh rather than carried from the password step, because the page may
   * have been reloaded since — and because an account with no verified factor must not be able to
   * reach a challenge at all. An unreadable list stops here; it does not fall through to "in".
   */
  const onVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problem = codeProblem(code);
    if (problem) {
      setCodeBad(true);
      setError(problem);
      return;
    }
    setError(null);
    setCodeBad(false);
    setBusy(true);
    const { data, error: listErr } = await supabase.auth.mfa.listFactors();
    const factor = listErr ? undefined : verifiedTotpFactors(data)[0];
    if (!factor) {
      setBusy(false);
      setError('We could not reach the verification settings on this account. Try signing in again.');
      return;
    }
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: normaliseCode(code),
    });
    setBusy(false);
    if (verifyErr) {
      setCodeBad(true);
      setError(authErrorMessage(verifyErr));
      setCode('');
      return;
    }
    navigate(from, { replace: true });
  };

  if (stepOwed?.step === 'blocked') {
    return (
      <AuthShell>
        <div className="auth-card" role="alert">
          <CardMark kind="alert" />
          <h2 className="auth-card-title">We could not finish signing you in</h2>
          <p className="auth-card-sub">{stepOwed.message}</p>
          {/* An exit, not a dead end: the half-made session is dropped so the password form comes
              back rather than this card returning for ever. */}
          <button type="button" className="btn btn-primary btn-block" onClick={() => void signOut()}>
            Start again
          </button>
          <p className="auth-switch">
            If it happens again, <Link to="/recovery">tell us what you saw</Link> and a person will look at it.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (stepOwed?.step === 'code') {
    return (
      <AuthShell>
        <form className="auth-card" onSubmit={onVerify} noValidate>
          <h2 className="auth-card-title">One more step</h2>
          <p className="auth-card-sub">Enter the six-digit code from your authenticator app.</p>
          <FormError message={error} />
          <label className="field">
            <span className="field-label">Verification code</span>
            <input
              name="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={12}
              required
              aria-invalid={codeBad ? 'true' : undefined}
              value={code}
              onChange={(e) => {
                // The mark comes off the field the moment it is being corrected. Leaving it on
                // while somebody retypes marks the input they are fixing as the one that is wrong.
                if (codeBad) setCodeBad(false);
                setCode(e.target.value);
              }}
              placeholder="123456"
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || !code.trim()}
            data-busy={busy ? 'true' : undefined}
            title={!code.trim() ? 'Enter the code from your authenticator app first' : undefined}
          >
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <p className="auth-switch">
            {/*[[ THIS USED TO BE A DEAD END, AND SAYING SO WAS THE HONEST THING AT THE TIME.
                  The sentence here read "Without that app you cannot get in — there are no backup
                  codes yet", which was true and left the person nowhere. /forgot is not the answer
                  either: a new password lands back on this same prompt, because the password was
                  never what was missing.

                  It now points at /recovery, which takes the message and puts it in a queue an
                  operator works. What it deliberately does NOT do is offer a code to type — there
                  are still no backup codes in this product, and a field for one would be a control
                  wired to nothing — or promise what the operator will decide. ]]*/}
            Lost the phone with that app on it? Your password will not help here — a new one returns
            you to this same screen.{' '}
            <Link to={`/recovery${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}>
              Tell us what happened
            </Link>{' '}
            and a person will look at it.
          </p>
          <p className="auth-switch">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
              Use a different account
            </button>
          </p>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        {/* "Sign in to keep building" was a mood. This says which two things the form wants, which
            is the difference between a person who has two addresses guessing and a person who
            knows. */}
        <h2 className="auth-card-title">Welcome back</h2>
        <p className="auth-card-sub">Use the address and password you signed up with.</p>
        <FormError message={error} />
        <label className="field">
          <span className="field-label">Email</span>
          {/* Focused on arrival. This route exists to take one pair of values and nothing else, so
              the caret starting anywhere but here costs every keyboard user a Tab and every screen
              reader user a hunt. */}
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            autoFocus
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || !email.trim() || !password}
          data-busy={busy ? 'true' : undefined}
          title={!email.trim() || !password ? 'Fill in both fields first' : undefined}
        >
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
          {/* THE RETURN PATH GOES WITH THEM, and it did not. `AuthGuard` sends a signed-out visitor
              here with `state.from` set to wherever they were trying to reach — for an invitee that
              is `/join?token=…`, the whole invitation. This link dropped it, so somebody who had
              never used the product before, arriving on a share link and doing the only thing open
              to them, lost the invitation at the click. */}
          New here? <Link to="/signup" state={from ? { from } : undefined}>Create an account</Link>
        </p>
        {/* THE THIRD LINK, and it is last on purpose. A reset fixes most of what brings people to
            this page, and offering the human queue first would fill it with requests that /forgot
            answers in seconds. This is for the person that link cannot reach: the mail never
            arrives, or the second factor is on a phone that is gone. */}
        <p className="auth-switch">
          Locked out and a reset will not help?{' '}
          <Link to={`/recovery${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}>Ask a person</Link>
        </p>
      </form>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------- sign up --- */

export function SignupPage() {
  // The same `from` the login page reads, for the same reason: an invitee who lands here rather
  // than on /login must end up back at their invitation, not at an empty project list.
  const location = useLocation();
  const from = safeInternalPath((location.state as { from?: string } | null)?.from);
  //[[ THE SENTENCE THEY TYPED ON THE LANDING PAGE.
  //   apps/site's hero is a real `<form action="/app/signup" method="get">` around a
  //   `<textarea name="start" maxlength="280">`, so pressing Build arrives here as
  //   `/app/signup?start=a+lobby+with+a+round+timer`. Nothing read it: a reader's own words
  //   reached the address bar and stopped there. It is held for this tab only and MOVED — not
  //   copied — into the first project they create. No copy on either page promises a prefill, so
  //   a browser that refuses storage simply does not offer one. ]]
  useEffect(() => { capturePendingStart(location.search); }, [location.search]);
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
      navigate(from ?? '/', { replace: true });
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
          {/* Conditional, because the unconditional version was false half the time. An address
              that already has an account gets no mail at all, and "click the link" then reads as an
              instruction the person cannot follow and cannot explain. */}
          <p className="auth-card-sub">If this address is new, the link confirms it. Then come back and sign in.</p>
        </CheckEmailCard>
      ) : (
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          {/* "Summon your apple" was the product's own vocabulary used where the product is not yet
              known. `Summon` is what this product calls starting a project — the dialog on the
              dashboard is named for it — and on the screen BEFORE the account exists it reads as a
              flourish rather than as an instruction. The heading on a form says what the form does. */}
          <h2 className="auth-card-title">Create your account</h2>
          {/* Derived from the same constant the install affordances obey, so it corrects itself.
              Until 2026-09-22 the plugin could not be obtained and this line said so; a sign-up page
              is the worst place to be the single optimistic exception, because it is read by exactly
              the people who have not learnt otherwise yet. Now that the listing is distributed it
              names the one thing Studio needs and where it comes from. */}
          <p className="auth-card-sub">
            {STUDIO_PLUGIN_STORE_LIVE
              ? 'Free to start, no card. Building in Studio needs one free plugin, Apple Studio, from the Creator Store.'
              : 'Free to start, no card. Chat works now; building inside Studio needs the plugin, and public installation is not open yet.'}
          </p>
          <FormError message={error} />
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              autoFocus
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          {/* THE REQUIREMENT MOVES OUT OF THE PLACEHOLDER. "At least 8 characters" was the
              placeholder, which means it was on screen exactly until the moment somebody started
              typing and disappeared for the whole time it was relevant. It is a hint now, it is
              wired to the field with aria-describedby, and it survives the first keystroke. */}
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            value={password}
            invalid={Boolean(error) && passwordProblem(password, { email }) !== null}
            hint={`At least ${PASSWORD_MIN} characters. Use one you have not used on another site.`}
            onChange={setPassword}
          />
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || !email.trim() || !password}
            data-busy={busy ? 'true' : undefined}
            title={!email.trim() || !password ? 'Fill in both fields first' : undefined}
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <p className="auth-switch">
            Already have an account? <Link to="/login" state={from ? { from } : undefined}>Sign in</Link>
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
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || !email.trim()}
            data-busy={busy ? 'true' : undefined}
            title={!email.trim() ? 'Enter the address you signed up with first' : undefined}
          >
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
/**
 * The mismatch sentence, as a constant rather than a literal in two places.
 *
 * It is compared against below to decide which FIELD to mark, and a message that is matched has to
 * be a name rather than a string somebody can retype slightly differently in one of the two spots.
 * It also tells the person what to do — "do not match" alone leaves a reader who cannot see either
 * value guessing which of the two boxes to fix.
 */
const PASSWORDS_DIFFER = 'The two passwords do not match — retype the second one.';

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
      setError(PASSWORDS_DIFFER);
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
          {/* Neutral, not green. `--good` and `--accent` are three points apart, and the button
              below is already spending the accent — see CardMark. */}
          <CardMark kind="done" />
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

  //[[ THE LOADING STATE THIS SCREEN NEVER HAD, and it was not a cosmetic omission.
  //
  //   `hasSession` starts null and the branch below only fires on `false`, so between mount and the
  //   first answer from getSession() a visitor with no readable token was shown the WORKING FORM —
  //   two password fields and a submit that cannot possibly succeed. They type, they submit, and
  //   the failure arrives afterwards. A fact that has not been read yet is not a fact that is
  //   false; until the session answers, the honest screen is this one.
  if (!link.ok && hasSession === null) {
    return (
      <AuthShell>
        <div className="auth-card" role="status" aria-busy="true">
          <CardMark kind="mail" />
          <h2 className="auth-card-title">Checking your link</h2>
          <p className="auth-card-sub">This takes a second. Keep the tab open.</p>
        </div>
      </AuthShell>
    );
  }

  // Arrived with no link and no session: there is nothing to reset here.
  if (!link.ok && hasSession === false) {
    return (
      <AuthShell>
        <div className="auth-card">
          <CardMark kind="alert" />
          <h2 className="auth-card-title">Nothing to reset</h2>
          <p className="auth-card-sub">
            This page is where a password-reset link lands. Ask for one and we will send it.
          </p>
          <Link to="/forgot" className="btn btn-primary btn-block">
            Send me a link
          </Link>
          <p className="auth-switch">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h2 className="auth-card-title">Choose a new password</h2>
        <p className="auth-card-sub">This replaces the old one everywhere you are signed in.</p>
        <FormError message={error} />
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          autoFocus
          minLength={PASSWORD_MIN}
          value={password}
          hint={`At least ${PASSWORD_MIN} characters. Use one you have not used on another site.`}
          onChange={setPassword}
        />
        {/* ONLY THE SECOND FIELD IS MARKED, because only the second field is the one to change. A
            mismatch tells you nothing about which of the two is wrong, and the message says to
            retype this one — so marking both would contradict the sentence above it. */}
        <PasswordField
          label="New password again"
          name="passwordConfirm"
          autoComplete="new-password"
          value={confirm}
          invalid={error === PASSWORDS_DIFFER}
          onChange={setConfirm}
        />
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || !password || !confirm}
          data-busy={busy ? 'true' : undefined}
          title={!password || !confirm ? 'Type the new password in both fields first' : undefined}
        >
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
      {/* The one place on this surface a status token is spent, and it is spent on the card whose
          whole subject is something the reader has to act on. The action beneath it is still the
          accent, so the card carries one red thing and one green thing rather than two of either. */}
      <CardMark kind="alert" />
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
  //[[ "ADDRESS CONFIRMED" WAS PRINTED FOR A TOKEN NOBODY CHECKED.
  //
  //   This page had two states — the link declared a failure, or it did not — and the second one
  //   rendered "Address confirmed. Your address is verified." So /app/confirm with a made-up token,
  //   a truncated link, or nothing in the URL at all told the reader their address was verified.
  //   A reviewer typed a token they invented and the product congratulated them.
  //
  //   There are THREE states, and the missing one is the honest one. A confirmation is established
  //   by a SESSION: Supabase parses the link, exchanges it, and a session is what that produces.
  //   No failure and no session does not mean success, it means this page cannot tell — which is
  //   exactly what somebody whose mail client cut the link in half has hit.
  //
  //   `checking` starts true so nothing is claimed while we are still asking. Rendering the success
  //   card for one frame and then correcting it is the same lie told faster. ]]
  const [confirmed, setConfirmed] = useState<'checking' | 'yes' | 'unknown'>('checking');

  useEffect(() => {
    if (failed) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        // Confirmed AND signed in. Nothing to decide, so do not make them press a button that
        // means "yes, I would like the thing I already asked for".
        setConfirmed('yes');
        navigate('/', { replace: true });
        return;
      }
      setConfirmed('unknown');
    }, () => {
      // A session lookup that THREW is not a confirmation either. Falling through to the success
      // card on an error is how the original defect would come back wearing a different shape.
      if (!cancelled) setConfirmed('unknown');
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
            <CardMark kind="alert" />
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
                autoFocus
                inputMode="email"
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
              data-busy={resend === 'sending' ? 'true' : undefined}
              title={!address.trim() ? 'Enter the address you signed up with first' : undefined}
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

  if (confirmed === 'checking') {
    return (
      <AuthShell>
        <div className="auth-card" role="status">
          <h2 className="auth-card-title">Checking that link…</h2>
          <p className="auth-card-sub">One moment.</p>
        </div>
      </AuthShell>
    );
  }

  if (confirmed === 'unknown') {
    // NOT a failure card: nothing said the link was bad. It says what is true — this page could not
    // establish anything — and offers the one action that resolves it either way.
    return (
      <AuthShell>
        {resend === 'sent' ? (
          <CheckEmailCard title="On its way" address={address.trim()} />
        ) : (
          <div className="auth-card">
            <CardMark kind="alert" />
            <h2 className="auth-card-title">We could not tell whether that worked</h2>
            <p className="auth-card-sub">
              Nothing in that link confirmed an address — it may have been cut short by your mail client, or
              already used. If you have already confirmed, just sign in. Otherwise we can send another.
            </p>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
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
              data-busy={resend === 'sending' ? 'true' : undefined}
              title={!address.trim() ? 'Enter the address you signed up with first' : undefined}
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
        <CardMark kind="done" />
        <h2 className="auth-card-title">Address confirmed</h2>
        {/* "Sign in and your apple is waiting" was a flourish where a fact belongs: it tells a
            first-time visitor nothing about what the next screen wants. */}
        <p className="auth-card-sub">Your address is verified. Sign in with the password you chose.</p>
        <Link to="/login" className="btn btn-primary btn-block">
          Go to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

/* ---------------------------------------------------------- account recovery (the last door) --- */

/**
 * `/recovery` — for somebody every other door has already failed.
 *
 * WHY THERE HAS TO BE A PAGE AND NOT JUST A MAILTO. Each recovery path this product has needs the
 * thing that is missing: `/forgot` mails the inbox they cannot open, the two-step prompt wants the
 * phone that broke, and `/settings` is behind the sign-in that is failing. Before this existed the
 * interface had nowhere at all to say "none of those work" — the audit for this section grepped
 * the whole tree for `support@`, `locked out` and `account recovery` and found only the checklist
 * lines asking for them. The owner of this product spent a week outside his own account with the
 * screen's entire offer being to try again.
 *
 * THE SCREEN NEVER DECIDES ANYTHING ITSELF. `recoveryOutcome` owns the one judgement that matters
 * — whether the plea was actually written down — because the comfortable wrong answer here is a
 * thank-you printed over a 503, to a person who will then wait for a reply nobody will send. The
 * three outcomes are rendered differently and the failed one keeps the form filled in, so trying
 * again does not mean typing it all again.
 *
 * AND IT SAYS NOTHING ABOUT THE ADDRESS. The worker cannot discover whether an account exists, so
 * the acknowledgement is the hedged sentence this product uses everywhere else.
 */
export function RecoveryRequestPage() {
  const location = useLocation();
  const initial = new URLSearchParams(location.search).get('email') ?? '';
  const [email, setEmail] = useState(initial);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RecoveryOutcome | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !canSubmitRecovery(email)) return;
    setBusy(true);
    // The reply is not interpreted here — see the module's own note on why that matters.
    const reply = await submitRecoveryRequest(email.trim(), note.trim());
    setBusy(false);
    setOutcome(recoveryOutcome(reply));
  };

  if (outcome?.kind === 'received') {
    return (
      <AuthShell>
        <div className="auth-card" role="status">
          <CardMark kind="done" />
          <h2 className="auth-card-title">That is with us</h2>
          <p className="auth-card-sub">{outcome.message}</p>
          {/* Said plainly, because the alternative is somebody filing the same plea six times and
              pushing everyone else down a queue that is worked oldest-first. A repeat is absorbed
              server-side, so this is a description of what happens, not a rule being asked for. */}
          <p className="field-hint">
            Sending this again will not move you up — repeats are folded into the request you already made.
          </p>
          <Link to="/login" className="btn btn-primary btn-block">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={send} noValidate>
        <h2 className="auth-card-title">Locked out of your account</h2>
        <p className="auth-card-sub">
          If the reset link never arrives, or you have lost the phone with your codes on it, tell us here and a
          person will look at it.
        </p>
        {/* THE TWO FASTER DOORS FIRST. Most people who land here have not actually exhausted the
            self-service paths — they have hit the case where signing up again with an existing
            address returns success and sends nothing. That one is fixed by /forgot in seconds,
            and pointing at it is worth more than a queue position. */}
        <p className="field-hint">
          Worth trying first: <Link to={`/forgot${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}>a
          password reset</Link>, which also works when a sign-up confirmation never came.
        </p>
        {/* `received` already returned above, so anything still here is a 'retry' or a 'failed' and
            both belong in the error slot. The narrowing is the type system's, not a convention. */}
        {outcome && <FormError message={outcome.message} />}
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            autoFocus
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span className="field-label">What happened</span>
          <textarea
            name="note"
            rows={4}
            maxLength={600}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="I set up two-step verification and my phone was replaced."
          />
          {/* The note is optional and the form never said so, so a person with nothing to add sat
              in front of a box wondering whether it was the thing blocking them. It is not: the
              address alone is enough to file, and `canSubmitRecovery` only ever reads the address. */}
          <p className="field-hint">Optional, and it helps. Say what you tried and what happened.</p>
        </label>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={busy || !canSubmitRecovery(email)}
          data-busy={busy ? 'true' : undefined}
          title={!canSubmitRecovery(email) ? 'Enter the address on the account first' : undefined}
        >
          {busy ? 'Sending…' : 'Ask for help'}
        </button>
        <p className="auth-switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}

/** Exported for the settings page, which shows the same "check your email" card after a change. */
export { CheckEmailCard };
