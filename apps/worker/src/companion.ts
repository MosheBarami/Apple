/**
 * THE STUDIO COMPANION'S WORKER HALF.
 *
 * Two jobs, both of them about not believing things.
 *
 * 1. SELECTION SYNC. The plugin pushes what the user has selected in Studio. That event
 *    arrives over `/api/studio/poll`, which is UNAUTHENTICATED at the edge and
 *    token-authenticated at the Durable Object — so the body is written by a client, and
 *    a client is not a trusted narrator. Everything here re-derives rather than trusts:
 *    the truncation flag is computed from the numbers instead of being read off the wire,
 *    and a count that contradicts the list it came with is corrected rather than
 *    broadcast. A UI that renders `items.length` as "N selected" when four thousand were
 *    selected would be reporting a failure to observe as an observation, and the whole
 *    point of carrying `count` separately is to make that impossible.
 *
 * 2. WHAT A PERSON MAY DRIVE DIRECTLY. The companion panel sends Studio ops with no model
 *    in the loop. That is a different trust boundary from the agent's tools, so it gets
 *    its own allowlist rather than inheriting the union: `StudioOp` is a COMPILE-TIME
 *    promise about what the worker's own code can construct, and this route is handed
 *    JSON from a browser. An op absent from both sets below is refused — the default is
 *    no, and a new op added to the shared union does not silently become reachable here.
 *
 * WHAT IS DELIBERATELY NOT REACHABLE, and why each one:
 *   run_code, edit_script       arbitrary Luau. `refuseLuauIngress` guards the tool path;
 *                               a second door with no filter is not a companion feature.
 *   create_instances, set_props these assign typed properties, which is how an asset id
 *   insert_asset, generate_model can enter a place. The asset gate lives on the tool
 *                               path. A direct route past it is the exact mistake
 *                               `/api/admin/studio-op` already documents.
 *   snapshot, restore           checkpoints have their own owner-checked routes, with
 *                               size limits and a restore confirmation.
 *   render_view, screenshot     capture is paced by the frame bus; an unpaced route
 *                               would let a browser drive the plugin's rasteriser flat
 *                               out.
 */
import type { SelectionItem, StudioEventSelection } from '@golem/shared';

// --------------------------------------------------------------------------- selection

/** How many selected instances the worker will keep and forward. Mirrors the plugin's cap. */
export const MAX_SELECTION_ITEMS = 100;

/** A finite number, or null. Not `?? default`: that defends undefined and null only. */
function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** A non-negative integer, or null. NaN and Infinity are neither. */
function count(v: unknown): number | null {
  const n = finiteNumber(v);
  if (n === null || !Number.isInteger(n) || n < 0) return null;
  return n;
}

function selectionItem(raw: unknown): SelectionItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { path?: unknown; class?: unknown };
  if (typeof r.path !== 'string' || r.path.length === 0 || r.path.length > 512) return null;
  const cls = typeof r.class === 'string' && r.class.length > 0 ? r.class.slice(0, 64) : 'Instance';
  return { path: r.path, class: cls };
}

/**
 * One selection event, re-derived from whatever arrived.
 *
 * `truncated` is COMPUTED, never read: it is exactly "the real selection is larger than
 * the list we are holding", and that is a fact about two numbers rather than a claim the
 * sender gets to make. `count` is likewise raised to at least the number of items kept —
 * a payload saying "0 selected" alongside three items is incoherent, and the honest
 * reading of it is that at least those three were selected.
 *
 * Returns null when the event is not a selection event at all, which is how a log or
 * state event passes through untouched.
 */
export function readSelectionEvent(raw: unknown): StudioEventSelection | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { kind?: unknown; items?: unknown; count?: unknown; clock?: unknown };
  if (r.kind !== 'selection') return null;
  if (!Array.isArray(r.items)) return null;

  const items: SelectionItem[] = [];
  for (const entry of r.items) {
    if (items.length >= MAX_SELECTION_ITEMS) break;
    const item = selectionItem(entry);
    if (item) items.push(item);
  }

  const claimed = count(r.count) ?? items.length;
  const real = Math.max(claimed, items.length);
  return {
    kind: 'selection',
    items,
    count: real,
    truncated: real > items.length,
    clock: finiteNumber(r.clock) ?? 0,
  };
}

