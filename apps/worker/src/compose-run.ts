/**
 * Runs the composer's Steps (compose.ts) in the user's Studio through the paired plugin. The Studio proof harness
 * (packages/components/proof/run-steps.luau) runs the same Steps from the command bar; the two must agree, and the
 * plugin's place_copies / strip_descendants ops (apps/studpilot-plugin/src/ops/Compose.luau) do exactly what the harness does.
 */
import type { InstanceSpec, PropValue, StudioOp } from '@studpilot/shared';
import type { AgentCtx } from './tools';
import type { InstanceSpecLite, Step } from './compose';
import { LIBRARY_IMPORT_MS } from './local-owner-corpus';
import { applySurfaceOp } from './surfaces';

const ENUMS: Record<string, string> = { Material: 'Material', TopSurface: 'SurfaceType', BottomSurface: 'SurfaceType', Shape: 'PartType' };

/** A composer value as the plugin's typed PropValue. */
export function propValue(key: string, v: unknown): PropValue | undefined {
  // Already typed (stud-ui.ts writes UDim2, UDim, Vector2, ColorSequence and enums this way): passed through unchanged.
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { t?: unknown }).t === 'string') return v as PropValue;
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return { t: 'number', v };
  if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')) return { t: 'Vector3', v: v as [number, number, number] };
  if (typeof v === 'string') {
    if (ENUMS[key]) return { t: 'EnumItem', v: `Enum.${ENUMS[key]}.${v}` };
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    if (hex) return { t: 'Color3', v: [parseInt(hex[1]!, 16) / 255, parseInt(hex[2]!, 16) / 255, parseInt(hex[3]!, 16) / 255] };
    return { t: 'string', v };
  }
  return undefined;
}

export function typed(spec: InstanceSpecLite): Omit<InstanceSpec, 'parent'> {
  const props: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(spec.props ?? {})) { const p = propValue(k, v); if (p) props[k] = p; }
  const attributes: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(spec.attributes ?? {})) { const p = propValue('', v); if (p) attributes[k] = p; }
  return {
    className: spec.className, name: spec.name,
    ...(Object.keys(props).length ? { props } : {}),
    ...(Object.keys(attributes).length ? { attributes } : {}),
    ...(spec.children?.length ? { children: spec.children.map(typed) } : {}),
  };
}

export interface RunReport {
  counts: Record<string, number>;
  problems: string[];
  /** Library pieces that did not come in, by key. A game missing one of these is not the game the recipe describes. */
  missing: string[];
  stopped?: string;
  /** What makes the game not the game at all (no map, no props): the build is a failure, whatever else came in. */
  critical: string[];
}

const clip = (s: unknown) => String(s ?? '').slice(0, 300);

/** Why a build stopped when Studio refused to write because a Play test was running. */
export const PLAY_TEST_STOP = 'Studio is in a Play test';

/** The plugin refuses a create_instances whose trees hold more than 400 instances; batches stay under this. */
export const CREATE_LIMIT = 350;
const nodes = (i: InstanceSpecLite): number => 1 + (i.children ?? []).reduce((n, c) => n + nodes(c), 0);

/**
 * One create split into batches the plugin accepts (live 2026-10-01: the simulator HUD was 400+ instances, Studio
 * refused it and the game had no screen at all). Items go together while they fit; an item too big alone is made
 * without its children, and its children follow under it. Parents always come before their children. Pure.
 */
export function createBatches(parent: string, items: InstanceSpecLite[], limit = CREATE_LIMIT): { parent: string; items: InstanceSpecLite[] }[] {
  const out: { parent: string; items: InstanceSpecLite[] }[] = [];
  let batch: InstanceSpecLite[] = [], size = 0;
  const flush = () => { if (batch.length) out.push({ parent, items: batch }); batch = []; size = 0; };
  for (const item of items) {
    const n = nodes(item);
    if (n <= limit) {
      if (size + n > limit) flush();
      batch.push(item); size += n;
      continue;
    }
    flush();
    const { children, ...shell } = item;
    out.push({ parent, items: [shell] });
    out.push(...createBatches(`${parent}.${item.name}`, children ?? [], limit));
  }
  flush();
  return out;
}

