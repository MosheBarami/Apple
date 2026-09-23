// The Phase A Studio tools (D-VISION-1 tool expansion): find, change many, ask the world, scatter,
// collision groups, more terrain, character rigs, and the user-interface builder and checker.
//
// Each one stands on an OPT-IN plugin operation (plugin-capabilities.ts OPT_IN_OPERATIONS), so a
// plugin that has not reported the operation is never offered the tool. The plugin validates every
// field again; the checks here exist so a malformed call is corrected in the same turn with zero
// operations sent, instead of becoming a failed op in the customer's Studio log.
//
// The bodies live here and the tools are registered ONE BY ONE in tools.ts, because three guards
// find the tool table by parsing that literal (see the web-tools comment there).
import type { GatewayToolDef, StudioOp, UiLayoutDevice } from '@golem/shared';
import { normaliseProps } from './studio-props';
import { compileUi, UI_NODE_KINDS, UI_ANCHORS } from './ui-builder';
import { APPLE_UI_THEME_IDS } from './ui-kit-themes';

/** How a tool body reaches Studio: tools.ts passes its own `op`, tests pass a recorder. */
export type OpCall = (op: StudioOp, timeoutMs?: number) => Promise<unknown>;
type Args = Record<string, unknown>;
type Refusal = { error: string };

const S = (props: Record<string, unknown>, required: string[] = []): unknown => ({ type: 'object', properties: props, required });
const VEC3 = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const REGION = { type: 'object', properties: { min: VEC3, max: VEC3 }, required: ['min', 'max'] };
const WORLD_LIMIT = 1_000_000;
const PATH_CHARS = 320;

const refuse = (message: string): Refusal => ({ error: `${message} Nothing was sent to Studio.` });
const isRefusal = (v: unknown): v is Refusal => !!v && typeof v === 'object' && 'error' in (v as object);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function vec3(v: unknown, label: string, limit = WORLD_LIMIT): [number, number, number] | Refusal {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(finite)) return refuse(`${label} must be [x, y, z] numbers.`);
  if (v.some((n) => Math.abs(n) > limit)) return refuse(`${label} is outside the allowed range (±${limit}).`);
  return [v[0] as number, v[1] as number, v[2] as number];
}

function region(v: unknown, label = 'region'): { min: [number, number, number]; max: [number, number, number] } | Refusal {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return refuse(`${label} must be {min: [x,y,z], max: [x,y,z]}.`);
  const r = v as Args;
  const min = vec3(r.min, `${label}.min`);
  if (isRefusal(min)) return min;
  const max = vec3(r.max, `${label}.max`);
  if (isRefusal(max)) return max;
  if (max.some((n, i) => n <= min[i]!)) return refuse(`${label}.max must be greater than ${label}.min on every axis.`);
  return { min, max };
}

function text(v: unknown, label: string, max: number): string | Refusal {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max) return refuse(`${label} must be 1-${max} characters.`);
  return v.trim();
}

function paths(v: unknown, label: string, max: number): string[] | Refusal {
  if (!Array.isArray(v) || v.length === 0 || v.length > max) return refuse(`${label} must list 1-${max} instance paths.`);
  const seen = new Set<string>();
  for (const [i, p] of v.entries()) {
    if (typeof p !== 'string' || !p.trim() || p.length > PATH_CHARS) return refuse(`${label}[${i}] must be an instance path of 1-${PATH_CHARS} characters.`);
    if (seen.has(p.trim())) return refuse(`${label} lists ${p} more than once.`);
    seen.add(p.trim());
  }
  return [...seen];
}

function integer(v: unknown, label: string, lo: number, hi: number, fallback: number): number | Refusal {
  if (v === undefined) return fallback;
  if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) return refuse(`${label} must be a whole number ${lo}-${hi}.`);
  return v as number;
}

/* ------------------------------------------------------------------ search_instances --- */

const QUERY_FIELDS = {
  root: { type: 'string', description: 'search under this path only (default: every readable service)' },
  name: { type: 'string', description: 'name substring, or a glob with * (case-insensitive)' },
  className: { type: 'string', description: 'exact class, e.g. "Part"' },
  isA: { type: 'string', description: 'class or superclass, e.g. "BasePart", "GuiButton"' },
  tag: { type: 'string', description: 'CollectionService tag' },
  attribute: { type: 'object', properties: { name: { type: 'string' }, equals: {} }, required: ['name'] },
  property: {
    type: 'object',
    properties: { name: { type: 'string' }, op: { type: 'string', enum: ['eq', 'lt', 'gt', 'contains'] }, value: {} },
    required: ['name', 'value'],
    description: 'e.g. {"name":"Transparency","op":"gt","value":0.5} or {"name":"Material","value":"Enum.Material.Neon"}',
  },
};

