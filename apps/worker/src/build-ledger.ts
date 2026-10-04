/**
 * THE BUILD LEDGER: what earlier runs of THIS project built, as information for the next run (owner directive,
 * 2026-10-02: "every project is new: nothing from one project may leak into another"; "he doesn't focus on what the user
 * asks, instead on what you built for him in the past").
 *
 * It replaces two single-slot memories that decided for the agent: `builtObject` (the last object's whole spec, which made
 * any "make it cooler" an edit of that object) and `builtGame` (the last game's request, which refused a rebuild). One
 * project holds many things, and whether a message continues, extends or replaces one of them is the agent's call.
 *
 * Each entry is {id, request, tool, rootPaths, at, spec?}. At the start of a run the entries whose root paths are gone from
 * the place are dropped, and the live ones are injected as a LABELLED block ("information, may be unrelated to this
 * message"). Nothing here forces a tool, refuses a tool, or edits a thing: `build_object { extend: <id> }` is how the agent
 * asks to add to an earlier object. The ledger is cleared when the place is restored to a checkpoint.
 */

export interface LedgerEntry {
  id: string;
  /** The user's request that was being served, first 200 characters. */
  request: string;
  tool: string;
  /** What stands in the place because of it: the paths verified at the next run's start. */
  rootPaths: string[];
  at: number;
  /** A build_object spec, kept for `extend` (only on the newest few entries). */
  spec?: Record<string, unknown>;
}

export const LEDGER_KEY = 'buildLedger';
const MAX_ENTRIES = 24;
const MAX_SPECS = 3;
const MAX_SPEC_CHARS = 20_000;

/** Tools whose successful result leaves something standing that a later message may be about. */
const LEDGER_TOOLS = new Set(['build_object', 'insert_library_model', 'insert_owner_component', 'dress_object', 'compose_game', 'build_game',
  'recreate_owner_game', 'install_owner_system', 'add_upgrades', 'build_studded_ui']);

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The paths a result says now stand in the place. Pure. */
export function rootPathsOf(tool: string, result: unknown): string[] {
  const r = rec(result);
  const out: string[] = [];
  if (typeof r.object === 'string') out.push(r.object);
  out.push(...strings(r.inserted));
  if (typeof r.screen === 'string' && r.screen) out.push(`game.StarterGui.${r.screen}`);
  if (tool === 'compose_game' && typeof r.game === 'string') out.push('game.Workspace.AppleMap');
  return [...new Set(out)].slice(0, 8);
}

/** The entry a tool call leaves, or null when it built nothing that stands in the place. Pure. */
export function ledgerEntryFor(tool: string, args: unknown, result: unknown, request: string, now: number, id: string): LedgerEntry | null {
  if (!LEDGER_TOOLS.has(tool)) return null;
  const r = rec(result);
  if ('error' in r && r.changed !== true) return null;
  const rootPaths = rootPathsOf(tool, result);
  if (!rootPaths.length) return null;
  const spec = tool === 'build_object' ? rec(args) : undefined;
  return {
    id, request: String(request ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), tool, rootPaths, at: now,
    ...(spec && Object.keys(spec).length && JSON.stringify(spec).length <= MAX_SPEC_CHARS ? { spec } : {}),
  };
}

/** The ledger with one more entry: the same object built again replaces its earlier entry; only the newest few keep a spec. Pure. */
export function withEntry(ledger: readonly LedgerEntry[], entry: LedgerEntry): LedgerEntry[] {
  const same = (e: LedgerEntry) => e.tool === entry.tool && e.rootPaths.length === entry.rootPaths.length && e.rootPaths.every((p, i) => p === entry.rootPaths[i]);
  const next = [...ledger.filter((e) => !same(e)), entry].slice(-MAX_ENTRIES);
  let specs = 0;
  return [...next].reverse().map((e) => (e.spec && ++specs > MAX_SPECS ? { ...e, spec: undefined } : e)).reverse().map((e) => {
    if (e.spec === undefined) { const { spec: _drop, ...rest } = e; void _drop; return rest; }
    return e;
  });
}

/**
 * The entries whose root paths all still exist, checked against the live place with `exists`, and the ones that died. A
 * path Studio cannot answer for counts as alive only when Studio did not answer at all (the caller then injects nothing).
 */
export async function liveEntries(ledger: readonly LedgerEntry[], exists: (path: string) => Promise<boolean>): Promise<{ live: LedgerEntry[]; dead: LedgerEntry[] }> {
  const live: LedgerEntry[] = [], dead: LedgerEntry[] = [];
  for (const e of ledger) {
    const alive = (await Promise.all(e.rootPaths.map(exists))).some(Boolean);
    (alive ? live : dead).push(e);
  }
  return { live, dead };
}

/** The labelled block a run is told. Short on purpose: an id, the tool, the request that made it, where it stands. Pure. */
export function ledgerBlock(live: readonly LedgerEntry[]): string | undefined {
  if (!live.length) return undefined;
  const clip = (s: string) => s.replace(/[\x00-\x1f]/g, ' ').slice(0, 200);
  const lines = live.slice(-12).map((e) => `- [${e.id}] ${e.tool} for "${clip(e.request)}": ${e.rootPaths.map(clip).join(', ')}${e.spec ? ' (build_object { extend: "' + e.id + '" } adds to it)' : ''}`);
  return `Earlier in this project (information, may be unrelated to this message; the message decides whether it continues, extends or replaces any of this, or has nothing to do with it):\n${lines.join('\n')}`;
}

/** The parts of an earlier build_object spec with the new ones added; a part of the same name is replaced. Pure. */
export function extendSpec(prev: Record<string, unknown>, add: Record<string, unknown>): Record<string, unknown> {
  const old = Array.isArray(prev.parts) ? prev.parts as Record<string, unknown>[] : [];
  const fresh = Array.isArray(add.parts) ? add.parts as Record<string, unknown>[] : [];
  const names = new Set(fresh.map((p) => String(rec(p).name ?? '')));
  return { ...prev, ...add, name: prev.name, parts: [...old.filter((p) => !names.has(String(rec(p).name ?? ''))), ...fresh] };
}