/**
 * The most recent selection among a poll body's events, or null when it carried none.
 *
 * LAST WINS. A poll can carry several changes if the user clicked around between polls,
 * and the one that describes the present is the last one. Taking the first would pin the
 * panel to a selection the user has already left.
 */
export function latestSelection(events: readonly unknown[] | undefined | null): StudioEventSelection | null {
  if (!Array.isArray(events)) return null;
  let latest: StudioEventSelection | null = null;
  for (const e of events) {
    const parsed = readSelectionEvent(e);
    if (parsed) latest = parsed;
  }
  return latest;
}

/**
 * Do two selections describe the same thing? Used to keep an unchanged selection off the
 * socket. Order matters: re-ordering a selection is a different selection to anything
 * that renders it as a list.
 */
export function sameSelection(a: StudioEventSelection | null | undefined, b: StudioEventSelection | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.count !== b.count || a.items.length !== b.items.length) return false;
  for (let i = 0; i < a.items.length; i += 1) {
    if (a.items[i]!.path !== b.items[i]!.path) return false;
    if (a.items[i]!.class !== b.items[i]!.class) return false;
  }
  return true;
}

// ------------------------------------------------------------------------- op admission

/** What a caller must be allowed to do for a companion op to be forwarded. */
export type CompanionAccess = 'read' | 'build';

/** Companion ops that change nothing at all — not the place, not Studio's own state. */
export const COMPANION_READ_OPS = [
  'ping',
  'get_tree',
  'get_instance',
  'get_selection',
  'viewport_info',
  'list_scripts',
  'read_script',
  'get_logs',
] as const;

/**
 * Companion ops that change something. Everything a person clicks in the panel: the
 * transform handles, the Explorer edits, the test controls, and the two Studio-state ops
 * (`select`, `camera_focus`) — moving somebody else's camera is not a read.
 */
export const COMPANION_BUILD_OPS = [
  'select',
  'camera_focus',
  'run_mode',
  'transform_instances',
  'clone_instances',
  'group_instances',
  'ungroup_instances',
  'rename_instance',
  'set_locked',
  'set_visible',
  'delete_instances',
  'move_instances',
  'undo_waypoint',
] as const;

// Sets, not a Record keyed by the union. `'__proto__' in someRecord` is true, and a
// Record<Union, T> is a promise the compiler keeps and the runtime does not — which is
// worth nothing at all on a boundary whose input is JSON from a browser.
const READ_SET: ReadonlySet<string> = new Set(COMPANION_READ_OPS);
const BUILD_SET: ReadonlySet<string> = new Set(COMPANION_BUILD_OPS);

/**
 * The access level this op needs, or null when the companion route will not carry it.
 *
 * Null is the default for everything not named above, INCLUDING ops that are perfectly
 * valid members of `StudioOp`. That asymmetry is the point: adding an op to the shared
 * union must not quietly open a door here.
 */
export function companionOpAccess(op: unknown): CompanionAccess | null {
  if (!op || typeof op !== 'object') return null;
  const kind = (op as { op?: unknown }).op;
  if (typeof kind !== 'string') return null;
  if (READ_SET.has(kind)) return 'read';
  if (BUILD_SET.has(kind)) return 'build';
  return null;
}

/**
 * The op as it may be forwarded, with the fields a caller must not be able to assert
 * removed.
 *
 * `verifiedAssetIds` is read off the op ENVELOPE by the plugin's asset policy: it is how
 * the worker tells the plugin that an id has already been through the licence gate. None
 * of the companion ops assign a typed property, so today the field would do nothing —
 * and it is stripped anyway, because "it happens to be inert right now" is not a security
 * property, and the admin route has already been fixed once for exactly this.
 */
export function sanitizeCompanionOp(op: Record<string, unknown>): Record<string, unknown> {
  const { verifiedAssetIds: _dropped, ...rest } = op;
  return rest;
}

/** The refusal message for an op the companion route will not carry. */
export function companionRefusal(op: unknown): string {
  const kind = op && typeof op === 'object' ? (op as { op?: unknown }).op : undefined;
  return (
    `${typeof kind === 'string' ? kind : 'that'} is not a companion op. This route carries direct manipulation only — ` +
    `inspection, selection, the test controls and the Explorer edits. Anything that writes script source, assigns a ` +
    `property or brings an asset into the place goes through the agent, so it passes the Luau and asset gates.`
  );
}