function compileQuery(a: Args, label: string): Record<string, unknown> | Refusal {
  const q: Record<string, unknown> = {};
  if (a.root !== undefined) {
    const root = text(a.root, `${label}root`, PATH_CHARS);
    if (isRefusal(root)) return root;
    q.root = root;
  }
  for (const [key, max] of [['name', 96], ['className', 64], ['isA', 64], ['tag', 64]] as const) {
    if (a[key] === undefined) continue;
    const value = text(a[key], `${label}${key}`, max);
    if (isRefusal(value)) return value;
    q[key] = value;
  }
  const scalar = (v: unknown) => typeof v === 'string' || typeof v === 'boolean' || finite(v);
  if (a.attribute !== undefined) {
    const at = a.attribute as Args;
    if (!at || typeof at !== 'object' || typeof at.name !== 'string' || !at.name) return refuse(`${label}attribute must be {name, equals?}.`);
    if (at.equals !== undefined && !scalar(at.equals)) return refuse(`${label}attribute.equals must be a string, number or boolean.`);
    q.attribute = at.equals === undefined ? { name: at.name } : { name: at.name, equals: at.equals };
  }
  if (a.property !== undefined) {
    const p = a.property as Args;
    if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name) return refuse(`${label}property must be {name, op?, value}.`);
    const cmp = p.op ?? 'eq';
    if (!['eq', 'lt', 'gt', 'contains'].includes(cmp as string)) return refuse(`${label}property.op must be eq, lt, gt or contains.`);
    if ((cmp === 'lt' || cmp === 'gt') && !finite(p.value)) return refuse(`${label}property.value must be a number for ${cmp}.`);
    if (cmp === 'contains' && typeof p.value !== 'string') return refuse(`${label}property.value must be a string for contains.`);
    if (!scalar(p.value)) return refuse(`${label}property.value must be a string, number or boolean.`);
    q.property = { name: p.name, op: cmp, value: p.value };
  }
  if (!['name', 'className', 'isA', 'tag', 'attribute', 'property'].some((k) => k in q)) {
    return refuse('A search needs at least one of name, className, isA, tag, attribute or property.');
  }
  return q;
}

export const searchInstances = {
  def: {
    name: 'search_instances',
    description:
      'Find instances by name (substring or * glob), className, isA, CollectionService tag, attribute or a property comparison, under one root or the whole place. Returns paths and classes, and says when the result was cut at the limit. Use it instead of walking get_project_tree when you know what you are looking for.',
    parameters: S({ ...QUERY_FIELDS, limit: { type: 'integer', minimum: 1, maximum: 200, description: 'default 50' } }),
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const q = compileQuery(a, '');
    if (isRefusal(q)) return q;
    const limit = integer(a.limit, 'limit', 1, 200, 50);
    if (isRefusal(limit)) return limit;
    return call({ op: 'query_instances', ...(q as object), limit } as StudioOp);
  },
};

/* --------------------------------------------------------------- set_properties_bulk --- */

export const setPropertiesBulk = {
  def: {
    name: 'set_properties_bulk',
    description:
      'Change many instances in ONE undoable step: either `targets` (up to 500 paths) or `query` (a search_instances filter, which must match at most 500). ' +
      '`props` uses the typed format of create_instances; `attributes` are typed too and {"t":"nil"} removes one; `adjust` is up to 16 {property, op: "add"|"mul", value: number or [x,y,z]} applied to number or Vector3 properties (e.g. scale every tree\'s Size by 1.2). ' +
      'Every target is checked before anything changes, so a refusal leaves the place untouched. Returns before/after for the first targets and a count.',
    parameters: S({
      targets: { type: 'array', items: { type: 'string' }, maxItems: 500 },
      query: { type: 'object', properties: QUERY_FIELDS, description: 'a search_instances filter (no limit)' },
      props: { type: 'object', description: 'typed props, e.g. {"Anchored":{"t":"bool","v":true}}' },
      attributes: { type: 'object' },
      adjust: {
        type: 'array',
        maxItems: 16,
        items: { type: 'object', properties: { property: { type: 'string' }, op: { type: 'string', enum: ['add', 'mul'] }, value: {} }, required: ['property', 'op', 'value'] },
      },
    }),
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    if ((a.targets === undefined) === (a.query === undefined)) return refuse('Give either targets or query, exactly one of them.');
    const out: Record<string, unknown> = { op: 'set_props_bulk' };
    if (a.targets !== undefined) {
      const t = paths(a.targets, 'targets', 500);
      if (isRefusal(t)) return t;
      out.targets = t;
    } else {
      if (!a.query || typeof a.query !== 'object' || Array.isArray(a.query)) return refuse('query must be a search_instances filter object.');
      const q = compileQuery(a.query as Args, 'query.');
      if (isRefusal(q)) return q;
      out.query = q;
    }
    if (a.props !== undefined) {
      const pass = normaliseProps(a.props);
      if (pass.refusals.length) return refuse(pass.refusals.map((r) => r.message).join(' '));
      if (Object.keys(pass.props).length) out.props = pass.props;
    }
    if (a.attributes !== undefined) {
      if (!a.attributes || typeof a.attributes !== 'object' || Array.isArray(a.attributes)) return refuse('attributes must be an object of typed values.');
      if (Object.keys(a.attributes).length) out.attributes = a.attributes;
    }
    if (a.adjust !== undefined) {
      if (!Array.isArray(a.adjust) || a.adjust.length > 16) return refuse('adjust must be a list of at most 16 {property, op, value}.');
      for (const [i, raw] of a.adjust.entries()) {
        const e = raw as Args;
        if (!e || typeof e !== 'object' || typeof e.property !== 'string' || !e.property) return refuse(`adjust[${i}].property must be a property name.`);
        if (e.op !== 'add' && e.op !== 'mul') return refuse(`adjust[${i}].op must be add or mul.`);
        const vector = Array.isArray(e.value) && e.value.length === 3 && e.value.every(finite);
        if (!finite(e.value) && !vector) return refuse(`adjust[${i}].value must be a number or [x, y, z].`);
        const factors = vector ? (e.value as number[]) : [e.value as number];
        if (e.op === 'mul' && factors.some((f) => f < 0 || f > 1000)) return refuse(`adjust[${i}] mul factors must be 0-1000.`);
      }
      if (a.adjust.length) out.adjust = a.adjust;
    }
    if (!out.props && !out.attributes && !out.adjust) return refuse('Give props, attributes or adjust — there is nothing to change.');
    return call(out as StudioOp, 60_000);
  },
};

