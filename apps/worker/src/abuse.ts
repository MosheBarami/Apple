// ABUSE AND SPAM AT THE PROMPT INGRESS.
//
// The spend controls (BudgetDO, QuotaDO) answer "can this account afford another run". The IP
// limiter in index.ts answers "is one address hammering the edge". Neither answers the question
// this file exists for: IS THIS SUBMISSION THE SAME SUBMISSION AGAIN. A user who sends the same
// 600-word prompt eleven times in four minutes is inside every quota — each run is paid for, each
// request is under the per-user ceiling — and is burning eleven builds on one intention.
//
// So this is a CONTENT-AND-CADENCE judgement, and it needs the history the other two do not have.
// It is pure: the caller passes the recent submissions and the clock, so the violating input in a
// test comes from the test rather than from a Durable Object that had to be driven into a state.
//
// ---------------------------------------------------------------------------------------------
// THE PART THAT IS EASY TO GET WRONG, AND IS THE REASON FOR `basis`
// ---------------------------------------------------------------------------------------------
// Every check here except the content ones depends on TIME. `now - at <= windowMs` is a comparison
// against a value that arrives from a database column, and a column can hold null, a string, or a
// number that was written by a different unit. `>` against a non-finite value is a guard that fails
// open: `Date.now() - NaN <= 60000` is false, so a corrupt timestamp silently means "that message
// is outside the window", which means "no duplicate", which means ALLOW.
//
// A failure to observe must not render as an observation. So unreadable entries are counted, not
// skipped, and the count rides on the verdict in `basis.historyUnreadable` together with a
// `history_unreadable` signal. The verdict still says what the CONTENT checks found — those do not
// need a clock — but nothing in it can be read as "the cadence checks were run and passed".
import { scanForInjection, type InjectionFinding } from './injection.ts';
import { scanSecrets, summariseDisclosures, type Disclosure } from './redaction.ts';

export const ABUSE_CODES = [
  'burst',
  'duplicate',
  'near_duplicate',
  'link_stuffing',
  'character_flood',
  'oversized',
  'injection_attempt',
  'secret_in_prompt',
  'history_unreadable',
] as const;
export type AbuseCode = (typeof ABUSE_CODES)[number];

export type AbuseAction = 'allow' | 'throttle' | 'refuse';

export interface AbuseSignal {
  code: AbuseCode;
  detail: string;
  /** Contribution to the score. Zero means "worth recording, never worth refusing for". */
  weight: number;
}

export interface AbuseLimits {
  /** How far back the cadence checks look. */
  windowMs: number;
  /** Submissions inside the window before `burst` fires. */
  burstMax: number;
  /** Distinct URLs in one prompt before `link_stuffing` fires. */
  maxUrls: number;
  /** Longest run of one repeated character before `character_flood` fires. */
  maxRepeatRun: number;
  /** Characters before `oversized` fires. The transcript cap is 8000; this is about repetition. */
  maxChars: number;
  /** Token-set overlap at which two prompts are "the same prompt again". */
  nearDuplicateRatio: number;
  throttleAt: number;
  refuseAt: number;
}

export const DEFAULT_ABUSE_LIMITS: AbuseLimits = {
  windowMs: 10 * 60_000,
  burstMax: 12,
  maxUrls: 5,
  maxRepeatRun: 40,
  maxChars: 8000,
  nearDuplicateRatio: 0.9,
  throttleAt: 3,
  refuseAt: 6,
};

export interface Submission {
  text: unknown;
  /** Epoch ms. Anything non-finite is counted as unreadable rather than treated as old. */
  at: unknown;
}

export interface AbuseVerdict {
  action: AbuseAction;
  score: number;
  signals: AbuseSignal[];
  basis: {
    historyConsidered: number;
    historyUnreadable: number;
    windowMs: number;
    /** False when the clock itself could not be read; every cadence check is then unrun. */
    clockReadable: boolean;
    /** False when the caller could not read the history AT ALL — see `historyReadable` below. */
    historyReadable: boolean;
  };
  /** What to tell the user. Null when nothing needs saying. */
  message: string | null;
  /** Disclosures found in the prompt itself — the user pasting their own key into the chat. */
  disclosures: Disclosure[];
  injection: InjectionFinding[];
}

/* ------------------------------------------------------------------- helpers --- */

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/gi;

export function textFrom(v: unknown): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
}

