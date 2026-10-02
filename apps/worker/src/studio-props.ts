/**
 * THE PROPERTY VALUES THAT NEVER REACH STUDIO, and why refusing them here is kinder than letting
 * them go.
 *
 * WHAT HAPPENED. The first — and so far only — time this product tried to build something in the
 * owner's own place, on 2026-09-19, the run did `snapshot`, `snapshot`, `get_tree` and then
 * `create_instances`, and the last one came back:
 *
 *     instance props.Position must be a typed property value
 *
 * The model had written `Position` as a bare value instead of the tagged `{t, v}` the wire uses.
 * The tool description says so explicitly and it wrote it wrong anyway, which is what models do to
 * a format often enough that the wire cannot be the only thing checking it.
 *
 * WHAT IT COST, and this is the part worth fixing rather than the mistake itself. The worker
 * forwarded the item unexamined, so the error was produced by the PLUGIN, inside the customer's
 * Studio, after a network round trip — and it landed in the project's operation log as a failed
 * build, where the customer sees it. A malformed field the worker could have read in a microsecond
 * became a visible failure in somebody's game.
 *
 * WHAT THIS DOES. It reads the props before the op leaves, and does one of two things:
 *
 *   NORMALISES what is unambiguous WITHOUT knowing the instance's class. A number is a number, a
 *   boolean is a bool, and a string beginning `Enum.` is an EnumItem; none of those can be anything
 *   else. That is most of what a model gets wrong, and it becomes a successful build.
 *
 *   REFUSES what is not, by name, with the shape it should have had. An array of three numbers is
 *   the interesting case and it is exactly why the wire is tagged: `[1, 0.5, 0]` is a Vector3 for
 *   `Position` and a Color3 for `Color`, and `Size` is a Vector3 on a Part and a UDim2 on a
 *   TextLabel. Guessing would put a colour where a position goes and report success. So it says
 *   what it cannot tell apart, and the model fixes it in the same turn — with no round trip, no
 *   failed op in the log, and nothing touched in the customer's place.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not check that `t` is a type the plugin knows, or that
 * `v` fits it. The plugin's decoder owns that and owns it against the Studio build actually
 * running, which this worker cannot see. Duplicating the table here would create a second answer
 * that drifts — the failure this repository keeps finding. This is a narrow gate for one mistake:
 * a value that is not tagged at all.
 */

export interface TaggedValue {
  t: string;
  v?: unknown;
}

export interface PropNormalisation {
  /** The props as they should go on the wire. */
  props: Record<string, unknown>;
  /** Names this turned into tagged values, with what they became. Worth reporting, not worth failing. */
  normalised: { name: string; t: string }[];
  /** Names it could not tag, each with the sentence the model needs to fix it (`short` is the same without the shared how-to). */
  refusals: { name: string; message: string; short: string }[];
  /** Bare values it typed from the property's own name and class (a coercion, not a guess), for the record. */
  coerced?: { name: string; t: string }[];
  /** Set only by `normaliseItems`: the item list with its props rewritten. */
  items?: unknown[];
}

/** Already on the wire format: an object carrying a string `t`. */
export function isTagged(value: unknown): value is TaggedValue {
  return typeof value === 'object' && value !== null && typeof (value as { t?: unknown }).t === 'string';
}