/* --------------------------------------------------------------------- spatial_query --- */

const SPATIAL_ACTIONS = ['raycast', 'find_ground', 'bounds', 'check_placement', 'overlap', 'find_flat'] as const;

export const spatialQuery = {
  def: {
    name: 'spatial_query',
    description:
      'Ask the 3D world before placing things. raycast {origin, direction ≤5000 studs}; find_ground {position}: the surface straight below; bounds {path}: centre, size, bottomY/topY; ' +
      'check_placement {path}: what it overlaps and whether it floats (gapBelow); overlap {center, size}: parts inside a box; find_flat {region, samples ≤256, maxSlopeDeg}: flat ground points. ' +
      '`exclude` lists paths the rays ignore. Use find_ground / check_placement so trees, coins and props sit ON the ground instead of floating or sinking.',
    parameters: S({
      action: { type: 'string', enum: [...SPATIAL_ACTIONS] },
      origin: VEC3,
      direction: VEC3,
      position: VEC3,
      path: { type: 'string' },
      center: VEC3,
      size: VEC3,
      region: REGION,
      samples: { type: 'integer', minimum: 4, maximum: 256 },
      maxSlopeDeg: { type: 'number', minimum: 0, maximum: 60 },
      exclude: { type: 'array', items: { type: 'string' }, maxItems: 50 },
    }, ['action']),
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const action = a.action as (typeof SPATIAL_ACTIONS)[number];
    if (!SPATIAL_ACTIONS.includes(action)) return refuse(`action must be one of ${SPATIAL_ACTIONS.join(', ')}.`);
    const out: Record<string, unknown> = { op: 'spatial_query', action };
    if (a.exclude !== undefined) {
      const ex = paths(a.exclude, 'exclude', 50);
      if (isRefusal(ex)) return ex;
      out.exclude = ex;
    }
    const need = (key: string, limit?: number) => {
      const v = vec3(a[key], key, limit);
      if (!isRefusal(v)) out[key] = v;
      return v;
    };
    if (action === 'raycast') {
      const o = need('origin');
      if (isRefusal(o)) return o;
      const d = need('direction', 5000);
      if (isRefusal(d)) return d;
      const length = Math.hypot(...d);
      if (length <= 0 || length > 5000) return refuse('direction length must be > 0 and ≤ 5000 studs.');
    } else if (action === 'find_ground') {
      const p = need('position');
      if (isRefusal(p)) return p;
    } else if (action === 'bounds' || action === 'check_placement') {
      const p = text(a.path, 'path', PATH_CHARS);
      if (isRefusal(p)) return p;
      out.path = p;
    } else if (action === 'overlap') {
      const c = need('center');
      if (isRefusal(c)) return c;
      const s = need('size', 2048);
      if (isRefusal(s)) return s;
      if (s.some((n) => n <= 0)) return refuse('size must be positive on every axis.');
    } else {
      const r = region(a.region);
      if (isRefusal(r)) return r;
      out.region = r;
      const samples = integer(a.samples, 'samples', 4, 256, 64);
      if (isRefusal(samples)) return samples;
      out.samples = samples;
      if (a.maxSlopeDeg !== undefined) {
        if (!finite(a.maxSlopeDeg) || a.maxSlopeDeg < 0 || a.maxSlopeDeg > 60) return refuse('maxSlopeDeg must be 0-60.');
        out.maxSlopeDeg = a.maxSlopeDeg;
      }
    }
    return call(out as StudioOp);
  },
};

/* ------------------------------------------------------------------ scatter_instances --- */

