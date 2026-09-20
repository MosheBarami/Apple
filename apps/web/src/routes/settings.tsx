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
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PairingCodeDto } from '@golem/shared';
import { MOCK_MODE, mockProfile } from '../lib/mock';
import { supabase, type ProfileRow } from '../lib/supabase';
import { createDiscordCode, disconnectDiscord, fetchDiscordLink } from '../lib/api';
import { countdownTo } from '../lib/format';
import { Failure } from '../components/failure';
import { ApiKeysPanel } from '../components/api-keys-panel';
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
import { fullStamp, formatNumber, relativeTime } from '../lib/format.ts';
import { SETTING_FIELDS, matchSettings } from '../lib/settings-search.ts';
import {
  DELETE_ACCOUNT_PHRASE,
  deleteAccount,
  downloadAccountExport,
  fetchDeletionStatus,
  fetchNotifications,
  fetchScopeMemory,
  markNotificationsRead,
  grantOwnerCredits,
  reportPasswordChanged,
  savePreferences,
  type ErasureReceipt,
} from '../lib/api';
import { historyState, occurrenceNote, unreadSecurityIds } from '../lib/security-history';
import { KIND_LABELS, MANDATORY_KINDS, NOTIFICATION_KINDS } from '../lib/notification-inbox.ts';
import {
  DEFAULT_DELIVERY,
  DIGEST_MODES,
  MANDATORY_REASON,
  deviceTimeZone,
  digestHourLabel,
  digestLabel,
  eventEnabled,
  quietHoursOf,
  rejectSentence,
  toggledEvents,
  withQuietHours,
  type DeliveryPreference,
  type DigestMode,
  type NotificationEventPrefs,
} from '../lib/notification-prefs.ts';
import { SOURCE_EXPLANATIONS, cleanSelection, summarise } from '../lib/asset-sources';
import type { AssetSourceChoice, AssetSourcePolicy } from '@golem/shared';
import {
  codeProblem,
  enrollment,
  factorsState,
  normaliseCode,
  type Enrollment,
} from '../lib/mfa';
// The asset-sources section below renders asset-source-dialog.tsx's own markup — `.asrc__choice`,
// `.asrc__cost`, `.asrc__reach` — so it needs that component's sheet as well as this route's. It
// happens to be loaded anyway today, because workspace.tsx is eager and shares this bundle; naming
// it here is what keeps the cost line styled if either route is ever made lazy.
import '../components/asset-source-dialog.css';
import './settings.css';

/**
 * The account's enrolled factors.
 *
 * THROWS rather than returning the error, because react-query's `error` is what separates "we asked
 * and the answer was none" from "we never got an answer" — and this panel prints a different
 * sentence for each. Swallowing it here would collapse both into an empty list.
 */
async function listFactors(): Promise<unknown> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data;
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  if (MOCK_MODE) return mockProfile;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, plan, is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProfileRow | null) ?? null;
}

/**
 * CONNECT DISCORD.
 *
 * The code is minted HERE, signed in, on a project this account owns, and typed into Discord. That
 * direction is the whole proof: only somebody signed in to this account can produce a code, so
 * presenting one in Discord demonstrates ownership. Minting in Discord instead would demonstrate
 * nothing about the Discord user — only that they could read a code somebody sent them.
 *
 * The card states plainly what the connection can do, because it can spend money: the connected
 * Discord account can start builds in the chosen project and see the balance. That sentence is on
 * screen at the moment of connecting, not buried.
 */
function DiscordCard({ userId }: { userId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [code, setCode] = useState<PairingCodeDto | null>(null);
  const [remaining, setRemaining] = useState<string | null>(null);

  const link = useQuery({
    queryKey: ['discord-link', userId],
    queryFn: fetchDiscordLink,
    enabled: userId.length > 0,
  });

  const projects = useQuery({
    queryKey: ['projects-for-discord', userId],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      if (MOCK_MODE) return [];
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .is('archived_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: userId.length > 0,
  });

  useEffect(() => {
    if (!projectId && projects.data && projects.data.length > 0) setProjectId(projects.data[0]!.id);
  }, [projects.data, projectId]);

  // A code with no visible clock is a code people paste five minutes after it died and then blame
  // the bot for. The countdown is the same one the Studio pairing dialog shows.
  useEffect(() => {
    if (!code) {
      setRemaining(null);
      return;
    }
    setRemaining(countdownTo(code.expiresAtIso));
    const t = window.setInterval(() => setRemaining(countdownTo(code.expiresAtIso)), 1000);
    return () => window.clearInterval(t);
  }, [code]);

  const mint = useMutation({
    mutationFn: () => createDiscordCode(projectId),
    onSuccess: (dto) => setCode(dto),
    onError: (e: Error) => toast(`Couldn't make a code: ${e.message}`, 'error'),
  });

  const disconnect = useMutation({
    mutationFn: disconnectDiscord,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['discord-link', userId] });
      toast(res.removed ? 'Discord disconnected.' : 'There was nothing connected.', 'success');
    },
    onError: (e: Error) => toast(`Couldn't disconnect: ${e.message}`, 'error'),
  });

  const connected = link.data?.link ?? null;

  return (
    <>
      <h3 className="settings-sub">Discord</h3>
      {/* Four situations, four sentences, and each carries its own tone: a request in flight is
          neutral with a working dot, a request that never answered is a caution (nothing about
          the connection has changed, so red would say something untrue), and the two settled
          answers are plain. */}
      {!connected && (
        <p
          className={`settings-note${link.isPending ? ' settings-note-busy' : link.isError ? ' settings-note-warn' : ''}`}
          role="status"
        >
          {link.isPending ? 'Checking connection…' : link.isError ? 'Connection status unavailable. Reload the page to check again.' : code && remaining ? 'Code pending — not connected yet.' : 'Not connected.'}
        </p>
      )}
      {link.isError && <Failure error={link.error} onRetry={() => void link.refetch()} compact />}

      {connected ? (
        <>
          <p className="settings-note">
            A Discord account is connected to <strong>{connected.projectName}</strong>. It can start builds there and
            see this account&rsquo;s Credits.
          </p>
          <button type="button" className="btn" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            {disconnect.isPending ? 'Disconnecting…' : 'Disconnect Discord'}
          </button>
          <p className="settings-note">
            Disconnecting takes effect immediately. The same thing happens if you run <code>/unlink</code> in Discord.
          </p>
        </>
      ) : (
        <>
          <p className="settings-note">
            Connect one Discord account to one project, then use <code>/build</code>, <code>/status</code> and{' '}
            <code>/credits</code> there. <strong>The connected Discord account spends this account&rsquo;s Credits</strong>,
            so only connect your own.
          </p>
          <div className="settings-inline">
            <label className="field settings-grow">
              <span className="field-label">Project</span>
              <select
                id="discord-project"
                name="discordProject"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={projects.isPending || (projects.data?.length ?? 0) === 0}
              >
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => mint.mutate()}
              disabled={!projectId || mint.isPending || link.isPending || link.isError}
              // A disabled control says why it is disabled, rather than leaving somebody clicking
              // a dead button and concluding the product is broken.
              title={
                link.isPending
                  ? 'Checking the connection first'
                  : link.isError
                    ? 'The connection status could not be read'
                    : !projectId
                      ? 'Choose a project first'
                      : undefined
              }
            >
              {mint.isPending ? 'Making a code…' : 'Get a code'}
            </button>
          </div>
          {projects.data?.length === 0 && (
            <p className="settings-note">Make a project first — a Discord link always points at one.</p>
          )}
          {code && (
            <div className="pairing-code-box">
              <span className="pairing-label">Type this in Discord</span>
              <output className="pairing-code" aria-live="polite">
                /link {code.code}
              </output>
              <span className="pairing-countdown" role="timer">
                {remaining ? `Expires in ${remaining}` : 'Expired — get another'}
              </span>
            </div>
          )}
        </>
      )}
    </>
  );
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

