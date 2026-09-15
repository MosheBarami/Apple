// Small formatting helpers — relative time, durations, bytes, countdowns, numbers.
//
// Every one of these used to pass `undefined` as the locale and no time zone at all, which means
// "whatever this browser happens to be set to". That is the right DEFAULT and the wrong only
// option: someone working on a machine in one region, for a studio in another, had no way to make
// this product agree with the rest of their tools, and every timestamp in the app was silently
// rendered in the device's zone with nothing saying which zone that was.
//
// The settings live in lib/prefs.ts. They reach these functions through one module-level value
// rather than through a prop on every call site, because these are called from perhaps eighty
// places — half of them deep inside render — and threading a context through all of them would be
// a much larger change than the feature is worth. Each function still takes explicit settings as
// its last argument, so `node --test` can exercise every branch without touching the module state.
// Explicit .ts extension so `node --test` can load this module directly through native type
// stripping, the same reason the generative-UI validator does it. See apps/web/tsconfig.json.
import { DEFAULT_PREFS, resolveHour12, resolveLocale, resolveTimeZone, type Prefs } from './prefs.ts';

export interface FormatSettings {
  /** undefined means "the browser's own", which is what every call did before this existed. */
  locale: string | undefined;
  timeZone: string | undefined;
  hour12: boolean | undefined;
}

export const SYSTEM_FORMAT: Readonly<FormatSettings> = Object.freeze({
  locale: undefined,
  timeZone: undefined,
  hour12: undefined,
});

export function formatSettingsFrom(prefs: Prefs): FormatSettings {
  return {
    locale: resolveLocale(prefs.region),
    timeZone: resolveTimeZone(prefs.timeZone),
    hour12: resolveHour12(prefs.hourCycle),
  };
}

let active: FormatSettings = formatSettingsFrom({ ...DEFAULT_PREFS });

/** Called by the preferences provider whenever the user changes one of these. */
export function setFormatSettings(next: FormatSettings): void {
  active = next;
}

export function formatSettings(): FormatSettings {
  return active;
}

/**
 * Build a date formatter that cannot throw.
 *
 * `Intl.DateTimeFormat` raises a RangeError for an unknown time zone or a malformed locale, and
 * these functions run inside render on screens the user needs in order to fix the setting that
 * broke them. `prefs.ts` validates a zone before storing it; this is the second line, for the value
 * that got in some other way — an older build, a hand-edited blob, a locale the runtime's ICU data
 * does not carry.
 */
function dateFormat(opts: Intl.DateTimeFormatOptions, s: FormatSettings): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(s.locale, { ...opts, timeZone: s.timeZone });
  } catch {
    return new Intl.DateTimeFormat(undefined, opts);
  }
}

function numberFormat(opts: Intl.NumberFormatOptions, s: FormatSettings): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(s.locale, opts);
  } catch {
    return new Intl.NumberFormat(undefined, opts);
  }
}

/**
 * The WORDS around a relative timestamp, in the reader's language.
 *
 * The dates below already went through Intl; everything nearer than a month was assembled from
 * English literals — 'just now', '2m ago', 'Yesterday', 'from now' — so a Hebrew session rendered a
 * Hebrew date under an English clock. In a right-to-left paragraph that is not only untranslated:
 * 'm' and 'd' are Latin runs the bidi algorithm reorders around the digits beside them.
 *
 * `numeric: 'auto'` is what turns "1 day ago" into "yesterday", and into "אתמול".
 * `style: 'narrow'` is chosen so the English output is character-for-character what it was — these
 * strings sit in a narrow rail, and "2 minutes ago" where "2m ago" used to be is a layout
 * regression wearing an improvement's clothes.
 */
function relativeFormat(s: FormatSettings): Intl.RelativeTimeFormat {
  try {
    return new Intl.RelativeTimeFormat(s.locale, { numeric: 'auto', style: 'narrow' });
  } catch {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' });
  }
}

/**
 * A bare quantity with its unit and no "ago" — "2m", "3h", "4d" — for the compact rail form.
 *
 * `Intl.RelativeTimeFormat` cannot produce this: its narrow output always carries the direction
 * word, and the parts cannot be split without destroying the unit in languages that lead with it.
 * A narrow unit-style NumberFormat is the same string in English and a real unit everywhere else.
 */
function unitAmount(value: number, unit: 'minute' | 'hour' | 'day', s: FormatSettings): string {
  try {
    return new Intl.NumberFormat(s.locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value);
  }
}

