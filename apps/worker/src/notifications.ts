// WHAT THE PRODUCT TELLS YOU ABOUT, WHEN, AND WHERE IT SENDS YOU - as decisions, not as storage.
//
// Everything this product knew how to say, it said over a WebSocket to a tab that happened to be
// open. `msg_end` reaches whoever is attached to that project right now; an `error` frame reaches
// the same people. Close the tab and the run's outcome is not delayed, it is gone - there was no
// record to come back to, and no count of anything unread, because nothing was ever read.
//
// That is a coverage hole with a particular shape: the product was perfectly good at telling you
// things while you were looking at it. So this file is deliberately NOT a second transport. It is
// the policy layer that decides, for one event and one recipient:
//
//   - is this person the right recipient at all (and never the person who caused it);
//   - has this person switched this kind of notification off - and are they ALLOWED to;
//   - is this the same thing they were already told, in which case it is a count and not a row;
//   - when should it land, given quiet hours and a digest setting in the person's own zone;
//   - which URL does it open, and does that URL address something this product actually serves.
//
// `notification-store.ts` writes the rows and nothing else. The split is the same one
// collab-threads.ts made: a policy reachable only by standing up storage is a policy nobody feeds
// a hostile input to.
//
// ---------------------------------------------------------------------------------------------
// CHANNELS: THERE IS EXACTLY ONE, AND SAYING SO IS THE FEATURE
// ---------------------------------------------------------------------------------------------
// The obvious shape here is a channel list - in-app, email, push - with a preference per channel.
// This deployment has no mail transport and no service worker: nothing in the tree can send an
// email or a web push, and adding a preference switch for either would put a control in the
// settings page that does nothing, reads as working, and quietly loses every notification routed
// to it. A switch for an absent transport is the exact shape of failure this repository is built
// around - an unperformed delivery rendering as a delivery.
//
// So `NOTIFICATION_CHANNELS` has one entry, the preference normaliser REFUSES `email` and `push`
// by name with a reason the settings page can print, and `UNBUILT_CHANNELS` carries the sentence
// to print. The day a transport exists, it moves lists; until then the product says what it is.
import { instantForWall, isTimeZone, offsetMsAt, wallPartsAt } from './zoned-time';

// ---------------------------------------------------------------------------------------------
// the taxonomy
// ---------------------------------------------------------------------------------------------

/**
 * Every kind of thing this product will tell a person about.
 *
 * A RUNTIME allowlist with the type derived from it, never the other way round: these arrive from
 * a stored preference row, from another Durable Object over `fetch`, and from a webhook body.
 */