export const scatterInstances = {
  def: {
    name: 'scatter_instances',
    description:
      'Place up to 200 copies of an existing BasePart or Model (`template`, which must contain no scripts) on the ground inside `region`, deterministically by `seed`: each copy is dropped by a ray onto whatever is below. ' +
      'Optional onMaterial (only land on these Enum.Material surfaces, e.g. ["Enum.Material.Grass"]), minSpacing (studs between copies), scale [min, max] (0.2-5), randomYaw (default true), parent (default the template\'s parent). ' +
      'Returns how many were placed and why any were not (no ground, wrong material, too close). Use it for forests, rocks, coins, grass tufts.',
    parameters: S({
      template: { type: 'string' },
      count: { type: 'integer', minimum: 1, maximum: 200 },
      region: REGION,
      onMaterial: { type: 'array', items: { type: 'string' }, maxItems: 12 },
      minSpacing: { type: 'number', minimum: 0, maximum: 500 },
      scale: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
      randomYaw: { type: 'boolean' },
      seed: { type: 'integer' },
      parent: { type: 'string' },
    }, ['template', 'count', 'region']),
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const template = text(a.template, 'template', PATH_CHARS);
    if (isRefusal(template)) return template;
    const count = integer(a.count, 'count', 1, 200, 20);
    if (isRefusal(count)) return count;
    const r = region(a.region);
    if (isRefusal(r)) return r;
    const out: Record<string, unknown> = { op: 'scatter', template, count, region: r };
    if (a.onMaterial !== undefined) {
      if (!Array.isArray(a.onMaterial) || a.onMaterial.length === 0 || a.onMaterial.length > 12
        || !a.onMaterial.every((m) => typeof m === 'string' && /^Enum\.Material\.[A-Za-z]+$/.test(m))) {
        return refuse('onMaterial must list 1-12 values like "Enum.Material.Grass".');
      }
      out.onMaterial = a.onMaterial;
    }
    if (a.minSpacing !== undefined) {
      if (!finite(a.minSpacing) || a.minSpacing < 0 || a.minSpacing > 500) return refuse('minSpacing must be 0-500 studs.');
      out.minSpacing = a.minSpacing;
    }
    if (a.scale !== undefined) {
      const s = a.scale;
      if (!Array.isArray(s) || s.length !== 2 || !s.every(finite)) return refuse('scale must be [min, max] within 0.2-5.');
      const [lo, hi] = s as [number, number];
      if (lo < 0.2 || hi > 5 || lo > hi) return refuse('scale must be [min, max] within 0.2-5.');
      out.scale = s;
    }
    if (a.randomYaw !== undefined) {
      if (typeof a.randomYaw !== 'boolean') return refuse('randomYaw must be true or false.');
      out.randomYaw = a.randomYaw;
    }
    if (a.seed !== undefined) {
      if (!Number.isInteger(a.seed) || Math.abs(a.seed as number) > 2 ** 31) return refuse('seed must be a whole number.');
      out.seed = a.seed;
    }
    if (a.parent !== undefined) {
      const p = text(a.parent, 'parent', PATH_CHARS);
      if (isRefusal(p)) return p;
      out.parent = p;
    }
    return call(out as StudioOp, 60_000);
  },
};

/* ------------------------------------------------------------------- collision_groups --- */

const COLLISION_ACTIONS = ['register', 'set_collidable', 'assign', 'list'] as const;

export const collisionGroups = {
  def: {
    name: 'collision_groups',
    description:
      'Physics collision groups. register {group}; set_collidable {group, other, collidable}: whether two groups collide (e.g. players pass through each other, or NPCs ignore a door); assign {group, paths ≤500}: put parts (or every part under a model) in a group; list: the groups and every pair that does NOT collide. Roblox allows at most 32 groups.',
    parameters: S({
      action: { type: 'string', enum: [...COLLISION_ACTIONS] },
      group: { type: 'string', maxLength: 100 },
      other: { type: 'string', maxLength: 100 },
      collidable: { type: 'boolean' },
      paths: { type: 'array', items: { type: 'string' }, maxItems: 500 },
    }, ['action']),
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const action = a.action as (typeof COLLISION_ACTIONS)[number];
    if (!COLLISION_ACTIONS.includes(action)) return refuse(`action must be one of ${COLLISION_ACTIONS.join(', ')}.`);
    if (action === 'list') return call({ op: 'collision_groups_list' });
    const group = text(a.group, 'group', 100);
    if (isRefusal(group)) return group;
    if (action === 'register') return call({ op: 'collision_groups', action, group });
    if (action === 'set_collidable') {
      const other = text(a.other, 'other', 100);
      if (isRefusal(other)) return other;
      if (typeof a.collidable !== 'boolean') return refuse('collidable must be true or false.');
      return call({ op: 'collision_groups', action, group, other, collidable: a.collidable });
    }
    const p = paths(a.paths, 'paths', 500);
    if (isRefusal(p)) return p;
    return call({ op: 'collision_groups', action, group, paths: p }, 60_000);
  },
  /** list reads; register of an existing group changes nothing. */
  mutates: (result: unknown): boolean => {
    const r = (result && typeof result === 'object' ? result : {}) as Args;
    return typeof r.action === 'string' && r.alreadyRegistered !== true;
  },
};