/**
 * Every number the product prints, in the reader's own conventions.
 *
 * `1234.5` is "1,234.5" to a reader in Chicago and "1.234,5" to one in Berlin, and getting it
 * wrong is not cosmetic — a thousands separator read as a decimal point is a Credit balance off by
 * three orders of magnitude. The bare `toLocaleString()` calls this replaces were already
 * locale-aware, but only ever in the browser's locale, which the user could not choose.
 */
export function formatNumber(value: number, opts: Intl.NumberFormatOptions = {}, s: FormatSettings = active): string {
  if (!Number.isFinite(value)) return '';
  return numberFormat(opts, s).format(value);
}

export function relativeTime(input: string | number | Date, s: FormatSettings = active): string {
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  // Intl's sign convention: the past is negative. This replaces an 'ago' / 'from now' pair that
  // only existed in English.
  const sign = diff >= 0 ? -1 : 1;
  const rtf = relativeFormat(s);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < 45_000) return rtf.format(0, 'second');
  if (abs < hour) return rtf.format(sign * Math.round(abs / min), 'minute');
  if (abs < day) return rtf.format(sign * Math.round(abs / hour), 'hour');
  if (abs < 30 * day) return rtf.format(sign * Math.round(abs / day), 'day');
  return dateFormat({ month: 'short', day: 'numeric', year: 'numeric' }, s).format(then);
}

/**
 * The compact form used in the rail and the conversation header: "2m", "1h",
 * "Yesterday", "2d". Falls back to a short date past a month.
 *
 * Returns '' for a missing or unparseable input, so a caller can simply skip
 * rendering rather than print a placeholder.
 */
export function shortRelative(input: string | number | Date | null | undefined, s: FormatSettings = active): string {
  if (input === null || input === undefined) return '';
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  const rtf = relativeFormat(s);
  // 'now' and 'Yesterday' were the two English words in here. Both are Intl's to choose now, and
  // 'yesterday' in particular is a word only `numeric: 'auto'` produces.
  if (diff < min) return rtf.format(0, 'second');
  if (diff < hour) return unitAmount(Math.floor(diff / min), 'minute', s);
  if (diff < day) return unitAmount(Math.floor(diff / hour), 'hour', s);
  if (diff < 2 * day) return rtf.format(-1, 'day');
  if (diff < 30 * day) return unitAmount(Math.floor(diff / day), 'day', s);
  return dateFormat({ month: 'short', day: 'numeric' }, s).format(then);
}

/** Wall-clock time for a message timestamp, e.g. "14:32". Never invented. */
export function clockTime(input: string | number | Date, s: FormatSettings = active): string {
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return '';
  return dateFormat({ hour: 'numeric', minute: '2-digit', hour12: s.hour12 }, s).format(then);
}

/**
 * A full date and time, in the user's chosen region and zone.
 *
 * This is what the `title` on a timestamp should say, and the reason it takes a `timeZoneName` is
 * that a product which lets you CHOOSE a zone has to say which one it is showing. "14:32" with no
 * zone was honest when it was always the device's; it is a lie the moment it might not be.
 */
export function fullStamp(input: string | number | Date, s: FormatSettings = active): string {
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return '';
  return dateFormat(
    {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: s.hour12,
      timeZoneName: 'short',
    },
    s,
  ).format(then);
}

/**
 * Full, unambiguous timestamp for a `title` / `dateTime` attribute.
 *
 * DELIBERATELY NOT LOCALISED. This is the machine-readable value, and `<time dateTime>` is defined
 * in terms of UTC ISO-8601 — formatting it in the user's zone would produce a string that reads
 * plausibly and parses to the wrong instant.
 */
export function isoStamp(input: string | number | Date): string {
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return '';
  return new Date(then).toISOString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function formatBytes(bytes: number, s: FormatSettings = active): string {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${formatNumber(bytes, {}, s)} B`;
  if (bytes < 1024 * 1024) {
    return `${formatNumber(bytes / 1024, { maximumFractionDigits: 1, minimumFractionDigits: 1 }, s)} KB`;
  }
  return `${formatNumber(bytes / (1024 * 1024), { maximumFractionDigits: 1, minimumFractionDigits: 1 }, s)} MB`;
}

/** "12:34" style mm:ss countdown until the given ISO time; null when passed. */
export function countdownTo(iso: string): string | null {
  const remaining = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(remaining) || remaining <= 0) return null;
  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