const ENUM_TEXT = /^Enum\.[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*$/;

/**
 * What an untagged value should be tagged as, or null when only the class could say.
 *
 * `null` for anything structural. An array is the ambiguous case by construction; an object without
 * `t` could be a half-written tagged value or something else entirely, and neither is guessable.
 */
function inferTag(value: unknown): TaggedValue | null {
  if (value === null) return { t: 'nil' };
  if (typeof value === 'boolean') return { t: 'bool', v: value };
  if (typeof value === 'number') return Number.isFinite(value) ? { t: 'number', v: value } : null;
  if (typeof value === 'string') return ENUM_TEXT.test(value) ? { t: 'EnumItem', v: value } : { t: 'string', v: value };
  return null;
}

/** The classes whose Size, Position, Orientation, Color, Material, Shape and surfaces are the BasePart ones. */
const BASE_PART_CLASSES = new Set(['Part', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'SpawnLocation', 'Seat', 'VehicleSeat']);
const LIGHT_CLASSES = new Set(['PointLight', 'SpotLight', 'SurfaceLight']);
/** Plain parts whose Anchored the build leaves to the author. Vehicles and seats are left as written: they may need physics. */
const ANCHOR_DEFAULT_CLASSES = new Set(['Part', 'WedgePart', 'CornerWedgePart', 'TrussPart']);
/** The enum each of these BasePart properties takes, so a bare `Plastic` can only mean Enum.Material.Plastic. */
const BARE_ENUM: Record<string, string> = { Material: 'Material', Shape: 'PartType', TopSurface: 'SurfaceType', BottomSurface: 'SurfaceType' };

/**
 * What a BARE value for this property on this class can only mean, or null when it is still ambiguous.
 *
 * The refusal below stays for what is genuinely ambiguous (an array of three on a class this file does not know). But the
 * largest refusal class measured live was a model writing `"Size": [4, 1, 4]` on a Part, where Size is a Vector3 and nothing
 * else: refusing that cost a step and taught nothing the next batch would not need again. The decision uses the property's
 * NAME and the item's CLASS, both of which are on the wire, and never a request's subject. A colour in 0..255 is read as
 * 0..255 only when every channel is a whole number above nothing a 0..1 colour could not hold; any other mix is refused.
 */
function coerceBare(className: string | undefined, name: string, value: unknown): TaggedValue | null {
  if (!className) return null;
  const part = BASE_PART_CLASSES.has(className);
  if (Array.isArray(value)) {
    if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    const nums = value as number[];
    if (nums.length === 3 && ((part && (name === 'Size' || name === 'Position' || name === 'Orientation')) || (className === 'Attachment' && (name === 'Position' || name === 'Orientation')))) {
      return { t: 'Vector3', v: nums };
    }
    if (nums.length === 3 && name === 'Color' && (part || LIGHT_CLASSES.has(className))) {
      const max = Math.max(...nums);
      if (nums.some((n) => n < 0) || max > 255) return null;
      if (max <= 1) return { t: 'Color3', v: nums };
      return nums.every((n) => Number.isInteger(n)) ? { t: 'Color3', v: nums.map((n) => n / 255) } : null;
    }
    return null;
  }
  if (typeof value === 'string' && part && /^[A-Za-z][A-Za-z0-9_]*$/.test(value) && BARE_ENUM[name]) {
    return { t: 'EnumItem', v: `Enum.${BARE_ENUM[name]}.${value}` };
  }
  return null;
}

/** The how-to, said once per refusal list instead of once per property. */
export const TAGGING_GUIDE =
  'Every property is tagged with its type: write {"t":"Vector3","v":[0,5,0]} for a position, {"t":"Color3","v":[1,0.5,0]} for a colour, {"t":"UDim2","v":[0.5,0,0.1,0]} for GUI size. An array on its own cannot be read here: [1,0.5,0] is a Vector3 for Position and a Color3 for Color, and Size is a Vector3 on a Part and a UDim2 on a TextLabel, so only you know which you meant.';

function shapeOf(value: unknown): string {
  return Array.isArray(value)
    ? `an array of ${value.length}`
    : typeof value === 'object' && value !== null
      ? 'an object with no "t"'
      : typeof value;
}

function refusal(name: string, value: unknown): string {
  // The message names the property, what arrived, and the exact repair — a model reading "must be a
  // typed property value" has to go and remember the format; a model reading this does not.
  return `${name} arrived as ${shapeOf(value)}. ${TAGGING_GUIDE}`;
}

/**
 * The refusal list as ONE message: where each value is, what arrived, then the how-to once. The old message repeated a
 * 600-character sentence per property, so twelve bad Sizes overran the 3000-character tool-result ceiling and the model
 * read a sentence cut off mid-word. The list is capped; the count of the rest is said.
 */
export function describeRefusals(refusals: readonly { name: string; short: string }[], limit = 2400): string {
  const shown: string[] = [];
  let used = 0;
  for (const r of refusals) {
    const line = `${r.name} (${r.short})`;
    if (used + line.length > limit) break;
    shown.push(line);
    used += line.length + 2;
  }
  const more = refusals.length - shown.length;
  const needsGuide = refusals.some((r) => r.short !== 'missing');
  return `${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}.${needsGuide ? ` ${TAGGING_GUIDE}` : ''}`;
}

/** Tag what can be tagged; name what cannot. `className` lets a bare Size or Color on a Part be read as what it can only be. */
export function normaliseProps(props: unknown, className?: string): PropNormalisation {
  const out: PropNormalisation = { props: {}, normalised: [], refusals: [], coerced: [] };
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return out;
  for (const [name, value] of Object.entries(props as Record<string, unknown>)) {
    if (isTagged(value)) {
      out.props[name] = value;
      continue;
    }
    const coerced = coerceBare(className, name, value);
    if (coerced) {
      out.props[name] = coerced;
      out.coerced!.push({ name, t: coerced.t });
      continue;
    }
    const inferred = inferTag(value);
    if (inferred === null) {
      out.refusals.push({ name, message: refusal(name, value), short: shapeOf(value) });
      continue;
    }
    out.props[name] = inferred;
    out.normalised.push({ name, t: inferred.t });
  }
  return out;
}

/**
 * The same pass over a `create_instances` item list, including children.
 *
 * Children are where this matters most: a model that tags the top-level props correctly and forgets
 * inside a nested `children` array produces an item that looks right until Studio reads it.
 * `path` is how a refusal says WHICH one — "items[2].children[0].props.Size" rather than "Size",
 * because an item list of twenty has twenty Sizes in it.
 */
/**
 * Keys a model writes in Roblox's own spelling for the wire's field. Each is UNAMBIGUOUS — `ClassName`
 * can only mean `className` — so it is renamed, not refused. Measured 2026-09-22 (vis-01 street lamp,
 * run after D-RUN-1): the plugin refused two create_instances calls in a row, "className must be a
 * string" and then "path must be a string", because the item schema was an untyped object and the
 * model wrote Roblox's property names. The schema now names the fields; this catches the rest.
 */
const ITEM_KEY_ALIASES: Record<string, string> = {
  ClassName: 'className', Class: 'className', class: 'className', classname: 'className',
  Name: 'name', Parent: 'parent',
  Props: 'props', Properties: 'props', properties: 'props',
  Attributes: 'attributes', Children: 'children',
};

/**
 * A parent given as a tagged Instance or a `{path}` object means its path; anything else is left for the plugin to refuse.
 *
 * The plugin resolves only paths rooted at `game` ('path must start with "game"'). Measured 2026-09-22
 * (coin game, run 76b59615): the first create_instances was refused for exactly that, because this
 * file's own default was the bare 'Workspace' and the model wrote 'Workspace' too. A path whose first
 * segment is not `game` can only mean a child of `game`, so it is rooted there; `workspace` is the
 * Luau global for the Workspace service.
 */
function parentPath(value: unknown): unknown {
  let path: unknown = value;
  if (value && typeof value === 'object') {
    const v = value as { t?: unknown; v?: unknown; path?: unknown };
    if (v.t === 'Instance' && typeof v.v === 'string') path = v.v;
    else if (typeof v.path === 'string') path = v.path;
  }
  if (typeof path !== 'string' || path.length === 0) return path;
  if (path === 'game' || path.startsWith('game.') || path.startsWith('game[')) return path;
  return `game.${path.replace(/^workspace(?=$|[.[])/, 'Workspace')}`;
}

export function normaliseItems(items: unknown, path = 'items'): PropNormalisation {
  const out: PropNormalisation = { props: {}, normalised: [], refusals: [] };
  if (!Array.isArray(items)) return out;
  const topLevel = path === 'items';
  const cleaned = items.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const item = { ...(raw as Record<string, unknown>) };
    const where = `${path}[${index}]`;
    for (const [alias, key] of Object.entries(ITEM_KEY_ALIASES)) {
      if (alias in item && !(key in item)) {
        item[key] = item[alias];
        delete item[alias];
      }
    }
    if (typeof item.className !== 'string' || item.className.length === 0) {
      out.refusals.push({ name: `${where}.className`, short: 'missing', message: `${where} has no className — say which Roblox class to create, e.g. "Part", "Model" or "PointLight".` });
    }
    if (topLevel) {
      // The one default the wire takes without asking: an item with no parent is built in Workspace,
      // which is where a creator looks for what was just built. Children never carry a parent.
      item.parent = item.parent === undefined ? 'game.Workspace' : parentPath(item.parent);
    }
    const className = typeof item.className === 'string' ? item.className : undefined;
    if (item.props !== undefined) {
      const pass = normaliseProps(item.props, className);
      item.props = pass.props;
      out.normalised.push(...pass.normalised.map((n) => ({ ...n, name: `${where}.props.${n.name}` })));
      out.coerced = [...(out.coerced ?? []), ...(pass.coerced ?? []).map((n) => ({ ...n, name: `${where}.props.${n.name}` }))];
      // The location travels with the refusal: `items[2].children[0].props.Size`, not "Size" among twenty Sizes.
      out.refusals.push(...pass.refusals.map((r) => ({ name: `${where}.props.${r.name}`, short: r.short, message: `${where}.props.${r.message}` })));
    }
    // A plain part nobody anchored falls over the moment it exists; audit_build flags it after the fact, so the default is
    // the harness's own rule applied up front. An explicit Anchored (either way) is left exactly as written.
    if (className && ANCHOR_DEFAULT_CLASSES.has(className)) {
      const props = (typeof item.props === 'object' && item.props !== null ? item.props : {}) as Record<string, unknown>;
      if (!('Anchored' in props)) item.props = { ...props, Anchored: { t: 'bool', v: true } };
    }
    if (item.children !== undefined) {
      const kids = normaliseItems(item.children, `${where}.children`);
      item.children = kids.items ?? item.children;
      out.normalised.push(...kids.normalised);
      out.coerced = [...(out.coerced ?? []), ...(kids.coerced ?? [])];
      out.refusals.push(...kids.refusals);
    }
    return item;
  });
  out.items = cleaned;
  return out;
}