/* ------------------------------------------------------------ shape_terrain, read_terrain --- */

const SHAPE_ACTIONS = ['fill_cylinder', 'fill_wedge', 'clear_region', 'smooth', 'heightmap', 'appearance'] as const;
const MATERIAL = /^Enum\.Material\.[A-Za-z][A-Za-z0-9_]*$/;
const unitColour = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((n) => finite(n) && n >= 0 && n <= 1);

export const shapeTerrain = {
  def: {
    name: 'shape_terrain',
    description:
      'More terrain shapes and the look of Terrain, beside edit_terrain (at most 65,536 voxels per call, one undo step). ' +
      'fill_cylinder {center, height, radius, material}: pillars, mesas, towers; fill_wedge {center, size, rotationY?, material}: ramps and slopes; clear_region {min, max}; ' +
      'smooth {min, max, strength 0-1}: soften blocky edges; heightmap {min, max, material?, subMaterial?, octaves 1-6, amplitude 0-1, scale 8-2048, seed}: rolling hills from seeded noise; ' +
      'appearance {water?: {color [r,g,b] 0-1, transparency, reflectance, waveSize, waveSpeed}, decoration?: grass blades on/off, materialColors?: {"Grass": [r,g,b]}}.',
    parameters: S({
      action: { type: 'string', enum: [...SHAPE_ACTIONS] },
      center: VEC3,
      size: VEC3,
      height: { type: 'number' },
      radius: { type: 'number' },
      rotationY: { type: 'number' },
      min: VEC3,
      max: VEC3,
      material: { type: 'string', description: 'e.g. Enum.Material.Rock' },
      subMaterial: { type: 'string' },
      strength: { type: 'number' },
      octaves: { type: 'integer' },
      amplitude: { type: 'number' },
      scale: { type: 'number' },
      seed: { type: 'integer' },
      water: { type: 'object' },
      decoration: { type: 'boolean' },
      materialColors: { type: 'object' },
    }, ['action']),
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const action = a.action as (typeof SHAPE_ACTIONS)[number];
    if (!SHAPE_ACTIONS.includes(action)) return refuse(`action must be one of ${SHAPE_ACTIONS.join(', ')}.`);
    const out: Record<string, unknown> = { op: 'terrain_shape', action };
    const vec = (key: string) => {
      const v = vec3(a[key], key);
      if (!isRefusal(v)) out[key] = v;
      return v;
    };
    const mat = (key: string, required: boolean): Refusal | null => {
      if (a[key] === undefined) return required ? refuse(`${key} is required, e.g. "Enum.Material.Rock".`) : null;
      if (typeof a[key] !== 'string' || !MATERIAL.test(a[key] as string)) return refuse(`${key} must look like "Enum.Material.Rock".`);
      out[key] = a[key];
      return null;
    };
    const num = (key: string, lo: number, hi: number, required: boolean): Refusal | null => {
      if (a[key] === undefined) return required ? refuse(`${key} is required.`) : null;
      if (!finite(a[key]) || (a[key] as number) < lo || (a[key] as number) > hi) return refuse(`${key} must be ${lo}-${hi}.`);
      out[key] = a[key];
      return null;
    };
    const box = () => {
      const r = region({ min: a.min, max: a.max }, 'min/max');
      if (isRefusal(r)) return r;
      out.min = r.min;
      out.max = r.max;
      return null;
    };
    let bad: Refusal | null | [number, number, number] = null;
    if (action === 'fill_cylinder') {
      bad = vec('center');
      if (isRefusal(bad)) return bad;
      bad = num('height', 0.001, 1024, true) ?? num('radius', 0.001, 512, true) ?? mat('material', true);
    } else if (action === 'fill_wedge') {
      bad = vec('center');
      if (isRefusal(bad)) return bad;
      bad = vec('size');
      if (isRefusal(bad)) return bad;
      if ((out.size as number[]).some((n) => n <= 0)) return refuse('size must be positive on every axis.');
      bad = num('rotationY', -360, 360, false) ?? mat('material', true);
    } else if (action === 'clear_region') {
      bad = box();
    } else if (action === 'smooth') {
      bad = box() ?? num('strength', 0.001, 1, false);
    } else if (action === 'heightmap') {
      bad = box() ?? mat('material', false) ?? mat('subMaterial', false) ?? num('amplitude', 0, 1, false) ?? num('scale', 8, 2048, false);
      if (!bad && a.octaves !== undefined) {
        const o = integer(a.octaves, 'octaves', 1, 6, 3);
        if (isRefusal(o)) return o;
        out.octaves = o;
      }
      if (!bad && a.seed !== undefined) {
        if (!Number.isInteger(a.seed)) return refuse('seed must be a whole number.');
        out.seed = a.seed;
      }
    } else {
      if (a.water === undefined && a.decoration === undefined && a.materialColors === undefined) return refuse('appearance needs water, decoration or materialColors.');
      if (a.water !== undefined) {
        const w = a.water as Args;
        if (!w || typeof w !== 'object' || Array.isArray(w)) return refuse('water must be an object.');
        if (w.color !== undefined && !unitColour(w.color)) return refuse('water.color must be [r, g, b] with channels 0-1.');
        for (const k of ['transparency', 'reflectance']) if (w[k] !== undefined && !(finite(w[k]) && w[k] >= 0 && w[k] <= 1)) return refuse(`water.${k} must be 0-1.`);
        for (const k of ['waveSize', 'waveSpeed']) if (w[k] !== undefined && !(finite(w[k]) && w[k] >= 0 && w[k] <= 100)) return refuse(`water.${k} must be 0-100.`);
        out.water = w;
      }
      if (a.decoration !== undefined) {
        if (typeof a.decoration !== 'boolean') return refuse('decoration must be true or false.');
        out.decoration = a.decoration;
      }
      if (a.materialColors !== undefined) {
        const mc = a.materialColors as Args;
        if (!mc || typeof mc !== 'object' || Array.isArray(mc) || Object.keys(mc).length > 16) return refuse('materialColors must map up to 16 material names to [r, g, b].');
        for (const [k, v] of Object.entries(mc)) {
          if (!/^[A-Za-z]+$/.test(k) || !unitColour(v)) return refuse(`materialColors.${k} must be a material name such as Grass mapped to [r, g, b] 0-1.`);
        }
        out.materialColors = mc;
      }
    }
    if (isRefusal(bad)) return bad;
    return call(out as StudioOp, 60_000);
  },
};

