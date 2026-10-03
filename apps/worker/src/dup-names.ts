/**
 * DUPLICATE-NAMED SIBLINGS: THE PARTS OF THE ANSWER THAT LIVE IN THE WORKER.
 *
 * A Roblox path is a spelling, and two siblings can share one. The plugin used to refuse every write and
 * every delete aimed at such a path, so copies the agent made (or a library model that repeats a name inside
 * itself) could be neither fixed nor removed, and `clone_instances` could not be asked for N copies of one
 * thing. The plugin now accepts the `read-ref:` references get_tree already hands out for these nodes as the
 * address of a write (apps/apple-plugin/src/Commands.luau, resolvePath), and says so on every tree it returns
 * (`refsWritable`). This module is what the worker does with that, and with a plugin that cannot:
 *
 *  - planCopyRounds: a source listed N times is N copies, sent as rounds in which no path repeats, because
 *    the plugin refuses a repeated target inside ONE op and only the worker can split it for every plugin
 *    already installed.
 *  - clearChildren: empty a container, addressing each child the way the connected plugin can honour. A
 *    child the plugin cannot address (a duplicate, on a plugin without write-through references) is NAMED in
 *    the result, never retried and never silently left.
 *
 * Nothing here knows what a thing is called or what it is for. It reads names, counts and references.
 */
import type { StudioOp } from '@golem/shared';

/** The most clones one clone_instances call may make: the same ceiling every direct edit has. */
export const COPIES_LIMIT = 120;

export type CopyPlan = { rounds: string[][]; total: number } | { error: string };

/**
 * `paths` lists the sources, repeats allowed; `copies` multiplies every listed occurrence (default 1).
 * Round r holds every source that still owes a copy after r, in first-listed order, so a round never repeats
 * a path and one clone of each is exactly one round, which is the shape the plugin has always taken.
 */
export function planCopyRounds(paths: readonly string[], copies: unknown = 1): CopyPlan {
  if (typeof copies !== 'number' || !Number.isInteger(copies) || copies < 1) {
    return { error: 'copies must be a whole number from 1' };
  }
  const owed = new Map<string, number>();
  for (const path of paths) owed.set(path, (owed.get(path) ?? 0) + copies);
  let total = 0;
  for (const count of owed.values()) total += count;
  if (total > COPIES_LIMIT) {
    return { error: `that asks for ${total} copies; at most ${COPIES_LIMIT} per call — split it` };
  }
  const rounds: string[][] = [];
  for (let round = 0; ; round++) {
    const row = [...owed].filter(([, count]) => count > round).map(([path]) => path);
    if (row.length === 0) break;
    rounds.push(row);
  }
  return { rounds, total };
}

/** What a Studio op answers with, narrowed to what this module reads. */
export type OpAnswer = { ok: boolean; data?: unknown; error?: string; failure?: string };
export type ExecOp = (op: StudioOp, timeoutMs?: number) => Promise<OpAnswer>;

export interface ChildNode { name?: string; path?: string; readRef?: string; class?: string }
export interface Leftover { path: string; why: string }
export interface ClearResult { removed: number; left: Leftover[]; read: boolean }

/** One delete op names at most this many addresses; the plugin's own item limit is above it. */
const DELETE_BATCH = 100;
/** A reasonable place needs a handful of rounds (400 children are read per round); this only stops a bug. */
const MAX_ROUNDS = 40;
const READ_NODES = 400;
const STUCK_NO_REFS = 'it shares its name with a sibling and the connected Studio plugin cannot address one of several same-named objects (update the plugin)';

const readChildren = async (exec: ExecOp, root: string): Promise<{ children: ChildNode[]; refsWritable: boolean } | null> => {
  const res = await exec({ op: 'get_tree', root, maxDepth: 1, maxNodes: READ_NODES }, 20_000).catch(() => null);
  if (!res?.ok) return null;
  const data = res.data as { root?: { children?: ChildNode[] }; refsWritable?: unknown } | undefined;
  return { children: data?.root?.children ?? [], refsWritable: data?.refsWritable === true };
};

/**
 * Delete every child of `root` that `keep` does not name, whatever those children are called.
 *
 * A child that shares its name with a sibling is addressed by its read reference when the plugin honours
 * them, in chunks; a unique child by its path. One refused child never stops the rest: a chunk that fails is
 * retried one address at a time and the ones that still fail are reported. Re-reads the container until it is
 * empty, because a deleted twin leaves its sibling's plain path valid and a container can hold more children
 * than one read returns. Stops the first round that removes nothing.
 */
export async function clearChildren(exec: ExecOp, root: string, opts: { keep?: (child: ChildNode) => boolean } = {}): Promise<ClearResult> {
  let removed = 0;
  let read = false;
  const failed = new Map<string, string>();
  let remaining: (Leftover & { address?: string })[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const seen = await readChildren(exec, root);
    if (!seen) return { removed, left: remaining.map(({ path, why }) => ({ path, why })), read };
    read = true;
    const targets: { address: string; path: string }[] = [];
    remaining = [];
    for (const child of seen.children) {
      if (opts.keep?.(child)) continue;
      const path = child.path ?? `${root}.${child.name ?? '?'}`;
      const duplicated = typeof child.readRef === 'string';
      if (duplicated && !seen.refsWritable) { remaining.push({ path, why: STUCK_NO_REFS }); continue; }
      const address = duplicated ? (child.readRef as string) : path;
      const earlier = failed.get(address);
      if (earlier !== undefined) { remaining.push({ path, why: earlier, address }); continue; }
      targets.push({ address, path });
      remaining.push({ path, why: 'not removed', address });
    }
    if (targets.length === 0) break;

    let progress = 0;
    for (let at = 0; at < targets.length; at += DELETE_BATCH) {
      const batch = targets.slice(at, at + DELETE_BATCH);
      const all = await exec({ op: 'delete_instances', paths: batch.map((t) => t.address) }, 20_000).catch(() => null);
      if (all?.ok) { progress += batch.length; continue; }
      for (const target of batch) {
        const one = await exec({ op: 'delete_instances', paths: [target.address] }, 20_000).catch(() => null);
        if (one?.ok) progress += 1;
        else failed.set(target.address, one?.error ?? 'Studio did not answer');
      }
    }
    removed += progress;
    if (progress === 0) break;
  }
  return { removed, left: remaining.map((l) => ({ path: l.path, why: (l.address !== undefined ? failed.get(l.address) : undefined) ?? l.why })), read };
}