// ---------------------------------------------------------------------------------------------
// WHAT ONE create_instances CALL MAY CARRY, and what happens to a batch that carries more.
// ---------------------------------------------------------------------------------------------

/**
 * The plugin's own limits for one create_instances call (apps/apple-plugin/src/Commands.luau: MAX_ITEMS,
 * MAX_CHILDREN_PER_SPEC, MAX_CREATE_NODES, MAX_SNAPSHOT_DEPTH, MAX_PROPS). No number was anywhere the model could
 * see, so it found each by being refused. The description states them once, and an oversize batch of SEPARATE items is
 * now split into sequential calls here; only one item that is itself over a limit cannot be split, and is refused with
 * its index and the limit.
 */
export const CREATE_LIMITS = { items: 120, children: 40, nodes: 400, depth: 12, props: 48 } as const;

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

/** Nodes in one item: itself and every descendant. */
function nodesIn(item: unknown): number {
  const kids = asRecord(item).children;
  return 1 + (Array.isArray(kids) ? kids.reduce((n: number, k: unknown) => n + nodesIn(k), 0) : 0);
}

/** The limits a SINGLE item breaks on its own, named with its index. Splitting into batches cannot help these. */
export function createLimitIssues(items: readonly unknown[]): string[] {
  const issues: string[] = [];
  items.forEach((item, i) => {
    const where = `items[${i}]`;
    const total = nodesIn(item);
    if (total > CREATE_LIMITS.nodes) issues.push(`${where} holds ${total} instances; one call may create at most ${CREATE_LIMITS.nodes} and a single item cannot be split: build it from several items or several calls.`);
    const walk = (node: unknown, depth: number, path: string): void => {
      const n = asRecord(node);
      const kids = Array.isArray(n.children) ? n.children : [];
      const propCount = Object.keys(asRecord(n.props)).length;
      if (propCount > CREATE_LIMITS.props) issues.push(`${path} sets ${propCount} properties; the limit is ${CREATE_LIMITS.props} per instance.`);
      if (kids.length > CREATE_LIMITS.children) issues.push(`${path} has ${kids.length} children; the limit is ${CREATE_LIMITS.children} per instance.`);
      if (depth > CREATE_LIMITS.depth) { issues.push(`${path} is nested ${depth} deep; the limit is ${CREATE_LIMITS.depth}.`); return; }
      kids.forEach((k, j) => walk(k, depth + 1, `${path}.children[${j}]`));
    };
    walk(item, 0, where);
  });
  return issues.slice(0, 6);
}

