// The age screen on email sign-up (plan section 7: StudPilot is for people aged 13 and over).
//
// A NEUTRAL SCREEN. It asks for a date of birth as a day, a month and a year and says nothing about a threshold: no
// "you must be 13", no limit on the year field, no placeholder that shows an age. A screen that names the line teaches the
// person to cross it.
//
// WHAT LEAVES THE BROWSER. Nothing about the date. A person who passes is recorded as `age_gate: 'passed'` in the sign-up's
// user metadata and nothing else; a person who does not is never sent anywhere (no request is made at all). The date itself
// is read, compared and dropped inside this file's callers; it is not stored, logged or sent.
//
// A SOFT BLOCK, AND SAID SO. A refusal is remembered in this browser (localStorage), so changing the date and trying again at
// once does not work. It stops nobody who clears site data or uses another browser, and the server does not check the flag.
// That is the strength of any neutral age screen without an identity check. planning/proof/M2/DECISIONS.md section 12 says so.
//
// No React and no imports, so `node --test` loads it and tests/age-gate.test.mjs executes every rule here.

/** The age at which an account may be made. It is a number in this file and on the policy pages, and on no screen of the form. */
export const MIN_AGE = 13;

/** What the sign-up request carries for a person who passed. The only fact about age that is ever sent. */
export const AGE_GATE_PASSED = { age_gate: 'passed' } as const;

/** The browser's memory of a refusal. A flag, never a date or an age. */
export const AGE_GATE_KEY = 'studpilot.age-gate.v1';

export interface BirthDate {
  day: string;
  month: string;
  year: string;
}

export type AgeVerdict =
  /** A field is empty, or the three do not make a date that exists. Said the same way for both, so it hints at nothing. */
  | { kind: 'invalid' }
  | { kind: 'under' }
  | { kind: 'pass' };

const DIGITS = /^\d{1,4}$/;

const DECIMAL_DIGIT = /\p{Nd}/u;

/**
 * Every Unicode decimal digit written as the ASCII digit it stands for, and everything else left as it was. A person whose keyboard types
 * Arabic-Indic, Persian, Devanagari, Bengali, Thai or full-width digits has typed a real date; stripping those as "not digits" made every
 * keystroke vanish and the submit stay disabled, with no message. Unicode keeps each script's ten decimal digits in one unbroken run in
 * the order 0 to 9, so a digit's value is its distance from the start of its run, modulo ten (runs may touch, and each is ten long).
 * tests/age-gate.test.mjs checks the result against Intl's own digits for every numbering system the runtime knows.
 */
export function normaliseDigits(raw: string): string {
  return raw.replace(/\p{Nd}/gu, (digit) => {
    const at = digit.codePointAt(0) ?? 0;
    if (at >= 0x30 && at <= 0x39) return digit;
    let back = 0;
    while (DECIMAL_DIGIT.test(String.fromCodePoint(at - back - 1))) back += 1;
    return String(back % 10);
  });
}

/** What a day or a year field holds after something is typed or pasted into it: ASCII digits only (any script's digits are converted, anything else is dropped). */
export function dateDigits(raw: string): string {
  return normaliseDigits(raw).replace(/\D/g, '');
}

/** The first year the field accepts. Not a threshold: anybody alive is after it. */
const FIRST_YEAR = 1900;

/**
 * Judge a birth date as of `now`. The date is read as the person's own calendar date (the device's local one),
 * and the birthday counts on the day it falls: a person is 13 from their thirteenth birthday, not the day after.
 */
export function judgeBirthDate(date: BirthDate, now: Date = new Date()): AgeVerdict {
  // Whatever script the digits were typed in is the same date.
  const day = normaliseDigits(date.day);
  const month = normaliseDigits(date.month);
  const year = normaliseDigits(date.year);
  if (![day, month, year].every((part) => DIGITS.test(part.trim()))) return { kind: 'invalid' };
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (year.trim().length !== 4 || y < FIRST_YEAR || m < 1 || m > 12 || d < 1 || d > 31) return { kind: 'invalid' };
  // A date that does not exist (31 February) is not a date of birth. Built and read back, so the calendar decides.
  const built = new Date(Date.UTC(y, m - 1, d));
  if (built.getUTCFullYear() !== y || built.getUTCMonth() !== m - 1 || built.getUTCDate() !== d) return { kind: 'invalid' };
  const nowY = now.getFullYear();
  const nowM = now.getMonth() + 1;
  const nowD = now.getDate();
  // Born after today: not a date of birth either.
  if (y > nowY || (y === nowY && (m > nowM || (m === nowM && d > nowD)))) return { kind: 'invalid' };
  const age = nowY - y - (nowM < m || (nowM === m && nowD < d) ? 1 : 0);
  return age >= MIN_AGE ? { kind: 'pass' } : { kind: 'under' };
}

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

/** A refusal made in this page load, kept even where storage is blocked, so the soft block works in a private window too. */
let refusedThisPage = false;

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Has this browser refused somebody on this screen? Storage that cannot be read says no; the page's own memory still counts. */
export function refusalRemembered(storage: ReadableStorage | null = defaultStorage()): boolean {
  if (refusedThisPage) return true;
  try {
    return storage?.getItem(AGE_GATE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remember a refusal. Storage that cannot be written costs the memory across reloads, never the refusal itself. */
export function rememberRefusal(storage: WritableStorage | null = defaultStorage()): void {
  refusedThisPage = true;
  try {
    storage?.setItem(AGE_GATE_KEY, '1');
  } catch {
    /* blocked or full: the page's own memory above still holds */
  }
}

export type SignupGate =
  | { kind: 'refused' }
  | { kind: 'ask'; message: string }
  | { kind: 'go'; data: typeof AGE_GATE_PASSED };

/** The one sentence for an empty or impossible date. It is the same for both, so it hints at nothing. */
export const ENTER_A_REAL_DATE = 'Enter your date of birth, as a day, a month and a year.';

/** What a sign-up attempt may do. The one decision both the form and its test read. */
export function signupGate(
  date: BirthDate,
  now: Date = new Date(),
  storage: (ReadableStorage & WritableStorage) | null = defaultStorage(),
): SignupGate {
  // A browser that has refused already refuses again whatever date is now typed: that is what remembering means.
  if (refusalRemembered(storage)) return { kind: 'refused' };
  const verdict = judgeBirthDate(date, now);
  if (verdict.kind === 'invalid') return { kind: 'ask', message: ENTER_A_REAL_DATE };
  if (verdict.kind === 'under') {
    rememberRefusal(storage);
    return { kind: 'refused' };
  }
  return { kind: 'go', data: AGE_GATE_PASSED };
}

/** The refusal, kind and short. It names no age and no rule, and it does not invite a second try. */
export const REFUSAL_TITLE = 'We cannot make an account for you right now';
export const REFUSAL_BODY = 'Thank you for telling us. StudPilot is not open to you yet, and we are sorry about that. We hope to see you here when you are older.';
