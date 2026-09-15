// /settings — profile, security, appearance, region, privacy, reset.
//
// Two things about the shape of this page, both of which are the feature rather than decoration:
//
//   * EVERY CONTROL IS REGISTERED in lib/settings-search.ts and carries a `data-setting` attribute
//     matching its id. That is what the search field at the top filters on, and
//     tests/settings-search.test.mjs checks the correspondence in both directions — a registry
//     entry with no control is a search result that goes nowhere, and a control with no entry is a
//     setting search cannot find.
//
//   * THE IDENTITY ACTIONS ASK WHO, NOT HOW SURE. Changing an address, changing a password and
//     ending every session go through ReauthDialog; resetting settings goes through BOTH that and
//     the existing typed-confirmation ladder. See lib/auth-flows.ts for why those are two different
//     questions.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MOCK_MODE, mockProfile } from '../lib/mock';
import { supabase, type ProfileRow } from '../lib/supabase';
import { Failure } from '../components/failure';
import { RobloxKeyPanel } from '../components/roblox-key-panel';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/toast';
import { usePrefs } from '../lib/theme';
import { ConfirmDialog } from '../components/confirm-dialog';
import { ReauthDialog } from '../components/reauth-dialog';
import { confirmationFor } from '../lib/confirm-model';
import {
  APPEARANCES,
  COMMON_TIME_ZONES,
  HOUR_CYCLES,
  MOTIONS,
  REGIONS,
  REGION_NAMES,
  changedPrefs,
  isDefaultPrefs,
  PREF_LABELS,
  type Appearance,
  type HourCycle,
  type MotionPref,
  type Region,
} from '../lib/prefs.ts';
import {
  emailChangeOutcome,
  emailRedirectTo,
  emailVerification,
  freshestAuth,
  needsReauth,
  passwordProblem,
  PASSWORD_MIN,
  authErrorMessage,
  type SensitiveAction,
} from '../lib/auth-flows';
import { fullStamp, formatNumber } from '../lib/format.ts';
import { matchSettings } from '../lib/settings-search.ts';

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  if (MOCK_MODE) return mockProfile;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, plan, is_admin, training_opt_in')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProfileRow | null) ?? null;
}

/* ------------------------------------------------------------- small parts --- */

/** A labelled row that search can hide. `hidden` rather than unmounting: state survives a query. */
function Row({ id, visible, children }: { id: string; visible: boolean; children: ReactNode }) {
  return (
    <div className="settings-row" data-setting={id} hidden={!visible}>
      {children}
    </div>
  );
}

function Section({ title, visible, children, danger }: { title: string; visible: boolean; children: ReactNode; danger?: boolean }) {
  return (
    <section className={`card settings-card${danger ? ' danger-card' : ''}`} hidden={!visible}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** A three-way choice, as radios. Used by appearance, motion and the clock. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  names,
  hint,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  names: Readonly<Record<string, string>>;
  hint?: ReactNode;
}) {
  return (
    <>
      <div className="theme-toggle" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={`theme-btn${value === option ? ' theme-btn-active' : ''}`}
            onClick={() => onChange(option)}
          >
            {names[option] ?? option}
          </button>
        ))}
      </div>
      {hint && <p className="muted">{hint}</p>}
    </>
  );
}

const APPEARANCE_NAMES: Record<Appearance, string> = {
  system: 'Match my system',
  dark: 'Night quarry',
  light: 'Quarry daylight',
};

const MOTION_NAMES: Record<MotionPref, string> = {
  system: 'Match my system',
  reduced: 'Always reduce',
  full: 'Keep motion on',
};

const HOUR_NAMES: Record<HourCycle, string> = {
  system: 'Match my region',
  h12: '12-hour',
  h23: '24-hour',
};

/* ------------------------------------------------------------------ page --- */