export const NOTIFICATION_KINDS = [
  'run_complete',
  'run_failed',
  'automation_failed',
  'approval_requested',
  'mention',
  'integration_failure',
  'usage_threshold',
  'billing_issue',
  'security_event',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
const KIND_SET: ReadonlySet<string> = new Set<string>(NOTIFICATION_KINDS);
export function isNotificationKind(v: unknown): v is NotificationKind {
  return typeof v === 'string' && KIND_SET.has(v);
}

export const NOTIFICATION_SEVERITIES = ['info', 'warn', 'urgent'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/** Which surface a notification of this kind opens. Each maps to a route the web app serves. */
export const NOTIFICATION_TARGETS = ['project', 'usage', 'settings'] as const;
export type NotificationTarget = (typeof NOTIFICATION_TARGETS)[number];

export interface NotificationSpec {
  severity: NotificationSeverity;
  /**
   * May the recipient switch it off?
   *
   * TWO KINDS MAY NOT, and the reason is the same for both: they are the only notifications whose
   * subject is the person's ACCOUNT rather than their work. A security event the account holder
   * can mute is a setting an attacker turns on after they get in; a failed card the account holder
   * can mute is a service that stops working for a reason nobody told them. Everything else is
   * about a build, and a person who does not want to hear about their builds is entitled not to.
   */
  optional: boolean;
  target: NotificationTarget;
  /**
   * Does it wait for quiet hours or a digest?
   *
   * The same two exceptions, for the same reason. Holding "your card was declined" until 07:00 is
   * holding it past the renewal it is warning about.
   */
  defers: boolean;
  /**
   * Is a notification about your OWN action pointless, or is it the point?
   *
   * Two kinds exist only because somebody else did something to you: a mention and a review
   * request. Telling the author that they mentioned themselves, or the requester that they asked
   * themselves for a review, is noise with no information in it - and the mention resolver already
   * drops the author for the same reason.
   *
   * For everything else the actor and the recipient being the same person is the NORMAL case and
   * suppressing it would delete the feature. You started the run, so you are the one who wants to
   * know it finished; you minted the key, and "a key was minted on your account" is worth reading
   * precisely so that the day you did not mint it, you see it. A security log nobody is told about
   * while nothing is wrong is a security log nobody reads on the day something is.
   */
  suppressSelf: boolean;
}

export const NOTIFICATION_SPECS: Readonly<Record<NotificationKind, NotificationSpec>> = {
  run_complete: { severity: 'info', optional: true, target: 'project', defers: true, suppressSelf: false },
  run_failed: { severity: 'warn', optional: true, target: 'project', defers: true, suppressSelf: false },
  automation_failed: { severity: 'warn', optional: true, target: 'project', defers: true, suppressSelf: false },
  approval_requested: { severity: 'info', optional: true, target: 'project', defers: true, suppressSelf: true },
  mention: { severity: 'info', optional: true, target: 'project', defers: true, suppressSelf: true },
  integration_failure: { severity: 'warn', optional: true, target: 'project', defers: true, suppressSelf: false },
  usage_threshold: { severity: 'warn', optional: true, target: 'usage', defers: true, suppressSelf: false },
  billing_issue: { severity: 'urgent', optional: false, target: 'settings', defers: false, suppressSelf: false },
  security_event: { severity: 'urgent', optional: false, target: 'settings', defers: false, suppressSelf: false },
};

/**
 * `NOTIFICATION_SPECS[kind]` for a kind that has already been validated - and a throw otherwise.
 *
 * A bare index would answer `undefined` for an unknown key and, worse, answer something truthy for
 * `'constructor'`. Every caller here has an `isNotificationKind` above it; this is what makes that
 * a requirement rather than a convention.
 */
export function notificationSpec(kind: NotificationKind): NotificationSpec {
  if (!isNotificationKind(kind) || !Object.hasOwn(NOTIFICATION_SPECS, kind)) {
    throw new Error(`notificationSpec: unknown kind ${String(kind)}`);
  }
  return NOTIFICATION_SPECS[kind];
}

/** The one channel that exists. See the header. */
export const NOTIFICATION_CHANNELS = ['inapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Channels a person might reasonably ask for and this deployment cannot serve, each with the
 * sentence the settings page prints instead of rendering a switch.
 */
export const UNBUILT_CHANNELS: Readonly<Record<string, string>> = {
  email: 'Email notifications are not available: this deployment has no mail transport configured.',
  push: 'Browser push is not available: this deployment ships no service worker to receive it.',
};

// ---------------------------------------------------------------------------------------------
// delivery preferences
// ---------------------------------------------------------------------------------------------

export const DIGEST_MODES = ['off', 'hourly', 'daily'] as const;
export type DigestMode = (typeof DIGEST_MODES)[number];

/** `HH:MM`, 24-hour, zero-padded. Anchored: `9:5` and `25:00` are not times. */
const HHMM_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

export interface QuietHours {
  /** Local wall time the quiet window opens, `HH:MM`. */
  start: string;
  /** Local wall time it closes. May be EARLIER than `start`, which means it wraps midnight. */
  end: string;
}

export interface DeliveryPreference {
  /** IANA zone. Every wall time in this object is read in it. */
  timezone: string;
  quiet_hours: QuietHours | null;
  digest: DigestMode;
  /** Local hour a daily digest lands. Ignored for the other modes. */
  digest_hour: number;
}

export const DEFAULT_DELIVERY: DeliveryPreference = { timezone: 'UTC', quiet_hours: null, digest: 'off', digest_hour: 9 };

export type NotificationPrefReject =
  | 'bad_value'
  | 'unknown_timezone'
  | 'bad_time'
  | 'empty_window'
  | 'unknown_kind'
  | 'mandatory'
  | 'no_transport';

export interface NormalisedDelivery {
  delivery: DeliveryPreference;
  rejected: { key: string; reason: NotificationPrefReject }[];
}

/**
 * Validate a delivery preference from outside.
 *
 * PARTIAL ACCEPTANCE IS DELIBERATE and only for fields that stand alone. A bad `digest_hour`
 * leaves the default hour and keeps the rest; a bad TIMEZONE, by contrast, invalidates everything
 * else in the object, because a quiet window with no zone to read it in is a window that would be
 * silently applied in UTC - and a person in Auckland would be silenced for a block of their
 * afternoon by a setting they wrote for the night.
 */
export function normaliseDelivery(input: unknown): NormalisedDelivery {
  const rejected: { key: string; reason: NotificationPrefReject }[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { delivery: { ...DEFAULT_DELIVERY }, rejected: input === undefined ? [] : [{ key: 'notify_delivery', reason: 'bad_value' }] };
  }
  const raw = input as Record<string, unknown>;

  const tzGiven = raw.timezone;
  if (tzGiven !== undefined && !isTimeZone(tzGiven)) {
    // Everything else is discarded with it. See the note above.
    rejected.push({ key: 'timezone', reason: 'unknown_timezone' });
    return { delivery: { ...DEFAULT_DELIVERY }, rejected };
  }
  const timezone = isTimeZone(tzGiven) ? tzGiven : DEFAULT_DELIVERY.timezone;

  let quiet: QuietHours | null = null;
  if (raw.quiet_hours !== undefined && raw.quiet_hours !== null) {
    const q = raw.quiet_hours as Record<string, unknown>;
    if (!q || typeof q !== 'object' || Array.isArray(q)) rejected.push({ key: 'quiet_hours', reason: 'bad_value' });
    else if (typeof q.start !== 'string' || !HHMM_RE.test(q.start) || typeof q.end !== 'string' || !HHMM_RE.test(q.end)) {
      rejected.push({ key: 'quiet_hours', reason: 'bad_time' });
    } else if (q.start === q.end) {
      // Not "quiet all day" and not "quiet for no time": it is ambiguous between the two, and
      // guessing either way silences or un-silences a person who asked for neither.
      rejected.push({ key: 'quiet_hours', reason: 'empty_window' });
    } else {
      quiet = { start: q.start, end: q.end };
    }
  }

  let digest: DigestMode = DEFAULT_DELIVERY.digest;
  if (raw.digest !== undefined) {
    if (typeof raw.digest === 'string' && (DIGEST_MODES as readonly string[]).includes(raw.digest)) digest = raw.digest as DigestMode;
    else rejected.push({ key: 'digest', reason: 'bad_value' });
  }

  let digestHour = DEFAULT_DELIVERY.digest_hour;
  if (raw.digest_hour !== undefined) {
    const h = raw.digest_hour;
    if (typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= 23) digestHour = h;
    else rejected.push({ key: 'digest_hour', reason: 'bad_value' });
  }

  return { delivery: { timezone, quiet_hours: quiet, digest, digest_hour: digestHour }, rejected };
}

export type NotificationEventPrefs = Partial<Record<NotificationKind, boolean>>;

export interface NormalisedEventPrefs {
  events: NotificationEventPrefs;
  rejected: { key: string; reason: NotificationPrefReject }[];
}

/**
 * Validate a per-event on/off map.
 *
 * A request to mute a MANDATORY kind is refused by name rather than dropped, so the settings page
 * can say which switch it would not throw and why. A request naming `email` or `push` is refused
 * with `no_transport` for the same reason: the person asked for something real that this
 * deployment does not have, and silence would read as agreement.
 */
export function normaliseEventPrefs(input: unknown): NormalisedEventPrefs {
  const events: NotificationEventPrefs = {};
  const rejected: { key: string; reason: NotificationPrefReject }[] = [];
  if (input === undefined) return { events, rejected };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { events, rejected: [{ key: 'notify_events', reason: 'bad_value' }] };
  }
  // Own keys only: `for...in` would read a preference straight off the prototype.
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Object.hasOwn(UNBUILT_CHANNELS, key)) {
      rejected.push({ key, reason: 'no_transport' });
      continue;
    }
    if (!isNotificationKind(key)) {
      rejected.push({ key: key.slice(0, 60), reason: 'unknown_kind' });
      continue;
    }
    if (typeof value !== 'boolean') {
      rejected.push({ key, reason: 'bad_value' });
      continue;
    }
    if (value === false && !notificationSpec(key).optional) {
      rejected.push({ key, reason: 'mandatory' });
      continue;
    }
    events[key] = value;
  }
  return { events, rejected };
}

