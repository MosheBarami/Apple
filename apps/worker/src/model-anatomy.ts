/**
 * model_anatomy: what a PLACED model is made of, read from the place, so behaviour can be attached to the right part.
 *
 * A library or Creator Store model arrives with its scripts and sounds stripped and with whatever names its author gave
 * the parts ("Part001", "Smooth Block Model" four times). To add the behaviour the user asked for the agent needs the part
 * graph: where each part is and how big, what is joined to what, which parts rest against which (a hinge lives on an edge
 * where one part rests on another), which way a positive angle would carry a part, and what is already clickable,
 * touchable, playing or lit. This reads all of that from the existing read-only `get_tree` op, so it needs no plugin
 * release, and it reports MEASUREMENTS. It does not say what a part "is" (a lid, a door): the agent looks at the geometry
 * and the names and decides. Nothing here knows a subject.
 *
 * `parseTree` is also what add_behaviour resolves paths with, so a path means the same thing in both tools, including the
 * `Name#2` form for the second of several siblings with one name (Roblox allows them, and every other tool refuses to
 * address such a part by name).
 */
import type { AgentCtx } from './tools';
import {
  AXES, AXIS_NAMES, boxEdges, boxPoint, cframeOf, dominantAxis, edgeSamples, pointToBoxDistance, positiveCarries,
  round, round3, vec3Of, vectorToWorld, type BoxEdge, type CF, type Vec3,
} from './model-geometry';
import { parseConfigSource, BEHAVIOUR_MODULE } from './behaviour-config';
import { parseInstancePath } from './effects';

// ----------------------------------------------------------------------------------------------------------- classes

export const PART_CLASSES = new Set([
  'Part', 'MeshPart', 'UnionOperation', 'NegateOperation', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'SpawnLocation', 'Seat', 'VehicleSeat', 'SkateboardPlatform',
]);
const JOINT_CLASSES = new Set(['Weld', 'ManualWeld', 'Motor6D', 'Motor', 'Snap', 'Rotate', 'RotateP', 'RotateV', 'WeldConstraint']);
const CONSTRAINT_CLASSES = new Set([
  'HingeConstraint', 'BallSocketConstraint', 'RodConstraint', 'RopeConstraint', 'SpringConstraint', 'PrismaticConstraint', 'CylindricalConstraint',
  'UniversalConstraint', 'AlignPosition', 'AlignOrientation',
]);
const LIGHT_CLASSES = new Set(['PointLight', 'SpotLight', 'SurfaceLight']);
const SCRIPT_CLASSES = new Set(['Script', 'LocalScript', 'ModuleScript']);

export const isPartClass = (c: string): boolean => PART_CLASSES.has(c);
export const isLightClass = (c: string): boolean => LIGHT_CLASSES.has(c);

// -------------------------------------------------------------------------------------------------------------- tree

/** A path segment relative to the model: a name, or the nth child of that name when several share it. */
export type Seg = string | { name: string; nth: number };

export interface TNode {
  name: string;
  className: string;
  /** The plugin's own path for it. Identical for same-named siblings. */
  path: string;
  /** Relative to the model root (the root's is empty). */
  segs: Seg[];
  /** The path with `#k` written into any name several siblings share: the only spelling that names this node alone. */
  address: string;
  /** Its name is shared with a sibling. */
  ambiguous: boolean;
  props: Record<string, unknown>;
  children: TNode[];
  parent: TNode | null;
  depth: number;
  /** Per level below the root, which of the same-named siblings it is (1-based): what an instance reference's `o` ends with. */
  ordinals: number[];
}

