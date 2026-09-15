// Wall-clock time in a named zone, and the two instants a year when a wall-clock time is not one
// instant at all.
//
// WHY THIS EXISTS. Everything time-keyed in this product is UTC by deliberate design —
// `quota-math.ts` says so at length, and it is right to: an allowance that resets on a key rather
// than on a job has no job to miss. But "reset the allowance" is the product's clock; "run this at
// 9am" is the PERSON'S clock, and those are different things. A schedule expressed in UTC is a
// schedule that drifts an hour away from the person who wrote it twice a year, in opposite
// directions, without anything having changed.
//
// So a schedule carries an IANA zone, and this file is the only place that converts between a wall
// time in that zone and the UTC instant the rest of the system stores. Nothing else in the tree
// constructs a local date.
//
// THE HARD PART IS NOT THE OFFSET, IT IS THE TWO DAYS A YEAR WHEN THERE ISN'T ONE.
//
//   - On the morning the clocks go forward, 02:30 local DOES NOT EXIST. There is no instant whose
//     wall time in that zone is 02:30; the minute after 01:59:59 is 03:00:00.
//   - On the morning they go back, 01:30 local EXISTS TWICE — once before the change and once
//     after, an hour apart.
//
// A converter that ignores this does not fail loudly. It returns *an* instant, because
// `Date.UTC(...) - offset` always returns a number, and the number is silently an hour wrong, or
// silently fires a daily job twice. That is precisely the shape this repository calls an
// observation failure: a computation that could not be performed rendering as a computed answer.
//
// So `instantForWall` returns the FOLD as well as the instant, every caller can see which of the
// three cases it got, and the policy for each is stated once, here, rather than implied by
// arithmetic in three places.

/** How a requested wall time sat against the zone's offset changes. */
export type DstFold = 'normal' | 'skipped' | 'repeated';

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
}

/**
 * Is this a zone the runtime's own tz database knows?
 *
 * Asked by CONSTRUCTING a formatter and catching the RangeError, because that is the only oracle
 * there is — there is no list to compare against, and a hand-written allowlist of IANA names would
 * be a second tz database that starts drifting from the real one on the day a zone is renamed.
 *
 * `'UTC'` is accepted by every implementation. An empty string is not: `Intl` treats it as absent
 * and falls back to the system zone, which would silently make "no zone" mean "the server's zone".
 */
export function isTimeZone(v: unknown): v is string {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

const PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  const cached = PART_FORMATTERS.get(tz);
  if (cached) return cached;
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  PART_FORMATTERS.set(tz, f);
  return f;
}

export interface ZonedParts extends WallTime {
  second: number;
  /** 0 = Sunday, matching `Date.prototype.getUTCDay`. */
  weekday: number;
}

/**
 * What the clock on the wall in `tz` reads at `instant`.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`, because the latter still yields `"24"` for
 * midnight in several ICU versions, and a `24` that reaches `Date.UTC` becomes the next day.
 */
export function wallPartsAt(tz: string, instant: number): ZonedParts {
  const parts = formatterFor(tz).formatToParts(new Date(instant));
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : NaN;
  };
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour') % 24;
  const minute = get('minute');
  const second = get('second');
  // The weekday is derived from the ZONED date rather than asked of the formatter: one fewer part
  // to parse, and it cannot disagree with the y/m/d the rest of this record reports.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, second, weekday };
}

/**
 * The zone's offset from UTC at `instant`, in milliseconds (east of UTC is positive).
 *
 * Computed by asking what the wall clock reads and subtracting. There is no API that returns an
 * offset directly, and parsing `timeZoneName: 'shortOffset'` would mean parsing `"GMT+5:30"` by
 * hand in every locale ICU might answer in.
 */
export function offsetMsAt(tz: string, instant: number): number {
  const p = wallPartsAt(tz, instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Milliseconds are not in the formatted parts, so they are carried over from the instant before
  // the subtraction; without this the offset of any instant with a non-zero ms component comes
  // back short by that many milliseconds.
  return asIfUtc - (instant - (((instant % 1000) + 1000) % 1000));
}

export interface ResolvedWall {
  /** The UTC instant this wall time resolves to, under the policy documented below. */
  instant: number;
  fold: DstFold;
}

/**
 * The UTC instant at which the clock in `tz` reads `wall` — and which of the three cases it was.
 *
 * THE POLICY, which is the part a user has to be told about:
 *
 *   normal   — one instant. Nothing to decide.
 *   skipped  — the wall time does not exist. The run happens SHIFTED FORWARD BY THE SIZE OF THE
 *              GAP: an 02:30 job on the morning the clocks go forward an hour runs at 03:30. It is
 *              not dropped, and it does not silently slide to the same nominal time the next day.
 *   repeated — the wall time happens twice. The run happens at the FIRST of the two, and ONCE.
 *              Firing on both is the failure that matters here: the second 01:30 is a real instant
 *              and a naive "has the wall time come round again" test says yes to it.
 *
 * Both choices are the forward-moving one, which is the property that makes a schedule monotonic:
 * whatever the clocks do, the next fire is always after the last one.
 */
export function instantForWall(tz: string, wall: WallTime): ResolvedWall {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0, 0);
  // Offsets a day either side, so a transition anywhere near this wall time is represented by one
  // of the two candidates. Sampling at `naive` itself is not enough: inside a fall-back repeat the
  // offset at `naive` and at the instant it implies are the same value, and the second, later
  // occurrence would never be generated at all.
  const offBefore = offsetMsAt(tz, naive - 86_400_000);
  const offAfter = offsetMsAt(tz, naive + 86_400_000);
  const candidates = offBefore === offAfter ? [naive - offBefore] : [naive - offBefore, naive - offAfter];

  const valid: number[] = [];
  for (const c of candidates) {
    const p = wallPartsAt(tz, c);
    if (p.year === wall.year && p.month === wall.month && p.day === wall.day && p.hour === wall.hour && p.minute === wall.minute) {
      if (!valid.includes(c)) valid.push(c);
    }
  }

  if (valid.length === 0) {
    // A gap. `naive - offBefore` is the requested wall time read with the PRE-transition offset,
    // which lands exactly one gap-width past the transition — 02:30 becomes 03:30 for a one-hour
    // spring forward, and half an hour past it for Lord Howe Island's thirty-minute one.
    return { instant: naive - offBefore, fold: 'skipped' };
  }
  if (valid.length > 1) {
    return { instant: Math.min(...valid), fold: 'repeated' };
  }
  return { instant: valid[0]!, fold: 'normal' };
}

/**
 * What to tell a person about the two mornings a year, in their own zone.
 *
 * Copy, not a comment, because the behaviour above is a CHOICE and a choice the user cannot see is
 * indistinguishable to them from a bug. Rendered next to a schedule editor.
 */
export function dstDisclosure(wall: { hour: number; minute: number }): string {
  const at = `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`;
  return (
    `Twice a year the clocks move and ${at} is not a normal time. ` +
    `On the morning they go forward, ${at} may not exist at all: this run is not skipped — it ` +
    `happens as much later on the clock as the clocks moved, which keeps it exactly as far from ` +
    `yesterday's run as on any other day. ` +
    `On the morning they go back, ${at} happens twice and this runs on the first one only, once.`
  );
}