export function SettingsPage() {
  const { session, signOutEverywhere, reauthenticatedAt } = useAuth();
  const { prefs, setPref, resetPrefs, theme, systemTheme } = usePrefs();
  const { toast } = useToast();
  const qc = useQueryClient();
  const userId = session?.user.id ?? '';

  const profile = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId),
    enabled: userId.length > 0,
  });

  const [query, setQuery] = useState('');
  const matches = useMemo(() => new Set(matchSettings(query)), [query]);
  const shows = (id: string) => matches.has(id);
  const sectionShows = (...ids: string[]) => ids.some(shows);

  const [displayName, setDisplayName] = useState('');
  useEffect(() => {
    if (profile.data) setDisplayName(profile.data.display_name ?? '');
  }, [profile.data]);

  /* --- the identity gate ------------------------------------------------- */

  // The freshest proof we have: the token's own sign-in time, or a password re-entered in this tab,
  // whichever is later. See `freshestAuth` — a refreshed token carries the ORIGINAL time.
  const lastAuth = freshestAuth(session?.user.last_sign_in_at, reauthenticatedAt);
  const [pending, setPending] = useState<SensitiveAction | null>(null);
  const [reauthFor, setReauthFor] = useState<SensitiveAction | null>(null);

  /**
   * Run a sensitive action, asking for a password first when the session is not fresh.
   *
   * The action is STASHED rather than run-and-hoped: the dialog is asynchronous, so the work has to
   * survive until the password comes back. Stashing the name and looking it up in `RUN` means the
   * thing that runs afterwards is always the thing that was gated, and never a closure captured
   * from a render two states ago.
   */
  const guard = (action: SensitiveAction) => {
    if (needsReauth(action, lastAuth)) {
      setReauthFor(action);
      return;
    }
    setPending(action);
  };

  /* --- email -------------------------------------------------------------- */

  const verification = emailVerification(session?.user);
  const [newEmail, setNewEmail] = useState('');
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);

  const changeEmail = useMutation({
    mutationFn: async (address: string) => {
      const { error } = await supabase.auth.updateUser(
        { email: address },
        { emailRedirectTo: emailRedirectTo('/confirm') },
      );
      return emailChangeOutcome(error, address);
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'retry') {
        toast(outcome.message, 'error');
        return;
      }
      // Narrowed rather than asserted: `updateUser` cannot return a session here, but the outcome
      // type covers every auth flow and a cast would be the place this breaks silently if it ever
      // could.
      if (outcome.kind !== 'check-email') return;
      // Supabase mails BOTH addresses when "secure email change" is on: the old one to authorise
      // it and the new one to prove it is reachable. Said out loud, because a user who only checks
      // the new inbox will otherwise conclude the change is stuck.
      setEmailSentTo(outcome.address);
      setNewEmail('');
    },
    onError: (e: Error) => toast(authErrorMessage(e), 'error'),
  });

  const resendConfirmation = useMutation({
    mutationFn: async () => {
      const email = session?.user.email;
      if (!email) throw new Error('No address on this session.');
      await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: emailRedirectTo('/confirm') } });
    },
    onSuccess: () => toast('Confirmation link sent — check your inbox.', 'success'),
    onError: (e: Error) => toast(authErrorMessage(e), 'error'),
  });

  /* --- password ----------------------------------------------------------- */

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePassword = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setNewPassword('');
      setConfirmPassword('');
      toast('Password changed. Other devices will have to sign in again.', 'success');
    },
    onError: (e: Error) => toast(authErrorMessage(e), 'error'),
  });

  const passwordFault =
    newPassword === '' ? null : (passwordProblem(newPassword, { email: session?.user.email }) ??
      (newPassword !== confirmPassword && confirmPassword !== '' ? 'The two passwords do not match.' : null));

  /* --- everything else ---------------------------------------------------- */

  const saveName = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() || null })
        .eq('id', userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile', userId] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast('Display name saved', 'success');
    },
    onError: (e: Error) => toast(`Couldn't save: ${e.message}`, 'error'),
  });

  const setOptIn = useMutation({
    mutationFn: async (optIn: boolean) => {
      const { error } = await supabase.from('profiles').update({ training_opt_in: optIn }).eq('id', userId);
      if (error) throw new Error(error.message);
      return optIn;
    },
    onSuccess: (optIn) => {
      void qc.invalidateQueries({ queryKey: ['profile', userId] });
      toast(optIn ? 'Thanks for contributing.' : 'Opted out — your work stays fully private.', 'success');
    },
    onError: (e: Error) => toast(`Couldn't update: ${e.message}`, 'error'),
  });

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    if (!saveName.isPending) saveName.mutate();
  };

  /** What a gated action actually does once identity has been established. */
  const RUN: Record<SensitiveAction, () => void> = {
    'change-email': () => changeEmail.mutate(newEmail.trim()),
    'change-password': () => changePassword.mutate(),
    'sign-out-everywhere': () => {
      void signOutEverywhere().then((r) => {
        // REPORTED, never assumed. A "signed out everywhere" toast over a request that failed is
        // the worst outcome here: the user believes the session they were worried about is dead.
        if (r.ok) toast('Signed out on every other device.', 'success');
        else toast(`Could not sign out everywhere: ${r.message ?? 'unknown error'}`, 'error');
      });
    },
    'reset-settings': () => {
      resetPrefs();
      toast('Settings are back to their defaults.', 'success');
    },
  };

  /**
   * The two actions that also need a CONFIRMATION, not only an identity check.
   *
   * Resetting settings is derived from `confirmationFor` rather than asserted, because it is
   * exactly what that model describes: not reversible, and it does not take user content with it —
   * which is the definition of its 'dialog' verdict.
   *
   * Signing out everywhere is NOT derived, and the reason is worth writing down rather than
   * quietly hard-coding. Run it through the same model and it comes back 'none': it is reversible
   * (sign in again) and destroys nothing. The model measures what an action does to your WORK, and
   * this one does nothing to your work — it reaches across your other devices, an axis that
   * vocabulary does not have. Inventing a consequence to make the numbers come out ("call it
   * irreversible") would corrupt a model four other call sites depend on.
   */
  const CEREMONY: Partial<Record<SensitiveAction, 'dialog' | 'typed'>> = {
    'sign-out-everywhere': 'dialog',
    'reset-settings': confirmationFor({ reversible: false, destroysUserContent: false }) as 'dialog',
  };

  const changed = changedPrefs(prefs);

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Signed in as {session?.user.email}</p>
        </div>
      </div>

      <div className="card settings-card">
        <label className="field" htmlFor="settings-search">
          <span className="gx-sr">Search settings</span>
          <input
            id="settings-search"
            name="settingsSearch"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings — try “dark”, “24 hour”, “devices”"
            autoComplete="off"
          />
        </label>
        {query.trim() !== '' && matches.size === 0 && (
          <p className="muted" role="status">
            Nothing here matches “{query.trim()}”.
          </p>
        )}
      </div>

      {profile.isError && (
        <div className="card">
          <Failure error={profile.error} onRetry={() => void profile.refetch()} compact />
        </div>
      )}

      <Section title="Profile" visible={sectionShows('display-name')}>
        <Row id="display-name" visible={shows('display-name')}>
          <form onSubmit={submitName} className="settings-inline">
            <label className="field settings-grow">
              <span className="field-label">Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
                name="displayName"
                id="display-name"
                // A disabled field showing "How Apple should address you" reads as "you have not set
                // one" while the answer is still being fetched. Same conflation as everywhere else.
                placeholder={profile.isPending ? 'Loading…' : 'How Apple should address you'}
                disabled={profile.isPending}
              />
            </label>
            <button type="submit" className="btn" disabled={saveName.isPending || profile.isPending}>
              {saveName.isPending ? 'Saving…' : 'Save'}
            </button>
          </form>
        </Row>
      </Section>

      <Section title="Security" visible={sectionShows('email-address', 'password', 'sign-out-everywhere')}>
        <Row id="email-address" visible={shows('email-address')}>
          <h3 className="settings-sub">Email address</h3>
          <p className="settings-current">
            <strong>{session?.user.email}</strong>{' '}
            {/* Three states, not two. An absent user object is not an unverified address, and a
                badge that says otherwise accuses someone of something on the strength of a
                missing field. */}
            {verification === 'verified' && <span className="pill pill-good">Verified</span>}
            {verification === 'unverified' && <span className="pill pill-warn">Not confirmed</span>}
          </p>
          {verification === 'unverified' && (
            <p className="muted">
              This address has not been confirmed yet.{' '}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => resendConfirmation.mutate()}
                disabled={resendConfirmation.isPending}
              >
                {resendConfirmation.isPending ? 'Sending…' : 'Send the link again'}
              </button>
            </p>
          )}
          {emailSentTo ? (
            <p className="muted" role="status">
              A confirmation link is on its way to <strong>{emailSentTo}</strong>. Your current address gets one too —
              the change only takes effect once both are confirmed, which is what stops someone who borrows your screen
              from quietly moving your account to their own inbox.
            </p>
          ) : (
            <form
              className="settings-inline"
              onSubmit={(e) => {
                e.preventDefault();
                if (newEmail.trim()) guard('change-email');
              }}
            >
              <label className="field settings-grow">
                <span className="field-label">New email address</span>
                <input
                  type="email"
                  name="newEmail"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <button type="submit" className="btn" disabled={!newEmail.trim() || changeEmail.isPending}>
                {changeEmail.isPending ? 'Sending…' : 'Change'}
              </button>
            </form>
          )}
        </Row>

        <Row id="password" visible={shows('password')}>
          <h3 className="settings-sub">Password</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!passwordFault && newPassword && newPassword === confirmPassword) guard('change-password');
            }}
          >
            {/* The manager needs to know whose password this is. */}
            <input type="text" name="username" autoComplete="username" value={session?.user.email ?? ''} readOnly hidden />
            <label className="field">
              <span className="field-label">New password</span>
              <input
                type="password"
                name="newPassword"
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">New password again</span>
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            {passwordFault && (
              <p className="form-error" role="alert">
                {passwordFault}
              </p>
            )}
            <button
              type="submit"
              className="btn"
              disabled={
                changePassword.isPending || !newPassword || newPassword !== confirmPassword || passwordFault !== null
              }
            >
              {changePassword.isPending ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </Row>

        <Row id="sign-out-everywhere" visible={shows('sign-out-everywhere')}>
          <h3 className="settings-sub">Sign out everywhere</h3>
          <p className="muted">
            Ends every session on every device, including this one. Reach for this if you have lost a machine or seen
            something you do not recognise. Signing out from the account menu only affects this browser.
          </p>
          <button type="button" className="btn" onClick={() => guard('sign-out-everywhere')}>
            Sign out on all devices
          </button>
        </Row>
      </Section>

      <Section title="Connections" visible={sectionShows('roblox-key')}>
        <Row id="roblox-key" visible={shows('roblox-key')}>
          <RobloxKeyPanel />
        </Row>
      </Section>

      <Section title="Appearance" visible={sectionShows('appearance', 'motion')}>
        <Row id="appearance" visible={shows('appearance')}>
          <h3 className="settings-sub">Appearance</h3>
          <Choice
            label="Appearance"
            value={prefs.appearance}
            options={APPEARANCES}
            names={APPEARANCE_NAMES}
            onChange={(v) => setPref('appearance', v)}
            hint={
              prefs.appearance === 'system'
                ? `Your system is set to ${systemTheme === 'dark' ? 'dark' : 'light'}, so Apple is ${theme}. It follows along when you change it.`
                : 'Dark is the apple’s natural habitat, but daylight works too.'
            }
          />
        </Row>

        <Row id="motion" visible={shows('motion')}>
          <h3 className="settings-sub">Motion</h3>
          <Choice
            label="Motion"
            value={prefs.motion}
            options={MOTIONS}
            names={MOTION_NAMES}
            onChange={(v) => setPref('motion', v)}
            hint={
              prefs.motion === 'full'
                ? 'Some effects are switched off by your operating system’s own reduced-motion setting and stay off; this covers the movement Apple itself drives.'
                : 'Animation, the drifting cursor and the grain. “Always reduce” overrides your system setting in this product only.'
            }
          />
        </Row>
      </Section>

      <Section title="Language and region" visible={sectionShows('region', 'clock', 'time-zone')}>
        <Row id="region" visible={shows('region')}>
          <label className="field">
            <span className="field-label">Regional formatting</span>
            <select
              name="region"
              value={prefs.region}
              onChange={(e) => setPref('region', e.target.value as Region)}
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_NAMES[r]}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Dates and numbers throughout Apple. Right now: <strong>{formatNumber(1234.5)}</strong> and{' '}
            <strong>{fullStamp(Date.now())}</strong>.
          </p>
        </Row>

        <Row id="clock" visible={shows('clock')}>
          <h3 className="settings-sub">Clock</h3>
          <Choice
            label="Clock"
            value={prefs.hourCycle}
            options={HOUR_CYCLES}
            names={HOUR_NAMES}
            onChange={(v) => setPref('hourCycle', v)}
          />
        </Row>

        <Row id="time-zone" visible={shows('time-zone')}>
          <label className="field">
            <span className="field-label">Time zone</span>
            <select
              name="timeZone"
              value={prefs.timeZone}
              onChange={(e) => setPref('timeZone', e.target.value)}
            >
              <option value="system">Match my device</option>
              {/* A zone already stored that is not on the short list still works and still shows —
                  dropping it silently would move every timestamp without saying so. */}
              {!COMMON_TIME_ZONES.includes(prefs.timeZone) && prefs.timeZone !== 'system' && (
                <option value={prefs.timeZone}>{prefs.timeZone}</option>
              )}
              {COMMON_TIME_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">Every timestamp in Apple is shown in this zone, and says which zone it is.</p>
        </Row>
      </Section>


      <Section title="Privacy" visible={sectionShows('training-opt-in')}>
        <Row id="training-opt-in" visible={shows('training-opt-in')}>
          <p>
            <strong>Your projects are private. Apple never trains on your work.</strong>
          </p>
          <label className="switch-row">
            <input
              type="checkbox"
              name="trainingOptIn"
              id="training-opt-in"
              checked={profile.data?.training_opt_in ?? false}
              onChange={(e) => setOptIn.mutate(e.target.checked)}
              disabled={profile.isPending || setOptIn.isPending}
            />
            <span>
              Contribute anonymised snippets to improve Apple
              <span className="field-hint"> — optional, off by default, revocable any time.</span>
            </span>
          </label>
        </Row>
      </Section>

      <Section title="Danger zone" visible={sectionShows('reset-settings')} danger>
        <Row id="reset-settings" visible={shows('reset-settings')}>
          <h3 className="settings-sub">Reset settings</h3>
          <p className="muted">
            Puts appearance, motion, region, clock, time zone and workspace preferences back to their defaults on this
            device. Your projects, your display name and your privacy choice are not touched.
          </p>
          <button type="button" className="btn" onClick={() => guard('reset-settings')} disabled={isDefaultPrefs(prefs)}>
            {isDefaultPrefs(prefs)
              ? 'Everything is already default'
              : `Reset ${changed.length} setting${changed.length === 1 ? '' : 's'}`}
          </button>
        </Row>
        <p className="muted">
          Deleting a project removes its chat history, checkpoints and Studio pairing forever. The delete action lives
          in each <Link to="/">project card&rsquo;s menu</Link> — it asks you to type the project&rsquo;s name to
          confirm.
        </p>
      </Section>

      {reauthFor && (
        <ReauthDialog
          action={reauthFor}
          title="Confirm it is you"
          onClose={() => setReauthFor(null)}
          onConfirmed={() => {
            const action = reauthFor;
            setReauthFor(null);
            setPending(action);
          }}
        />
      )}

      {pending && CEREMONY[pending] && (
        <ConfirmDialog
          title={pending === 'sign-out-everywhere' ? 'Sign out everywhere?' : 'Reset every setting?'}
          ceremony={CEREMONY[pending]!}
          confirmLabel={pending === 'sign-out-everywhere' ? 'Sign out everywhere' : 'Reset settings'}
          onClose={() => setPending(null)}
          onConfirm={() => {
            const action = pending;
            setPending(null);
            RUN[action]();
          }}
        >
          {pending === 'sign-out-everywhere'
            ? 'Every device signed in to this account will be signed out, including this one. You will need to sign in again.'
            : `${changed.length === 0 ? 'Nothing' : changed.map((k) => PREF_LABELS[k]).join(', ')} will go back to the default. This cannot be undone.`}
        </ConfirmDialog>
      )}

      {/* Actions with no confirmation ceremony run as soon as identity is settled. */}
      <RunPending pending={pending} ceremony={CEREMONY} run={RUN} clear={() => setPending(null)} />
    </div>
  );
}

/**
 * The half of the gate that runs an action needing identity but no confirmation.
 *
 * A component rather than an inline effect so that the dependency list is the pending action alone.
 * Running this from the body of the page would fire on every unrelated re-render — a settings page
 * that changes your email address again because you typed in the search box.
 */
function RunPending({
  pending,
  ceremony,
  run,
  clear,
}: {
  pending: SensitiveAction | null;
  ceremony: Partial<Record<SensitiveAction, string>>;
  run: Record<SensitiveAction, () => void>;
  clear: () => void;
}) {
  useEffect(() => {
    if (!pending || ceremony[pending]) return;
    run[pending]();
    clear();
    // `run` and `clear` are rebuilt every render; including them would run the action on every
    // render while one is pending. The action to take is fully determined by `pending`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);
  return null;
}
