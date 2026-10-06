/**
 * THE OWNER'S BENCHMARK, RESET HALF (owner, 2026-10-02: "a fixed set of at least 30 varied requests, each in a new clean chat").
 *
 * The evaluation half of this file (four Studio photos, a census of the place, and a vision judge's scores against a fixed rubric)
 * was removed in M4: the product sends no picture to a model. What stays is the clean-place reset the admin and owner routes call
 * between benchmark requests (`/bench-reset`).
 */
import type { AgentCtx } from './tools';
import { clearChildren } from './dup-names';

/** What a clean Baseplate keeps at the top of Workspace; everything else a request made goes. */
const KEEP_TOP = new Set(['Camera', 'Terrain', 'Baseplate', 'SpawnLocation']);
const CLEAR_ROOTS = ['game.Workspace', 'game.StarterGui', 'game.ServerScriptService', 'game.ServerStorage', 'game.ReplicatedStorage',
  'game.StarterPack', 'game.SoundService', 'game.Lighting', 'game.MaterialService', 'game.StarterPlayer.StarterPlayerScripts', 'game.StarterPlayer.StarterCharacterScripts'];

/**
 * Empties the place back to a bare Baseplate before a benchmark request (live 2026-10-02: a checkpoint restore put the
 * baseline back but left every earlier request's build standing, so items 2-8 were built and judged in a cluttered
 * place). Returns what is left over that should not be; empty means clean.
 *
 * A place after a request is full of same-named siblings (copies, a library model repeating a part name), and a plain
 * path cannot select one of them, so the old one-path-per-child reset left every such child standing and the next
 * request was judged in the previous one's clutter. Each root is now cleared by clearChildren (dup-names.ts), which
 * addresses a duplicate by its read reference. With a plugin that cannot, the duplicates come back in the answer by
 * name, with the reason, instead of being skipped.
 */
export async function benchClean(ctx: AgentCtx): Promise<string[]> {
  const exec = ctx.execStudioOp;
  const left: string[] = [];
  for (const root of CLEAR_ROOTS) {
    const keep = root === 'game.Workspace' ? (child: { name?: string }) => !!child.name && KEEP_TOP.has(child.name) : undefined;
    const cleared = await clearChildren(exec, root, { keep });
    for (const l of cleared.left) left.push(l.why === 'not removed' ? l.path : `${l.path} (${l.why})`);
  }
  await exec({ op: 'terrain_edit', action: 'clear' } as never, 30_000).catch(() => undefined);
  return left;
}