export interface ModelTree {
  root: TNode;
  nodes: TNode[];
  truncated: boolean;
  byPath: Map<string, TNode[]>;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function segText(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? `.${name}` : `["${name}"]`;
}

/** A `get_tree` answer as a navigable tree, or why it could not be read. */
export function parseTree(data: unknown): ModelTree | { error: string } {
  const rootRaw = obj(obj(data).root);
  const rootPath = str(rootRaw.path);
  if (!rootPath || !str(rootRaw.class)) return { error: 'the place answered with no tree for that path' };
  const nodes: TNode[] = [];
  const byPath = new Map<string, TNode[]>();
  let truncated = obj(data).truncated === true;

  const build = (raw: Record<string, unknown>, parent: TNode | null, seg: Seg | null, ordinal: number, ambiguous: boolean): TNode => {
    const name = str(raw.name) ?? '?';
    const node: TNode = {
      name,
      className: str(raw.class) ?? '?',
      path: str(raw.path) ?? `${parent?.path ?? 'game'}${segText(name)}`,
      segs: parent && seg ? [...parent.segs, seg] : [],
      address: '',
      ambiguous,
      props: obj(raw.props),
      children: [],
      parent,
      depth: parent ? parent.depth + 1 : 0,
      ordinals: parent ? [...parent.ordinals, ordinal] : [],
    };
    node.address = parent
      ? `${parent.address}${segText(ambiguous ? `${name}#${ordinal}` : name)}`
      : node.path;
    nodes.push(node);
    byPath.set(node.path, [...(byPath.get(node.path) ?? []), node]);
    if (raw.truncated === true || typeof raw.moreChildren === 'number') truncated = true;
    const kids = Array.isArray(raw.children) ? raw.children.map(obj) : [];
    const seen = new Map<string, number>();
    const total = new Map<string, number>();
    for (const k of kids) { const n = str(k.name) ?? '?'; total.set(n, (total.get(n) ?? 0) + 1); }
    for (const k of kids) {
      const n = str(k.name) ?? '?';
      const nth = (seen.get(n) ?? 0) + 1;
      seen.set(n, nth);
      const dup = (total.get(n) ?? 1) > 1;
      node.children.push(build(k, node, dup ? { name: n, nth } : n, nth, dup));
    }
    return node;
  };
  const root = build(rootRaw, null, null, 1, false);
  return { root, nodes, truncated, byPath };
}

/** Where a path (as the agent writes it) lands in the tree, or why not. `Name#k` picks the kth of several same-named siblings. */
export function findNode(tree: ModelTree, path: string, parseSegments: (p: string) => string[] | null): TNode | { error: string } {
  // A path may be written relative to the model (`Cover`, `Group.Cover`, `["Smooth Block Model#2"]`), the way the reports show them.
  const trimmed = String(path ?? '').trim();
  if (trimmed && !/^game\b/i.test(trimmed) && trimmed !== '(the model)') path = `${tree.root.path}${trimmed.startsWith('[') ? '' : '.'}${trimmed}`;
  else if (trimmed === '(the model)') path = tree.root.path;
  const want = parseSegments(path);
  const have = parseSegments(tree.root.path);
  if (!want || !have) return { error: `${path} is not a path (game.Workspace.Model.Part, or game.Workspace["Model Name"].Part)` };
  if (want.length < have.length || have.some((s, i) => want[i] !== s)) return { error: `${path} is not inside ${tree.root.path}` };
  let at = tree.root;
  for (const text of want.slice(have.length)) {
    const exact = at.children.filter((c) => c.name === text);
    if (exact.length === 1) { at = exact[0]!; continue; }
    const hashed = /^(.*)#(\d+)$/.exec(text);
    if (exact.length === 0 && hashed) {
      const same = at.children.filter((c) => c.name === hashed[1]);
      const nth = Number(hashed[2]);
      if (same.length === 0) return { error: `${at.address} has no child named ${hashed[1]}${near(at, hashed[1]!)}` };
      if (nth < 1 || nth > same.length) return { error: `${at.address} has ${same.length} children named ${hashed[1]}; ${text} is out of range (use #1 to #${same.length})` };
      at = same[nth - 1]!;
      continue;
    }
    if (exact.length > 1) {
      return { error: `${at.address} has ${exact.length} children named ${text}; say which one with ${text}#1 to ${text}#${exact.length} (model_anatomy lists each one's address)` };
    }
    return { error: `${at.address} has no child named ${text}${near(at, text)}` };
  }
  return at;
}

function near(at: TNode, name: string): string {
  const lower = name.toLowerCase();
  const names = [...new Set(at.children.map((c) => c.name))];
  const close = names.filter((n) => n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase())).slice(0, 5);
  const shown = (close.length ? close : names).slice(0, 8);
  return shown.length ? ` (it has: ${shown.join(', ')}${names.length > shown.length ? ', …' : ''})` : ' (it has no children)';
}

