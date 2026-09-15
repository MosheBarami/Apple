// The inputs to a scheduler that, until now, could never take a branch.
//
// apps/worker/src/notifications.ts holds a delivery engine with more tests behind it than any
// other part of that subsystem: a quiet window that wraps midnight, survives a clock change and is
// read in the person's own zone; an hourly and a daily digest; a per-kind mute list that layers an
// organisation over a person over a single project. Its defaults are `quiet_hours: null` and
// `digest: 'off'`, and there was no control anywhere in this app to change either — so on a live
// deployment every one of those branches was dead code.
//
// This is the decision layer for the controls that feed it. It lives outside the JSX for the same
// reason components/roadmap/model.ts does: what can be wrong here is arithmetic and defaults, and
// those should be exercised rather than eyeballed.
//
// THREE THINGS ARE COPIES OF SERVER DECISIONS, and each is pinned against the worker's own source
// by tests/notification-prefs.test.mjs rather than trusted:
//
//   * AN UNSET SWITCH IS ON. `wants()` answers true for an absent entry, because a product that
//     tells you nothing until you ask it to is one whose notifications nobody discovers.
//   * TWO KINDS CANNOT BE MUTED. The server refuses them with the reason `mandatory`; a page that
//     offered the switch would show a control that silently does nothing.
//   * START EQUAL TO END IS NOT A WINDOW. The server calls it `empty_window` and throws the whole
//     object away, because it is ambiguous between "quiet all day" and "quiet for no time".
import { MANDATORY_KINDS, type NotificationKind } from './notification-inbox.ts';

/* --------------------------------------------------------------------- the shapes --- */

export const DIGEST_MODES = ['off', 'hourly', 'daily'] as const;
export type DigestMode = (typeof DIGEST_MODES)[number];

export interface QuietHours {
  /** Local wall time the quiet window opens, `HH:MM`, 24-hour. */
  start: string;
  /** Local wall time it closes. May be EARLIER than `start`, which means it wraps midnight. */
  end: string;
}

export interface DeliveryPreference {
  /** IANA zone. Every wall time in this object is read in it, on the server. */
  timezone: string;
  quiet_hours: QuietHours | null;
  digest: DigestMode;
  /** Local hour a daily digest lands. Ignored for the other two modes. */
  digest_hour: number;
}

/** What the worker stores when nobody has set anything. Pinned against its DEFAULT_DELIVERY. */
export const DEFAULT_DELIVERY: DeliveryPreference = { timezone: 'UTC', quiet_hours: null, digest: 'off', digest_hour: 9 };

export type NotificationEventPrefs = Partial<Record<NotificationKind, boolean>>;

/* ------------------------------------------------------------------ per-kind switches --- */

const MANDATORY: ReadonlySet<string> = new Set(MANDATORY_KINDS);

/**
 * Is this kind switched on?
 *
 * DEFAULT ON, and mandatory kinds on regardless of what is stored — both copied from `wants()`.
 * Rendering an unset switch as off would show a fresh account with every notification disabled,
 * and the first thing the user would do is turn on something that was never off.
 */
export function eventEnabled(events: NotificationEventPrefs | undefined, kind: string): boolean {
  if (MANDATORY.has(kind)) return true;
  const v = events?.[kind as NotificationKind];
  return v === undefined ? true : v === true;
}

/**
 * The map after one switch moved.
 *
 * ON IS STORED AS `true`, NOT AS AN ABSENT KEY. The scopes merge per entry, so an explicit true at
 * the account layer is the only way to undo a mute an organisation set; deleting the key would
 * quietly hand the decision back to the org and the switch would flip itself back.
 *
 * Muting a mandatory kind returns the map unchanged rather than sending a value the server will
 * refuse — the control is disabled, and this is the second half of the same promise.
 */
export function toggledEvents(events: NotificationEventPrefs | undefined, kind: string, on: boolean): NotificationEventPrefs {
  const next: NotificationEventPrefs = { ...(events ?? {}) };
  if (MANDATORY.has(kind) && !on) return next;
  next[kind as NotificationKind] = on;
  return next;
}

/* ------------------------------------------------------------------------ quiet hours --- */

/** The server's own pattern, anchored the same way: `9:5` and `25:00` are not times. */
const HHMM_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

export type QuietProblem = 'half_window' | 'empty_window' | 'bad_time';