/**
 * A three-way choice, as radios. Used by appearance, motion and the clock.
 *
 * THE KEYBOARD HALF WAS MISSING, and a radiogroup is the one widget where that is a correctness
 * problem rather than a convenience one. Three buttons each in the tab order is not what
 * `role="radiogroup"` promises: assistive technology announces "1 of 3" and then the arrow keys,
 * which is what a person is told to press, did nothing. So the group is one tab stop — only the
 * chosen segment is tabbable — and the arrows move the answer.
 *
 * FOCUS FOLLOWS THE SELECTION, which is why the ref is here at all. React re-renders with the
 * tabindex on the newly chosen button, but the browser leaves focus on the old one; the next arrow
 * key would then travel out of the group entirely. Moving it by hand is the only way the second
 * press lands where the first one left off.
 */
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
  const group = useRef<HTMLDivElement>(null);

  const step = (delta: number) => {
    const at = options.indexOf(value);
    // A value that is not one of the options is a bug elsewhere; wrapping from -1 would silently
    // paper over it by picking an arbitrary answer for somebody.
    if (at < 0) return;
    const next = (at + delta + options.length) % options.length;
    onChange(options[next]!);
    group.current?.querySelectorAll<HTMLButtonElement>('.theme-btn')[next]?.focus();
  };

  return (
    <>
      <div className="theme-toggle" role="radiogroup" aria-label={label} ref={group}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            tabIndex={value === option ? 0 : -1}
            className={`theme-btn${value === option ? ' theme-btn-active' : ''}`}
            onClick={() => onChange(option)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                step(1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                step(-1);
              }
            }}
          >
            {names[option] ?? option}
          </button>
        ))}
      </div>
      {hint && <p className="settings-note">{hint}</p>}
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

/* --------------------------------------------------------- notifications --- */

/**
 * When Apple is allowed to interrupt you, and about what.
 *
 * THE ENGINE BEHIND THIS ALREADY EXISTED and could never engage. apps/worker holds a quiet window
 * that wraps midnight and survives a clock change, an hourly and a daily digest, and a per-kind
 * mute list layered across an organisation, a person and one project — the most heavily tested
 * part of that subsystem. Its defaults are `quiet_hours: null` and `digest: 'off'`, and there was
 * no control anywhere in this app to change either, so on a live deployment every branch of it was
 * unreachable.
 *
 * Three things about the shape of this, all of them the server's:
 *
 *   * THE WHOLE PREFERENCE OBJECT IS SENT. `PUT .../preferences` replaces the scope and DELETES
 *     any key it does not receive, so that clearing a setting is reachable. Sending only the two
 *     notification keys would therefore silently wipe this person's language and coding-style
 *     preferences — hence the spread over what is stored.
 *   * WHAT WAS REFUSED IS PRINTED. `unknown_timezone` and `empty_window` make the server discard
 *     the value and answer with the DEFAULT; a page that rendered the response without reading
 *     `rejected` would show the setting snapping back with no explanation.
 *   * THE ZONE IS A REAL ZONE. The display setting above may hold the literal `system` because the
 *     browser resolves it at render time. This one is read on the server, where there is no device
 *     to ask.
 */

/**
 * Where Apple may take assets from — the same answer the build dialog asks for, changeable here.
 *
 * THE OWNER'S REQUEST WAS TWO HALVES and only one was built: "a pop-up before building asking
 * whether it may use the Apple library, the Creator Store, or build from scratch — AND
 * configurable". The dialog exists and gates the first build; until now the only way to change the
 * answer was to clear it and be asked again.
 *
 * IT READS AND WRITES THE SAME KEY THE DIALOG DOES, `asset_sources` — but at a DIFFERENT LAYER, and
 * the difference is the feature rather than an inconsistency. The dialog answers for one project,
 * because the right answer genuinely differs between a game built out of parts and a game assembled
 * from the Creator Store. This panel answers for the ACCOUNT, and because `asset_sources` narrows
 * downwards (apps/worker/src/preferences.ts) that answer is a ceiling: switching a source off here
 * switches it off in every project, and no project can turn it back on. The dialog greys out what
 * this panel forbids rather than accepting a tick that would be swallowed — see `availableChoices`.
 *
 * Two surfaces for one stored preference is fine; two representations of it is how they come to
 * disagree, so `summarise`, `cleanSelection` and SOURCE_EXPLANATIONS are the workspace's own — not a
 * second copy of the same words with different punctuation.
 */
