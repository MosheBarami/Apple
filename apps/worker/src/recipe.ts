/**
 * THE RECIPE INTERPRETER (M5 5.0). It runs the blocks the model selected in this run, in dependency order, through the
 * plugin's ops, and checks each step as it goes.
 *
 * THE RULE (plan section 3): the system may execute a block the model selected in this run; it may never pick one. So
 * `runBlocks` refuses, before any op is sent, a block that was not selected, a selected block whose dependency was not
 * selected, and an id that is not a block. It never adds a block on its own.
 *
 * After each step it runs the block's checks bound to that step (`after`); checks without one run after the last step,
 * and `play_clean` runs once at the very end, for everything. When a check that names a parameter fails, the step is run
 * again with a corrected value from `repair` (plan-fill.ts names the failing parameter to the model), at most twice; a
 * create step first removes what it created. Every failure is reported with what the check describes and what was found.
 */
import type { OpResult, PropValue, StudioOp } from '@studpilot/shared';
import { BLOCKS, PALETTE } from './blocks.generated.ts';
import type { Block, BlockCheck, RecipeStep } from './block-types.ts';
import { validateParams } from './block-schema.ts';
import { summarisePlayCheck } from './playtest.ts';
import { propValue, typed } from './typed-spec.ts';
import { expandKit } from './studkit.ts';

export const MAX_REPAIRS = 2;
const NAME = '[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*){0,2}';
const SLOT = new RegExp(`\\{\\{(${NAME})\\}\\}`, 'g');
const EXACT_SLOT = new RegExp(`^\\{\\{(${NAME})\\}\\}$`);

/**
 * A slot's value: `name`; `item.field` inside a repeated (`each`) entry; `colour.shade` for a palette colour parameter
 * (and `item.colour.shade` for an entry's colour).
 */
const lookup = (params: Record<string, unknown>, name: string): unknown => {
  const [head, ...rest] = name.split('.');
  let v: unknown = params[head!];
  for (const part of rest) v = typeof v === 'string' ? PALETTE[v]?.[part] : (v as Record<string, unknown> | undefined)?.[part];
  return v;
};

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const rgb = (v: unknown): unknown => {
  const m = typeof v === 'string' ? HEX.exec(v) : null;
  return m ? [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255] : v;
};

/** Hex colours written inside typed values (a gradient's keypoints, a typed Color3) as the 0..1 triples the plugin takes. */
function hexToRgb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hexToRgb);
  if (!value || typeof value !== 'object') return value;
  const o = value as Record<string, unknown>;
  if (o.t === 'Color3') return { t: 'Color3', v: rgb(o.v) };
  if (o.t === 'ColorSequence' && Array.isArray(o.v)) return { t: 'ColorSequence', v: o.v.map((k) => (Array.isArray(k) ? [k[0], rgb(k[1])] : k)) };
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hexToRgb(v)]));
}

export interface RunDeps {
  exec(op: StudioOp, timeoutMs?: number): Promise<OpResult>;
  /** A corrected parameter set after `param` failed `problem`, or null. plan-fill.ts's repairParam. */
  repair?(blockId: string, param: string, problem: string, params: Record<string, unknown>): Promise<Record<string, unknown> | null>;
}

export interface StepReport { id: string; ok: boolean; attempts: number; error?: string }
export interface CheckReport { block: string; id: string; ok: boolean; describes: string; found?: string }
export interface BlockReport { id: string; ok: boolean; params: Record<string, unknown>; steps: StepReport[]; checks: CheckReport[]; error?: string }
export interface RunReport { ok: boolean; refused?: string; blocks: BlockReport[]; checks: CheckReport[] }

/** The selected blocks in an order where each comes after what it depends on, or why they cannot run. Pure. */
export function runOrder(selected: string[], blocks: Record<string, Block> = BLOCKS): { ok: true; order: string[] } | { ok: false; refused: string } {
  const unknown = selected.filter((id) => !blocks[id]);
  if (unknown.length) return { ok: false, refused: `not a block: ${unknown.join(', ')}` };
  const chosen = new Set(selected);
  for (const id of selected) {
    const missing = blocks[id]!.block.depends.filter((d) => !chosen.has(d));
    if (missing.length) return { ok: false, refused: `${id} needs ${missing.join(', ')}, which this run did not select` };
  }
  const order: string[] = [];
  const visit = (id: string) => {
    if (order.includes(id)) return;
    for (const dep of blocks[id]!.block.depends) visit(dep);
    order.push(id);
  };
  [...new Set(selected)].forEach(visit);
  return { ok: true, order };
}

/**
 * A recipe or check value with its `{{slots}}` filled. Pure; throws when a value would add a path segment.
 *
 * An object in a list with `"each": "<list parameter>"` is repeated once per entry of that list, with `{{item.<field>}}`
 * the entry's field and `{{index}}` its position from 1 (so a card template becomes one real card per item).
 */
/** Fields that name a place in the game: a value slotted into one may not add a path segment. */
const PATH_FIELDS = new Set(['path', 'parent', 'paths', 'name']);