export const readTerrain = {
  def: {
    name: 'read_terrain',
    description:
      'What Terrain holds inside {min, max} (at most 65,536 voxels): a material histogram and how full the region is. Never returns raw voxels. Use it to check that a lake has water, a hill exists, or a build area is clear.',
    parameters: S({ min: VEC3, max: VEC3 }, ['min', 'max']),
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const r = region({ min: a.min, max: a.max }, 'min/max');
    if (isRefusal(r)) return r;
    return call({ op: 'terrain_read', min: r.min, max: r.max });
  },
};

/* ------------------------------------------------------------------------- create_rig --- */

const BODY_KEYS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
const SCALE_BOUNDS: Record<string, [number, number]> = {
  height: [0.9, 1.05], width: [0.7, 1], depth: [0.7, 1], head: [0.95, 1], proportion: [0, 1], bodyType: [0, 1],
};

export const createRig = {
  def: {
    name: 'create_rig',
    description:
      'Add a Roblox character (R15 by default, or R6) built by Studio from a description: body colours [r,g,b] 0-1 per part and body scales only — no clothing, accessories or animations. ' +
      'npc: true anchors it and hides its name tag, for shopkeepers and quest givers. Use it for NPCs and mannequins instead of assembling limbs from Parts.',
    parameters: S({
      rigType: { type: 'string', enum: ['R15', 'R6'] },
      name: { type: 'string', maxLength: 96 },
      position: VEC3,
      parent: { type: 'string', description: 'default game.Workspace' },
      bodyColors: { type: 'object', description: `keys ${BODY_KEYS.join(', ')}; values [r,g,b] 0-1` },
      scale: { type: 'object', description: 'height 0.9-1.05, width 0.7-1, depth 0.7-1, head 0.95-1, proportion 0-1, bodyType 0-1' },
      npc: { type: 'boolean' },
      displayName: { type: 'string', maxLength: 60 },
    }),
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const out: Record<string, unknown> = { op: 'create_rig' };
    if (a.rigType !== undefined) {
      if (a.rigType !== 'R15' && a.rigType !== 'R6') return refuse('rigType must be R15 or R6.');
      out.rigType = a.rigType;
    }
    if (a.name !== undefined) {
      const n = text(a.name, 'name', 96);
      if (isRefusal(n)) return n;
      out.name = n;
    }
    if (a.position !== undefined) {
      const p = vec3(a.position, 'position');
      if (isRefusal(p)) return p;
      out.position = p;
    }
    if (a.parent !== undefined) {
      const p = text(a.parent, 'parent', PATH_CHARS);
      if (isRefusal(p)) return p;
      out.parent = p;
    }
    if (a.bodyColors !== undefined) {
      const c = a.bodyColors as Args;
      if (!c || typeof c !== 'object' || Array.isArray(c)) return refuse('bodyColors must be an object.');
      for (const [k, v] of Object.entries(c)) {
        if (!BODY_KEYS.includes(k)) return refuse(`bodyColors keys are ${BODY_KEYS.join(', ')}.`);
        if (!unitColour(v)) return refuse(`bodyColors.${k} must be [r, g, b] with channels 0-1.`);
      }
      out.bodyColors = c;
    }
    if (a.scale !== undefined) {
      const s = a.scale as Args;
      if (!s || typeof s !== 'object' || Array.isArray(s)) return refuse('scale must be an object.');
      for (const [k, v] of Object.entries(s)) {
        const b = SCALE_BOUNDS[k];
        if (!b) return refuse(`scale keys are ${Object.keys(SCALE_BOUNDS).join(', ')}.`);
        if (!finite(v) || v < b[0] || v > b[1]) return refuse(`scale.${k} must be ${b[0]}-${b[1]}.`);
      }
      out.scale = s;
    }
    if (a.npc !== undefined) {
      if (typeof a.npc !== 'boolean') return refuse('npc must be true or false.');
      out.npc = a.npc;
    }
    if (a.displayName !== undefined) {
      const d = text(a.displayName, 'displayName', 60);
      if (isRefusal(d)) return d;
      out.displayName = d;
    }
    return call(out as StudioOp, 60_000);
  },
};

