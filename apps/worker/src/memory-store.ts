// What Apple remembers ACROSS a conversation — and who it is allowed to remember it for.
//
// `memory.ts` holds one project's model-written summary and facts, in that project's Durable
// Object. That is the right home for it: it is derived from one transcript and read by one run.
//
// This file is the other half, and it exists because three things are true of the rest of what a
// person wants Apple to remember, and none of them fit a per-project DO:
//
//   1. It is NOT per-project. "Answer me in Hebrew", "use Rojo layout", "never run_luau without
//      asking" are facts about the PERSON, and a preference that has to be re-taught in every new
//      project is not a preference, it is a chore.
//   2. It is LAYERED. An organisation sets a floor, a person sets their own defaults, and a single
//      project overrides both for that project only. Which layer won is something the user has to
//      be able to see, or a setting that is being overridden elsewhere reads as a broken control.
//   3. It is READ BY THINGS THAT ARE NOT THE DO. The routing layer wants the preferred model
//      before any DO is addressed; the team-instructions viewer wants an org's rows without
//      opening one DO per project. A DO structurally cannot answer a question about another DO.
//
// So: D1, the same choice and for the same reason as provenance.ts.
//
// THE PROPERTY THIS FILE EXISTS TO KEEP: **a scope can only ever read and write itself.** Every
// read binds (scope, scope_id) — never scope alone — and every write is refused unless the caller
// arrived with that exact scope id already PROVEN by the route (project ownership via
// `withOwnedProject`, org membership via `orgMembership` below). A memory store that leaks one
// project's instructions into another project's prompt is not a privacy bug at the edges; it is
// the agent being told to do someone else's work.
import type { Env } from './env';
import { scanText, type Disclosure, type DisclosureKind } from './redaction';

// ---------------------------------------------------------------------------------------------
// the vocabulary — validated at runtime, because a union is a compile-time promise
// ---------------------------------------------------------------------------------------------

/**
 * Scopes, in PRECEDENCE ORDER: later wins.
 *
 * org < user < project. The organisation sets what it needs everywhere, a person overrides it for
 * their own work, and a project overrides both inside that project. The one exception is tool
 * permissions, which narrow instead of override — see `preferences.ts`, where a denial at any
 * layer survives every layer above it.
 */