/**
 * Layer per-event switches from several scopes.
 *
 * PER ENTRY, not per object. Wholesale override is right for a delivery window - half of one
 * person's window and half of another's is a window nobody set - and wrong here: muting one kind
 * inside a project would otherwise silently un-mute every kind the person had muted everywhere
 * else, which is a setting changing itself.
 */
export function mergeEventPrefs(layers: readonly NotificationEventPrefs[]): NotificationEventPrefs {
  const out: NotificationEventPrefs = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const kind of NOTIFICATION_KINDS) {
      const v = layer[kind];
      if (typeof v === 'boolean') out[kind] = v;
    }
  }
  return out;
}

/** Is this kind switched on for this recipient? Mandatory kinds answer true whatever is stored. */
export function wants(kind: NotificationKind, events: NotificationEventPrefs | undefined): boolean {
  if (!notificationSpec(kind).optional) return true;
  const v = events?.[kind];
  // Default ON. A product that tells you nothing until you go and ask it to is a product whose
  // notifications nobody discovers.
  return v === undefined ? true : v === true;
}

// ---------------------------------------------------------------------------------------------
// where a notification sends you
// ---------------------------------------------------------------------------------------------

/**
 * The routes the web app serves, as PATTERNS rather than as strings built at each call site.
 *
 * These are asserted against apps/web's router by the test, so renaming a route there turns this
 * red instead of shipping an inbox full of links to a 404.
 */
