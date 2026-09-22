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
  /** Names it could not tag, each with the sentence the model needs to fix it. */
  refusals: { name: string; message: string }[];
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

function refusal(name: string, value: unknown): string {
  const shape = Array.isArray(value)
    ? `an array of ${value.length}`
    : typeof value === 'object' && value !== null
      ? `an object with no "t"`
      : typeof value;
  // The message names the property, what arrived, and the exact repair — a model reading "must be a
  // typed property value" has to go and remember the format; a model reading this does not.
  return `${name} arrived as ${shape}. Every property is tagged with its type: write {"t":"Vector3","v":[0,5,0]} for a position, {"t":"Color3","v":[1,0.5,0]} for a colour, {"t":"UDim2","v":[0.5,0,0.1,0]} for GUI size. An array on its own cannot be read — [1,0.5,0] is a Vector3 for Position and a Color3 for Color, and Size is a Vector3 on a Part and a UDim2 on a TextLabel, so only you know which you meant.`;
}

/** Tag what can be tagged; name what cannot. */
export function normaliseProps(props: unknown): PropNormalisation {
  const out: PropNormalisation = { props: {}, normalised: [], refusals: [] };
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return out;
  for (const [name, value] of Object.entries(props as Record<string, unknown>)) {
    if (isTagged(value)) {
      out.props[name] = value;
      continue;
    }
    const inferred = inferTag(value);
    if (inferred === null) {
      out.refusals.push({ name, message: refusal(name, value) });
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
      out.refusals.push({ name: `${where}.className`, message: `${where} has no className — say which Roblox class to create, e.g. "Part", "Model" or "PointLight".` });
    }
    if (topLevel) {
      // The one default the wire takes without asking: an item with no parent is built in Workspace,
      // which is where a creator looks for what was just built. Children never carry a parent.
      item.parent = item.parent === undefined ? 'game.Workspace' : parentPath(item.parent);
    }
    if (item.props !== undefined) {
      const pass = normaliseProps(item.props);
      item.props = pass.props;
      out.normalised.push(...pass.normalised.map((n) => ({ ...n, name: `${where}.props.${n.name}` })));
      out.refusals.push(...pass.refusals.map((r) => ({ name: `${where}.props.${r.name}`, message: r.message })));
    }
    if (item.children !== undefined) {
      const kids = normaliseItems(item.children, `${where}.children`);
      item.children = kids.items ?? item.children;
      out.normalised.push(...kids.normalised);
      out.refusals.push(...kids.refusals);
    }
    return item;
  });
  out.items = cleaned;
  return out;
}
