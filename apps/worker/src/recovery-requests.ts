// The door for somebody who cannot get in at all.
//
// WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL. Every recovery path this product had needs the
// thing the person has lost. `/forgot` sends a link to the inbox they can no longer open. The
// second-factor prompt wants the phone that broke. The settings page — where the address is
// changed, where the factor is removed, where the sessions would be listed — is behind the sign-in
// that is failing. When all of those are gone the product's entire offer was "try again", and the
// owner of this product spent a week locked out of it with nowhere in the interface to say so.
//
// A support queue is an unglamorous answer to that, and it is the honest one: the last resort in
// account recovery is a human being who decides. What this module does is make that decision
// possible without the queue itself becoming the next security problem.
//
// ---------------------------------------------------------------------------------------------
// FOUR RULES, EACH ONE AGAINST A SPECIFIC WAY THIS GOES WRONG
// ---------------------------------------------------------------------------------------------
//
// 1. IT CANNOT ANSWER "DOES THIS ADDRESS HAVE AN ACCOUNT?", BY CONSTRUCTION.
//    `auth-flows.ts` spent real effort making the registered and unregistered cases identical —
//    one conditional sentence, no branch on `identities`, no friendlier error. A recovery form
//    that replied "we have no account for that address" would hand all of it back, on a route
//    with no password in front of it, to anybody with a list of addresses to test.
//
//    The defence is not a careful reply. It is that this module HAS NO WAY TO ASK. It holds a D1
//    binding and nothing else — no Postgres credential, no service role, no user table. Every
//    request is recorded identically because no other behaviour is available to it. There is
//    deliberately no `emailExists` helper here, and a test asserts that nothing named like one
//    ever appears.
//
// 2. THE TABLE IS NOT A CUSTOMER LIST.
//    Rows carry the SHA-256 of the normalised address and never the address. A queue of "people
//    currently locked out of their accounts", in plaintext, is a phishing target assembled and
//    curated for the attacker — and the defining fact about every subject of every row here is
//    that they are already in trouble and already expecting mail about it.
//
//    The operator's workflow survives that: the person reaches them through some other channel and
//    gives their address, the operator puts it into `findByEmail`, and the hash locates the row.
//    So the address is the OPERATOR'S input rather than the database's content.
//
// 3. A WRITE THAT DID NOT HAPPEN IS NEVER REPORTED AS A RECORDED REQUEST.
//    This is the one place where uniformity and honesty look like they conflict, and they do not,
//    because they answer different questions. Whether the address has an account must never be
//    observable. Whether D1 accepted the row has nothing to do with the address — it is the same
//    failure for every input — so reporting it leaks nothing, and NOT reporting it means telling
//    somebody their plea is in a queue it never reached. That is this repository's own named
//    failure, an absence of an observation rendered as an observation, at the moment it costs
//    most. `recorded` is false when nothing was written, and the route turns that into a 503 that
//    asks them to try again rather than a calm confirmation.
//
// 4. THE STATE MACHINE FAILS CLOSED AND IS ATTRIBUTABLE.
//    `refused` and `closed` are terminal. The transition this refuses to allow is the dangerous
//    one: a request refused because it looked like an impersonation attempt, reopened later by a
//    tired operator and approved, leaving an audit trail that says the takeover was intended. And
//    every move records who made it — a state change with no author is not an audit trail, it is
//    a timestamp.
import { oncePerIsolate } from './schema-once';

export interface RecoveryEnv {
  CORPUS: {
    prepare(sql: string): {
      bind(...args: unknown[]): {
        run(): Promise<unknown>;
        first<T = unknown>(): Promise<T | null>;
        all<T = unknown>(): Promise<{ results: T[] }>;
      };
    };
    exec?(sql: string): Promise<unknown>;
  };
}

/**
 * How much of what somebody types is kept.
 *
 * Long enough for "I lost my phone and the backup email is my old work one", short enough that the
 * field is not a place to park a payload aimed at whatever renders the operator's screen.
 */
export const NOTE_MAX = 600;

/** The states a request can be in. Ordered as they are actually reached. */
export const RECOVERY_STATES = ['open', 'verifying', 'approved', 'refused', 'closed'] as const;
export type RecoveryState = (typeof RECOVERY_STATES)[number];

/**
 * The states from which nothing more may happen.
 *
 * `approved` is deliberately NOT here: approving is the decision, and the request still has to be
 * closed once the account is actually back in the person's hands. Two facts, two moves.
 */
const TERMINAL: readonly RecoveryState[] = ['refused', 'closed'];

/** The states in which a fresh plea from the same address is the SAME plea. */
const LIVE: readonly RecoveryState[] = ['open', 'verifying', 'approved'];

export interface RecoveryRequest {
  id: string;
  /** SHA-256 of the normalised address, hex. The address itself is nowhere. */
  emailHash: string;
  openedAt: number;
  state: RecoveryState;
  /** What the person said, capped and stripped, or null when they said nothing. */
  note: string | null;
  /** How many times they asked. A repeat is a fact about urgency, not noise to discard. */
  attempts: number;
  decidedBy: string | null;
  decidedAt: number | null;
}

