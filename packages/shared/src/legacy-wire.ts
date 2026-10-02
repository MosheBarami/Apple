// THE WIRE NAMES, AND THE OLD SPELLINGS THAT MUST KEEP WORKING.
//
// The product is Apple. Before the rename its wire identity carried the old name: the WebSocket
// subprotocol, the bearer-token subprotocol prefix, the Studio plugin's `X-<Brand>-*` request
// headers, the capability schema, the generated-UI fence, an attribute written into places users
// already built. Those spellings are in the wild, and two of them are in software this repository
// cannot update: the PUBLISHED Studio plugin (Creator Store asset 107230158271368) changes only when
// a user clicks Update, and a browser tab keeps running the bundle it loaded.
//
// So the rename is two steps, never one flip:
//   B1  the worker (and every reader) ACCEPTS BOTH spellings, answers in a way both can read, and
//       counts every use of the old one. This file is that step.
//   B2  clients start SENDING the new spelling, only after B1 is deployed.
//   D   when the counters say nobody sends the old spelling any more, this file's legacy half is
//       deleted and the guard's allowlist entry for it with it.
//
// ONE WORD, ONE PLACE. The old spelling is not written out anywhere in product code: it is DERIVED
// from the new one by `legacyOf` (the brand word swapped), so there is exactly one line in the
// repository that says the old name for the wire. The tests that pin the old literals say it in the
// open, in files the allowlist names, because a test that derived the old literal with the same
// function would agree with a broken function forever.

/** The wire names the product speaks today. */
export const WS_SUBPROTOCOL = 'apple.v1';
export const WS_JWT_PREFIX = 'apple.jwt.';
export const CAPABILITY_SCHEMA = 'apple.studio-ops.v1';
export const UI_FENCE = 'apple-ui';
export const BASE_VOLUME_ATTRIBUTE = 'AppleBaseVolume';

/** Request/response header names. Case-insensitive on the wire; spelled once here. */
export const WIRE_HEADERS = {
  token: 'X-Apple-Token',
  pluginVersion: 'X-Apple-Plugin-Version',
  pluginProtocol: 'X-Apple-Plugin-Protocol',
  role: 'X-Apple-Role',
  grantExpiresAt: 'X-Apple-Grant-Expires-At',
  exportSha256: 'X-Apple-Export-SHA256',
  sandbox: 'X-Apple-Sandbox',
  usageInputTokens: 'X-Apple-Usage-Input-Tokens',
  usageOutputTokens: 'X-Apple-Usage-Output-Tokens',
  usageCredits: 'X-Apple-Usage-Credits',
  creditsRemaining: 'X-Apple-Credits-Remaining',
} as const;

/** The old spelling of a wire name: the same name with the brand word swapped. */
export function legacyOf(name: string): string {
  return name.replace(/apple/i, (m) => (m === 'Apple' ? 'Golem' : 'golem'));
}

/** Every wire name above has an old spelling; these are them, derived. */
export const LEGACY_SUBPROTOCOL = legacyOf(WS_SUBPROTOCOL);
export const LEGACY_JWT_PREFIX = legacyOf(WS_JWT_PREFIX);
export const LEGACY_CAPABILITY_SCHEMA = legacyOf(CAPABILITY_SCHEMA);
export const LEGACY_UI_FENCE = legacyOf(UI_FENCE);
export const LEGACY_BASE_VOLUME_ATTRIBUTE = legacyOf(BASE_VOLUME_ATTRIBUTE);

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

/** The new header if present, else the old one (and the use is counted). Null when neither. */
export function readWire(h: HeaderReader, name: string): string | null {
  const v = h.get(name);
  if (v !== null) return v;
  const old = h.get(legacyOf(name));
  if (old !== null) noteLegacyWire(`header ${name}`);
  return old;
}

/** Remove both spellings. Used on headers a client must never be able to supply. */
export function stripWire(h: Headers, name: string): void {
  h.delete(name);
  h.delete(legacyOf(name));
}

/** Set both spellings, so a reader that predates the rename and one that follows it agree. */
export function setWire(h: Headers, name: string, value: string): void {
  h.set(name, value);
  h.set(legacyOf(name), value);
}

/** `{ new: v, old: v }` for a response header object literal. */
export function bothWire(name: string, value: string): Record<string, string> {
  return { [name]: value, [legacyOf(name)]: value };
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
    if (p === LEGACY_SUBPROTOCOL) { noteLegacyWire(`subprotocol ${WS_SUBPROTOCOL}`); return LEGACY_SUBPROTOCOL; }
  }
  return LEGACY_SUBPROTOCOL;
}

/** The bearer token carried in a subprotocol with either prefix, or null. */
export function jwtFromSubprotocols(header: string | null | undefined): string | null {
  for (const p of protocolList(header)) {
    if (p.startsWith(WS_JWT_PREFIX)) return p.slice(WS_JWT_PREFIX.length);
    if (p.startsWith(LEGACY_JWT_PREFIX)) { noteLegacyWire(`subprotocol ${WS_JWT_PREFIX}`); return p.slice(LEGACY_JWT_PREFIX.length); }
  }
  return null;
}

/* ----------------------------------------------------------------- the rest --- */

/** Is this the capability schema, in either spelling? Callers normalise to CAPABILITY_SCHEMA. */
export function isCapabilitySchema(v: unknown): boolean {
  if (v === CAPABILITY_SCHEMA) return true;
  if (v === LEGACY_CAPABILITY_SCHEMA) { noteLegacyWire(`schema ${CAPABILITY_SCHEMA}`); return true; }
  return false;
}

/** A generated-UI fence tag, in either spelling. */
export function isUiFence(lang: string): boolean {
  return lang === UI_FENCE || lang === LEGACY_UI_FENCE;
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