export const NOTIFICATION_ROUTES: Readonly<Record<NotificationTarget, string>> = {
  project: '/app/projects/:id',
  usage: '/app/usage',
  settings: '/app/settings',
};

/**
 * The URL this notification opens, or null.
 *
 * NULL IS A REAL ANSWER. A project notification that cannot say which project has nowhere correct
 * to send anyone, and sending them to the dashboard instead is a link that looks like it worked.
 * The caller refuses the notification rather than delivering a row whose only action is wrong.
 */
export function deepLinkFor(kind: NotificationKind, projectId: string | null | undefined): string | null {
  const target = notificationSpec(kind).target;
  if (target !== 'project') return NOTIFICATION_ROUTES[target];
  if (typeof projectId !== 'string' || projectId.trim() === '') return null;
  return `/app/projects/${encodeURIComponent(projectId)}`;
}

// ---------------------------------------------------------------------------------------------
// identity: what counts as the same notification twice
// ---------------------------------------------------------------------------------------------

/**
 * The key two deliveries must share to be ONE row with a count on it.
 *
 * Built from the recipient, the kind and the SUBJECT - the specific thing the notification is
 * about, which is a run id, a thread id, an invoice id or a key id depending on the kind. Without
 * the subject, two different runs failing would coalesce into one line reading "2", and the user
 * would lose a failure they never saw. With it, the SAME run reported twice - a retried webhook, a
 * dispatcher that woke twice - stays one line.
 */
export function dedupeKeyFor(ev: { recipientId: string; kind: NotificationKind; subject?: string | null }): string {
  return `${ev.recipientId} ${ev.kind} ${ev.subject ?? ''}`;
}

/**
 * The key a listing groups rows under: recipient, kind, project.
 *
 * Coarser than the dedupe key on purpose. Twelve mentions across one project are twelve rows a
 * person wants to read individually and one line in a collapsed view; twelve reports of the same
 * run failing are one row.
 */
export function groupKeyFor(ev: { recipientId: string; kind: NotificationKind; projectId?: string | null }): string {
  return `${ev.recipientId} ${ev.kind} ${ev.projectId ?? ''}`;
}

// ---------------------------------------------------------------------------------------------
// when it lands
// ---------------------------------------------------------------------------------------------