function AssetSourceSettings({
  userId,
  shows,
  sectionShows,
}: {
  userId: string;
  shows: (id: string) => boolean;
  sectionShows: (...ids: string[]) => boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const stored = useQuery({
    queryKey: ['scope-memory', 'user', userId],
    queryFn: () => fetchScopeMemory('user', userId),
    enabled: userId.length > 0,
  });

  const policy = (stored.data?.preferences.prefs.asset_sources ?? null) as AssetSourcePolicy | null;
  const [dirty, setDirty] = useState(false);
  const [chosen, setChosen] = useState<AssetSourceChoice[]>([]);
  const [ask, setAsk] = useState(false);
  const displayedChosen = dirty ? chosen : policy?.allow ?? [];
  const displayedAsk = dirty ? ask : policy?.mode === 'ask';

  useEffect(() => {
    if (dirty || !stored.data) return;
    setChosen(policy?.allow ? [...policy.allow] : []);
    setAsk(policy?.mode === 'ask');
  }, [stored.data, dirty]);

  const save = useMutation({
    mutationFn: async () => {
      if (!stored.data || stored.isError) throw new Error('Load your asset sources before saving.');
      // Everything already stored plus the one key this section owns: what is not sent is deleted.
      const base = stored.data?.preferences.prefs ?? {};
      return savePreferences('user', userId, {
        ...base,
        asset_sources: { mode: ask ? 'ask' : 'remember', allow: cleanSelection(chosen) },
      });
    },
    onSuccess: (out) => {
      qc.setQueryData<Awaited<ReturnType<typeof fetchScopeMemory>>>(['scope-memory', 'user', userId], (current) =>
        current ? { ...current, preferences: { ...current.preferences, prefs: out.preferences } } : current,
      );
      setDirty(false);
      // What came back, not what was sent — a value the server refused has already been replaced,
      // and showing the submission would be this page lying about what is stored.
      const back = (out.preferences.asset_sources ?? null) as AssetSourcePolicy | null;
      setChosen(back?.allow ? [...back.allow] : []);
      setAsk(back?.mode === 'ask');
      toast('Asset sources saved', 'success');
      void qc.invalidateQueries({ queryKey: ['scope-memory', 'user', userId] });
    },
    onError: (e: unknown) => toast(e instanceof Error ? e.message : 'Could not save', 'error'),
  });

  const toggle = (c: AssetSourceChoice) => {
    if (!stored.data || stored.isError || save.isPending) return;
    setAsk(displayedAsk);
    setDirty(true);
    setChosen(displayedChosen.includes(c) ? displayedChosen.filter((x) => x !== c) : [...displayedChosen, c]);
  };

  if (!sectionShows('asset-sources')) return null;
  if (!stored.data || stored.isError) {
    return (
      <Section title="Where Apple gets assets" visible>
        {/* A caution and not a refusal. The sentence says nothing stored has changed, and red
            beside that copy would contradict it — the same call api-keys-panel.css writes down
            for its own failed lookup. */}
        <p className={stored.isError ? 'settings-note settings-note-warn' : 'settings-note settings-note-busy'} role="status">
          {stored.isError
            ? 'Could not load asset sources. Your saved choices have not changed.'
            : 'Loading asset sources…'}
        </p>
        {stored.isError && <button type="button" className="btn" onClick={() => { void stored.refetch(); }}>Try again</button>}
      </Section>
    );
  }

  return (
    <Section title="Where Apple gets assets" visible>
      <p className="settings-note">{summarise(policy).line}</p>

      <Row id="asset-sources" visible={shows('asset-sources')}>
        <div className="settings-pair settings-pair--stack">
          {SOURCE_EXPLANATIONS.map((e) => (
            <label key={e.choice} className="asrc__choice asrc__choice--settings">
              <input type="checkbox" disabled={save.isPending} checked={displayedChosen.includes(e.choice)} onChange={() => toggle(e.choice)} />
              <span className="asrc__body">
                <span className="asrc__name">{e.title}</span>
                <span className="asrc__does">{e.does}</span>
                <span className="asrc__meta">
                  <span className="asrc__cost">{e.costs}</span>
                  <span className="asrc__reach">{e.reach}</span>
                </span>
              </span>
            </label>
          ))}

          <label className="asrc__remember">
            <input type="checkbox" disabled={save.isPending} checked={displayedAsk} onChange={() => { setChosen([...displayedChosen]); setDirty(true); setAsk(!displayedAsk); }} />
            Ask me again before each build
          </label>

          {displayedChosen.length === 0 && (
            <p className="form-error" role="alert">
              {/* The same sentence the dialog uses. An empty allow list is not a setting, it is a
                  build that can only place plain parts — and the person should hear it here too. */}
              With none of these, Apple can only place plain parts.
            </p>
          )}

          <button
            type="button"
            className="btn"
            disabled={save.isPending || !dirty}
            title={!save.isPending && !dirty ? 'Nothing has changed yet' : undefined}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save asset sources'}
          </button>
        </div>
      </Row>
    </Section>
  );
}

function NotificationSettings({
  userId,
  shows,
  sectionShows,
}: {
  userId: string;
  shows: (id: string) => boolean;
  sectionShows: (...ids: string[]) => boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // The same key the workspace's instructions panel uses, so the two surfaces cannot show
  // different values for the same stored preference.
  const stored = useQuery({
    queryKey: ['scope-memory', 'user', userId],
    queryFn: () => fetchScopeMemory('user', userId),
    enabled: userId.length > 0,
  });

  const [dirty, setDirty] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryPreference>(DEFAULT_DELIVERY);
  const [events, setEvents] = useState<NotificationEventPrefs>({});
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rejected, setRejected] = useState<{ key: string; reason: string }[]>([]);

  useEffect(() => {
    if (dirty || !stored.data) return;
    const prefs = stored.data.preferences.prefs;
    const d = prefs.notify_delivery ?? DEFAULT_DELIVERY;
    setDelivery(d);
    setEvents(prefs.notify_events ?? {});
    setStart(d.quiet_hours?.start ?? '');
    setEnd(d.quiet_hours?.end ?? '');
  }, [stored.data, dirty]);

  const window = quietHoursOf(start, end);

  const save = useMutation({
    mutationFn: async () => {
      // Everything already stored, plus the two keys this section owns. See the header: what is
      // not sent is deleted.
      const base = stored.data?.preferences.prefs ?? {};
      return savePreferences('user', userId, {
        ...base,
        notify_delivery: withQuietHours(delivery, window.hours),
        notify_events: events,
      });
    },
    onSuccess: (out) => {
      setDirty(false);
      setRejected(out.rejected);
      const back = out.preferences.notify_delivery ?? DEFAULT_DELIVERY;
      // What came back, not what was sent: a value the server refused has already been replaced by
      // the default here, and showing the submission would be this page lying about what is stored.
      setDelivery(back);
      setEvents(out.preferences.notify_events ?? {});
      setStart(back.quiet_hours?.start ?? '');
      setEnd(back.quiet_hours?.end ?? '');
      if (out.rejected.length === 0) toast('Notification settings saved', 'success');
      void qc.invalidateQueries({ queryKey: ['scope-memory', 'user', userId] });
    },
    onError: (e: Error) => toast(`Couldn't save: ${e.message}`, 'error'),
  });

  const edit = (fn: () => void) => {
    setDirty(true);
    setRejected([]);
    fn();
  };

  const zoneOptions = [delivery.timezone, deviceTimeZone(), ...COMMON_TIME_ZONES].filter(
    (z, i, all) => all.indexOf(z) === i,
  );

  return (
    <Section title="Notifications" visible={sectionShows('notify-quiet-hours', 'notify-digest', 'notify-events')}>
      {/* A FAILED READ IS NOT "NOTHING IS SET". Rendering the defaults over a fetch that never
          answered would show quiet hours as off to somebody who has them on. */}
      {stored.isError && (
        <p className="settings-note settings-note-warn" role="alert">
          Could not read your notification settings, so nothing below is showing what is actually stored. Reload the
          page to read them again.
        </p>
      )}

      <Row id="notify-quiet-hours" visible={shows('notify-quiet-hours')}>
        <h3 className="settings-sub">Quiet hours</h3>
        <p className="settings-note">
          Nothing arrives inside this window except a billing or security alert, which are never held. Leave both
          empty for no quiet hours.
        </p>
        <div className="settings-pair">
          <label className="field">
            <span className="field-label">From</span>
            <input
              type="time"
              name="quietStart"
              value={start}
              disabled={stored.isPending}
              onChange={(e) => edit(() => setStart(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="field-label">Until</span>
            <input
              type="time"
              name="quietEnd"
              value={end}
              disabled={stored.isPending}
              onChange={(e) => edit(() => setEnd(e.target.value))}
            />
          </label>
        </div>
        {window.problem && (
          <p className="settings-note settings-note-warn" role="alert">
            {window.problem === 'half_window'
              ? 'A quiet window needs both a start and an end.'
              : rejectSentence('notify_delivery:quiet_hours', window.problem)}
          </p>
        )}

        <label className="field">
          <span className="field-label">Read these times in</span>
          <select
            name="notifyTimeZone"
            value={delivery.timezone}
            disabled={stored.isPending}
            onChange={(e) => edit(() => setDelivery({ ...delivery, timezone: e.target.value }))}
          >
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
                {z === deviceTimeZone() ? ' — this device' : ''}
              </option>
            ))}
          </select>
        </label>
      </Row>

      <Row id="notify-digest" visible={shows('notify-digest')}>
        <h3 className="settings-sub">How often</h3>
        <label className="field">
          <span className="field-label">Delivery</span>
          <select
            name="notifyDigest"
            value={delivery.digest}
            disabled={stored.isPending}
            onChange={(e) => edit(() => setDelivery({ ...delivery, digest: e.target.value as DigestMode }))}
          >
            {DIGEST_MODES.map((m) => (
              <option key={m} value={m}>
                {digestLabel(m)}
              </option>
            ))}
          </select>
        </label>
        {/* The hour means nothing for 'off' and 'hourly' — the server ignores it — and a control
            that is always visible invites somebody to set a value that changes nothing. */}
        {delivery.digest === 'daily' && (
          <label className="field">
            <span className="field-label">Arriving at</span>
            <select
              name="notifyDigestHour"
              value={String(delivery.digest_hour)}
              disabled={stored.isPending}
              onChange={(e) => edit(() => setDelivery({ ...delivery, digest_hour: Number(e.target.value) }))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={String(h)}>
                  {digestHourLabel(h)}
                </option>
              ))}
            </select>
          </label>
        )}
      </Row>

      <Row id="notify-events" visible={shows('notify-events')}>
        <h3 className="settings-sub">What to tell me about</h3>
        <fieldset className="prefs__set">
          <legend className="gx-sr">Notification kinds</legend>
          {NOTIFICATION_KINDS.map((kind) => {
            const locked = MANDATORY_KINDS.includes(kind);
            return (
              <label key={kind} className="prefs__check">
                <input
                  type="checkbox"
                  name={`notify-${kind}`}
                  checked={eventEnabled(events, kind)}
                  disabled={locked || stored.isPending}
                  onChange={(e) => edit(() => setEvents(toggledEvents(events, kind, e.target.checked)))}
                />
                <span>
                  {KIND_LABELS[kind]}
                  {/* Disabled AND PRESENT. A row that is simply absent reads as "this product does
                      not notify me about billing" — it does, and it always will. */}
                  {locked && <span className="field-hint"> — {MANDATORY_REASON}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      </Row>

      {rejected.length > 0 && (
        <ul className="muted settings-note-warn" role="alert">
          {rejected.map((r) => (
            <li key={`${r.key}:${r.reason}`}>{rejectSentence(r.key, r.reason)}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="btn"
        disabled={!dirty || save.isPending || window.problem !== null || stored.isPending}
        // Four ways to be disabled and four different things to do about it. Without this the
        // button is dead for a reason nobody on the page states.
        title={
          save.isPending
            ? undefined
            : stored.isPending
              ? 'Still reading your settings'
              : window.problem !== null
                ? 'Fix the quiet window first'
                : !dirty
                  ? 'Nothing has changed yet'
                  : undefined
        }
        onClick={() => save.mutate()}
      >
        {save.isPending ? 'Saving…' : 'Save notification settings'}
      </button>
    </Section>
  );
}

/**
 * TWO-STEP VERIFICATION — a code from an app, on top of the password.
 *
 * The cryptography is Supabase's (`auth.mfa.*`); what is decided here is what the panel is entitled
 * to SAY, and that lives in lib/mfa.ts because the comfortable wrong answer is dangerous: "Two-step
 * verification is off" printed because the request failed tells an owner their defence is missing,
 * under a button offering to enrol a second one. `factorsState` refuses to say `off` unless it read
 * a well-formed, empty list, and this panel renders whichever of the four states it returns.
 *
 * ITS OWN COMPONENT for the same reason SecurityHistory is: the page re-renders on every keystroke
 * in the search box, and an enrolment half-finished in that body would be rebuilt under the user's
 * fingers.
 *
 * REMOVAL IS NOT HANDLED HERE. Turning the second factor off is exactly the takeover a second
 * factor exists to stop, so it goes through the page's identity gate like changing a password —
 * `onRemove` hands the factor id up, the page asks for the password, and the page runs it.
 */
function TwoStepPanel({ onRemove }: { onRemove: (factorId: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const factors = useQuery({ queryKey: ['mfa-factors'], queryFn: listFactors });
  const state = factorsState({ loading: factors.isPending, error: factors.error, data: factors.data });

  /** The enrolment in progress: a factor that exists but has never been challenged. */
  const [pending, setPending] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [fault, setFault] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      const e = enrollment(data);
      // A response we cannot use is a failure, not a blank enrolment screen with a Verify button
      // that can never succeed.
      if (!e) throw new Error('The verification setup did not come back in a usable shape.');
      return e;
    },
    onSuccess: (e) => {
      setPending(e);
      setCode('');
      setFault(null);
    },
    onError: (e: Error) => toast(authErrorMessage(e), 'error'),
  });

  const confirm = useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: normaliseCode(code) });
      if (error) throw error;
    },
    onSuccess: () => {
      setPending(null);
      setCode('');
      void qc.invalidateQueries({ queryKey: ['mfa-factors'] });
      toast('Two-step verification is on. You will be asked for a code when you sign in.', 'success');
    },
    // Stays on the form. A wrong code is the ordinary case — the previous one expired thirty
    // seconds ago — and a toast that scrolls away leaves the field looking accepted.
    onError: (e: Error) => setFault(authErrorMessage(e)),
  });

  const abandon = useMutation({
    mutationFn: async (factorId: string) => {
      // The factor row exists from `enroll()` onward, before any code has been checked. Leaving it
      // behind would show nothing on this panel (it is unverified, so it is not protection) while
      // counting against the account's factor limit for ever.
      await supabase.auth.mfa.unenroll({ factorId });
    },
    onSettled: () => {
      setPending(null);
      setCode('');
      setFault(null);
      void qc.invalidateQueries({ queryKey: ['mfa-factors'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    const problem = codeProblem(code);
    if (problem) {
      setFault(problem);
      return;
    }
    setFault(null);
    confirm.mutate(pending.factorId);
  };

  return (
    <>
      <h3 className="settings-sub">Two-step verification</h3>
      <p className="settings-note">
        A six-digit code from an app on your phone, asked for after your password. It is what keeps a stolen or guessed
        password from being enough on its own.
      </p>

      {state.state === 'loading' && (
        <p className="settings-note settings-note-busy" role="status">
          Checking this account…
        </p>
      )}

      {state.state === 'unavailable' && (
        <>
          {/* No wrapping role="alert": <Failure> carries one, and nesting them makes a screen
              reader announce the same failure twice. */}
          <Failure error={new Error(state.message)} onRetry={() => void factors.refetch()} compact />
          {/* The branch one step away says "it is off" and offers to set it up. Someone who has seen
              that screen before will fill this gap in themselves unless it is said. */}
          <p className="settings-note settings-note-warn">
            This does not mean it is off. We could not find out either way.
          </p>
        </>
      )}

      {state.state === 'on' && (
        <>
          <p className="settings-current">
            <strong>On</strong> <span className="pill pill-good">Protected</span>
          </p>
          <ul className="sec-log">
            {state.factors.map((f) => (
              <li key={f.id} className="sec-event">
                <p className="sec-event-title">{f.friendlyName ?? 'Authenticator app'}</p>
                <p className="sec-when">
                  {f.createdAt === null ? (
                    'Added at an unknown time'
                  ) : (
                    <>
                      Added <time dateTime={new Date(f.createdAt).toISOString()}>{relativeTime(f.createdAt)}</time>
                    </>
                  )}
                </p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(f.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <p className="settings-note">
            Losing the phone this is on means losing the way in — there is no backup code in this product yet, so keep
            the account&rsquo;s email reachable.
          </p>
        </>
      )}

      {state.state === 'off' && !pending && (
        <>
          <p className="settings-current">
            <strong>Off</strong>
          </p>
          <button type="button" className="btn" onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? 'Setting up…' : 'Set up two-step verification'}
          </button>
        </>
      )}

      {pending && (
        <form onSubmit={submit}>
          <p>Scan this with an authenticator app, then type the code it shows.</p>
          {pending.qrCode ? (
            // White ground on purpose: the provider's QR is black on transparent, which is
            // unscannable on the dark theme this product defaults to.
            <img className="mfa-qr" src={pending.qrCode} alt="" width={168} height={168} />
          ) : (
            <p className="settings-note">Your app can take the key below instead of a scan.</p>
          )}
          {pending.secret && (
            <p className="settings-note">
              Or enter this key by hand: <code>{pending.secret}</code>
            </p>
          )}
          <label className="field">
            <span className="field-label">Code from your app</span>
            <input
              name="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </label>
          {fault && (
            <p className="form-error" role="alert">
              {fault}
            </p>
          )}
          <div className="settings-inline">
            <button type="submit" className="btn" disabled={confirm.isPending}>
              {confirm.isPending ? 'Checking…' : 'Turn it on'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => abandon.mutate(pending.factorId)}
              disabled={abandon.isPending}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </>
  );
}

/**
 * WHAT HAS HAPPENED TO THIS ACCOUNT — the consumer that did not exist.
 *
 * The worker has written a `security_event` on every key mint, rotation, revocation and membership
 * change since securityNotice was added, and its own comment says why: "a log that is never read
 * while nothing is wrong is a log nobody thinks to read on the day something is". Nothing in this
 * app had ever fetched one. The record was faithful and unreachable, which is the same defect one
 * layer up.
 *
 * ITS OWN COMPONENT, not a block in the page. The settings page re-renders on every keystroke in
 * the search box; a query declared in its body is fine with react-query's cache and a nightmare to
 * reason about the day someone adds a dependency to it. It also means this panel's failure stays
 * this panel's failure.
 *
 * THE EMPTY STATE AND THE BROKEN STATE ARE DIFFERENT SENTENCES, and `historyState` is what keeps
 * them apart — see lib/security-history.ts. "Nothing has happened on your account" printed because
 * a fetch failed is the one sentence on this page that could actually cost somebody something.
 */
function SecurityHistory() {
  const { toast } = useToast();
  const qc = useQueryClient();
  // Wrapped rather than passed bare: react-query hands its queryFn a context object, which
  // fetchNotifications would read as its unreadOnly flag.
  const history = useQuery({ queryKey: ['notifications'], queryFn: () => fetchNotifications() });
  const state = historyState({ loading: history.isPending, error: history.error, data: history.data });

  const markRead = useMutation({
    // ids only, never `all`: this panel shows security events, and clearing everything from
    // here would mark run failures read that the person has not seen.
    mutationFn: (ids: string[]) => markNotificationsRead({ ids }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      // REPORTED FROM THE WRITE. "Marked as read" over a write that matched no rows is the same
      // lie as a clean guard that saw nothing — the count comes back from the server and is what
      // is printed.
      toast(r.marked === 0 ? 'Nothing was left to mark.' : `Marked ${r.marked} as read.`, 'success');
    },
    onError: (e: Error) => toast(`Could not mark those read: ${e.message}`, 'error'),
  });

  const unread = state.state === 'items' ? unreadSecurityIds(history.data?.items) : [];

  return (
    <>
      <h3 className="settings-sub">Account history</h3>
      <p className="settings-note">
        Things that happened to the account itself rather than to your projects — keys created or revoked, people added
        or removed, your password changed. Worth a look on a day nothing seems wrong, so that the day something does you
        already know what this normally says.
      </p>

      {state.state === 'loading' && (
        <p className="settings-note settings-note-busy" role="status">
          Reading your account history…
        </p>
      )}

      {/* The wrapper carries NO role: <Failure> already announces itself, and an alert inside an
          alert is read twice by some screen readers and swallowed entirely by others. */}
      {state.state === 'unavailable' && (
        <>
          <Failure error={new Error(state.message)} onRetry={() => void history.refetch()} compact />
          {/* Said out loud, because the empty state sitting one branch away says the opposite and a
              reader who has seen that one before will otherwise fill in the gap themselves. */}
          <p className="settings-note settings-note-warn">
            This is not the same as a quiet account. We could not read the history at all.
          </p>
        </>
      )}

      {/* AN EMPTY LOG IS NOT "NO RESULTS". The second line is what makes the first one readable:
          without it, a person who came here because something felt wrong is told nothing, and has
          no way to tell an empty record from a record that does not cover what they are worried
          about. */}
      {state.state === 'empty' && (
        <div className="settings-empty" role="status">
          <p className="settings-empty-title">Nothing has been recorded on this account yet.</p>
          <p className="settings-empty-body">
            Keys created or revoked, people added or removed and password changes appear here as they happen. A quiet
            history is the expected state.
          </p>
        </div>
      )}

      {state.state === 'items' && (
        <>
          <ul className="sec-log">
            {state.items.map((item) => {
              const repeated = occurrenceNote(item);
              return (
                <li key={item.id} className={`sec-event${item.readAt === null ? ' sec-event-new' : ''}`}>
                  <p className="sec-event-title">
                    {item.title}
                    {item.readAt === null && <span className="pill pill-warn">New</span>}
                  </p>
                  {item.body && <p className="muted">{item.body}</p>}
                  <p className="sec-when">
                    <time dateTime={new Date(item.deliverAt).toISOString()} title={fullStamp(item.deliverAt)}>
                      {relativeTime(item.deliverAt)}
                    </time>
                    {repeated && <span> · {repeated}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
          {unread.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => markRead.mutate(unread)}
              disabled={markRead.isPending}
            >
              {markRead.isPending ? 'Marking…' : `Mark ${unread.length} as read`}
            </button>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ page --- */

export function SettingsPage() {
  const { session, signOutEverywhere, reauthenticatedAt } = useAuth();
  const { prefs, setPref, resetPrefs, theme, systemTheme } = usePrefs();
  const { toast } = useToast();
  const qc = useQueryClient();
  const userId = session?.user.id ?? '';

  useEffect(() => {
    if (session?.user.email?.toLowerCase() !== 'moshe.barami111@gmail.com') return;
    if (new URLSearchParams(window.location.search).get('ownerCredits') !== '1') return;
    void grantOwnerCredits()
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['me'] });
        toast('Temporary unlimited owner Credits are active.', 'success');
        window.history.replaceState({}, '', '/app/settings');
      })
      .catch((error: unknown) => toast(error instanceof Error ? error.message : 'Could not grant owner Credits.', 'error'));
  }, [qc, session?.user.email, toast]);

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

  /* --- two-step verification --------------------------------------------- */

  // Which factor the Remove button named, held while the password dialog is open. The id is
  // stashed for the same reason the action is: the dialog is asynchronous, and a closure captured
  // two renders ago is how the wrong row gets removed.
  const [factorToRemove, setFactorToRemove] = useState<string | null>(null);

  const removeTwoStep = useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mfa-factors'] });
      toast('Two-step verification is off. Your password is now the only thing protecting this account.', 'success');
    },
    onError: (e: Error) => toast(authErrorMessage(e), 'error'),
  });

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
      // WHAT THIS PAGE MAY SAY ABOUT IT. Supabase mails BOTH addresses when the project's "secure
      // email change" setting is on — the old one to authorise the move, the new one to prove it is
      // reachable — and that is the defence that stops someone at a borrowed screen moving an
      // account to their own inbox. Nothing in this repository sets that toggle or can read it:
      // there is no config.toml in the tree, and infra/supabase can see SQL, not auth settings. So
      // the page states only what is true either way — the address does not move until the new one
      // is confirmed — and tests/secure-email-change.test.mjs holds it to that until something here
      // can actually observe the setting.
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
      /*
       * THE ACCOUNT IS TOLD, and it has to be told from HERE.
       *
       * Supabase performs the change; the worker never sees it, so there is no server-side moment
       * where a notice could be raised. Asking for it from the browser is the only hook that
       * exists in this deployment — which does mean an attacker who changes the password can
       * simply not make this call. Worth doing anyway, and worth writing down rather than
       * pretending otherwise: the common case this covers is a password changed on a machine the
       * owner walked away from, where the record is read later from another device.
       *
       * Awaited inside the mutation rather than fired and forgotten, because the toast below makes
       * a claim about it and a claim about an unobserved write is the defect this repo is built
       * around. A failure here is caught, NOT rethrown: the password really did change, and
       * reporting the change as failed because the diary entry failed is the worse of the two
       * lies.
       */
      const noted = await reportPasswordChanged().catch(() => ({ recorded: false }));
      return noted.recorded === true;
    },
    onSuccess: (recorded) => {
      setNewPassword('');
      setConfirmPassword('');
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      toast(
        recorded
          ? 'Password changed, and noted in your account history. Other devices will have to sign in again.'
          : 'Password changed. Other devices will have to sign in again.',
        'success',
      );
    },
    onError: (e: Error) => toast(authErrorMessage(e), 'error'),
  });

  /*
   * TWO FAULTS, NOT ONE — because two fields are being judged and only one of them is wrong.
   *
   * The single expression this replaces produced the identical sentence; what it could not do is
   * say WHICH box to go back to. `aria-invalid` is per-field, so the parts are named separately
   * here and recombined for the sentence, and the recombination is the original expression
   * unchanged: a password that is empty is neither too short nor mismatched.
   */
  const passwordTooWeak = newPassword === '' ? null : passwordProblem(newPassword, { email: session?.user.email });
  const passwordsDiffer = newPassword !== '' && confirmPassword !== '' && newPassword !== confirmPassword;
  const passwordFault = passwordTooWeak ?? (passwordsDiffer ? 'The two passwords do not match.' : null);

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


  const submitName = (e: FormEvent) => {
    e.preventDefault();
    if (!saveName.isPending) saveName.mutate();
  };

  /* --- your data, and your account ---------------------------------------
   *
   * Both of these are worker routes (apps/worker/src/account-export.ts and erasure.ts) and the
   * client is deliberately thin. In particular the DELETION RECEIPT IS RENDERED AS THE SERVER WROTE
   * IT: it is the only thing that knows which stores were actually cleared and which survived, and
   * a success line composed here would be this page claiming something nothing measured.
   */

  // The same query key the notifications section uses, so the two cannot disagree about one stored
  // preference. React Query serves both from one fetch.
  const storedPrefs = useQuery({
    queryKey: ['scope-memory', 'user', userId],
    queryFn: () => fetchScopeMemory('user', userId),
    enabled: userId.length > 0,
  });

  const setAnalyticsOptOut = useMutation({
    mutationFn: async (optOut: boolean) => {
      // Everything already stored plus the one key this row owns: what is not sent is deleted.
      const base = storedPrefs.data?.preferences.prefs ?? {};
      return savePreferences('user', userId, { ...base, analytics_opt_out: optOut });
    },
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: ['scope-memory', 'user', userId] });
      // What came back, not what was sent — a value the server refused is not a value that is set.
      toast(
        out.preferences.analytics_opt_out
          ? 'Your account id will be left off analytics, within a minute.'
          : 'Analytics will be attributed to your account again.',
        'success',
      );
    },
    onError: (e: Error) => toast(`Couldn't save: ${e.message}`, 'error'),
  });

  const exportData = useMutation({
    mutationFn: () => downloadAccountExport(),
    onSuccess: () => toast('Your data is downloading.', 'success'),
    onError: (e: Error) => toast(`Couldn't export your data: ${e.message}`, 'error'),
  });

  const deletion = useQuery({
    queryKey: ['deletion-status', userId],
    queryFn: () => fetchDeletionStatus(),
    enabled: userId.length > 0,
  });

  const [receipt, setReceipt] = useState<ErasureReceipt | null>(null);
  const runDelete = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: (r) => {
      setReceipt(r);
      void qc.invalidateQueries({ queryKey: ['deletion-status', userId] });
      // NOT "your account has been deleted". `r.summary` is the server's own sentence and it says
      // what actually happened, including the stores it could not reach.
      toast(r.complete ? 'Your data has been deleted.' : 'Some stores could not be cleared — see the receipt.', r.complete ? 'success' : 'error');
    },
    onError: (e: Error) => toast(`Couldn't delete your account: ${e.message}`, 'error'),
  });

  /** What a gated action actually does once identity has been established. */
  const RUN: Record<SensitiveAction, () => void> = {
    'change-email': () => changeEmail.mutate(newEmail.trim()),
    'change-password': () => changePassword.mutate(),
    'remove-two-step': () => {
      const id = factorToRemove;
      setFactorToRemove(null);
      // Nothing to remove is not an error to report; it is a stale click on a panel that has since
      // been refetched. Silently doing nothing is the only honest option, and it is not a lie
      // because no success is claimed either.
      if (id) removeTwoStep.mutate(id);
    },
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
    'export-data': () => exportData.mutate(),
    'delete-account': () => runDelete.mutate(),
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
    // DERIVED, not asserted: irreversible AND it destroys user content, which is the exact input
    // the model answers 'typed' to. The phrase typed is the one the worker demands in the request
    // body, so the ceremony and the API are the same sentence rather than two similar ones.
    'delete-account': confirmationFor({ reversible: false, destroysUserContent: true }) as 'typed',
  };

  const changed = changedPrefs(prefs);

  /** The dialogs, as data. Three actions with three different sentences is not three if-ladders. */
  const DIALOG: Partial<Record<SensitiveAction, { title: string; confirmLabel: string; subject?: string; body: string }>> = {
    'sign-out-everywhere': {
      title: 'Sign out everywhere?',
      confirmLabel: 'Sign out everywhere',
      body: 'Every device signed in to this account will be signed out, including this one. You will need to sign in again.',
    },
    'reset-settings': {
      title: 'Reset every setting?',
      confirmLabel: 'Reset settings',
      body: `${changed.length === 0 ? 'Nothing' : changed.map((k) => PREF_LABELS[k]).join(', ')} will go back to the default. This cannot be undone.`,
    },
    'delete-account': {
      title: 'Delete your account?',
      confirmLabel: 'Delete everything',
      subject: DELETE_ACCOUNT_PHRASE,
      body:
        'Your projects, conversations, checkpoints, workspace files, memory, notifications, automations, ' +
        'API keys and your stored Roblox key are deleted from every store Apple can reach. None of it can be ' +
        'brought back. Your sign-in itself is not removed by this — the receipt afterwards names everything that survives, and why.',
    },
  };

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Signed in as {session?.user.email}</p>
        </div>
      </div>

      <div className="card settings-card settings-search">
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
        {/* BOTH ANSWERS, not only the bad one. A filtered page with no count looks like a page
            that has lost its sections; a "nothing matches" with no next move leaves somebody
            guessing at the vocabulary. */}
        {query.trim() !== '' && (
          <p className="settings-note" role="status">
            {matches.size === 0
              ? `Nothing matches “${query.trim()}”. Try a word from the setting itself, like “theme”, “password”, “time zone” or “delete”.`
              : `Showing ${matches.size} of ${SETTING_FIELDS.length} settings. Clear the box to see them all.`}
          </p>
        )}
      </div>

      {profile.isError && (
        <div className="card settings-card">
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
            <button
              type="submit"
              className="btn"
              disabled={saveName.isPending || profile.isPending}
              title={!saveName.isPending && profile.isPending ? 'Still reading your profile' : undefined}
            >
              {saveName.isPending ? 'Saving…' : 'Save'}
            </button>
          </form>
        </Row>
      </Section>

      <Section
        visible={sectionShows('email-address', 'password', 'two-step', 'sign-out-everywhere', 'security-history')}
        title="Security"
      >
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
            <p className="settings-note settings-note-warn">
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
            <p className="settings-note" role="status">
              A confirmation link is on its way to <strong>{emailSentTo}</strong>. The address on your account does not
              change until that link is opened, so if this was not you, doing nothing is enough — and it is worth
              changing your password, because someone who could reach this page could reach the rest of the account.
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
              <button
                type="submit"
                className="btn"
                disabled={!newEmail.trim() || changeEmail.isPending}
                title={!changeEmail.isPending && !newEmail.trim() ? 'Type the new address first' : undefined}
              >
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
                aria-invalid={passwordTooWeak !== null || undefined}
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
                aria-invalid={passwordsDiffer || undefined}
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
              title={
                changePassword.isPending
                  ? undefined
                  : !newPassword
                    ? 'Enter a new password first'
                    : passwordFault ?? (newPassword !== confirmPassword ? 'Type the new password again to confirm' : undefined)
              }
            >
              {changePassword.isPending ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </Row>

        <Row id="two-step" visible={shows('two-step')}>
          <TwoStepPanel
            onRemove={(factorId) => {
              setFactorToRemove(factorId);
              guard('remove-two-step');
            }}
          />
        </Row>

        <Row id="sign-out-everywhere" visible={shows('sign-out-everywhere')}>
          <h3 className="settings-sub">Sign out everywhere</h3>
          <p className="settings-note">
            Ends every session on every device, including this one. Reach for this if you have lost a machine or seen
            something you do not recognise. Signing out from the account menu only affects this browser.
          </p>
          <button type="button" className="btn" onClick={() => guard('sign-out-everywhere')}>
            Sign out on all devices
          </button>
        </Row>

        <Row id="security-history" visible={shows('security-history')}>
          <SecurityHistory />
        </Row>
      </Section>

      <Section title="Connections" visible={sectionShows('roblox-key', 'api-keys', 'discord')}>
        <Row id="roblox-key" visible={shows('roblox-key')}>
          <RobloxKeyPanel />
        </Row>
        {/* Apple's OWN keys, under the same heading as the Roblox one deliberately: both are
            credentials that act on your behalf, and the only difference is which side holds them.
            The worker has served this whole lifecycle since the public API shipped and nothing in
            this app called any of it — a leaked key could be revoked only with curl. */}
        <Row id="api-keys" visible={shows('api-keys')}>
          <ApiKeysPanel />
        </Row>
        <Row id="discord" visible={shows('discord')}>
          <DiscordCard userId={userId} />
        </Row>
      </Section>

      <AssetSourceSettings userId={userId} shows={shows} sectionShows={sectionShows} />
      <NotificationSettings userId={userId} shows={shows} sectionShows={sectionShows} />

      <Section title="Appearance" visible={sectionShows('appearance', 'motion')}>
        <Row id="appearance" visible={shows('appearance')}>
          <h3 className="settings-sub">Appearance</h3>
          <Choice
            label="Theme"
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
          <p className="settings-note">
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
          <p className="settings-note">Every timestamp in Apple is shown in this zone, and says which zone it is.</p>
        </Row>
      </Section>


      <Section title="Privacy" visible={sectionShows('analytics-opt-out', 'download-my-data')}>
        {/* THE TOGGLE IS GONE, AND THE PROMISE IS THE REASON.
            Both published privacy pages say Apple never trains on a customer's projects — the
            policy states outright that no opt-in programme exists. This row offered exactly that
            opt-in, in the account settings of the same product. A careful reader could not
            reconcile the two, and whichever they believed, one of them was lying to them.
            Owner's decision, 2026-09-20: the promise is the true one. The stronger commitment is
            the one worth keeping, so the switch goes rather than the sentence. `training_opt_in`
            stays in the database untouched — dropping a column is a migration, and nothing reads
            it now. */}

        {/* THE REQUEST LOG CARRIED EVERY ACCOUNT ID AND NOTHING COULD TURN IT OFF.
            The number below is the real retention window from apps/worker/src/retention.ts, and
            tests/account-data.test.mjs compares the two — a privacy page quoting a window the code
            does not keep is the drift this product has already had once. */}
        <Row id="analytics-opt-out" visible={shows('analytics-opt-out')}>
          <h3 className="settings-sub">Analytics</h3>
          <p className="settings-note">
            Apple records which requests were made and how long they took, so a broken feature can be told from a slow
            one. That record carries your account id for 30 days unless you turn it off here. The requests are still
            counted either way — an opt-out removes your name from the row, not the row.
          </p>
          <label className="switch-row">
            <input
              type="checkbox"
              name="analyticsOptOut"
              id="analytics-opt-out"
              checked={storedPrefs.data?.preferences.prefs.analytics_opt_out ?? false}
              onChange={(e) => setAnalyticsOptOut.mutate(e.target.checked)}
              disabled={storedPrefs.isPending || setAnalyticsOptOut.isPending}
            />
            <span>
              Keep my account id out of analytics
              <span className="field-hint"> — takes effect within a minute.</span>
            </span>
          </label>
          {/* A FAILED READ IS NOT "OFF". Rendering an unchecked box over a fetch that never
              answered would show somebody their opt-out had been forgotten. */}
          {storedPrefs.isError && (
            <p className="settings-note settings-note-warn" role="alert">
              This setting could not be read just now, so the switch above may not show what is stored. Reload the page
              before changing it.
            </p>
          )}
        </Row>

        <Row id="download-my-data" visible={shows('download-my-data')}>
          <h3 className="settings-sub">Download my data</h3>
          <p className="settings-note">
            One file with everything Apple holds about you in its database — your profile, your projects, every message,
            your checkpoints, what you have spent, and the keys you have issued. It also names what it does NOT contain
            and where to get that instead, so the file is honest about being one part of the answer.
          </p>
          <button type="button" className="btn" onClick={() => guard('export-data')} disabled={exportData.isPending}>
            {exportData.isPending ? 'Preparing your file…' : 'Download my data'}
          </button>
        </Row>
      </Section>

      <Section title="Danger zone" visible={sectionShows('reset-settings', 'delete-account')} danger>
        <Row id="reset-settings" visible={shows('reset-settings')}>
          <h3 className="settings-sub">Reset settings</h3>
          <p className="settings-note">
            Puts appearance, motion, region, clock, time zone and workspace preferences back to their defaults on this
            device. Your projects, your display name and your privacy choice are not touched.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => guard('reset-settings')}
            disabled={isDefaultPrefs(prefs)}
            title={isDefaultPrefs(prefs) ? 'Nothing has been changed from the defaults' : undefined}
          >
            {isDefaultPrefs(prefs)
              ? 'Everything is already default'
              : `Reset ${changed.length} setting${changed.length === 1 ? '' : 's'}`}
          </button>
        </Row>

        <Row id="delete-account" visible={shows('delete-account')}>
          <h3 className="settings-sub">Delete my account</h3>
          <p className="settings-note">
            Deletes your projects, conversations, checkpoints, workspace files, memory, notifications, automations, API
            keys and your stored Roblox key from every store Apple can reach. It cannot be undone.
          </p>
          <p className="settings-note">
            It does not remove your sign-in. That needs an operator, and the receipt afterwards names it along with
            everything else that survives and why — rather than telling you the account is gone while you can still log
            in to it.
          </p>
          {/* MOVED INSIDE THE ROW. It used to sit between two <Row>s, which meant it was the one
              piece of prose on the page the search box could not hide: filtering to "delete
              account" left a paragraph about project deletion standing over an empty section. It
              also answers the question a person reading this row is most likely to have next —
              whether one project can go instead of everything. */}
          <p className="settings-note">
            To remove one project instead, the delete action lives in each{' '}
            <Link to="/">project card&rsquo;s menu</Link>. It asks you to type the project&rsquo;s name, and it removes
            that project&rsquo;s chat history, checkpoints and Studio pairing forever.
          </p>
          {deletion.data?.requested && !receipt && (
            <p className="settings-note settings-note-warn" role="status">
              Already requested {relativeTime(deletion.data.requestedAt ?? '')} — {deletion.data.stepsDone} stores cleared
              {deletion.data.stepsFailed > 0 ? `, ${deletion.data.stepsFailed} could not be` : ''}.
            </p>
          )}
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => guard('delete-account')}
            disabled={runDelete.isPending}
          >
            {runDelete.isPending ? 'Deleting…' : 'Delete my account'}
          </button>

          {/* THE SERVER'S RECEIPT, AS THE SERVER WROTE IT. It is the only thing that knows which
              stores were actually cleared; a sentence composed here would be this page claiming
              something nothing measured. */}
          {receipt && (
            <div className="settings-receipt" role="status">
              <p>{receipt.summary}</p>
              <h4 className="settings-sub">What is left, and why</h4>
              <ul>
                {receipt.residue.map((r) => (
                  <li key={r.target}>
                    <strong>{r.target}</strong> — {r.why}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Row>
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

      {pending && CEREMONY[pending] && DIALOG[pending] && (
        <ConfirmDialog
          title={DIALOG[pending]!.title}
          ceremony={CEREMONY[pending]!}
          confirmLabel={DIALOG[pending]!.confirmLabel}
          subject={DIALOG[pending]!.subject}
          onClose={() => setPending(null)}
          onConfirm={() => {
            const action = pending;
            setPending(null);
            RUN[action]();
          }}
        >
          {DIALOG[pending]!.body}
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