export const MEMORY_SCOPES = ['org', 'user', 'project'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/** What a row IS, which decides how it is rendered and whether it reaches the prompt. */
export const MEMORY_KINDS = ['fact', 'instruction', 'preference', 'profile'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** Who wrote it. `model` rows are the ones a user most needs to be able to correct. */
export const MEMORY_SOURCES = ['user', 'model', 'import'] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const ORG_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/**
 * Runtime membership tests.
 *
 * `Record<MemoryScope, T>` and `scope as MemoryScope` are both compile-time fictions the moment a
 * value crosses a trust boundary — a URL segment, a JSON body, a row from an imported bundle. Every
 * one of those enters through one of these three functions, which check an explicit allowlist. The
 * `includes` is over a frozen literal array, so no prototype-borne key (`__proto__`, `constructor`,
 * `toString`) can answer true the way a bare object lookup would.
 */
export const isMemoryScope = (v: unknown): v is MemoryScope => typeof v === 'string' && (MEMORY_SCOPES as readonly string[]).includes(v);
export const isMemoryKind = (v: unknown): v is MemoryKind => typeof v === 'string' && (MEMORY_KINDS as readonly string[]).includes(v);
export const isMemorySource = (v: unknown): v is MemorySource => typeof v === 'string' && (MEMORY_SOURCES as readonly string[]).includes(v);
export const isOrgRole = (v: unknown): v is OrgRole => typeof v === 'string' && (ORG_ROLES as readonly string[]).includes(v);

/**
 * Keys are addresses, not prose.
 *
 * Lowercase, must START with alphanumeric, and may then carry dot, dash and underscore. The leading
 * requirement is what makes `__proto__` unrepresentable as a key rather than merely discouraged:
 * keys are used as object properties in the resolver and in the export envelope, and a key that can
 * be `__proto__` turns a memory import into prototype pollution.
 */
export const MEMORY_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Names that are legal by the pattern above and still must not be keys.
 *
 * `constructor` and `prototype` pass MEMORY_KEY_RE — they are lowercase letters — and `__proto__`
 * only fails it by the accident of a leading underscore. Every one of them is dangerous the moment
 * a key is used as an object property, which `profileFromEntries` and `preferencesFromEntries`
 * already do and every future reader will do again. Refusing them once, at the boundary where a key
 * becomes a key, is a rule that holds for readers that do not exist yet; refusing them at each use
 * site is a rule that holds until somebody forgets.
 *
 * The check is on the WHOLE key and on its last dotted segment, because `profile.__proto__` is
 * sliced at the prefix before it is used as a property name.
 */
export const RESERVED_KEY_SEGMENTS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

function hasReservedSegment(key: string): boolean {
  return key.split('.').some((seg) => RESERVED_KEY_SEGMENTS.includes(seg));
}
export const VALUE_MAX = 4000;
/** Two years. Long enough for "remember this about me", short enough that nothing is truly forever. */
export const MAX_TTL_DAYS = 730;
/** One scope's rows. Bounds the prompt, the viewer and one import bundle with the same number. */
export const ENTRIES_PER_SCOPE_MAX = 200;

// ---------------------------------------------------------------------------------------------
// the row
// ---------------------------------------------------------------------------------------------

export interface MemoryEntry {
  scope: MemoryScope;
  scopeId: string;
  key: string;
  kind: MemoryKind;
  value: string;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
  /** ISO, or null for "keep this until someone deletes it". */
  expiresAt: string | null;
  /** The user id that last wrote it. Audit answers "who", this answers it without a join. */
  updatedBy: string;
}

export interface MemoryEntryInput {
  scope: unknown;
  scopeId: unknown;
  key: unknown;
  kind?: unknown;
  value: unknown;
  source?: unknown;
  /** Days from now. A number, strictly — see `expiresAtFor`. */
  ttlDays?: unknown;
  /** Used only by import, which carries an already-decided expiry. */
  expiresAt?: unknown;
}

export type RejectReason =
  | 'bad_scope'
  | 'bad_scope_id'
  | 'bad_key'
  | 'bad_kind'
  | 'bad_source'
  | 'empty_value'
  | 'value_too_long'
  | 'bad_ttl'
  | 'already_expired'
  | 'wrong_scope'
  | 'forbidden'
  /** The value carried a credential or a government/financial identifier. See `refusedDisclosure`. */
  | 'sensitive_value';

export interface Rejected {
  key: string;
  reason: RejectReason;
  /** What was wrong, when the reason alone does not say it. Never the value itself. */
  detail?: string;
}

// ---------------------------------------------------------------------------------------------
// what must never become a memory
// ---------------------------------------------------------------------------------------------

/**
 * Memory is the one store in this product that is deliberately forever and deliberately unread.
 *
 * A row written here is loaded into the system prompt of every later run, in the highest-trust
 * position, and nobody looks at it again. So a credential that lands in it is not "a secret in a
 * database": it is a secret that will be re-sent to a model provider on every run for as long as
 * the project exists, by a product whose own egress guard (`checkEgress`) would have refused to
 * send it anywhere else.
 *
 * The detector is `redaction.ts` — the same rules the egress guard and the analytics sink use, so
 * there is exactly one definition of "this is a credential" in the worker and a rule added there
 * covers this path on the same day. It is DERIVED rather than copied for that reason: a local list
 * of kinds would be a second opinion that silently stops agreeing.
 *
 * `minConfidence: 'high'` is deliberate. `long_hex` is a heuristic that matches a git SHA and a
 * Roblox content hash, and refusing "the map hash is 3f2a…" would be a store that rejects real
 * memories to protect against a hypothetical one.
 */
export const REFUSED_PII_KINDS: readonly DisclosureKind[] = ['credit_card', 'us_ssn'];

/**
 * The one finding that makes a value unstorable, or null.
 *
 * Returns the FINDING rather than a boolean so the refusal can say what it saw — "that looks like
 * an API key" is a sentence a person can act on, and "rejected" is not. The finding carries a
 * masked preview and never the value.
 */
export function refusedDisclosure(value: unknown): Disclosure | null {
  const secret = scanText(value, { classes: ['secret'], minConfidence: 'high' })[0];
  if (secret) return secret;
  return scanText(value, { kinds: REFUSED_PII_KINDS })[0] ?? null;
}

/**
 * Personal data that is legitimate to remember and must not be rendered in the open.
 *
 * An email address or a phone number is a real thing to ask Apple to remember, so it is stored —
 * but a settings panel that prints it in a shared screen share is a leak the user did not choose.
 * The viewer masks these until asked. Card numbers and SSNs are NOT in this list: those are
 * refused outright by `refusedDisclosure`, and a kind cannot be in both.
 */
export function personalDisclosures(value: unknown): Disclosure[] {
  return scanText(value, { classes: ['pii'] }).filter((d) => !(REFUSED_PII_KINDS as readonly string[]).includes(d.kind));
}

/**
 * Turn a TTL in days into an absolute expiry.
 *
 * `??` defends undefined and null and NOTHING else, so a `ttlDays` of `NaN`, `Infinity` or the
 * string `"7"` would sail past a `ttlDays ?? null` and into a `> 0` comparison that answers false
 * for NaN (silently storing no expiry), true for Infinity (an expiry in the year 275760, which
 * `toISOString` then throws on), and true for `"7"` (string coercion, which happens to work until
 * the day someone sends `"7 days"`). Every one of those is an expiry the user asked for and did not
 * get. So the type is checked before the comparison, and finiteness before the range.
 */
export function expiresAtFor(ttlDays: unknown, nowMs: number): { ok: true; expiresAt: string | null } | { ok: false; reason: 'bad_ttl' } {
  if (ttlDays === undefined || ttlDays === null) return { ok: true, expiresAt: null };
  if (typeof ttlDays !== 'number' || !Number.isFinite(ttlDays)) return { ok: false, reason: 'bad_ttl' };
  if (ttlDays <= 0 || ttlDays > MAX_TTL_DAYS) return { ok: false, reason: 'bad_ttl' };
  return { ok: true, expiresAt: new Date(nowMs + ttlDays * 86_400_000).toISOString() };
}

/** Normalise an ISO instant, or refuse it. Import is the only caller that supplies one. */
function normaliseInstant(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

/**
 * Has this row's life run out?
 *
 * Read-time, not sweeper-time. A sweeper that has not run yet is the normal state of a sweeper, so
 * an expiry enforced only by one is a promise nothing keeps between runs — and the run it fails to
 * keep it for is the one that puts the stale instruction back into the system prompt.
 */
export function isExpired(entry: Pick<MemoryEntry, 'expiresAt'>, nowMs: number): boolean {
  if (!entry.expiresAt) return false;
  const ms = Date.parse(entry.expiresAt);
  // An unparseable stamp is treated as EXPIRED. The alternative — treating it as "never expires" —
  // makes a corrupt row immortal, which is the worse of the two failures by a distance.
  if (!Number.isFinite(ms)) return true;
  return ms <= nowMs;
}

/**
 * Validate one entry arriving from outside: a request body, or a line in an imported bundle.
 *
 * Returns the stored shape or a REASON. Not a boolean: the import path shows the user which rows it
 * refused and why, and "some rows were skipped" is the kind of message that teaches nobody anything.
 */
export function normaliseEntry(
  input: MemoryEntryInput,
  ctx: { now: number; actorId: string; createdAt?: string },
): { ok: true; entry: MemoryEntry } | { ok: false; reason: RejectReason; detail?: string } {
  if (!isMemoryScope(input.scope)) return { ok: false, reason: 'bad_scope' };
  if (typeof input.scopeId !== 'string' || !input.scopeId.trim() || input.scopeId.length > 128) return { ok: false, reason: 'bad_scope_id' };
  if (typeof input.key !== 'string' || !MEMORY_KEY_RE.test(input.key) || hasReservedSegment(input.key)) return { ok: false, reason: 'bad_key' };

  const kind = input.kind === undefined ? 'fact' : input.kind;
  if (!isMemoryKind(kind)) return { ok: false, reason: 'bad_kind' };
  const source = input.source === undefined ? 'user' : input.source;
  if (!isMemorySource(source)) return { ok: false, reason: 'bad_source' };

  if (typeof input.value !== 'string') return { ok: false, reason: 'empty_value' };
  const value = input.value.trim();
  if (!value) return { ok: false, reason: 'empty_value' };
  // Refused, never truncated. A half-stored instruction is a DIFFERENT instruction, and the user
  // cannot see the cut. `memory.ts` truncates because the model writes prose there; a person
  // writing a rule gets told it was too long.
  if (value.length > VALUE_MAX) return { ok: false, reason: 'value_too_long' };
  // Checked HERE rather than at each route, because this function is the single door: the entry
  // editor, the preferences form, the profile form and an imported bundle all arrive through it.
  // A check on the routes would be a check on the routes that existed the day it was written.
  const refused = refusedDisclosure(value);
  if (refused) return { ok: false, reason: 'sensitive_value', detail: `${refused.why} (${refused.preview})` };

  let expiresAt: string | null;
  if (input.expiresAt !== undefined) {
    const parsed = normaliseInstant(input.expiresAt);
    if (parsed === undefined) return { ok: false, reason: 'bad_ttl' };
    expiresAt = parsed;
  } else {
    const ttl = expiresAtFor(input.ttlDays, ctx.now);
    if (!ttl.ok) return { ok: false, reason: ttl.reason };
    expiresAt = ttl.expiresAt;
  }

  const stamp = new Date(ctx.now).toISOString();
  const entry: MemoryEntry = {
    scope: input.scope,
    scopeId: input.scopeId,
    key: input.key,
    kind,
    value,
    source,
    createdAt: normaliseInstant(ctx.createdAt) ?? stamp,
    updatedAt: stamp,
    expiresAt,
    updatedBy: ctx.actorId,
  };
  // A row that is dead on arrival is refused rather than written. Writing it would put a row in the
  // viewer that the reader already filters out — visible in the audit, invisible in the list, and
  // indistinguishable from a write that silently did not happen.
  if (isExpired(entry, ctx.now)) return { ok: false, reason: 'already_expired' };
  return { ok: true, entry };
}

// ---------------------------------------------------------------------------------------------
// permissions
// ---------------------------------------------------------------------------------------------

/**
 * What this request has PROVEN, not what it claims.
 *
 * `projectIds` holds ids whose ownership the route already established through `withOwnedProject`,
 * and `orgs` holds memberships read from the members table. Nothing here is taken from the body or
 * the URL: the whole point of the type is that a scope id in a request is a question, and this is
 * the answer the route computed to it.
 */
export interface MemoryAccess {
  userId: string;
  projectIds: readonly string[];
  orgs: readonly { orgId: string; role: OrgRole }[];
}

export function canReadScope(access: MemoryAccess, scope: unknown, scopeId: unknown): boolean {
  if (!isMemoryScope(scope) || typeof scopeId !== 'string' || !scopeId) return false;
  if (scope === 'user') return scopeId === access.userId;
  if (scope === 'project') return access.projectIds.includes(scopeId);
  return access.orgs.some((o) => o.orgId === scopeId);
}

/**
 * Writing is narrower than reading in exactly one place: an org.
 *
 * Team instructions steer everyone in the organisation, so every member can READ them — otherwise
 * they are rules people are held to and cannot see — and only owners and admins can change them.
 * For `user` and `project` the two answers coincide, because both scopes have exactly one principal.
 */
export function canWriteScope(access: MemoryAccess, scope: unknown, scopeId: unknown): boolean {
  if (!canReadScope(access, scope, scopeId)) return false;
  if (scope === 'org') {
    const m = access.orgs.find((o) => o.orgId === scopeId);
    return m?.role === 'owner' || m?.role === 'admin';
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// conflict resolution
// ---------------------------------------------------------------------------------------------

export function precedenceOf(scope: MemoryScope): number {
  const i = MEMORY_SCOPES.indexOf(scope);
  // Unreachable through `isMemoryScope`, and it throws rather than returning -1 because a -1 would
  // quietly make an unknown scope the LOWEST-precedence layer — i.e. it would lose every conflict
  // silently instead of being noticed.
  if (i < 0) throw new Error(`precedenceOf: unknown scope ${String(scope)}`);
  return i;
}

export interface ResolvedEntry {
  key: string;
  /** The row that won. */
  winner: MemoryEntry;
  /**
   * The rows it beat, highest precedence first. The viewer renders this as "your personal setting
   * is overridden here" — without it, a user changes a preference, sees nothing happen, and has no
   * way to learn that the project layer is answering instead.
   */
  shadowed: MemoryEntry[];
}

export interface ResolvedMemory {
  entries: ResolvedEntry[];
  /** Rows dropped because their scope was not one of the three. Surfaced, never silently ignored. */
  invalid: MemoryEntry[];
}

/**
 * Layer entries from several scopes into the one answer the agent acts on.
 *
 * Ties inside a scope cannot happen — (scope, scope_id, key) is the primary key — so the only
 * comparison is between layers, and it is a strict precedence, never a merge. Merging two
 * free-text instructions produces a third instruction nobody wrote.
 */
export function resolveMemoryLayers(entries: readonly MemoryEntry[], nowMs: number): ResolvedMemory {
  const byKey = new Map<string, MemoryEntry[]>();
  const invalid: MemoryEntry[] = [];
  for (const e of entries) {
    if (!isMemoryScope(e.scope)) {
      invalid.push(e);
      continue;
    }
    if (isExpired(e, nowMs)) continue;
    const list = byKey.get(e.key);
    if (list) list.push(e);
    else byKey.set(e.key, [e]);
  }
  const out: ResolvedEntry[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => precedenceOf(b.scope) - precedenceOf(a.scope));
    out.push({ key, winner: sorted[0]!, shadowed: sorted.slice(1) });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return { entries: out, invalid };
}

// ---------------------------------------------------------------------------------------------
// export / import
// ---------------------------------------------------------------------------------------------

/** The envelope's own identity. Bumped only when the shape changes incompatibly. */
export const MEMORY_EXPORT_FORMAT = 'golem.memory.v1';

export interface MemoryExport {
  format: typeof MEMORY_EXPORT_FORMAT;
  scope: MemoryScope;
  scopeId: string;
  exportedAt: string;
  entries: MemoryEntry[];
}

export function buildExport(scope: MemoryScope, scopeId: string, entries: readonly MemoryEntry[], nowMs: number): MemoryExport {
  return {
    format: MEMORY_EXPORT_FORMAT,
    scope,
    scopeId,
    exportedAt: new Date(nowMs).toISOString(),
    entries: entries.filter((e) => !isExpired(e, nowMs)).map((e) => ({ ...e })),
  };
}

export interface ParsedImport {
  entries: MemoryEntry[];
  rejected: Rejected[];
  /** Set when the envelope itself is unusable; `entries` is then empty. */
  error: string | null;
}

/**
 * Read a bundle back in, INTO A NAMED TARGET.
 *
 * THE ATTACK THIS IS SHAPED AROUND. An export carries the scope it came from. If import trusted
 * that, then posting project B's bundle to project A's import route would write rows addressed to
 * project B — from a caller who has proven nothing about project B — and project B's next run would
 * read them out of its own system prompt. The bundle would be the delivery mechanism and the
 * ownership check on the route would have been bypassed without ever being called.
 *
 * So the target is an ARGUMENT, and it is the only thing that decides where rows land. An entry
 * naming a different scope is REJECTED rather than rewritten: silently re-addressing someone's
 * export is a way to move an org's team instructions into a personal scope, or the reverse, without
 * the person who did it seeing that anything changed.
 */
export function parseImport(raw: unknown, target: { scope: MemoryScope; scopeId: string }, ctx: { now: number; actorId: string }): ParsedImport {
  const none = (error: string): ParsedImport => ({ entries: [], rejected: [], error });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return none('expected a memory export object');
  const env = raw as Partial<MemoryExport>;
  if (env.format !== MEMORY_EXPORT_FORMAT) return none(`unknown format (expected ${MEMORY_EXPORT_FORMAT})`);
  if (!Array.isArray(env.entries)) return none('the bundle has no entries');

  const entries: MemoryEntry[] = [];
  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  for (const row of env.entries.slice(0, ENTRIES_PER_SCOPE_MAX)) {
    // Through `unknown` deliberately: `env.entries` is TYPED as MemoryEntry[] and is in fact
    // whatever was in the file. Treating the declared type as the real one here is how a bundle
    // with a hostile row would skip the checks below.
    const r = (row ?? {}) as unknown as Record<string, unknown>;
    const label = typeof r.key === 'string' ? r.key : '(unnamed)';
    // The scope check comes FIRST and compares against the target, not against the envelope: an
    // envelope that lies about its own scope must not be able to launder a row through agreement
    // with itself.
    if (r.scope !== target.scope || r.scopeId !== target.scopeId) {
      rejected.push({ key: label, reason: 'wrong_scope' });
      continue;
    }
    const out = normaliseEntry(
      { ...r, scope: target.scope, scopeId: target.scopeId, source: 'import' } as MemoryEntryInput,
      { now: ctx.now, actorId: ctx.actorId, createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined },
    );
    if (!out.ok) {
      // The detail travels with the refusal: "row 14 was refused" teaches nobody anything, and the
      // rows an import refuses are exactly the ones the person has to go and fix by hand.
      rejected.push({ key: label, reason: out.reason, ...(out.detail ? { detail: out.detail } : {}) });
      continue;
    }
    if (seen.has(out.entry.key)) continue;
    seen.add(out.entry.key);
    entries.push(out.entry);
  }
  return { entries, rejected, error: null };
}

// ---------------------------------------------------------------------------------------------
// the store
// ---------------------------------------------------------------------------------------------

type Corpus = Pick<Env, 'CORPUS'>;

export async function ensureMemoryTables(env: Corpus): Promise<void> {
  // (scope, scope_id, key) is the primary key, so a re-write of the same setting is an UPDATE to
  // one fact rather than a second row that the resolver would then have to break a tie between.
  await env.CORPUS.exec(
    `create table if not exists memory_entries(scope text not null, scope_id text not null, key text not null, kind text not null, value text not null, source text not null, created_at text not null, updated_at text not null, expires_at text, updated_by text not null, primary key(scope, scope_id, key))`,
  );
  // Every read binds both columns, so the index carries both. An index on `scope` alone would be
  // an index that makes a cross-tenant scan fast, which is not a thing worth making fast.
  await env.CORPUS.exec(`create index if not exists idx_memory_scope on memory_entries(scope, scope_id)`);
  await env.CORPUS.exec(`create index if not exists idx_memory_expiry on memory_entries(expires_at)`);
  await env.CORPUS.exec(
    `create table if not exists memory_audit(id text primary key, scope text not null, scope_id text not null, key text not null, action text not null, actor text not null, at text not null, before_value text, after_value text)`,
  );
  await env.CORPUS.exec(`create index if not exists idx_memory_audit_scope on memory_audit(scope, scope_id, at desc)`);
  // Organisation membership. It lives here rather than in Supabase because the rows it authorises
  // are here: an authorisation check that has to cross a network to a different database is a check
  // that fails open the first time that network does.
  await env.CORPUS.exec(
    `create table if not exists memory_org_members(org_id text not null, user_id text not null, role text not null, added_at text not null, primary key(org_id, user_id))`,
  );
  await env.CORPUS.exec(`create index if not exists idx_memory_org_user on memory_org_members(user_id)`);
  // The organisation itself. Membership alone was enough to AUTHORISE, and not enough to create:
  // there was no row anybody could make, so `setOrgMember` had no caller and no user could be in an
  // organisation at all. A name is the whole of it — everything else an org means in this product
  // is the rows addressed to its id.
  await env.CORPUS.exec(
    `create table if not exists memory_orgs(id text primary key, name text not null, created_at text not null, created_by text not null)`,
  );
}

interface Row {
  scope: string;
  scope_id: string;
  key: string;
  kind: string;
  value: string;
  source: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  updated_by: string;
}

const SELECT_COLS = 'scope, scope_id, key, kind, value, source, created_at, updated_at, expires_at, updated_by';

/**
 * A stored row back into the typed shape.
 *
 * `scope`, `kind` and `source` are re-validated on the way OUT as well as on the way in. The column
 * is `text`, not an enum: a row written by a migration, by hand, or by a future version of this file
 * can hold anything, and `row.scope as MemoryScope` would hand the resolver a value `precedenceOf`
 * throws on. Returning null here means one corrupt row is dropped instead of one corrupt row
 * taking down the whole read.
 */
function fromRow(r: Row): MemoryEntry | null {
  if (!isMemoryScope(r.scope) || !isMemoryKind(r.kind) || !isMemorySource(r.source)) return null;
  return {
    scope: r.scope,
    scopeId: r.scope_id,
    key: r.key,
    kind: r.kind,
    value: r.value,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    expiresAt: r.expires_at,
    updatedBy: r.updated_by,
  };
}

export interface MemoryAuditRow {
  id: string;
  scope: MemoryScope;
  scopeId: string;
  key: string;
  /**
   * `move` appears TWICE for one operation — once on the scope the row left and once on the scope
   * it arrived at — because each scope's history is read on its own, and a move that was recorded
   * only at the destination looks, from the source, exactly like a deletion nobody explained.
   */
  action: 'put' | 'delete' | 'import' | 'purge' | 'move';
  actor: string;
  at: string;
  before: string | null;
  after: string | null;
}

async function appendAudit(env: Corpus, row: Omit<MemoryAuditRow, 'id'>): Promise<void> {
  await env.CORPUS.prepare(`insert into memory_audit(id, scope, scope_id, key, action, actor, at, before_value, after_value) values(?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), row.scope, row.scopeId, row.key, row.action, row.actor, row.at, row.before, row.after)
    .run();
}

/**
 * Read one scope. ONE — the scope id is bound, never interpolated and never optional.
 *
 * Expired rows are excluded in SQL rather than in a filter afterwards, so a caller that forgets to
 * filter cannot resurrect them. The comparison is a string comparison, which is exactly right for
 * ISO-8601 UTC and exactly wrong for anything else, which is why every stamp in this file goes
 * through `toISOString` before it is stored.
 */
export const SEARCH_MAX = 100;

/**
 * Make a user's text safe to put on the right-hand side of LIKE.
 *
 * `%` and `_` are wildcards there. A search box that did not escape them would answer a query for
 * `100%` with every row in the scope — a result that looks like a successful search and is in fact
 * the absence of one. The escape character is declared in the SQL (`escape '\\'`), because
 * SQLite has no default one and a backslash would otherwise be a literal backslash.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** The text a search actually runs on, or null when there is nothing to search for. */
export function searchTerm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, SEARCH_MAX);
  return trimmed ? trimmed : null;
}

export async function listMemoryEntries(
  env: Corpus,
  access: MemoryAccess,
  scope: MemoryScope,
  scopeId: string,
  opts: { now?: number; includeExpired?: boolean; query?: unknown } = {},
): Promise<MemoryEntry[]> {
  if (!canReadScope(access, scope, scopeId)) return [];
  const now = opts.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  //[[ SEARCH RUNS IN SQL, NOT IN THE VIEWER.
  //
  //   A scope holds up to ENTRIES_PER_SCOPE_MAX rows and the panel renders all of them today, so a
  //   client-side filter would work — until the day the list is paged, at which point it answers
  //   "no matches" for text that IS stored, and nothing distinguishes that from the true answer.
  //   The same reasoning, and the same conclusion, as the conversation search in the DO.
  //
  //   Both the key and the value are searched: people look for `instruction.` rows by what they
  //   say, and for preference rows by what they are called. ]]
  const term = searchTerm(opts.query);
  const like = term ? `%${escapeLike(term)}%` : null;
  const liveClause = opts.includeExpired ? '' : ' and (expires_at is null or expires_at > ?)';
  const matchClause = like ? " and (key like ? escape '\\' or value like ? escape '\\')" : '';
  const sql = `select ${SELECT_COLS} from memory_entries where scope = ? and scope_id = ?${liveClause}${matchClause} order by key`;
  const params: unknown[] = [scope, scopeId];
  if (!opts.includeExpired) params.push(nowIso);
  if (like) params.push(like, like);
  const res = await env.CORPUS.prepare(sql).bind(...params).all<Row>();
  const rows = res.results ?? [];
  const out: MemoryEntry[] = [];
  for (const r of rows) {
    const e = fromRow(r);
    if (!e) continue;
    if (!opts.includeExpired && isExpired(e, now)) continue;
    out.push(e);
  }
  return out;
}

export type PutResult = { ok: true; entry: MemoryEntry } | { ok: false; reason: RejectReason; detail?: string };

/**
 * Write one entry.
 *
 * The permission check is FIRST, before validation, before any statement is prepared: a refusal
 * must not be distinguishable by timing or by error text from a well-formed request to a scope the
 * caller cannot touch. And a refused write appends nothing at all — not the row, not an audit line
 * — because a store that records rejected attempts in the same table as accepted ones invites a
 * reader to treat the audit as a list of what happened.
 */
export async function putMemoryEntry(env: Corpus, access: MemoryAccess, input: MemoryEntryInput, opts: { now?: number } = {}): Promise<PutResult> {
  const now = opts.now ?? Date.now();
  if (!canWriteScope(access, input.scope, input.scopeId)) return { ok: false, reason: 'forbidden' };
  const norm = normaliseEntry(input, { now, actorId: access.userId });
  if (!norm.ok) return norm;
  const e = norm.entry;

  const prior = await env.CORPUS.prepare(`select ${SELECT_COLS} from memory_entries where scope = ? and scope_id = ? and key = ?`)
    .bind(e.scope, e.scopeId, e.key)
    .first<Row>();

  // created_at survives an overwrite: "since when has Apple believed this" is a different question
  // from "when was it last touched", and collapsing them loses the one the user actually asks.
  const createdAt = prior?.created_at ?? e.createdAt;
  await env.CORPUS.prepare(
    `insert into memory_entries(scope, scope_id, key, kind, value, source, created_at, updated_at, expires_at, updated_by) values(?,?,?,?,?,?,?,?,?,?) on conflict(scope, scope_id, key) do update set kind=excluded.kind, value=excluded.value, source=excluded.source, updated_at=excluded.updated_at, expires_at=excluded.expires_at, updated_by=excluded.updated_by`,
  )
    .bind(e.scope, e.scopeId, e.key, e.kind, e.value, e.source, createdAt, e.updatedAt, e.expiresAt, e.updatedBy)
    .run();

  await appendAudit(env, {
    scope: e.scope,
    scopeId: e.scopeId,
    key: e.key,
    action: e.source === 'import' ? 'import' : 'put',
    actor: access.userId,
    at: e.updatedAt,
    before: prior?.value ?? null,
    after: e.value,
  });
  return { ok: true, entry: { ...e, createdAt } };
}

/**
 * Forget one entry, for real.
 *
 * A hard delete, not a tombstone. The user asked Apple to forget something; leaving the text in a
 * row with a flag on it means the thing they asked to be forgotten is still in the database, which
 * is not what the word means. What survives is the AUDIT line — the fact that a key was deleted,
 * by whom and when, and its previous value, which is what makes "why did this stop applying?"
 * answerable. That is a deliberate trade and the viewer says so.
 */
export async function deleteMemoryEntry(
  env: Corpus,
  access: MemoryAccess,
  scope: MemoryScope,
  scopeId: string,
  key: string,
  opts: { now?: number } = {},
): Promise<{ ok: boolean; reason?: RejectReason; deleted: boolean }> {
  if (!canWriteScope(access, scope, scopeId)) return { ok: false, reason: 'forbidden', deleted: false };
  if (typeof key !== 'string' || !MEMORY_KEY_RE.test(key) || hasReservedSegment(key)) return { ok: false, reason: 'bad_key', deleted: false };
  const prior = await env.CORPUS.prepare(`select ${SELECT_COLS} from memory_entries where scope = ? and scope_id = ? and key = ?`)
    .bind(scope, scopeId, key)
    .first<Row>();
  if (!prior) return { ok: true, deleted: false };
  await env.CORPUS.prepare(`delete from memory_entries where scope = ? and scope_id = ? and key = ?`).bind(scope, scopeId, key).run();
  await appendAudit(env, {
    scope,
    scopeId,
    key,
    action: 'delete',
    actor: access.userId,
    at: new Date(opts.now ?? Date.now()).toISOString(),
    before: prior.value,
    after: null,
  });
  return { ok: true, deleted: true };
}

export type MoveReject = RejectReason | 'not_found' | 'target_exists' | 'same_scope';

/**
 * Move one row from one scope to another — the operation the store was missing.
 *
 * WHY IT IS NOT EXPORT-THEN-IMPORT. It cannot be: `parseImport` refuses a row addressed to a
 * different scope (`wrong_scope`), deliberately and for a good reason, so the only way to carry a
 * rule from your account to a project was to retype it and delete the original. Two steps, and
 * between them the rule applies twice or not at all.
 *
 * WHAT IS LOAD-BEARING:
 *
 *   - WRITE ACCESS TO **BOTH** ENDS. A move is a write to the destination and a delete at the
 *     source. Checking only the source would let a member of an org they can read but not
 *     administer push a personal instruction into the team's prompt; checking only the destination
 *     would let them empty a scope they have no business editing.
 *   - IT NEVER OVERWRITES. A destination that already holds this key is refused, not replaced. The
 *     two rows are different settings that happen to share an address, and a move that silently
 *     destroyed one would be a data loss the user never saw and cannot undo.
 *   - THE PROFILE STAYS PERSONAL. `profile.*` rows are read from the user layer only
 *     (`personalisationForProject`), so a profile row moved to a project scope would be a row that
 *     exists, is visible, and is read by nothing — a setting that silently stopped applying.
 *   - `created_at` SURVIVES. "Since when has Apple believed this" is not reset by relocating it.
 */
export async function moveMemoryEntry(
  env: Corpus,
  access: MemoryAccess,
  from: { scope: MemoryScope; scopeId: string },
  to: { scope: unknown; scopeId: unknown },
  key: string,
  opts: { now?: number } = {},
): Promise<{ ok: true; entry: MemoryEntry } | { ok: false; reason: MoveReject }> {
  const now = opts.now ?? Date.now();
  if (!canWriteScope(access, from.scope, from.scopeId)) return { ok: false, reason: 'forbidden' };
  if (!isMemoryScope(to.scope)) return { ok: false, reason: 'bad_scope' };
  if (typeof to.scopeId !== 'string' || !to.scopeId.trim() || to.scopeId.length > 128) return { ok: false, reason: 'bad_scope_id' };
  if (!canWriteScope(access, to.scope, to.scopeId)) return { ok: false, reason: 'forbidden' };
  if (typeof key !== 'string' || !MEMORY_KEY_RE.test(key) || hasReservedSegment(key)) return { ok: false, reason: 'bad_key' };
  if (from.scope === to.scope && from.scopeId === to.scopeId) return { ok: false, reason: 'same_scope' };

  const prior = await env.CORPUS.prepare(`select ${SELECT_COLS} from memory_entries where scope = ? and scope_id = ? and key = ?`)
    .bind(from.scope, from.scopeId, key)
    .first<Row>();
  if (!prior) return { ok: false, reason: 'not_found' };
  const entry = fromRow(prior);
  if (!entry) return { ok: false, reason: 'not_found' };
  if (entry.kind === 'profile' && to.scope !== 'user') return { ok: false, reason: 'wrong_scope' };
  // A row whose life has already run out is not moved: reads exclude it, so the move would produce
  // an invisible row at the destination and an empty space at the source, which reads as a move
  // that silently lost something.
  if (isExpired(entry, now)) return { ok: false, reason: 'already_expired' };

  const existing = await env.CORPUS.prepare(`select key from memory_entries where scope = ? and scope_id = ? and key = ?`)
    .bind(to.scope, to.scopeId, key)
    .first<{ key: string }>();
  if (existing) return { ok: false, reason: 'target_exists' };

  const at = new Date(now).toISOString();
  const moved: MemoryEntry = { ...entry, scope: to.scope, scopeId: to.scopeId, updatedAt: at, updatedBy: access.userId };
  await env.CORPUS.prepare(
    `insert into memory_entries(scope, scope_id, key, kind, value, source, created_at, updated_at, expires_at, updated_by) values(?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(moved.scope, moved.scopeId, moved.key, moved.kind, moved.value, moved.source, moved.createdAt, moved.updatedAt, moved.expiresAt, moved.updatedBy)
    .run();
  await env.CORPUS.prepare(`delete from memory_entries where scope = ? and scope_id = ? and key = ?`).bind(from.scope, from.scopeId, key).run();

  // Both sides, both with the value: the source history has to explain where the row went, and the
  // destination history has to explain where it came from.
  await appendAudit(env, { scope: from.scope, scopeId: from.scopeId, key, action: 'move', actor: access.userId, at, before: entry.value, after: null });
  await appendAudit(env, { scope: moved.scope, scopeId: moved.scopeId, key, action: 'move', actor: access.userId, at, before: null, after: moved.value });
  return { ok: true, entry: moved };
}

/** The sweeper. Reads already exclude these; this is what stops the table growing forever. */
export async function purgeExpired(env: Corpus, opts: { now?: number; limit?: number } = {}): Promise<number> {
  const nowIso = new Date(opts.now ?? Date.now()).toISOString();
  const res = await env.CORPUS.prepare(`delete from memory_entries where expires_at is not null and expires_at <= ?`).bind(nowIso).run();
  const changes = (res as { meta?: { changes?: number } })?.meta?.changes;
  return typeof changes === 'number' && Number.isFinite(changes) ? changes : 0;
}

export async function readMemoryAudit(
  env: Corpus,
  access: MemoryAccess,
  scope: MemoryScope,
  scopeId: string,
  limit = 50,
): Promise<MemoryAuditRow[]> {
  if (!canReadScope(access, scope, scopeId)) return [];
  const capped = Number.isFinite(limit) ? Math.min(200, Math.max(1, Math.trunc(limit))) : 50;
  const res = await env.CORPUS.prepare(
    `select id, scope, scope_id, key, action, actor, at, before_value, after_value from memory_audit where scope = ? and scope_id = ? order by at desc limit ?`,
  )
    .bind(scope, scopeId, capped)
    .all<{ id: string; scope: string; scope_id: string; key: string; action: string; actor: string; at: string; before_value: string | null; after_value: string | null }>();
  return (res.results ?? [])
    .filter((r) => isMemoryScope(r.scope))
    .map((r) => ({
      id: r.id,
      scope: r.scope as MemoryScope,
      scopeId: r.scope_id,
      key: r.key,
      action: (['put', 'delete', 'import', 'purge', 'move'] as const).includes(r.action as 'put') ? (r.action as MemoryAuditRow['action']) : 'put',
      actor: r.actor,
      at: r.at,
      before: r.before_value,
      after: r.after_value,
    }));
}

// ---------------------------------------------------------------------------------------------
// org membership
// ---------------------------------------------------------------------------------------------

/** Every organisation this user belongs to, with the role that decides what they may change. */
export async function orgMembership(env: Corpus, userId: string): Promise<{ orgId: string; role: OrgRole }[]> {
  const res = await env.CORPUS.prepare(`select org_id, role from memory_org_members where user_id = ?`)
    .bind(userId)
    .all<{ org_id: string; role: string }>();
  return (res.results ?? [])
    // A role column that holds something nobody defined does NOT become a member by default. The
    // row is dropped, so an unrecognised role grants nothing rather than granting whatever the
    // `=== 'owner'` checks happen not to exclude.
    .filter((r) => isOrgRole(r.role))
    .map((r) => ({ orgId: r.org_id, role: r.role as OrgRole }));
}

export async function setOrgMember(env: Corpus, orgId: string, userId: string, role: OrgRole, now = Date.now()): Promise<void> {
  if (!isOrgRole(role)) throw new Error(`setOrgMember: unknown role ${String(role)}`);
  await env.CORPUS.prepare(`insert into memory_org_members(org_id, user_id, role, added_at) values(?,?,?,?) on conflict(org_id, user_id) do update set role=excluded.role`)
    .bind(orgId, userId, role, new Date(now).toISOString())
    .run();
}

export const ORG_NAME_MAX = 80;

export interface Org {
  id: string;
  /** Null when membership rows exist for an id that has no organisation row — see `listOrgsFor`. */
  name: string | null;
  role: OrgRole;
}

export interface OrgMember {
  userId: string;
  role: OrgRole;
  addedAt: string;
}

/** A display name, or null. Collapsed and capped, like every other free-text field in this store. */
export function normaliseOrgName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim().replace(/\s+/g, ' ').slice(0, ORG_NAME_MAX);
  return name || null;
}

/**
 * Make an organisation, with its creator as the owner.
 *
 * ONE STATEMENT PAIR, AND THE MEMBERSHIP IS PART OF IT. An org with no owner is an org nobody can
 * ever administer: `canWriteScope` requires owner or admin for team instructions, and there is no
 * other way to gain the role. Creating the row without the membership would produce exactly that
 * dead object, so the two are written together and the membership is written SECOND — if the org
 * insert fails there is no orphan grant, and if the grant fails the org is visible to nobody, which
 * is the recoverable direction.
 */
export async function createOrg(
  env: Corpus,
  ownerId: string,
  name: unknown,
  opts: { now?: number; id?: string } = {},
): Promise<{ ok: true; org: Org } | { ok: false; reason: 'bad_name' | 'bad_owner' }> {
  const clean = normaliseOrgName(name);
  if (!clean) return { ok: false, reason: 'bad_name' };
  if (typeof ownerId !== 'string' || !ownerId.trim()) return { ok: false, reason: 'bad_owner' };
  const now = opts.now ?? Date.now();
  const id = opts.id ?? crypto.randomUUID();
  await env.CORPUS.prepare(`insert into memory_orgs(id, name, created_at, created_by) values(?,?,?,?)`)
    .bind(id, clean, new Date(now).toISOString(), ownerId)
    .run();
  await setOrgMember(env, id, ownerId, 'owner', now);
  return { ok: true, org: { id, name: clean, role: 'owner' } };
}

/**
 * Every organisation this user is in, with its name.
 *
 * A LEFT JOIN, not an inner one. Membership rows and organisation rows are written by different
 * statements, and a member whose org row is missing must still be able to see and read the scope
 * they are in — an inner join would make that person's org disappear from their own switcher while
 * the rules it sets kept applying to them. A missing name is reported as null and the viewer falls
 * back to the id, which is a true statement rather than a blank.
 */
export async function listOrgsFor(env: Corpus, userId: string): Promise<Org[]> {
  const res = await env.CORPUS.prepare(
    `select m.org_id as org_id, m.role as role, o.name as name from memory_org_members m left join memory_orgs o on o.id = m.org_id where m.user_id = ? order by coalesce(o.name, m.org_id)`,
  )
    .bind(userId)
    .all<{ org_id: string; role: string; name: string | null }>();
  return (res.results ?? [])
    .filter((r) => isOrgRole(r.role))
    .map((r) => ({ id: r.org_id, name: r.name ?? null, role: r.role as OrgRole }));
}

/** Who is in an organisation. Readable by every member; changing it is `updateOrgMember`. */
export async function orgMembersOf(env: Corpus, access: MemoryAccess, orgId: string): Promise<OrgMember[]> {
  if (!canReadScope(access, 'org', orgId)) return [];
  const res = await env.CORPUS.prepare(`select user_id, role, added_at from memory_org_members where org_id = ? order by added_at`)
    .bind(orgId)
    .all<{ user_id: string; role: string; added_at: string }>();
  return (res.results ?? [])
    .filter((r) => isOrgRole(r.role))
    .map((r) => ({ userId: r.user_id, role: r.role as OrgRole, addedAt: r.added_at }));
}

/** Who may change the member list. The same test `canWriteScope` applies to the org's own rows. */
export function canAdministerOrg(access: MemoryAccess, orgId: unknown): boolean {
  if (typeof orgId !== 'string' || !orgId) return false;
  const m = access.orgs.find((o) => o.orgId === orgId);
  return m?.role === 'owner' || m?.role === 'admin';
}

export type MemberChangeReject = 'forbidden' | 'bad_role' | 'bad_user' | 'last_owner' | 'not_a_member';

async function ownerCount(env: Corpus, orgId: string): Promise<number> {
  const row = await env.CORPUS.prepare(`select count(*) as n from memory_org_members where org_id = ? and role = 'owner'`)
    .bind(orgId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * Add someone, or change what they may do.
 *
 * THE LAST OWNER CANNOT BE DEMOTED. Every path that changes an organisation — its team
 * instructions, its tool policy, its member list — requires owner or admin, and an admin cannot
 * promote anyone to owner. So an organisation whose last owner demotes themselves is an
 * organisation whose settings can never be changed again by anybody, while they keep applying to
 * everyone in it. Refusing here is the difference between a mistake and an unrecoverable one.
 */
export async function updateOrgMember(
  env: Corpus,
  access: MemoryAccess,
  orgId: string,
  userId: unknown,
  role: unknown,
  opts: { now?: number } = {},
): Promise<{ ok: true; member: OrgMember } | { ok: false; reason: MemberChangeReject }> {
  if (!canAdministerOrg(access, orgId)) return { ok: false, reason: 'forbidden' };
  if (!isOrgRole(role)) return { ok: false, reason: 'bad_role' };
  if (typeof userId !== 'string' || !userId.trim() || userId.length > 128) return { ok: false, reason: 'bad_user' };
  // Only an owner may create another owner. An admin who could would be an admin who can promote
  // themselves, which makes the two roles one role with two names.
  const mine = access.orgs.find((o) => o.orgId === orgId);
  if (role === 'owner' && mine?.role !== 'owner') return { ok: false, reason: 'forbidden' };

  const current = await env.CORPUS.prepare(`select role from memory_org_members where org_id = ? and user_id = ?`)
    .bind(orgId, userId)
    .first<{ role: string }>();
  if (current?.role === 'owner' && role !== 'owner' && (await ownerCount(env, orgId)) <= 1) return { ok: false, reason: 'last_owner' };

  const now = opts.now ?? Date.now();
  await setOrgMember(env, orgId, userId, role, now);
  const added = await env.CORPUS.prepare(`select added_at from memory_org_members where org_id = ? and user_id = ?`)
    .bind(orgId, userId)
    .first<{ added_at: string }>();
  return { ok: true, member: { userId, role, addedAt: added?.added_at ?? new Date(now).toISOString() } };
}

/** Remove someone. Same last-owner rule, for the same reason: it is the unrecoverable direction. */
export async function removeOrgMember(
  env: Corpus,
  access: MemoryAccess,
  orgId: string,
  userId: unknown,
): Promise<{ ok: true } | { ok: false; reason: MemberChangeReject }> {
  if (!canAdministerOrg(access, orgId)) return { ok: false, reason: 'forbidden' };
  if (typeof userId !== 'string' || !userId) return { ok: false, reason: 'bad_user' };
  const current = await env.CORPUS.prepare(`select role from memory_org_members where org_id = ? and user_id = ?`)
    .bind(orgId, userId)
    .first<{ role: string }>();
  if (!current) return { ok: false, reason: 'not_a_member' };
  if (current.role === 'owner' && (await ownerCount(env, orgId)) <= 1) return { ok: false, reason: 'last_owner' };
  await env.CORPUS.prepare(`delete from memory_org_members where org_id = ? and user_id = ?`).bind(orgId, userId).run();
  return { ok: true };
}

/**
 * Build the access context for a request.
 *
 * `provenProjectIds` is the caller's proof, passed in by the route that established it. This
 * function never takes a project id from a URL and never asks Supabase — mixing "proven" and
 * "claimed" inside one constructor is how the distinction stops being real.
 */
export async function memoryAccessFor(env: Corpus, userId: string, provenProjectIds: readonly string[] = []): Promise<MemoryAccess> {
  return { userId, projectIds: [...provenProjectIds], orgs: await orgMembership(env, userId) };
}

/**
 * Everything that applies to one run of one project, already layered.
 *
 * This is what the prompt builder and the router ask for. It reads three scopes and resolves them
 * with `resolveMemoryLayers`, so "which layer won" is computed once, in one place, and the viewer
 * and the agent cannot disagree about it.
 */
export async function resolveForProject(
  env: Corpus,
  access: MemoryAccess,
  target: { projectId: string; orgId?: string | null },
  opts: { now?: number } = {},
): Promise<ResolvedMemory & { layers: { org: MemoryEntry[]; user: MemoryEntry[]; project: MemoryEntry[] } }> {
  const now = opts.now ?? Date.now();
  const org = target.orgId ? await listMemoryEntries(env, access, 'org', target.orgId, { now }) : [];
  const user = await listMemoryEntries(env, access, 'user', access.userId, { now });
  const project = await listMemoryEntries(env, access, 'project', target.projectId, { now });
  return { ...resolveMemoryLayers([...org, ...user, ...project], now), layers: { org, user, project } };
}