/** The node an instance-typed property points at, using the sibling ordinals the plugin attaches to ambiguous references. */
function refTarget(tree: ModelTree, prop: unknown): TNode | null {
  const p = obj(prop);
  const path = str(p.v);
  if (!path) return null;
  const hits = tree.byPath.get(path);
  if (!hits || hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;
  const o = Array.isArray(p.o) ? (p.o as unknown[]).filter((n): n is number => typeof n === 'number') : null;
  if (!o) return null;
  return hits.find((h) => h.depth <= o.length && h.ordinals.every((n, i) => n === o[o.length - h.depth + i])) ?? null;
}

// ---------------------------------------------------------------------------------------------------------- analysis

export interface PartRec {
  i: number;
  node: TNode;
  cf: CF;
  size: Vec3;
  centre: Vec3;
}

export interface Hinge {
  axis: 'x' | 'y' | 'z';
  /** For add_behaviour swing: hinge.pivot, as -1..1 of each half-size of the part's own box. */
  pivot: Vec3;
  world: { pivot: Vec3; axis: Vec3 };
  edgeLength: number;
  /** The share of this edge (3 samples) that rests against another part. */
  restsOn: number;
  supports: string[];
  /** Which way the part's centre goes for a positive angle, and so (opposite) for a negative one. */
  positiveCarries: string | null;
  negativeCarries: string | null;
  /** Which side of the whole model the edge is on. */
  edgeSide: string | null;
}

export interface Joint { class: string; name: string; a: number; b: number }

export interface Anatomy {
  parts: PartRec[];
  joints: Joint[];
  /** Part indexes that hang from each part through joints, away from the root part. */
  rides: Map<number, number[]>;
  joinedTo: Map<number, number[]>;
  contacts: Map<number, number[]>;
  rootPart: number | null;
  bounds: { center: Vec3; size: Vec3 } | null;
  partsTruncated: boolean;
}

const MAX_PARTS = 250;
const hex = (c: unknown): string | null => {
  const v = vec3Of(c);
  if (!v) return null;
  return '#' + v.map((n) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0')).join('');
};
const bool = (p: Record<string, unknown>, k: string): boolean | undefined => {
  const v = obj(p[k]).v ?? p[k];
  return typeof v === 'boolean' ? v : undefined;
};
const num = (p: Record<string, unknown>, k: string): number | undefined => {
  const v = obj(p[k]).v ?? p[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

function partRec(node: TNode, i: number): PartRec | null {
  const size = vec3Of(node.props.Size);
  if (!size) return null;
  let cf = cframeOf(node.props.CFrame);
  if (!cf) {
    const pos = vec3Of(node.props.Position);
    if (!pos) return null;
    cf = [pos[0], pos[1], pos[2], 1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  return { i, node, cf, size, centre: [cf[0]!, cf[1]!, cf[2]!] };
}

function corners(p: PartRec): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if (x === 0 && y === 0 && z === 0) continue;
    out.push(boxPoint(p.cf, p.size, [x, y, z]));
  }
  return out;
}

const touchTolerance = (a: PartRec, b: PartRec): number => 0.12 + 0.01 * Math.min(Math.max(...a.size), Math.max(...b.size));

function boxesTouch(a: PartRec, b: PartRec): boolean {
  const tol = touchTolerance(a, b);
  for (const p of corners(a)) if (pointToBoxDistance(p, b.cf, b.size) <= tol) return true;
  for (const p of corners(b)) if (pointToBoxDistance(p, a.cf, a.size) <= tol) return true;
  return false;
}

export function analyse(tree: ModelTree): Anatomy {
  const parts: PartRec[] = [];
  let partsTruncated = false;
  for (const n of tree.nodes) {
    if (!isPartClass(n.className)) continue;
    const rec = partRec(n, parts.length + 1);
    if (!rec) continue;
    if (parts.length >= MAX_PARTS) { partsTruncated = true; break; }
    parts.push(rec);
  }
  const byNode = new Map<TNode, PartRec>(parts.map((p) => [p.node, p]));

  // ---- joints
  const joints: Joint[] = [];
  const addJoint = (n: TNode, a: TNode | null, b: TNode | null) => {
    const pa = a && byNode.get(a), pb = b && byNode.get(b);
    if (pa && pb && pa !== pb) joints.push({ class: n.className, name: n.name, a: pa.i, b: pb.i });
  };
  for (const n of tree.nodes) {
    if (JOINT_CLASSES.has(n.className)) {
      addJoint(n, refTarget(tree, n.props.Part0), refTarget(tree, n.props.Part1));
    } else if (CONSTRAINT_CLASSES.has(n.className)) {
      addJoint(n, refTarget(tree, n.props.Attachment0)?.parent ?? null, refTarget(tree, n.props.Attachment1)?.parent ?? null);
    }
  }
  const joinedTo = new Map<number, number[]>();
  for (const j of joints) {
    joinedTo.set(j.a, [...new Set([...(joinedTo.get(j.a) ?? []), j.b])]);
    joinedTo.set(j.b, [...new Set([...(joinedTo.get(j.b) ?? []), j.a])]);
  }

  // ---- the root part: the PrimaryPart, else the biggest anchored part, else the biggest
  const volume = (p: PartRec) => p.size[0] * p.size[1] * p.size[2];
  const primary = tree.root.className === 'Model' ? refTarget(tree, tree.root.props.PrimaryPart) : null;
  let rootRec: PartRec | undefined = primary ? byNode.get(primary) : undefined;
  if (!rootRec && parts.length) {
    const anchored = parts.filter((p) => bool(p.node.props, 'Anchored') === true);
    rootRec = [...(anchored.length ? anchored : parts)].sort((a, b) => volume(b) - volume(a))[0];
  }

  // ---- what hangs from what: breadth-first through the joints, away from the root part
  const rides = new Map<number, number[]>();
  if (rootRec) {
    const seen = new Set<number>([rootRec.i]);
    const parentOf = new Map<number, number>();
    const queue = [rootRec.i];
    while (queue.length) {
      const at = queue.shift()!;
      for (const next of joinedTo.get(at) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        parentOf.set(next, at);
        queue.push(next);
      }
    }
    for (const [child] of parentOf) {
      let up = parentOf.get(child);
      while (up !== undefined) {
        rides.set(up, [...(rides.get(up) ?? []), child]);
        up = parentOf.get(up);
      }
    }
  }

  // ---- what rests against what
  const contacts = new Map<number, number[]>();
  for (let x = 0; x < parts.length; x++) {
    for (let y = x + 1; y < parts.length; y++) {
      if (boxesTouch(parts[x]!, parts[y]!)) {
        contacts.set(parts[x]!.i, [...(contacts.get(parts[x]!.i) ?? []), parts[y]!.i]);
        contacts.set(parts[y]!.i, [...(contacts.get(parts[y]!.i) ?? []), parts[x]!.i]);
      }
    }
  }

  // ---- bounds (world axes)
  let bounds: Anatomy['bounds'] = null;
  if (parts.length) {
    const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) for (const q of corners(p)) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, q[k]!); hi[k] = Math.max(hi[k]!, q[k]!); }
    bounds = { center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
  }
  return { parts, joints, rides, joinedTo, contacts, rootPart: rootRec?.i ?? null, bounds, partsTruncated };
}

/** Hinge candidates for one part: its edges that rest against another part, best first, and the free ends when nothing does. */
export function hingeCandidates(a: Anatomy, part: PartRec, limit = 6): Hinge[] {
  const ridesWith = new Set(a.rides.get(part.i) ?? []);
  const others = a.parts.filter((q) => q !== part && !ridesWith.has(q.i));
  const model = a.bounds?.center ?? part.centre;
  const make = (edge: BoxEdge, restsOn: number, supports: string[]): Hinge => {
    const axisWorld = vectorToWorld(part.cf, AXES[edge.axis]);
    const pivotWorld = boxPoint(part.cf, part.size, edge.pivot);
    const plus = positiveCarries(pivotWorld, axisWorld, part.centre);
    const flip = (s: string | null) => (s ? `${s[0] === '+' ? '-' : '+'}${s.slice(1)}` : null);
    return {
      axis: edge.axis,
      pivot: edge.pivot,
      world: { pivot: round3(pivotWorld), axis: round3(axisWorld) },
      edgeLength: round(part.size[AXIS_NAMES.indexOf(edge.axis)]!, 2),
      restsOn: round(restsOn, 2),
      supports,
      positiveCarries: plus,
      negativeCarries: flip(plus),
      edgeSide: dominantAxis([pivotWorld[0] - model[0], pivotWorld[1] - model[1], pivotWorld[2] - model[2]]),
    };
  };

  const scored = boxEdges().map((edge) => {
    const samples = edgeSamples(part.cf, part.size, edge);
    const supports = new Set<string>();
    let resting = 0;
    for (const s of samples) {
      let hit = false;
      for (const q of others) {
        if (pointToBoxDistance(s, q.cf, q.size) <= touchTolerance(part, q)) { hit = true; supports.add(q.node.name); }
      }
      if (hit) resting += 1;
    }
    return { edge, restsOn: resting / 3, supports: [...supports].slice(0, 4), length: part.size[AXIS_NAMES.indexOf(edge.axis)]! };
  });
  const resting = scored.filter((s) => s.restsOn > 0).sort((x, y) => y.restsOn - x.restsOn || y.length - x.length);
  const out = resting.slice(0, limit).map((s) => make(s.edge, s.restsOn, s.supports));
  if (out.length === 0) {
    // Nothing rests against it: offer the two ends of its longest side, turning about its thinnest.
    const order = [0, 1, 2].sort((x, y) => part.size[y]! - part.size[x]!);
    const long = order[0]!, thin = order[2]!;
    for (const end of [-1, 1]) {
      const pivot: Vec3 = [0, 0, 0];
      pivot[long] = end;
      out.push(make({ axis: AXIS_NAMES[thin]!, pivot }, 0, []));
    }
  }
  return out;
}

// ----------------------------------------------------------------------------------------------------------- report

export interface AnatomyReport {
  model: string;
  class: string;
  partCount: number;
  [k: string]: unknown;
}

/**
 * A tool result is cut at 3000 characters by runTool (MAX_RESULT_CHARS) and re-sent on every later step, so the report FITS under
 * that on its own instead of being sliced mid-JSON: it sheds the least useful detail in a fixed order and says what it shed.
 */
export const REPORT_BUDGET = 2900;

/** A node's path relative to the model, which every tool here also accepts in place of the full path. */
export function relPath(tree: ModelTree, n: TNode): string {
  if (n === tree.root) return '(the model)';
  const rest = n.address.slice(tree.root.address.length);
  return rest.startsWith('.') ? rest.slice(1) : rest;
}

function partView(tree: ModelTree, a: Anatomy, p: PartRec, names: (i: number) => string, centre: Vec3): Record<string, unknown> {
  const n = p.node;
  const props = n.props;
  const kids = n.children;
  const prompt = kids.find((k) => k.className === 'ProximityPrompt');
  const sounds = kids.filter((k) => k.className === 'Sound').map((k) => k.name);
  const lights = kids.filter((k) => isLightClass(k.className)).map((k) => k.name);
  const emitters = kids.filter((k) => k.className === 'ParticleEmitter').map((k) => k.name);
  const view: Record<string, unknown> = { i: p.i, name: n.name };
  const path = relPath(tree, n);
  if (path !== n.name) view.path = path;
  if (n.className !== 'Part') view.class = n.className;
  view.size = round3(p.size);
  view.at = round3([p.centre[0] - centre[0], p.centre[1] - centre[1], p.centre[2] - centre[2]]);
  if (bool(props, 'Anchored') === false) view.anchored = false;
  const material = str(obj(props.Material).v ?? props.Material)?.replace(/^Enum\.Material\./, '');
  const colour = hex(props.Color);
  if (material || colour) view.look = [material, colour].filter(Boolean).join(' ');
  const transparency = num(props, 'Transparency');
  if (transparency) view.transparency = round(transparency, 2);
  if (bool(props, 'CanCollide') === false) view.canCollide = false;
  if (bool(props, 'CanTouch') === false) view.canTouch = false;
  if (bool(props, 'CanQuery') === false) view.canQuery = false;
  if (kids.some((k) => k.className === 'ClickDetector')) view.clickable = true;
  if (prompt) view.prompt = str(obj(prompt.props.ActionText).v ?? prompt.props.ActionText) ?? true;
  if (sounds.length) view.sounds = sounds;
  if (lights.length) view.lights = lights;
  if (emitters.length) view.emitters = emitters;
  const joined = a.joinedTo.get(p.i);
  if (joined?.length) view.joinedTo = joined.slice(0, 6).map(names);
  const hangs = a.rides.get(p.i);
  if (hangs?.length) view.hangsFromIt = hangs.slice(0, 8).map(names);
  const touching = a.contacts.get(p.i);
  if (touching?.length) view.restsAgainst = touching.slice(0, 6).map(names);
  return view;
}

const hingeView = (h: Hinge) => ({
  axis: h.axis, pivot: h.pivot, at: h.world.pivot, restsOn: h.restsOn, supports: h.supports,
  positiveCarries: h.positiveCarries, negativeCarries: h.negativeCarries, edgeSide: h.edgeSide,
});

export interface ReportOptions { focus?: string; maxParts?: number; parseSegments: (p: string) => string[] | null; existing?: { id: string; verb: string }[]; budget?: number }

export function report(tree: ModelTree, opts: ReportOptions): AnatomyReport | { error: string } {
  const a = analyse(tree);
  if (a.parts.length === 0) return { error: `${tree.root.path} contains no parts to read (a Model with BaseParts, or a part itself, is needed)` };
  const budget = opts.budget ?? REPORT_BUDGET;
  const centre = a.bounds!.center;
  const label = (i: number) => `${a.parts[i - 1]!.node.name}(${i})`;
  const rel = (n: TNode) => relPath(tree, n);
  const notes: string[] = [];
  const out: AnatomyReport = { model: tree.root.address, class: tree.root.className, partCount: a.parts.length };

  const contents = {
    scripts: tree.nodes.filter((n) => SCRIPT_CLASSES.has(n.className) && n.name !== BEHAVIOUR_MODULE).map((n) => `${n.className} ${rel(n)}`).slice(0, 8),
    sounds: tree.nodes.filter((n) => n.className === 'Sound').map(rel).slice(0, 8),
    lights: tree.nodes.filter((n) => isLightClass(n.className)).length,
    particleEmitters: tree.nodes.filter((n) => n.className === 'ParticleEmitter').length,
    clickDetectors: tree.nodes.filter((n) => n.className === 'ClickDetector').length,
    prompts: tree.nodes.filter((n) => n.className === 'ProximityPrompt').length,
  };
  if (!contents.scripts.length && !contents.sounds.length) notes.push('nothing in this model runs or makes a sound: no Script, LocalScript or Sound is inside it');
  if (a.joints.some((j) => j.class === 'Motor6D')) notes.push('Motor6D joints here (rigged for animate_model): a behaviour moving the same part would fight the joint');
  const dup = new Map<string, number>();
  for (const p of a.parts) if (p.node.ambiguous) dup.set(p.node.name, (dup.get(p.node.name) ?? 0) + 1);
  if (dup.size) notes.push(`${[...dup].slice(0, 4).map(([n, c]) => `${n} x${c}`).join(', ')} share names with siblings: other tools cannot address them by name; add_behaviour can, by the path shown (Name#2 = the second of that name)`);
  if (tree.truncated) notes.push('the place cut the tree short; parts beyond the cut are not listed');
  if (a.partsTruncated) notes.push(`only the first ${MAX_PARTS} parts were analysed`);

  if (opts.focus) {
    const found = findNode(tree, opts.focus, opts.parseSegments);
    if ('error' in found) return found;
    const rec = a.parts.find((p) => p.node === found);
    if (!rec) return { error: `${found.address} is a ${found.className}, not a part; name a part (use model_anatomy without \`part\` to list them)` };
    Object.assign(out, {
      part: partView(tree, a, rec, label, centre),
      hinges: hingeCandidates(a, rec, 5).map(hingeView),
      hingeHelp: 'swing: hinge = { pivot, axis } from one of these (pivot: the edge as -1..1 of each half-size of THIS part; axis: its own x, y or z). A positive angle carries the part\'s centre toward positiveCarries, a negative one toward negativeCarries: pick the sign that goes where you want. `with` = parts that swing along (hangsFromIt, and what rests on it). spin and bob use the centre.',
      children: rec.node.children.map((k) => `${k.className} ${k.name}`).slice(0, 12),
      notes,
    });
    return fitReport(out, budget);
  }

  const maxParts = Math.max(5, Math.min(80, Math.floor(opts.maxParts ?? 40)));
  const vol = (p: PartRec) => p.size[0] * p.size[1] * p.size[2];
  const chosen = a.parts.length <= maxParts ? a.parts : [...a.parts].sort((x, y) => vol(y) - vol(x)).slice(0, maxParts).sort((x, y) => x.i - y.i);
  // The parts most likely to be worth moving: smaller than the biggest, resting against something, best-supported hinge first.
  const biggest = Math.max(...a.parts.map(vol));
  const movable = a.parts
    .filter((p) => p.i !== a.rootPart && vol(p) < biggest * 0.6 && (a.contacts.get(p.i)?.length ?? 0) > 0)
    .map((p) => ({ p, h: hingeCandidates(a, p, 1)[0]! }))
    .filter((m) => m.h.restsOn > 0)
    .sort((x, y) => y.h.restsOn - x.h.restsOn || vol(y.p) - vol(x.p))
    .slice(0, 4)
    .map(({ p, h }) => ({ i: p.i, part: rel(p.node), bestHinge: { axis: h.axis, pivot: h.pivot, restsOn: h.restsOn, positiveCarries: h.positiveCarries } }));

  const partsWith = (test: (p: PartRec) => boolean) => a.parts.filter(test).map((p) => rel(p.node));
  const cannotClick = partsWith((p) => bool(p.node.props, 'CanQuery') === false).slice(0, 10);
  const cannotTouch = partsWith((p) => bool(p.node.props, 'CanTouch') === false).slice(0, 10);
  Object.assign(out, {
    bounds: { center: round3(a.bounds!.center), size: round3(a.bounds!.size) },
    rootPart: a.rootPart ? label(a.rootPart) : null,
    parts: chosen.map((p) => partView(tree, a, p, label, centre)),
    ...(chosen.length < a.parts.length ? { omitted: `${a.parts.length - chosen.length} smaller parts (part: <path> shows any of them)` } : {}),
    joints: a.joints.slice(0, 40).map((j) => `${j.class} ${j.name}: ${label(j.a)} - ${label(j.b)}`),
    interaction: {
      clickable: partsWith((p) => p.node.children.some((k) => k.className === 'ClickDetector')).slice(0, 10),
      prompts: partsWith((p) => p.node.children.some((k) => k.className === 'ProximityPrompt')).slice(0, 10),
      ...(cannotClick.length ? { cannotBeClicked: cannotClick } : {}),
      ...(cannotTouch.length ? { cannotBeTouched: cannotTouch } : {}),
    },
    contents,
    ...(opts.existing?.length ? { behaviours: opts.existing.map((b) => `${b.id}:${b.verb}`) } : {}),
    movable,
    notes,
    help: 'at = part centre relative to bounds.center (world axes). Paths are relative to the model; the full path works too. part: <path> gives hinge candidates.',
  });
  return fitReport(out, budget);
}

/** Shed detail, least useful first, until the report fits; say what was shed. Never slices JSON. */
export function fitReport(out: AnatomyReport, budget: number): AnatomyReport {
  const size = () => JSON.stringify(out).length;
  const shed: string[] = [];
  const parts = out.parts as Record<string, unknown>[] | undefined;
  if (parts && size() > budget) {
    const keep = new Set<number>();
    for (const m of (out.movable as { i: number }[] | undefined) ?? []) keep.add(m.i);
    const root = /\((\d+)\)$/.exec(String(out.rootPart ?? ''));
    if (root) keep.add(Number(root[1]));
    const volume = (v: Record<string, unknown>) => (v.size as number[]).reduce((x, y) => x * y, 1);
    const valuable = (v: Record<string, unknown>) => keep.has(v.i as number) || v.clickable || v.prompt || v.sounds || v.lights || v.emitters;
    let dropped = 0;
    while (size() > budget && parts.length > 6) {
      let at = -1;
      for (let k = 0; k < parts.length; k++) if (!valuable(parts[k]!) && (at < 0 || volume(parts[k]!) < volume(parts[at]!))) at = k;
      if (at < 0) break;
      parts.splice(at, 1);
      dropped++;
    }
    if (dropped) { shed.push(`${dropped} more parts`); out.omitted = `${(out.partCount as number) - parts.length} smaller parts (part: <path> shows any of them)`; }
  }
  const joints = out.joints as string[] | undefined;
  for (const keepJoints of [12, 4, 0]) {
    if (!joints || size() <= budget || joints.length <= keepJoints) continue;
    out.joints = joints.slice(0, keepJoints);
    out.jointsOmitted = joints.length - keepJoints;
    shed.push('joints');
  }
  const notes = out.notes as string[] | undefined;
  if (notes && size() > budget && notes.length > 2) { out.notes = notes.slice(0, 2); shed.push('notes'); }
  const hinges = out.hinges as unknown[] | undefined;
  while (hinges && size() > budget && hinges.length > 2) { hinges.pop(); shed.push('a hinge candidate'); }
  if (size() > budget && out.help) { delete out.help; shed.push('help'); }
  if (size() > budget && out.hingeHelp) { out.hingeHelp = 'swing: hinge = { pivot, axis } from a candidate; a positive angle carries the centre toward positiveCarries, a negative one toward negativeCarries.'; shed.push('help'); }
  if (shed.length) out.shed = [...new Set(shed)].join(', ');
  return out;
}

// ------------------------------------------------------------------------------------------------------------- tool

/** A path into Workspace in any form the tools return (`game.Workspace.A.B` or `game.Workspace["A B"]`), parsed, never prefix-matched. */
export function inWorkspace(path: string): boolean {
  const segs = parseInstancePath(path);
  return !!segs && segs.length >= 2 && segs[0] === 'Workspace';
}

const clip = (s: unknown) => String(s ?? '').slice(0, 300);

/** The tool: read the model from the place and report it (no write). */
export async function modelAnatomy(ctx: AgentCtx, a: Record<string, unknown>) {
  const model = String(a.model ?? '');
  if (!inWorkspace(model)) return { error: 'model must be the path of a Model (or a part) in Workspace, e.g. game.Workspace.MyModel' };
  const got = await ctx.execStudioOp({ op: 'get_tree', root: model, maxDepth: 12, maxNodes: 1200 }, 30_000);
  if (!got.ok) return { error: `could not read ${model}: ${clip(got.error)}` };
  const tree = parseTree(got.data);
  if ('error' in tree) return tree;

  let existing: { id: string; verb: string }[] | undefined;
  const cfg = tree.root.children.find((c) => c.className === 'ModuleScript' && c.name === BEHAVIOUR_MODULE);
  if (cfg) {
    const read = await ctx.execStudioOp({ op: 'read_script', path: cfg.path }, 20_000);
    const text = read.ok ? String(obj(read.data).source ?? '') : '';
    const parsed = text ? parseConfigSource(text) : null;
    existing = parsed && 'records' in parsed ? parsed.records.map((r) => ({ id: String(r.id), verb: String(r.verb) })) : [{ id: '?', verb: 'unreadable' }];
  }
  return report(tree, {
    focus: typeof a.part === 'string' && a.part ? a.part : undefined,
    maxParts: typeof a.maxParts === 'number' ? a.maxParts : undefined,
    parseSegments: parseInstancePath,
    existing,
  });
}
