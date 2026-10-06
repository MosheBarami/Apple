/**
 * build_blocks: the Studio agent's way to run reviewed blocks (M5; plan section 3). The model picks blocks from the menu
 * in the tool's description and fills their parameters; this tool only checks and runs what the model chose.
 *
 *   build_blocks { blocks }          the parameter sheet of each chosen block (its hint and parameters), nothing built
 *   build_blocks { blocks, params }  validates every parameter (field-level errors come back to fix), then runs the
 *                                    recipes through the plugin's ops and reports each step and check
 *
 * Nothing runs unless every chosen block, its dependencies and all parameters are valid (recipe.ts runBlocks).
 */
import type { AgentCtx } from './tools';
import { BLOCKS } from './blocks.generated.ts';
import { blockMenu } from './intake.ts';
import { checkFill } from './plan-fill.ts';
import { runBlocks, runOrder } from './recipe.ts';
import { WORLD_PROPS } from './studkit-icons.generated.ts';

export const BLOCKS_TOOL_DESCRIPTION = `Builds with reviewed blocks. First call with {blocks: [ids]} to get each block's parameters; then call with {blocks, params: {id: {...}}} to build. Pick by structure, not by words. Blocks:\n${blockMenu()}`;

function sheet(id: string) {
  const b = BLOCKS[id]!;
  return { id, hint: b.hint, depends: b.block.depends, params: b.block.params.properties };
}

export async function buildBlocks(ctx: AgentCtx, a: Record<string, unknown>) {
  const ids = Array.isArray(a.blocks) ? [...new Set(a.blocks.filter((x): x is string => typeof x === 'string'))] : [];
  if (!ids.length) return { error: 'blocks must list at least one block id', menu: blockMenu() };
  const order = runOrder(ids);
  if (!order.ok) return { error: order.refused, menu: blockMenu() };
  if (a.params === undefined) return { blocks: ids.map(sheet), next: 'Call build_blocks again with the same blocks and params: {id: {parameter: value}} (leave a parameter out to keep its default).' };
  const given = a.params && typeof a.params === 'object' && !Array.isArray(a.params) ? { ...(a.params as Record<string, unknown>) } : null;
  // A block that lives inside another (item-grid inside panel) is on the same screen unless told otherwise.
  if (given) {
    for (const id of order.order) {
      const own = given[id] as Record<string, unknown> | undefined;
      if (!('screen' in BLOCKS[id]!.block.params.properties) || (own && 'screen' in own)) continue;
      const host = BLOCKS[id]!.block.depends.map((d) => (given[d] as Record<string, unknown> | undefined)?.screen).find((x) => x !== undefined);
      if (host !== undefined) given[id] = { ...(own ?? {}), screen: host };
    }
  }
  const filled = checkFill(given, ids);
  if (!filled.ok) return { error: 'Fix these parameters and call again; nothing was built.', fix: filled.errors };
  const report = await runBlocks({
    selected: ids, params: filled.params,
    deps: {
      exec: (op, timeoutMs) => ctx.execStudioOp(op, timeoutMs),
      // A world-pack prop goes through the library's own path: staged, scanned, copied script-free, sized to player scale.
      placeProp: async (p) => {
        const row = WORLD_PROPS[p.prop];
        if (!row) return { ok: false, error: `${p.prop} is not in the world pack` };
        // Loaded when a prop is placed: the library path is large and only world blocks need it.
        const { placeLibraryPiece } = await import('./library-object');
        const r = await placeLibraryPiece(ctx, { source: 'store', name: p.name, id: `cs-${row.assetId}` }, { name: p.name, at: p.at, size: { size: row.size } }) as { error?: string };
        return r.error ? { ok: false, error: r.error } : { ok: true };
      },
    },
  });
  const changed = report.blocks.some((b) => b.steps.some((s) => s.ok || s.attempts > 0));
  return {
    ok: report.ok,
    changed,
    blocks: report.blocks.map((b) => ({ id: b.id, ok: b.ok, ...(b.error ? { error: b.error } : {}), failed: b.checks.filter((c) => !c.ok).map((c) => `${c.describes}: ${c.found ?? 'failed'}`) })),
    playTest: report.checks.length ? (report.checks.every((c) => c.ok) ? 'clean' : report.checks.find((c) => !c.ok)?.found) : 'not run',
    note: report.ok
      ? 'Built and checked. Say only what the checks show; fill in real content, never placeholders.'
      : 'Not everything worked: say plainly what failed. Fix the parameters named and call again, or tell the creator.',
  };
}