/* ------------------------------------------------------------------- address handling --- */

/**
 * The single spelling of an address that this module will hash.
 *
 * Case and surrounding whitespace are not identity: somebody typing `Sam@Example.com` on their
 * phone and `sam@example.com ` on a laptop is one person in one crisis, and two rows would put
 * them twice in a queue that an operator works top to bottom.
 *
 * ONLY the domain is genuinely case-insensitive per the RFCs, and the local part is formally the
 * mailbox provider's business. Lowercasing all of it is therefore technically over-eager and is
 * the right call here anyway: the consequence of over-merging is that one person's two spellings
 * collapse into one request, and the consequence of under-merging is a duplicate queue entry for
 * somebody already struggling. Only one of those hurts the person this row is about.
 */
function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (v.length < 3 || v.length > 320) return null;
  // Deliberately not a full RFC 5322 grammar. This is a shape check whose only job is to stop a
  // value that cannot be an address from becoming a hash nobody will ever match — no spaces, one
  // @, something on each side, and a dot in the domain.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v)) return null;
  return v;
}

const enc = new TextEncoder();

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * What survives of the note.
 *
 * Control characters go first, and not for tidiness: a note carrying `\r` or an ANSI escape can
 * forge the shape of whatever prints it — an operator's terminal, a log line, a column in an admin
 * table. Newlines become spaces rather than being deleted so that the sentence stays readable.
 * The cap is applied last, so a long note cannot smuggle content past it by being mostly junk.
 */
function cleanNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const flat = raw
    .replace(/[\r\n\t]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat ? flat.slice(0, NOTE_MAX) : null;
}

/* -------------------------------------------------------------------------- schema --- */

export function ensureRecoveryTables(env: RecoveryEnv): Promise<void> {
  return oncePerIsolate('recovery_requests', () => createRecoveryTables(env), env.CORPUS);
}

async function createRecoveryTables(env: RecoveryEnv): Promise<void> {
  await env.CORPUS.prepare(
    `create table if not exists recovery_requests (
       id text primary key,
       email_hash text not null,
       opened_at integer not null,
       state text not null,
       note text,
       attempts integer not null default 1,
       decided_by text,
       decided_at integer
     )`,
  ).bind().run();
  // The queue is read oldest-first and filtered by state on every operator page load.
  await env.CORPUS.prepare(
    'create index if not exists recovery_requests_state_opened on recovery_requests(state, opened_at)',
  ).bind().run();
  await env.CORPUS.prepare(
    'create index if not exists recovery_requests_hash on recovery_requests(email_hash)',
  ).bind().run();
}

/* ----------------------------------------------------------------------- the writes --- */

export interface OpenInput {
  email: unknown;
  note?: unknown;
  now?: number;
}

export interface OpenResult {
  /** True only when a row is actually in the table. Never true on a failed or refused write. */
  recorded: boolean;
  /** Present whenever a row exists — the existing one when this plea was a repeat. */
  id?: string;
  state?: RecoveryState;
  /** Why nothing was recorded. For the route's log and for the operator, never for the public body. */
  reason?: string;
}

/**
 * Record that somebody says they cannot get in.
 *
 * A LIVE REQUEST ABSORBS A REPEAT. Somebody locked out clicks the button more than once — that is
 * what people do, and three rows for one person pushes two other people down a queue worked top to
 * bottom. The repeat bumps `attempts` instead, which tells the operator something true.
 *
 * A SETTLED REQUEST DOES NOT. Once a request is `refused` or `closed` it is history, and a new
 * plea months later is a new situation. Letting the old row absorb it would leave somebody
 * permanently unable to ask again because of a decision made about a different occasion.
 */