/** Minutes past local midnight, for a validated `HH:MM`. */
function minutesOf(hhmm: string): number {
  const m = HHMM_RE.exec(hhmm);
  if (!m) throw new Error(`minutesOf: ${hhmm} is not HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Is `instant` inside the quiet window, read on the recipient's own wall clock?
 *
 * The window WRAPS when `end` is earlier than `start`, which is the normal case: 22:00 to 07:00 is
 * one window over two dates, not an empty one. Half-open at the end - 07:00 is not quiet - so the
 * instant the window closes is an instant something can be delivered at, and there is no minute
 * that belongs to both the quiet window and the day.
 */
export function inQuietHours(quiet: QuietHours, timezone: string, instant: number): boolean {
  const p = wallPartsAt(timezone, instant);
  const now = p.hour * 60 + p.minute;
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/**
 * The instant the current quiet window closes, at or after `instant`.
 *
 * Resolved through `instantForWall`, so the morning the clocks go forward past the closing time is
 * handled by the one piece of code in this tree that knows what to do about it, rather than by an
 * offset captured here and applied to a date that has since changed offset.
 */
export function quietHoursEnd(quiet: QuietHours, timezone: string, instant: number): number {
  const end = minutesOf(quiet.end);
  const p = wallPartsAt(timezone, instant);
  const today = instantForWall(timezone, { year: p.year, month: p.month, day: p.day, hour: Math.floor(end / 60), minute: end % 60 });
  if (today.instant > instant) return today.instant;
  // Already past today's closing time, so the window closes tomorrow. The date is advanced in UTC
  // and then re-read on the wall clock, which is what keeps "tomorrow" meaning the next local date
  // on a day that is 23 or 25 hours long.
  const nextDay = wallPartsAt(timezone, instant + 86_400_000);
  return instantForWall(timezone, { year: nextDay.year, month: nextDay.month, day: nextDay.day, hour: Math.floor(end / 60), minute: end % 60 }).instant;
}

/** The next digest boundary strictly after `instant`, or null when digests are off. */
export function nextDigestAt(delivery: DeliveryPreference, instant: number): number | null {
  if (delivery.digest === 'off') return null;
  if (delivery.digest === 'hourly') {
    // The top of the next hour on the RECIPIENT'S clock. Zones offset by a half or quarter hour
    // (+05:30, +05:45) put the top of the local hour at :30 or :45 past the UTC hour, so the
    // rounding is done in local time and the offset added back rather than rounding UTC directly.
    const off = offsetMsAt(delivery.timezone, instant);
    const local = instant + off;
    const next = Math.floor(local / 3_600_000) * 3_600_000 + 3_600_000;
    return next - off;
  }
  const p = wallPartsAt(delivery.timezone, instant);
  const today = instantForWall(delivery.timezone, { year: p.year, month: p.month, day: p.day, hour: delivery.digest_hour, minute: 0 });
  if (today.instant > instant) return today.instant;
  const tomorrow = wallPartsAt(delivery.timezone, instant + 86_400_000);
  return instantForWall(delivery.timezone, { year: tomorrow.year, month: tomorrow.month, day: tomorrow.day, hour: delivery.digest_hour, minute: 0 }).instant;
}

export interface DeliveryTiming {
  deliverAt: number;
  /** Why it is not landing now. `null` means it is. */
  heldBy: 'quiet_hours' | 'digest' | null;
}

/**
 * When this notification should become visible.
 *
 * Both holds apply and the LATER of the two wins: a digest boundary inside a quiet window is not a
 * hole in the quiet window. Urgent kinds bypass both - see `NotificationSpec.defers`.
 */
export function deliveryTiming(kind: NotificationKind, delivery: DeliveryPreference, now: number): DeliveryTiming {
  if (!notificationSpec(kind).defers) return { deliverAt: now, heldBy: null };
  let at = now;
  let heldBy: DeliveryTiming['heldBy'] = null;
  if (delivery.quiet_hours && inQuietHours(delivery.quiet_hours, delivery.timezone, now)) {
    at = quietHoursEnd(delivery.quiet_hours, delivery.timezone, now);
    heldBy = 'quiet_hours';
  }
  const digest = nextDigestAt(delivery, now);
  if (digest !== null && digest > at) {
    at = digest;
    heldBy = 'digest';
  }
  return { deliverAt: at, heldBy };
}

// ---------------------------------------------------------------------------------------------
// when a person is running out
// ---------------------------------------------------------------------------------------------

/**
 * The share of a day's allowance below which "running low" is worth saying.
 *
 * THE SAME NUMBER THE METER USES. `apps/web/src/components/usage-meter-model.ts` turns its bar
 * amber at this fraction, and a notification that fired at a different level would be the product
 * holding two opinions about when a person is running out - a push saying "you are low" over a bar
 * that is still green, or the reverse. The test asserts the two agree, so moving one moves both or
 * turns red.
 */
export const USAGE_WARN_FRACTION = 0.15;

export const USAGE_BANDS = ['fine', 'low', 'exhausted'] as const;
export type UsageBand = (typeof USAGE_BANDS)[number];

/**
 * Which band a balance is in.
 *
 * AN UNREADABLE ALLOWANCE IS `fine`, NOT `exhausted`. Every comparison against NaN is false, so an
 * implementation that reached the `remaining <= 0` test with NaN would fall through to whatever
 * the last branch happened to be - and telling a person their Credits have run out because a
 * number could not be read is an alarm about a measurement that was never taken. The unreadable
 * case is stated first and answers "I am not going to claim anything".
 */
export function usageBand(remaining: unknown, dailyAllowance: unknown): UsageBand {
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return 'fine';
  if (typeof dailyAllowance !== 'number' || !Number.isFinite(dailyAllowance) || dailyAllowance <= 0) return 'fine';
  if (remaining <= 0) return 'exhausted';
  return remaining / dailyAllowance <= USAGE_WARN_FRACTION ? 'low' : 'fine';
}

// ---------------------------------------------------------------------------------------------
// the plan
// ---------------------------------------------------------------------------------------------

export const TITLE_MAX = 160;
export const BODY_MAX = 600;

export interface NotificationInput {
  kind: unknown;
  recipientId: unknown;
  /** Who caused it. A person is never notified about their own action. */
  actorId?: unknown;
  projectId?: unknown;
  projectName?: unknown;
  /** The specific thing this is about: a run id, a thread id, an invoice id, a key id. */
  subject?: unknown;
  title: unknown;
  body?: unknown;
  at: number;
}

export interface PlannedNotification {
  recipientId: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  projectId: string | null;
  projectName: string | null;
  subject: string | null;
  href: string;
  dedupeKey: string;
  groupKey: string;
  createdAt: number;
  deliverAt: number;
  heldBy: DeliveryTiming['heldBy'];
}

export type PlanRefusal =
  | 'unknown_kind'
  | 'no_recipient'
  | 'own_action'
  | 'muted'
  | 'no_target'
  | 'empty_title';

export type NotificationPlan = { ok: true; notification: PlannedNotification } | { ok: false; reason: PlanRefusal };

export interface RecipientPrefs {
  delivery?: DeliveryPreference;
  events?: NotificationEventPrefs;
}

/**
 * Decide one notification, or refuse it with a reason.
 *
 * ORDER MATTERS AND IS THE SAME ORDER collab-threads.ts USES: identity first, then permission, then
 * content. A muted kind is refused on the grounds that it is muted, never on the grounds that its
 * title was empty, because the caller logs the reason and the reason is what someone reads when
 * they ask why they were not told.
 */
export function planNotification(input: NotificationInput, prefs: RecipientPrefs, opts: { now?: number } = {}): NotificationPlan {
  if (!isNotificationKind(input.kind)) return { ok: false, reason: 'unknown_kind' };
  const kind = input.kind;
  if (typeof input.recipientId !== 'string' || input.recipientId.trim() === '') return { ok: false, reason: 'no_recipient' };
  const recipientId = input.recipientId;

  // A MENTION OF YOURSELF IS NOT NEWS - and a run of your own finishing is. See `suppressSelf`.
  if (notificationSpec(kind).suppressSelf && typeof input.actorId === 'string' && input.actorId === recipientId) {
    return { ok: false, reason: 'own_action' };
  }

  if (!wants(kind, prefs.events)) return { ok: false, reason: 'muted' };

  const projectId = typeof input.projectId === 'string' && input.projectId.trim() !== '' ? input.projectId : null;
  const href = deepLinkFor(kind, projectId);
  if (href === null) return { ok: false, reason: 'no_target' };

  const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX) : '';
  if (title === '') return { ok: false, reason: 'empty_title' };
  const body = typeof input.body === 'string' && input.body.trim() !== '' ? input.body.trim().slice(0, BODY_MAX) : null;

  const subject = typeof input.subject === 'string' && input.subject.trim() !== '' ? input.subject.slice(0, 200) : null;
  const now = opts.now ?? input.at;
  const delivery = prefs.delivery ?? DEFAULT_DELIVERY;
  const timing = deliveryTiming(kind, delivery, now);

  return {
    ok: true,
    notification: {
      recipientId,
      kind,
      severity: notificationSpec(kind).severity,
      title,
      body,
      projectId,
      projectName: typeof input.projectName === 'string' && input.projectName.trim() !== '' ? input.projectName.slice(0, 120) : null,
      subject,
      href,
      dedupeKey: dedupeKeyFor({ recipientId, kind, subject }),
      groupKey: groupKeyFor({ recipientId, kind, projectId }),
      createdAt: now,
      deliverAt: timing.deliverAt,
      heldBy: timing.heldBy,
    },
  };
}