/* -------------------------------------------------------- check_ui_layout, build_ui --- */

const DEVICES: readonly UiLayoutDevice[] = ['phone_portrait', 'phone_landscape', 'tablet', 'desktop', 'console_tv'];

/** The plugin reports every element per device; the model needs the verdict and the issues. */
function layoutSummary(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || 'error' in (raw as object)) return raw;
  const r = raw as Args;
  const devices = Array.isArray(r.devices) ? (r.devices as Args[]) : [];
  return {
    screen: r.screen,
    verdict: r.verdict,
    issues: r.issues,
    devices: devices.map((d) => ({ device: d.device, size: d.size, elements: d.elements, issues: d.issues })),
    ...(r.verdict === 'pass'
      ? { note: 'Laid out at each device size: nothing offscreen or clipped, text fits, touch targets and contrast pass. This is geometry, not how it looks — render_view or play_check shows that.' }
      : { note: 'Fix each issue (resize, reposition, shorten text, raise contrast) and check again before saying the UI works on these devices.' }),
  };
}

function devicesArg(v: unknown): UiLayoutDevice[] | undefined | Refusal {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length === 0 || v.length > 5 || !v.every((d) => DEVICES.includes(d as UiLayoutDevice))) {
    return refuse(`devices must list 1-5 of ${DEVICES.join(', ')}.`);
  }
  return [...new Set(v as UiLayoutDevice[])];
}

export const checkUiLayout = {
  def: {
    name: 'check_ui_layout',
    description:
      'Lay a ScreenGui out at real device sizes WITHOUT changing the place (a temporary copy in Studio\'s own UI layer, always removed) and report elements that are offscreen or clipped, text that does not fit, overlapping buttons, touch targets under 44 px on phone and tablet, low text contrast, and buttons under the top bar. ' +
      'devices: phone_portrait, phone_landscape, tablet, desktop, console_tv (default phone_landscape + desktop). Run it after building any screen.',
    parameters: S({
      screen: { type: 'string', description: 'a ScreenGui path, e.g. game.StarterGui.ShopGui' },
      devices: { type: 'array', items: { type: 'string', enum: [...DEVICES] }, maxItems: 5 },
    }, ['screen']),
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const screen = text(a.screen, 'screen', PATH_CHARS);
    if (isRefusal(screen)) return screen;
    const devices = devicesArg(a.devices);
    if (isRefusal(devices)) return devices;
    return layoutSummary(await call({ op: 'ui_layout_check', screen, ...(devices ? { devices } : {}) }, 60_000));
  },
};