export async function openRecoveryRequest(env: RecoveryEnv, input: OpenInput): Promise<OpenResult> {
  const email = normaliseEmail(input.email);
  // Refused BEFORE anything is hashed or written. A value that cannot be an address would become a
  // hash that no operator's lookup will ever reproduce: a row that can only sit in the queue.
  if (!email) return { recorded: false, reason: 'that does not look like an email address' };

  const now = typeof input.now === 'number' && Number.isFinite(input.now) ? input.now : Date.now();
  const note = cleanNote(input.note);

  try {
    await ensureRecoveryTables(env);
    const hash = await sha256hex(email);

    const live = await env.CORPUS.prepare(
      `select id, state from recovery_requests
        where email_hash = ? and state in (${LIVE.map(() => '?').join(',')})
        order by opened_at asc limit 1`,
    ).bind(hash, ...LIVE).first<{ id: string; state: string }>();

    if (live) {
      await env.CORPUS.prepare(
        'update recovery_requests set attempts = attempts + 1 where id = ?',
      ).bind(live.id).run();
      return { recorded: true, id: live.id, state: live.state as RecoveryState };
    }

    const id = crypto.randomUUID();
    await env.CORPUS.prepare(
      `insert into recovery_requests (id, email_hash, opened_at, state, note, attempts)
       values (?, ?, ?, 'open', ?, 1)`,
    ).bind(id, hash, now, note).run();
    return { recorded: true, id, state: 'open' };
  } catch (e) {
    // NOT swallowed into a reassuring answer. See rule 3 at the top of this file: a storage failure
    // does not depend on the address, so saying so leaks nothing, and not saying so means telling
    // somebody their plea is queued when it is not.
    return { recorded: false, reason: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

export interface DecideInput {
  id: string;
  state: unknown;
  decidedBy: unknown;
  now?: number;
}

export interface DecideResult {
  ok: boolean;
  reason?: string;
  state?: RecoveryState;
}

/**
 * Move a request along, or refuse to.
 *
 * READS THE CURRENT STATE FIRST rather than writing with a `where state not in (...)` clause. The
 * clause would work and would report `changes = 0` for both "already terminal" and "no such id",
 * and those are different things to tell an operator staring at a queue.
 */
export async function decideRecoveryRequest(env: RecoveryEnv, input: DecideInput): Promise<DecideResult> {
  const next = RECOVERY_STATES.find((s) => s === input.state);
  if (!next) return { ok: false, reason: `state must be one of ${RECOVERY_STATES.join(', ')}` };

  // Every move is attributable. An approval with no author is a timestamp, not an audit trail —
  // and this is the table where "who decided to let that person back in" is the whole question.
  const by = typeof input.decidedBy === 'string' ? input.decidedBy.trim().slice(0, 80) : '';
  if (!by) return { ok: false, reason: 'a decision must record who made it' };

  const now = typeof input.now === 'number' && Number.isFinite(input.now) ? input.now : Date.now();

  await ensureRecoveryTables(env);
  const row = await env.CORPUS.prepare(
    'select state from recovery_requests where id = ?',
  ).bind(input.id).first<{ state: string }>();
  if (!row) return { ok: false, reason: 'no such request' };

  const current = row.state as RecoveryState;
  if (TERMINAL.includes(current)) {
    return { ok: false, reason: `this request is ${current}, which is final`, state: current };
  }

  await env.CORPUS.prepare(
    'update recovery_requests set state = ?, decided_by = ?, decided_at = ? where id = ?',
  ).bind(next, by, now, input.id).run();
  return { ok: true, state: next };
}

/* ------------------------------------------------------------------------ the reads --- */

const shape = (r: Record<string, unknown>): RecoveryRequest => ({
  id: String(r.id),
  emailHash: String(r.email_hash),
  openedAt: Number(r.opened_at),
  state: r.state as RecoveryState,
  note: r.note === null || r.note === undefined ? null : String(r.note),
  attempts: Number(r.attempts ?? 1),
  decidedBy: r.decided_by === null || r.decided_by === undefined ? null : String(r.decided_by),
  decidedAt: r.decided_at === null || r.decided_at === undefined ? null : Number(r.decided_at),
});

export async function getRecoveryRequest(env: RecoveryEnv, id: string): Promise<RecoveryRequest | null> {
  await ensureRecoveryTables(env);
  const row = await env.CORPUS.prepare(
    'select * from recovery_requests where id = ?',
  ).bind(id).first<Record<string, unknown>>();
  return row ? shape(row) : null;
}

/**
 * The operator's lookup: an address they were given, turned into the row it belongs to.
 *
 * THE ADDRESS IS THE CALLER'S, NOT THE DATABASE'S. This is what makes rule 2 survivable — the
 * queue can be worked without the table ever having held an address. Returns the newest live
 * request, because that is the one the person in front of them is asking about.
 */
export async function findByEmail(env: RecoveryEnv, email: unknown): Promise<RecoveryRequest | null> {
  const norm = normaliseEmail(email);
  if (!norm) return null;
  await ensureRecoveryTables(env);
  const hash = await sha256hex(norm);
  const row = await env.CORPUS.prepare(
    'select * from recovery_requests where email_hash = ? order by opened_at desc limit 1',
  ).bind(hash).first<Record<string, unknown>>();
  return row ? shape(row) : null;
}

/**
 * The queue, OLDEST FIRST.
 *
 * Not a default worth leaving to chance: every list in this product is newest-first, and this one
 * must not be. A support queue sorted newest-first strands the person who has been waiting longest
 * behind everyone who asked after them, which is the exact failure mode of an unattended inbox.
 */
export async function listRecoveryRequests(
  env: RecoveryEnv,
  opts: { state?: unknown; limit?: number },
): Promise<RecoveryRequest[]> {
  await ensureRecoveryTables(env);
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const state = RECOVERY_STATES.find((s) => s === opts.state);
  const q = state
    ? env.CORPUS.prepare(
        'select * from recovery_requests where state = ? order by opened_at asc limit ?',
      ).bind(state, limit)
    : env.CORPUS.prepare(
        'select * from recovery_requests order by opened_at asc limit ?',
      ).bind(limit);
  const { results } = await q.all<Record<string, unknown>>();
  return (results ?? []).map(shape);
}