/** The items as sequential batches that each stay within the per-call item and node limits, in order. */
export function planCreateBatches(items: readonly unknown[]): unknown[][] {
  const batches: unknown[][] = [];
  let current: unknown[] = [];
  let nodes = 0;
  for (const item of items) {
    const size = nodesIn(item);
    if (current.length && (current.length >= CREATE_LIMITS.items || nodes + size > CREATE_LIMITS.nodes)) {
      batches.push(current);
      current = [];
      nodes = 0;
    }
    current.push(item);
    nodes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

// ---------------------------------------------------------------------------------------------
// ONE PATH SPELLING for every Studio tool.
// ---------------------------------------------------------------------------------------------

/** The services a studio path can start at (the plugin's own READ_SERVICES). A closed vocabulary of Roblox services, not of subjects. */
const SERVICE_ROOTS = new Set([
  'Workspace', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer',
  'ReplicatedFirst', 'Lighting', 'SoundService', 'Teams', 'TextChatService', 'MaterialService',
]);

/**
 * `Workspace.Lamp` or `workspace.Lamp` can only mean `game.Workspace.Lamp`. create_instances' own description teaches the
 * bare form and normalises it, but every other tool passed it to a plugin that resolves only paths rooted at `game`, so
 * scatter, set_properties and delete failed on exactly what create_instances had just been told was fine.
 */
export function rootStudioPath(path: string): string {
  const m = /^([A-Za-z]+)(?=$|[.[])/.exec(path);
  if (!m) return path;
  const head = m[1] === 'workspace' ? 'Workspace' : m[1]!;
  return SERVICE_ROOTS.has(head) ? `game.${head}${path.slice(m[1]!.length)}` : path;
}

/** Keys whose string (or list of strings) value is a Studio path. */
const PATH_KEYS = ['path', 'paths', 'parent', 'newParent', 'target', 'targets', 'root', 'template'] as const;

/** The call's path arguments, rooted at `game`; everything else exactly as it came. */
export function normaliseStudioPaths(args: Record<string, unknown>): Record<string, unknown> {
  const fix = (v: unknown): unknown => (typeof v === 'string' ? rootStudioPath(v) : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? rootStudioPath(x) : x)) : v);
  const out: Record<string, unknown> = { ...args };
  for (const key of PATH_KEYS) if (key in out) out[key] = fix(out[key]);
  if (Array.isArray(out.moves)) {
    out.moves = out.moves.map((m) => {
      if (typeof m !== 'object' || m === null) return m;
      const move = { ...(m as Record<string, unknown>) };
      for (const key of ['path', 'newParent'] as const) if (key in move) move[key] = fix(move[key]);
      return move;
    });
  }
  return out;
}
