/**
 * What the worker will, and will not, refuse to talk to.
 *
 * THE CONSTRAINT THAT SHAPES ALL OF THIS. Roblox has no automatic plugin
 * updating. Studio's plugin manager has per-plugin "Update" buttons and an
 * "Update all Plugins" button that a human clicks; Roblox staff confirmed on
 * 2026-04-27 that the bulk button was broken and that the individual ones "should
 * still work". There is no silent update on restart and no push channel. So the
 * installed base fragments permanently, and a user running an old build has no
 * self-service remedy beyond noticing a message and clicking a button in a
 * different window.
 *
 * THEREFORE: version skew is the steady state, not an error. A server that
 * refuses an old client is not being careful, it is breaking somebody's Studio
 * for a difference that may be entirely cosmetic. The gate below is written to
 * make that mistake structurally hard:
 *
 *   1. Admission is decided by PROTOCOL, never by VERSION. A plugin that reports
 *      version 0.1.0 against a server shipping 9.9.9 is admitted without comment
 *      as long as the wire contract it speaks is still served.
 *
 *   2. An UNKNOWN protocol is compatible. Unconditionally, at every value of
 *      MIN_PLUGIN_PROTOCOL. A plugin that predates version reporting sends no
 *      headers at all, and the only honest reading of that silence is "a client
 *      that worked yesterday". We cannot prove it is broken, and guessing wrong
 *      strands a working user with no way out. Absence of evidence is not
 *      evidence of incompatibility.
 *
 *   3. The only thing that can produce `compatible: false` is a protocol number
 *      we can read and that is genuinely below the floor.
 *
 * TODAY THE GATE ADMITS EVERYONE, ON PURPOSE. MIN_PLUGIN_PROTOCOL equals
 * CURRENT_PLUGIN_PROTOCOL, so no real client is rejected. That is the correct
 * state — nothing is actually incompatible yet. It is NOT the same thing as the
 * gate being inert by accident: plugin-version.test.mjs drives a hypothetical
 * floor of 2 and asserts the refusal fires, so the day someone raises the floor
 * for real, the mechanism is known to work rather than hoped to.
 */

/**
 * The wire contract this worker speaks. Must match Version.PROTOCOL in the plugin;
 * plugin-version.test.mjs reads both files and fails if they drift.
 *
 * Deliberately NOT an alias of `PROTOCOL_VERSION` in packages/shared. That constant
 * is exported, referenced by nothing anywhere in the repo, and carries no comment
 * saying what it versions — the plugin long-poll and the browser WebSocket are two
 * different protocols and it could plausibly mean either. Aliasing an ambiguous
 * constant to gate user admission would be guessing. If someone later documents it
 * as the plugin wire contract, collapse these two into it then, and keep the drift
 * test pointed at whatever survives.
 */
export const CURRENT_PLUGIN_PROTOCOL = 1;

/**
 * The oldest wire contract still served. Raise this ONLY when an older plugin
 * would genuinely misbehave — not when it merely lacks a feature. Raising it
 * strands every user on an older build until they manually click Update.
 */
export const MIN_PLUGIN_PROTOCOL = 1;

/**
 * The newest plugin build published to the Creator Store, for advisory
 * "an update exists" notices. Bump alongside Version.VERSION in the plugin, at
 * the moment the human actually republishes the Store asset — not when the
 * source changes. Announcing a version nobody can install yet is worse than
 * saying nothing.
 */
export const LATEST_PLUGIN_VERSION = '0.2.0';

/**
 * How a user actually applies an update. Named concretely, because "please
 * update" is useless advice when the mechanism lives in a different window.
 */
const UPDATE_PATH = 'Studio → Plugins → Manage Plugins → Update';

export interface PluginClientInfo {
  /** Semver string, or null when the plugin predates version reporting. */
  version: string | null;
  /** Wire contract revision, or null when unknown. */
  protocol: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface PluginCompatibility {
  compatible: boolean;
  /** Present only when there is something worth showing the user. */
  message?: string;
}

/**
 * Version strings arrive from a client we do not control and are then persisted
 * and shown in the web UI, so they are treated as untrusted input: bounded
 * length, and a charset that cannot carry markup or control characters. A value
 * that fails is discarded rather than truncated — a mangled version is worse
 * than an honest "unknown", which is a state we already handle correctly.
 */
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;

export function sanitizeVersion(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return VERSION_RE.test(v) ? v : null;
}

export function parseProtocol(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/** Pull the plugin's self-report off a request. Missing or malformed reads as unknown. */
export function readPluginHeaders(h: Headers): { version: string | null; protocol: number | null } {
  return {
    version: sanitizeVersion(h.get('X-Golem-Plugin-Version')),
    protocol: parseProtocol(h.get('X-Golem-Plugin-Protocol')),
  };
}

/**
 * Compare two semver-ish strings. Returns -1, 0, 1, or null when either side
 * cannot be parsed confidently. Null means "do not draw a conclusion" — an
 * unparseable version must never produce an update nag.
 */
export function compareVersions(a: string | null, b: string | null): number | null {
  const parse = (v: string | null): number[] | null => {
    if (!v) return null;
    const core = v.split(/[-+]/)[0] ?? '';
    const parts = core.split('.');
    if (parts.length === 0 || parts.length > 4) return null;
    const nums: number[] = [];
    for (const p of parts) {
      if (!/^\d{1,9}$/.test(p)) return null;
      nums.push(Number(p));
    }
    return nums;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * The admission decision. Protocol only — see the file header for why version is
 * deliberately not consulted here.
 *
 * `min` is a parameter rather than a bare reference to the constant so the refusal
 * path can be exercised by tests while the shipping floor stays where it is. A gate
 * that has never once been observed to fire is indistinguishable from a gate that
 * is wired up wrong, and this codebase has already shipped one of those.
 */
export function pluginCompatibility(protocol: number | null, min: number = MIN_PLUGIN_PROTOCOL): PluginCompatibility {
  // Unknown is compatible. This branch is unconditional by design: it never
  // consults `min`, so raising the floor later cannot retroactively lock out
  // clients that predate version reporting.
  if (protocol === null) return { compatible: true };
  if (protocol < min) {
    return {
      compatible: false,
      message: `This Golem build is too old for the server and cannot run builds. Update it in ${UPDATE_PATH}.`,
    };
  }
  return { compatible: true };
}

/**
 * The full notice for a polling client, or null when there is nothing to say —
 * which is the common case and should stay silent rather than sending an empty
 * object on every poll.
 *
 * An advisory notice requires BOTH versions to parse and the client to be
 * strictly older. Equal, newer, or unparseable all produce silence.
 */
export function clientNotice(
  info: { version: string | null; protocol: number | null },
  latest: string = LATEST_PLUGIN_VERSION,
  min: number = MIN_PLUGIN_PROTOCOL,
): PluginCompatibility | null {
  const compat = pluginCompatibility(info.protocol, min);
  if (!compat.compatible) return compat;
  if (compareVersions(info.version, latest) === -1) {
    return {
      compatible: true,
      message: `Golem ${latest} is available. Update it in ${UPDATE_PATH}.`,
    };
  }
  return null;
}