/** Lowercase, punctuation out, whitespace collapsed. Two prompts that differ only in typing noise. */
export function normaliseForComparison(v: unknown): string {
  return textFrom(v)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenSet(v: unknown): Set<string> {
  const n = normaliseForComparison(v);
  return new Set(n ? n.split(' ') : []);
}

/** |A∩B| / |A∪B|. 1 for two identical token sets, 0 when they share nothing. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Longest run of one character. `'aaa!'` → 3. */
export function longestRepeatRun(s: string): number {
  let best = 0;
  let run = 0;
  let prev = '';
  for (const ch of s) {
    run = ch === prev ? run + 1 : 1;
    prev = ch;
    if (run > best) best = run;
  }
  return best;
}

/* -------------------------------------------------------------------- scoring --- */

/**
 * Judge one submission against the recent ones.
 *
 * The weights are relationships, not magic numbers, and the tests assert them as relationships:
 * a third identical prompt must score strictly higher than a second; a burst of thirty must score
 * higher than a burst of thirteen. A literal ("score is 6") would keep passing after a change that
 * inverted the ordering.
 */
export function scoreSubmission(input: {
  text: unknown;
  recent: readonly Submission[];
  now: unknown;
  limits?: Partial<AbuseLimits>;
  /** The run's fence id, so the prompt can be scanned for injection with the same rules as tool output. */
  fenceId?: string;
  /**
   * False when the caller's attempt to READ the history failed — a storage error, a missing table.
   * `recent: []` cannot express that: an empty array means "there were none", and a caller whose
   * query threw would otherwise hand this function the same value as a caller whose user is new.
   * One of those is an observation and the other is the absence of one.
   */
  historyReadable?: boolean;
}): AbuseVerdict {
  const limits: AbuseLimits = { ...DEFAULT_ABUSE_LIMITS, ...(input.limits ?? {}) };
  const text = textFrom(input.text);
  const signals: AbuseSignal[] = [];

  // --- the clock, stated rather than assumed ------------------------------------------------
  const now = typeof input.now === 'number' && Number.isFinite(input.now) ? input.now : null;
  const recent = Array.isArray(input.recent) ? input.recent : [];
  let unreadable = 0;
  const inWindow: { norm: string; tokens: Set<string> }[] = [];
  for (const entry of recent) {
    const at = typeof entry?.at === 'number' && Number.isFinite(entry.at) ? entry.at : null;
    if (now === null || at === null) {
      unreadable += 1;
      continue;
    }
    const age = now - at;
    // A submission stamped in the future is not "very recent", it is a clock disagreement. It is
    // counted as unreadable rather than treated as age zero, which would make it a duplicate of
    // everything.
    if (age < 0) {
      unreadable += 1;
      continue;
    }
    if (age > limits.windowMs) continue;
    inWindow.push({ norm: normaliseForComparison(entry.text), tokens: tokenSet(entry.text) });
  }
  const historyReadable = input.historyReadable !== false;
  if (unreadable > 0 || !historyReadable) {
    signals.push({
      code: 'history_unreadable',
      detail: !historyReadable
        ? 'the submission history could not be read at all, so no cadence check ran'
        : now === null
          ? `the clock was unreadable, so none of the cadence checks ran over ${recent.length} prior submission(s)`
          : `${unreadable} prior submission(s) carried an unusable timestamp and were not judged`,
      // Zero weight ON PURPOSE. This signal does not accuse the user of anything; it exists so a
      // verdict of `allow` cannot be read as "the cadence checks passed" when they did not run.
      weight: 0,
    });
  }

  // --- cadence ------------------------------------------------------------------------------
  if (inWindow.length > limits.burstMax) {
    signals.push({
      code: 'burst',
      detail: `${inWindow.length} submissions in the last ${Math.round(limits.windowMs / 1000)}s (limit ${limits.burstMax})`,
      weight: Math.min(6, (inWindow.length - limits.burstMax) * 2),
    });
  }

  const norm = normaliseForComparison(text);
  if (norm) {
    const identical = inWindow.filter((p) => p.norm === norm).length;
    if (identical >= 2) {
      signals.push({
        code: 'duplicate',
        detail: `this exact prompt was already sent ${identical} time(s) in the last ${Math.round(limits.windowMs / 60_000)} minutes`,
        weight: identical >= 3 ? 6 : 3,
      });
    } else {
      // Near-duplicate only when the prompt is long enough for overlap to mean something. Two
      // four-word prompts share tokens by accident; two sixty-word prompts do not.
      const mine = tokenSet(text);
      if (mine.size >= 8) {
        const near = inWindow.filter((p) => p.tokens.size >= 8 && jaccard(mine, p.tokens) >= limits.nearDuplicateRatio).length;
        if (near >= 2) {
          signals.push({
            code: 'near_duplicate',
            detail: `${near} near-identical prompts in the window (token overlap ≥ ${limits.nearDuplicateRatio})`,
            // Same ladder as the exact-duplicate case above, and deliberately so: three
            // near-identical long prompts in the window are the same intention three times,
            // whether or not a word moved. A gentler curve here would make "add a full stop"
            // the documented way around the duplicate rule.
            weight: near >= 3 ? 6 : 3,
          });
        }
      }
    }
  }

  // --- content ------------------------------------------------------------------------------
  const urls = new Set((text.match(URL_RE) ?? []).map((u) => u.toLowerCase()));
  if (urls.size > limits.maxUrls) {
    signals.push({
      code: 'link_stuffing',
      detail: `${urls.size} distinct links in one prompt (limit ${limits.maxUrls})`,
      weight: urls.size >= limits.maxUrls * 2 ? 4 : 2,
    });
  }

  const longestRun = longestRepeatRun(text);
  if (longestRun > limits.maxRepeatRun) {
    signals.push({
      code: 'character_flood',
      detail: `one character repeated ${longestRun} times`,
      weight: 3,
    });
  }

  if (text.length > limits.maxChars) {
    signals.push({ code: 'oversized', detail: `${text.length} characters (limit ${limits.maxChars})`, weight: 1 });
  }

  // --- what the prompt itself carries --------------------------------------------------------
  // Both of these are RECORDED AND NEVER REFUSED FOR, and the reason is the same for each: the
  // user is allowed to paste a hostile page and ask what it says, and a user who pastes their own
  // API key needs to be told, not blocked. Weight zero keeps them out of the arithmetic while
  // keeping them in the verdict, where the UI and the trace can use them.
  const injection = input.fenceId ? scanForInjection(text, { fenceId: input.fenceId }) : [];
  if (injection.length) {
    signals.push({
      code: 'injection_attempt',
      detail: `the prompt contains ${injection.length} instruction-injection pattern(s): ${[...new Set(injection.map((f) => f.kind))].join(', ')}`,
      weight: 0,
    });
  }
  const disclosures = scanSecrets(text, { minConfidence: 'high' });
  if (disclosures.length) {
    signals.push({
      code: 'secret_in_prompt',
      detail: `the prompt contains ${summariseDisclosures(disclosures)} — a credential pasted into a chat is a credential to rotate`,
      weight: 0,
    });
  }

  const score = signals.reduce((n, s) => n + s.weight, 0);
  const action: AbuseAction = score >= limits.refuseAt ? 'refuse' : score >= limits.throttleAt ? 'throttle' : 'allow';
  return {
    action,
    score,
    signals,
    basis: {
      historyConsidered: inWindow.length,
      historyUnreadable: unreadable,
      windowMs: limits.windowMs,
      clockReadable: now !== null,
      historyReadable,
    },
    message: messageFor(action, signals),
    disclosures,
    injection,
  };
}

/**
 * What the user is told.
 *
 * Names the reason. "Too many requests" for a repeated prompt teaches the user to wait and try the
 * same thing again, which is the one action that cannot work.
 */
function messageFor(action: AbuseAction, signals: readonly AbuseSignal[]): string | null {
  if (action === 'allow') return null;
  const worst = [...signals].sort((a, b) => b.weight - a.weight)[0];
  const verb = action === 'refuse' ? 'was not started' : 'is being slowed down';
  switch (worst?.code) {
    case 'duplicate':
    case 'near_duplicate':
      return `This run ${verb}: the same request was already sent moments ago. Wait for that build to finish, or change what you are asking for.`;
    case 'burst':
      return `This run ${verb}: too many builds started in the last few minutes. Give the current one time to finish.`;
    case 'character_flood':
      return `This run ${verb}: the prompt is mostly one repeated character, which no build can act on.`;
    case 'link_stuffing':
      return `This run ${verb}: too many links in one prompt. Point at the one page that matters.`;
    default:
      return `This run ${verb}: ${worst?.detail ?? 'the request looked automated'}.`;
  }
}