export function fill(value: unknown, params: Record<string, unknown>, key = ''): unknown {
  if (typeof value === 'string') {
    const exact = EXACT_SLOT.exec(value);
    if (exact && !PATH_FIELDS.has(key)) return lookup(params, exact[1]!);
    return value.replace(SLOT, (_, name: string) => {
      const v = String(lookup(params, name));
      if (PATH_FIELDS.has(key) && /[.[\]]/.test(v)) throw new Error(`parameter ${name} ("${v}") would change a path`);
      return v;
    });
  }
  if (Array.isArray(value)) {
    return value.flatMap((v) => {
      const each = v && typeof v === 'object' && !Array.isArray(v) ? (v as { each?: unknown }).each : undefined;
      if (typeof each !== 'string') return [fill(v, params, key)];
      const { each: _, ...template } = v as Record<string, unknown>;
      const list = params[each];
      return Array.isArray(list) ? list.map((item, i) => fill(template, { ...params, item, index: i + 1 }, key)) : [];
    });
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, params, k)]));
  return value;
}

/** A parameter as a Luau literal, so a value can never become code. Pure. */
export function luauLiteral(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v).replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => `\\u{${h}}`);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `{${v.map(luauLiteral).join(', ')}}`;
  if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `[${luauLiteral(k)}] = ${luauLiteral(x)}`).join(', ')}}`;
  return 'nil';
}

export function fillSource(source: string, params: Record<string, unknown>): string {
  return source.replace(SLOT, (_, name: string) => luauLiteral(lookup(params, name)));
}

function typedProps(props: Record<string, unknown>): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(props)) { const p = propValue(k, v); if (p) out[k] = p; }
  return out;
}

/** The ops one step sends. Pure. */
export function stepOps(step: RecipeStep, block: Block, params: Record<string, unknown>): StudioOp[] {
  // StudKit components (studkit.ts) become plain specs after the slots are filled: the look is the kit's, never a parameter's.
  const s = hexToRgb(expandKit(fill(step, params))) as RecipeStep;
  switch (s.op) {
    case 'create_instances':
      return [{ op: 'create_instances', items: (s.items as Array<{ parent: string } & Parameters<typeof typed>[0]>).map((item) => ({ ...typed(item), parent: item.parent })) }];
    case 'set_props':
      return [{ op: 'set_props', path: s.path, props: typedProps(s.props) }];
    case 'edit_script':
      return [{ op: 'edit_script', path: s.path, source: fillSource(block.sources[s.file] ?? '', params), create: s.create }];
    case 'clone_instances':
      return [{ op: 'clone_instances', paths: s.paths, ...(s.parent ? { parent: s.parent } : {}) }];
  }
}

/** What a create step made, so a re-run can remove it first. Pure. */
function createdPaths(op: StudioOp): string[] {
  return op.op === 'create_instances' ? op.items.map((i) => `${i.parent}.${i.name}`) : [];
}

const props = (r: OpResult): Record<string, unknown> => {
  const d = r.data as { props?: Record<string, unknown> } | undefined;
  return d?.props ?? {};
};

function sameValue(found: unknown, want: PropValue | undefined): boolean {
  const f = found as { t?: string; v?: unknown } | undefined;
  if (!want || !f || typeof f !== 'object') return false;
  const close = (a: unknown, b: unknown): boolean =>
    typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-3
      : Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => close(x, b[i]))
        : a === b;
  return close(f.v, 'v' in want ? want.v : undefined);
}

/** Runs one check. `found` says what the place showed when it fails. */
export async function runCheck(check: BlockCheck, params: Record<string, unknown>, deps: RunDeps): Promise<{ ok: boolean; found?: string }> {
  const c = fill(check, params) as BlockCheck;
  switch (c.kind) {
    case 'exists': {
      const r = await deps.exec({ op: 'get_instance', path: c.path }, 15_000);
      return r.ok ? { ok: true } : { ok: false, found: `${c.path} is not there (${r.error ?? 'not found'})` };
    }
    case 'prop': {
      const r = await deps.exec({ op: 'get_instance', path: c.path }, 15_000);
      if (!r.ok) return { ok: false, found: `${c.path} is not there (${r.error ?? 'not found'})` };
      const found = props(r)[c.prop];
      return sameValue(found, propValue(c.prop, c.equals)) ? { ok: true } : { ok: false, found: `${c.prop} is ${JSON.stringify((found as { v?: unknown })?.v ?? null)}` };
    }
    case 'script_has': {
      const r = await deps.exec({ op: 'read_script', path: c.path }, 15_000);
      const source = (r.data as { source?: unknown } | undefined)?.source;
      if (!r.ok || typeof source !== 'string') return { ok: false, found: `${c.path} could not be read (${r.error ?? 'no source'})` };
      return source.includes(c.contains) ? { ok: true } : { ok: false, found: `${c.path} does not contain the expected code` };
    }
    case 'play_clean': {
      const r = await deps.exec({ op: 'play_check', seconds: 8 }, 120_000);
      if (!r.ok) return { ok: false, found: `the play test did not run (${r.error ?? 'failed'})` };
      const s = summarisePlayCheck(r.data);
      const errors = [...s.clientErrors, ...s.serverErrors];
      return errors.length ? { ok: false, found: errors.slice(0, 3).join(' | ') } : { ok: true };
    }
  }
}

/**
 * Runs the selected blocks with their parameters (from plan-fill.ts). `params` may only name selected blocks. Nothing
 * runs when the selection is refused.
 */
export async function runBlocks(input: {
  selected: string[];
  params: Record<string, Record<string, unknown>>;
  deps: RunDeps;
  blocks?: Record<string, Block>;
}): Promise<RunReport> {
  const blocks = input.blocks ?? BLOCKS;
  const deps = input.deps;
  const extra = Object.keys(input.params).filter((id) => !input.selected.includes(id));
  if (extra.length) return { ok: false, refused: `parameters for blocks this run did not select: ${extra.join(', ')}`, blocks: [], checks: [] };
  const plan = runOrder(input.selected, blocks);
  if (!plan.ok) return { ok: false, refused: plan.refused, blocks: [], checks: [] };

  const reports: BlockReport[] = [];
  const finalChecks: Array<{ block: string; check: BlockCheck; params: Record<string, unknown> }> = [];
  const failed = new Set<string>();
  for (const id of plan.order) {
    const block = blocks[id]!;
    const valid = validateParams(block.block, input.params[id]);
    if (!valid.ok) { reports.push({ id, ok: false, params: {}, steps: [], checks: [], error: valid.errors.join('; ') }); failed.add(id); continue; }
    let params = valid.params;
    const report: BlockReport = { id, ok: true, params, steps: [], checks: [] };
    reports.push(report);
    const blockedBy = block.block.depends.filter((d) => failed.has(d));
    if (blockedBy.length) { report.ok = false; report.error = `not run: ${blockedBy.join(', ')} failed`; failed.add(id); continue; }

    const last = block.recipe.steps.at(-1)?.id;
    for (const step of block.recipe.steps) {
      const due = block.checks.filter((c) => c.kind !== 'play_clean' && (c.after === step.id || (c.after === undefined && step.id === last)));
      const stepReport: StepReport = { id: step.id, ok: false, attempts: 0 };
      report.steps.push(stepReport);
      let made: string[] = [];
      let results: Array<{ c: BlockCheck; r: { ok: boolean; found?: string } }> = [];
      for (;;) {
        stepReport.attempts += 1;
        if (made.length) await deps.exec({ op: 'delete_instances', paths: made }, 20_000).catch(() => undefined);
        let ops: StudioOp[];
        try { ops = stepOps(step, block, params); } catch (e) { stepReport.error = String((e as Error).message); break; }
        made = ops.flatMap(createdPaths);
        let opError: string | undefined;
        for (const op of ops) {
          const r = await deps.exec(op, 60_000);
          if (!r.ok) { opError = `${op.op} failed: ${r.error ?? 'no reason given'}`; break; }
        }
        if (opError) { stepReport.error = opError; results = []; break; }
        results = [];
        for (const c of due) results.push({ c, r: await runCheck(c, params, deps) });
        const failing = results.find((x) => !x.r.ok);
        if (!failing) { stepReport.ok = true; break; }
        const { c, r } = failing;
        const problem = `${c.describes}: ${r.found ?? 'failed'}`;
        if (!c.param || !deps.repair || stepReport.attempts > MAX_REPAIRS) { stepReport.error = problem; break; }
        const next = await deps.repair(id, c.param, problem, params);
        const revalid = next ? validateParams(block.block, next) : null;
        if (!revalid?.ok) { stepReport.error = problem; break; }
        params = revalid.params;
        report.params = params;
      }
      for (const c of due) {
        const r = results.find((x) => x.c === c)?.r ?? { ok: false, found: `not run: ${stepReport.error ?? 'the step failed'}` };
        report.checks.push({ block: id, id: c.id, ok: r.ok, describes: c.describes, ...(r.ok ? {} : { found: r.found }) });
      }
      if (!stepReport.ok) { report.ok = false; break; }
    }
    if (!report.ok) { failed.add(id); continue; }
    for (const c of block.checks) if (c.kind === 'play_clean') finalChecks.push({ block: id, check: c, params });
  }

  // One play test proves every block that asked for it: they run together in the place.
  const checks: CheckReport[] = [];
  if (finalChecks.length) {
    const r = await runCheck(finalChecks[0]!.check, finalChecks[0]!.params, input.deps);
    for (const f of finalChecks) checks.push({ block: f.block, id: f.check.id, ok: r.ok, describes: f.check.describes, ...(r.ok ? {} : { found: r.found }) });
  }
  return { ok: reports.every((b) => b.ok) && checks.every((c) => c.ok), blocks: reports, checks };
}
