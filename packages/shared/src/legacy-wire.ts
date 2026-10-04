// THE WIRE NAMES, AND THE OLD SPELLINGS THAT MUST KEEP WORKING.
//
// The product is StudPilot. It was called Apple, and before that Golem, and its wire identity carried
// each name in turn: the WebSocket subprotocol, the bearer-token subprotocol prefix, the Studio
// plugin's `X-<Brand>-*` request headers, the capability schema, the generated-UI fence. Those
// spellings are in the wild, and two of them are in software this repository cannot update: the
// PUBLISHED Studio plugin (Creator Store asset 107230158271368) changes only when a user clicks
// Update, and a browser tab keeps running the bundle it loaded. Every published plugin build still
// sends the oldest spelling (X-Golem-*, golem.studio-ops.v1).
//
// So a rename is two steps, never one flip:
//   1  the worker (and every reader) ACCEPTS EVERY spelling, answers in a way each can read, and
//      counts every use of an old one. This file is that step (compat `wire-all`).
//   2  clients start SENDING the new spelling, only after step 1 is deployed.
//   D  when the counters say nobody sends an old spelling any more, this file's legacy half is
//      deleted and the guard's allowlist line for it with it.
//
// ONE WORD, ONE PLACE. The old spellings are not written out anywhere in product code: they are
// DERIVED from the new one by `legaciesOf` (the brand word swapped for each former name), so there
// is exactly one line in the repository that says the old names for the wire. The tests that pin
// the old literals say them in the open, because a test that derived the old literals with the
// same function would agree with a broken function forever.

/** The wire names the product speaks today. */
export const WS_SUBPROTOCOL = 'studpilot.v1';
export const WS_JWT_PREFIX = 'studpilot.jwt.';
export const CAPABILITY_SCHEMA = 'studpilot.studio-ops.v1';
export const UI_FENCE = 'studpilot-ui';
/**
 * Written into users' own places, so it is a place name, not a wire name: it keeps its 2026-10-02
 * spelling until the blocks of handoff M4 write StudPilot names and read the old ones.
 */
export const BASE_VOLUME_ATTRIBUTE = 'AppleBaseVolume';

/** Request/response header names. Case-insensitive on the wire; spelled once here. */
export const WIRE_HEADERS = {
  token: 'X-StudPilot-Token',
  pluginVersion: 'X-StudPilot-Plugin-Version',
  pluginProtocol: 'X-StudPilot-Plugin-Protocol',
  role: 'X-StudPilot-Role',
  grantExpiresAt: 'X-StudPilot-Grant-Expires-At',
  exportSha256: 'X-StudPilot-Export-SHA256',
  sandbox: 'X-StudPilot-Sandbox',
  usageInputTokens: 'X-StudPilot-Usage-Input-Tokens',
  usageOutputTokens: 'X-StudPilot-Usage-Output-Tokens',
  usageCredits: 'X-StudPilot-Usage-Credits',
  creditsRemaining: 'X-StudPilot-Credits-Remaining',
} as const;

/** The former brand words, newest first. */
const FORMER = ['Apple', 'Golem'] as const;

/** The old spellings of a wire name, newest first: the same name with the brand word swapped. */
export function legaciesOf(name: string): string[] {
  return FORMER.map((old) => name.replace(/studpilot/i, (m) => (m === 'StudPilot' ? old : m === 'STUDPILOT' ? old.toUpperCase() : old.toLowerCase())));
}

/** The OLDEST spelling of a wire name: what every published plugin build sends. */
export function legacyOf(name: string): string {
  const all = legaciesOf(name);
  return all[all.length - 1] as string;
}

/** Every wire name above has old spellings; these are them, derived. */
export const LEGACY_SUBPROTOCOLS = legaciesOf(WS_SUBPROTOCOL);
export const LEGACY_JWT_PREFIXES = legaciesOf(WS_JWT_PREFIX);
export const LEGACY_CAPABILITY_SCHEMAS = legaciesOf(CAPABILITY_SCHEMA);
export const LEGACY_UI_FENCES = legaciesOf(UI_FENCE);
/** The oldest of each, for callers that answer a client which named no spelling at all. */
export const LEGACY_SUBPROTOCOL = legacyOf(WS_SUBPROTOCOL);
export const LEGACY_JWT_PREFIX = legacyOf(WS_JWT_PREFIX);
export const LEGACY_CAPABILITY_SCHEMA = legacyOf(CAPABILITY_SCHEMA);
export const LEGACY_UI_FENCE = legacyOf(UI_FENCE);
/** The place attribute's one older spelling (it was renamed once, from the oldest brand word). */
export const LEGACY_BASE_VOLUME_ATTRIBUTE = BASE_VOLUME_ATTRIBUTE.replace(/^Apple/, FORMER[1]);

/* ------------------------------------------------------------------ counters --- */

