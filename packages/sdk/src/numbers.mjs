// Numeric admission for values that arrived from somewhere else.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT `??`.
//
// `x ?? fallback` defends `undefined` and `null` and NOTHING ELSE. Every other wrong
// shape sails straight through it:
//
//     const waitMs = body.waitMs ?? 2000;        // "5000"  -> a string
//     await sleep(waitMs);                       // NaN     -> setTimeout fires immediately
//     if (waitMs > LIMIT) ...                    // NaN > n -> false, so the cap fails OPEN
//
// Every one of those is a value a server, a JSON file, a CLI flag or a plugin can hand
// this SDK, and each turns a guard into decoration. `>` against a non-finite number is
// always false, so the comparison that was supposed to be the limit stops being one and
// reports nothing while it happens.
//
// So: numbers that cross a trust boundary come through here, and anything that is not a
// real finite number of the right shape is REPLACED by the caller's fallback rather than
// used. The fallback is a parameter and never a silent zero, because "we could not read
// it" and "it was zero" are different facts and only one of them is safe to sleep on.

/** True only for a real, finite JS number. Rejects NaN, ±Infinity, strings, null, bigint. */
export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A finite number inside [min, max], or `fallback`.
 *
 * Out-of-range finite values are CLAMPED, not rejected: a server asking for a 10-minute
 * poll delay wants a long delay, and answering it with the default would poll 300x more
 * often than it asked. A value that is not a number at all is a different case and gets
 * the fallback, because nothing about it is meaningful.
 */
export function finiteNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  if (!isFiniteNumber(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** As `finiteNumber`, but the result is an integer (truncated toward zero). */
export function finiteInt(value, fallback, range = {}) {
  const n = finiteNumber(value, fallback, range);
  return Math.trunc(n);
}

/**
 * Seconds from a `Retry-After` header, or null.
 *
 * The header is legally either a delta in seconds or an HTTP-date, and both forms show up
 * in the wild. A date in the past yields 0 — meaning "retry now" — never a negative delay
 * that a later `Math.min` would happily pick as the smallest.
 */
export function retryAfterSeconds(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const asNumber = Number(raw.trim());
  if (Number.isFinite(asNumber)) return Math.max(0, asNumber);
  const asDate = Date.parse(raw);
  if (Number.isNaN(asDate)) return null;
  return Math.max(0, (asDate - Date.now()) / 1000);
}