export const buildUi = {
  def: {
    name: 'build_ui',
    description:
      'Build a whole screen of game UI in ONE call from a small layout tree, styled from a genre theme, then lay it out on phone and desktop and report problems. ' +
      `Node = {kind, id?, text?, style?, size?, anchor?, value?, cell?, gap?, children?}. kinds: ${UI_NODE_KINDS.join(', ')}. ` +
      'panel and card are styled containers that stack children vertically; row / column stack without a background; grid lays children in cells (cell [w, h] fractions); scroll is a scrolling column; ' +
      'text {text, style: title|body|muted}; button {text, style: primary|secondary|danger}; bar {value 0-1}: a progress/health bar; spacer. ' +
      `size [w, h] is a FRACTION (0.02-1) of the parent, never pixels. anchor places a top-level node: ${UI_ANCHORS.join(', ')}. ids become instance names, so play_check_ui can press "game.StarterGui.<screen>.<id path>". ` +
      'The screen name must be new (an existing ScreenGui of that name is refused, not replaced). Images are not supported yet: use text glyphs. Every size is scale-based and text scales with a min/max, so the same tree fits every device.',
    parameters: S({
      screen: { type: 'string', description: 'the ScreenGui name, e.g. "ShopGui" (created in game.StarterGui)' },
      theme: { type: 'string', enum: [...APPLE_UI_THEME_IDS] },
      tree: { description: 'one node, or a list of up to 8 top-level nodes', anyOf: [{ type: 'object' }, { type: 'array', items: { type: 'object' }, maxItems: 8 }] },
      safeArea: { type: 'boolean', description: 'keep content inside the device safe area and below the top bar (default true)' },
      devices: { type: 'array', items: { type: 'string', enum: [...DEVICES] }, maxItems: 5 },
    }, ['screen', 'theme', 'tree']),
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const compiled = compileUi({ screen: a.screen, theme: a.theme, tree: a.tree, safeArea: a.safeArea });
    if ('error' in compiled) return refuse(compiled.error);
    const devices = devicesArg(a.devices);
    if (isRefusal(devices)) return devices;
    // create_instances does not rename on a clash, so a second "ShopGui" would sit beside the first
    // and every path into it would be ambiguous. Look first; nothing is built if the name is taken.
    const existing = await call({ op: 'query_instances', root: 'game.StarterGui', className: 'ScreenGui', name: compiled.screenName, limit: 50 });
    if (isRefusal(existing)) return { ...existing, note: 'Could not check whether the screen name is free, so nothing was built.' };
    const taken = ((existing as Args).matches as Array<{ path?: unknown }> | undefined ?? [])
      .some((m) => typeof m.path === 'string' && m.path.endsWith(`StarterGui.${compiled.screenName}`));
    if (taken) return refuse(`game.StarterGui.${compiled.screenName} already exists. Choose a new screen name, or delete the old screen first if this one replaces it.`);
    const made = await call({ op: 'create_instances', items: [compiled.item] } as StudioOp, 60_000);
    if (isRefusal(made)) return made;
    const created = (made as Args).created;
    const screenPath = Array.isArray(created) && typeof created[0] === 'string' ? created[0] : `game.StarterGui.${compiled.screenName}`;
    const layout = await call({ op: 'ui_layout_check', screen: screenPath, ...(devices ? { devices } : {}) }, 60_000);
    const checked = !isRefusal(layout);
    return {
      built: screenPath,
      instances: compiled.count,
      buttons: compiled.buttons.map((b) => `${screenPath}.${b}`),
      projectMutated: true,
      layout: checked ? layoutSummary(layout) : { notChecked: (layout as Refusal).error },
      next: checked && (layout as Args).verdict === 'pass'
        ? 'The screen is built and lays out cleanly. To prove its buttons work, wire them with a LocalScript, then press them with play_check_ui.'
        : 'The screen is built. Resolve the layout issues (or say the layout was not checked) before calling it done.',
      ...(made && typeof made === 'object' && 'propIssues' in (made as object) ? { propIssues: (made as Args).propIssues } : {}),
    };
  },
};

/* ------------------------------------------------------------------------ play_check_ui --- */

export const PLAY_CHECK_UI_PRESS_LIMIT = 5;

/** Argument checks for play_check_ui; the summary itself is playtest.ts summarisePlayCheck. */
export function playCheckUiOp(a: Args): StudioOp | Refusal {
  const seconds = Math.min(15, Math.max(3, Math.round(Number(a.seconds) || 5)));
  const rawTouch = a.touch === undefined ? [] : a.touch;
  if (!Array.isArray(rawTouch) || rawTouch.length > 5 || rawTouch.some((p) => typeof p !== 'string' || p.length > PATH_CHARS)) {
    return refuse('touch must be a list of at most 5 instance paths inside game.Workspace.');
  }
  const press = paths(a.press, 'press', PLAY_CHECK_UI_PRESS_LIMIT);
  if (isRefusal(press)) return press;
  if (press.some((p) => !/^(game\.)?StarterGui\./.test(p))) {
    return refuse('Each press path must be a GuiButton inside a ScreenGui in game.StarterGui, e.g. "game.StarterGui.ShopGui.Panel.Buy".');
  }
  return { op: 'play_check_ui', seconds, ...(rawTouch.length ? { touch: rawTouch as string[] } : {}), press };
}

export const PLAY_CHECK_UI_DEF: GatewayToolDef = {
  name: 'play_check_ui',
  description:
    "play_check that also PRESSES on-screen buttons: starts a real Test session with one player, optionally walks onto `touch` parts, then clicks each `press` button (a GuiButton inside a ScreenGui in game.StarterGui, up to 5, in order) the way a player's click does, and reports for each whether it was found, visible and actually activated, the leaderstats after the presses, what the screen shows afterwards, and client and server errors. " +
    'Use it to prove a UI flow works (Shop → Buy → coins go down) before you say so. A button that was not activated has not been tested.',
  parameters: S({
    press: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: PLAY_CHECK_UI_PRESS_LIMIT, description: 'e.g. ["game.StarterGui.ShopGui.Panel.Open", "game.StarterGui.ShopGui.Panel.Items.Sword.Buy"]' },
    seconds: { type: 'number', description: '3-15, default 5: how long the player stays in before the touches and presses' },
    touch: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  }, ['press']),
};

export { isRefusal as isPhaseARefusal };