export async function runSteps(ctx: AgentCtx, steps: Step[], onProgress?: (done: number, total: number, what: string) => void): Promise<RunReport> {
  const report: RunReport = { counts: {}, problems: [], missing: [], critical: [] };
  const count = (k: string) => { report.counts[k] = (report.counts[k] ?? 0) + 1; };
  // Studio in a Play test refuses every write; once it says so the build stops instead of retrying each of its ~200 ops
  // (round 11 of the owner's test 1, 2026-10-01: a build ground on for 17 minutes while a test was running).
  const op = async (o: StudioOp, ms = 60_000) => {
    const out = await ctx.execStudioOp(o, ms);
    if (!out.ok && /edit mode/i.test(out.error ?? '')) report.stopped = PLAY_TEST_STOP;
    return out;
  };
  const places = steps.filter((s): s is Extract<Step, { kind: 'place' }> => s.kind === 'place');
  let done = 0;
  for (const s of steps) {
    if (report.stopped) return report;
    done += 1;
    if (s.kind === 'place') continue; // placed together below, once every piece is in
    onProgress?.(done, steps.length, s.kind);
    if (s.kind === 'import') {
      const out = await op({ op: 'import_owner_library', gameId: s.ref.game, path: s.ref.path, mode: 'self', parent: s.into, applyServiceProperties: false, studioData: true }, LIBRARY_IMPORT_MS);
      if (out.ok) count('import');
      else { report.missing.push(s.key); report.problems.push(`import ${s.key} (${s.ref.path}): ${clip(out.error)}`); }
      if (!out.ok && /not connected|disconnected/i.test(out.error ?? '')) { report.stopped = 'Studio disconnected'; return report; }
    } else if (s.kind === 'create') {
      // A rerun on the same place replaces what an earlier run made, rather than stacking a second copy.
      await op({ op: 'delete_instances', paths: s.items.map((i) => `${s.parent}.${i.name}`) }).catch(() => undefined);
      let failed: string | undefined;
      for (const b of createBatches(s.parent, s.items)) {
        const out = await op({ op: 'create_instances', items: b.items.map((i) => ({ ...typed(i), parent: b.parent })) }, 120_000);
        if (!out.ok) { failed = clip(out.error); break; }
      }
      if (!failed) count('create');
      else {
        report.problems.push(`create in ${s.parent}: ${failed}`);
        if (s.parent === 'game.Workspace') report.critical.push(`the map was not made: ${failed}`);
        // A game with no screen cannot be played: nothing can be bought (the same live run).
        if (s.parent === 'game.StarterGui') report.critical.push(`the game's screen was not made: ${failed}`);
      }
    } else if (s.kind === 'script') {
      const path = `${s.parent}.${s.name}`;
      await op({ op: 'delete_instances', paths: [path] }).catch(() => undefined);
      const out = await op({ op: 'edit_script', path, source: s.source, create: { className: s.className, parent: s.parent } }, 60_000);
      if (out.ok) count('script'); else report.problems.push(`script ${s.name}: ${clip(out.error)}`);
    } else if (s.kind === 'surface') {
      const out = await op(applySurfaceOp(s.paths, s.surface), 120_000);
      if (out.ok) count('surface'); else report.problems.push(`studs: ${clip(out.error)}`);
    } else if (s.kind === 'set') {
      const props: Record<string, PropValue> = {};
      for (const [k, v] of Object.entries(s.props)) { const pv = propValue(k, v); if (pv) props[k] = pv; }
      const out = await op({ op: 'set_props', path: s.path, props });
      if (out.ok) count('set'); else if (!s.optional) report.problems.push(`set ${s.path}: ${clip(out.error)}`);
    } else if (s.kind === 'hide') {
      const out = await op({ op: 'set_visible', paths: s.paths, visible: false });
      if (out.ok) count('hide'); else report.problems.push(`hide: ${clip(out.error)}`);
    } else if (s.kind === 'delete') {
      // The screen a game had stays when its new one was not made: an old screen beats none.
      if (report.critical.some((c) => c.startsWith("the game's screen")) && s.paths.some((p) => p.startsWith('game.StarterGui.'))) continue;
      // ONE PATH PER OP. The plugin's delete_instances is all-or-nothing: one path that is not there ("SpawnLocation.Texture", on a
      // spawn that has only a Decal) refuses the whole call, and the paths that do exist stay. Round 2's retire step listed both, so
      // the default spawn's star decal was never deleted (round 3, 2026-10-04). An absent path is not a problem.
      let deleted = false;
      for (const path of s.paths) if ((await op({ op: 'delete_instances', paths: [path] })).ok) deleted = true;
      if (deleted) count('delete');
    } else if (s.kind === 'strip') {
      const out = await op({ op: 'strip_descendants', root: s.root, classes: s.classes as ('LocalScript' | 'Script' | 'ModuleScript' | 'Sound')[] });
      if (out.ok) count('strip'); else report.problems.push(`strip ${s.root}: ${clip(out.error)}`);
    }
  }
  for (let i = 0; i < places.length; i += 200) {
    onProgress?.(steps.length, steps.length, 'place');
    const batch = places.slice(i, i + 200).map((p) => ({ from: `game.${p.from}`, parent: `game.${p.parent}`, name: p.name, at: p.at, yaw: p.yaw,
      ...(p.height ? { height: p.height } : {}), ...(p.length ? { length: p.length } : {}), ...(p.along ? { along: p.along } : {}) }));
    const out = await op({ op: 'place_copies', items: batch }, 180_000);
    if (!out.ok) { report.problems.push(`place: ${clip(out.error)}`); report.critical.push(`no props were placed: ${clip(out.error)}`); continue; }
    const data = out.data as { placed?: unknown[]; failed?: { index: number; error: string }[] };
    report.counts.place = (report.counts.place ?? 0) + (data.placed?.length ?? 0);
    for (const f of data.failed ?? []) report.problems.push(`place ${batch[f.index - 1]?.name ?? f.index}: ${clip(f.error)}`);
  }
  return report;
}