/**
 * Two time inputs into the window the server will accept, or the reason it would not.
 *
 * Both boxes empty is no window and no complaint — that is how a person switches quiet hours off.
 * One box filled is `half_window`, which the server has no word for because it never receives one:
 * a partial object would be rejected as `bad_time` and the page would blame the value the user did
 * type. Said here, in terms of the control the person is actually looking at.
 */
export function quietHoursOf(start: string, end: string): { hours: QuietHours | null; problem: QuietProblem | null } {
  const s = (start ?? '').trim();
  const e = (end ?? '').trim();
  if (s === '' && e === '') return { hours: null, problem: null };
  if (s === '' || e === '') return { hours: null, problem: 'half_window' };
  if (!HHMM_RE.test(s) || !HHMM_RE.test(e)) return { hours: null, problem: 'bad_time' };
  // Ambiguous between "quiet all day" and "quiet for no time"; guessing either silences a person
  // who asked for neither. The server discards the whole object for this, so it is caught here.
  if (s === e) return { hours: null, problem: 'empty_window' };
  return { hours: { start: s, end: e }, problem: null };
}

/** The delivery preference with a different window on it, and nothing else touched. */
export function withQuietHours(delivery: DeliveryPreference, hours: QuietHours | null): DeliveryPreference {
  return { ...delivery, quiet_hours: hours };
}

/* ----------------------------------------------------------------------------- digest --- */

const DIGEST_LABELS: Readonly<Record<DigestMode, string>> = {
  off: 'Tell me as things happen',
  hourly: 'Once an hour',
  daily: 'Once a day',
};

export function digestLabel(mode: string): string {
  return DIGEST_LABELS[mode as DigestMode] ?? mode;
}

/** `00:00` … `23:00`, for the daily digest's hour. Shown in the zone the window is read in. */
export function digestHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * The zone this device is in, as a REAL IANA name.
 *
 * The display preference in lib/prefs.ts may hold the literal `'system'`, because the browser
 * resolves it at render time. This one is stored on the server and read there, where there is no
 * device to ask — so `'system'` would be stored, refused as `unknown_timezone`, and every wall
 * time the person set would silently be applied in UTC.
 */
export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone !== '' ? zone : DEFAULT_DELIVERY.timezone;
  } catch {
    return DEFAULT_DELIVERY.timezone;
  }
}

/* ---------------------------------------------------------- what the server refused --- */

export const MANDATORY_REASON = 'Always on — this one is about your account, not about a build.';

/**
 * Every reason `NotificationPrefReject` can carry, as a sentence.
 *
 * Both of the reasons this page can actually provoke — `unknown_timezone` and `empty_window` —
 * make the server DISCARD the value and answer with the default. A page that renders the response
 * without reading `rejected` shows the setting snapping back with no explanation, twice, before
 * the person gives up. The test scrapes the union from the worker so a reason added there with no
 * sentence here fails rather than printing a variable name at somebody.
 */
export const REJECT_SENTENCES: Readonly<Record<string, string>> = {
  bad_value: 'that value was not one this setting accepts',
  unknown_timezone: 'that time zone is not one the server knows, so the whole window was discarded',
  bad_time: 'a time has to be written as HH:MM on a 24-hour clock',
  empty_window: 'a quiet window that starts and ends at the same minute is not a window',
  unknown_kind: 'there is no notification of that kind',
  mandatory: MANDATORY_REASON,
  no_transport: 'this deployment has no way to send that, so the switch would have done nothing',
};

/** The names people see, keyed on the suffix the worker prefixes with `notify_delivery:` etc. */
const FIELD_NAMES: Readonly<Record<string, string>> = {
  timezone: 'Time zone',
  quiet_hours: 'Quiet hours',
  digest: 'Digest',
  digest_hour: 'Digest hour',
  notify_delivery: 'Notification delivery',
  notify_events: 'Notification kinds',
};

/**
 * One line of "this is what was not saved, and why".
 *
 * The key arrives as `notify_delivery:timezone` or `notify_events:billing_issue`. Printing that
 * verbatim is the product reading its own storage layout aloud; printing only the reason loses
 * which of four controls it was about.
 */
export function rejectSentence(key: string, reason: string): string {
  const suffix = typeof key === 'string' && key.includes(':') ? key.slice(key.indexOf(':') + 1) : String(key ?? '');
  const name = FIELD_NAMES[suffix] ?? humanKind(suffix);
  const why = REJECT_SENTENCES[reason] ?? 'the server would not accept it';
  return `${name}: ${why}`;
}

/** A wire kind as words, for a rejection about one. `billing_issue` → `Billing issue`. */
function humanKind(key: string): string {
  if (key === '') return 'That setting';
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