/**
 * Phase D needs to know whether anyone still sends the old spelling, and the repository cannot say
 * how many old plugins are in the wild. Each read that had to fall back to the old spelling is
 * counted here, per isolate, and the totals are reported by /api/health. A count of zero across an
 * agreed window is the precondition for deleting the fallback; it is not proof by itself (isolates
 * recycle), which is why the first use of each kind per isolate is also logged.
 */
const legacyHits = new Map<string, number>();

export function noteLegacyWire(kind: string): void {
  const n = (legacyHits.get(kind) ?? 0) + 1;
  legacyHits.set(kind, n);
  if (n === 1) console.log(`[legacy-wire] first use of the old spelling in this isolate: ${kind}`);
}

export function legacyWireCounts(): Record<string, number> {
  return Object.fromEntries(legacyHits);
}

/** Test seam: the counters are module state. */
export function resetLegacyWireCounts(): void {
  legacyHits.clear();
}

/* ------------------------------------------------------------------- headers --- */

export interface HeaderReader { get(name: string): string | null }

/** The new header if present, else the newest old one present (and the use is counted). Null when none. */
export function readWire(h: HeaderReader, name: string): string | null {
  const v = h.get(name);
  if (v !== null) return v;
  for (const old of legaciesOf(name)) {
    const o = h.get(old);
    if (o !== null) { noteLegacyWire(`header ${name}`); return o; }
  }
  return null;
}

/** Remove every spelling. Used on headers a client must never be able to supply. */
export function stripWire(h: Headers, name: string): void {
  h.delete(name);
  for (const old of legaciesOf(name)) h.delete(old);
}

/** Set every spelling, so readers from before either rename and after it agree. */
export function setWire(h: Headers, name: string, value: string): void {
  h.set(name, value);
  for (const old of legaciesOf(name)) h.set(old, value);
}

/** `{ new: v, old: v, older: v }` for a response header object literal. */
export function bothWire(name: string, value: string): Record<string, string> {
  return Object.fromEntries([name, ...legaciesOf(name)].map((n) => [n, value]));
}

/* ------------------------------------------------------------- subprotocols --- */

function protocolList(header: string | null | undefined): string[] {
  return typeof header === 'string' ? header.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * The subprotocol to echo back: whichever version protocol the client listed, first listed wins.
 * A browser aborts the handshake unless the echoed value is one it requested, so echoing a fixed
 * new value to a client that only knows the old one would break it. A client that listed neither
 * is answered as before the rename.
 */
export function echoSubprotocol(header: string | null | undefined): string {
  for (const p of protocolList(header)) {
    if (p === WS_SUBPROTOCOL) return WS_SUBPROTOCOL;
    if (LEGACY_SUBPROTOCOLS.includes(p)) { noteLegacyWire(`subprotocol ${WS_SUBPROTOCOL}`); return p; }
  }
  return LEGACY_SUBPROTOCOL;
}

/** The bearer token carried in a subprotocol with any prefix, or null. */
export function jwtFromSubprotocols(header: string | null | undefined): string | null {
  for (const p of protocolList(header)) {
    if (p.startsWith(WS_JWT_PREFIX)) return p.slice(WS_JWT_PREFIX.length);
    const old = LEGACY_JWT_PREFIXES.find((pre) => p.startsWith(pre));
    if (old) { noteLegacyWire(`subprotocol ${WS_JWT_PREFIX}`); return p.slice(old.length); }
  }
  return null;
}

/* ----------------------------------------------------------------- the rest --- */

/** Is this the capability schema, in any spelling? Callers normalise to CAPABILITY_SCHEMA. */
export function isCapabilitySchema(v: unknown): boolean {
  if (v === CAPABILITY_SCHEMA) return true;
  if (typeof v === 'string' && LEGACY_CAPABILITY_SCHEMAS.includes(v)) { noteLegacyWire(`schema ${CAPABILITY_SCHEMA}`); return true; }
  return false;
}

/** A generated-UI fence tag, in any spelling. */
export function isUiFence(lang: string): boolean {
  return lang === UI_FENCE || LEGACY_UI_FENCES.includes(lang);
}

/**
 * The volume a Sound had before any trim, from the attribute written into the user's own place:
 * the new attribute first, then the one places built before the rename carry. Returns the new
 * attribute's value when both exist, because the new one is the one a later pass wrote.
 */
export function baseVolumeOf(attributes: Record<string, unknown> | null | undefined): unknown {
  const a = attributes ?? {};
  if (a[BASE_VOLUME_ATTRIBUTE] !== undefined && a[BASE_VOLUME_ATTRIBUTE] !== null) return a[BASE_VOLUME_ATTRIBUTE];
  const old = a[LEGACY_BASE_VOLUME_ATTRIBUTE];
  if (old !== undefined && old !== null) noteLegacyWire(`attribute ${BASE_VOLUME_ATTRIBUTE}`);
  return old;
}
