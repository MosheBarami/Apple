/**
 * add_behaviour: give a PLACED model the behaviour the user asked for, from reviewed verbs, by path.
 *
 * Library and Creator Store models arrive with every script and sound stripped, and the agent could not put the asked-for
 * behaviour back (a part that opens, music on a click, a bounce). This tool is that capability. The agent reads the model
 * (model_anatomy), then names VERBS to do to PARTS when a TRIGGER fires, choosing every parameter itself:
 *
 *   swing   turn about a hinge       slide  move by an offset      spin   turn without end        bob     rise and fall
 *   fade    go transparent           light  switch lights, glow    sound  play a Sound            emit    burst particles
 *   bounce  launch whoever touches it
 *
 * Nothing the agent sends becomes code. What is written is DATA: a ModuleScript `AppleBehaviours` in the model (see
 * behaviour-config.ts) that the one reviewed runtime script AppleBehave (packages/components/behave, ServerScriptService)
 * reads when the game runs. A verb is a verb on parts: no subject is named anywhere in this file, and the same call works for
 * any model whatever it depicts or wherever it came from.
 *
 * The harness gives information and checks (every path is resolved against the live tree, a Sound must come from Apple's
 * library, a hinge must be a point on the box, each number is range-checked) and reports what it measured: after the write it
 * reads both scripts back and says whether they match. It does NOT decide what looks right; that is the agent's choice.
 *
 * Flag BEHAVIOUR_V2: set to "off" (or "0", "false") and the tool refuses, the kill switch for measuring with it off.
 */
import type { AgentCtx } from './tools';
import { COMPONENTS } from './components.generated';
import { refuseSoundId } from './fx-library';
import { parseInstancePath } from './effects';
import { BEHAVIOUR_MODULE, parseConfigSource, renderConfigSource, type BehaviourRecord } from './behaviour-config';
import { analyse, findNode, isLightClass, isPartClass, parseTree, type ModelTree, type Seg, type TNode } from './model-anatomy';
import { sourceHash } from './luau-review';

const clip = (s: unknown) => String(s ?? '').slice(0, 300);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function behaviourEnabled(env: { BEHAVIOUR_V2?: string } | undefined): boolean {
  const v = String(env?.BEHAVIOUR_V2 ?? '').trim().toLowerCase();
  return !(v === 'off' || v === '0' || v === 'false');
}

// ------------------------------------------------------------------------------------------------------ the vocabulary

export const VERBS = ['swing', 'slide', 'spin', 'bob', 'fade', 'light', 'sound', 'emit', 'bounce'] as const;
export type Verb = (typeof VERBS)[number];
export const TRIGGERS = ['click', 'prompt', 'touch', 'near', 'auto'] as const;
export const MODES = ['toggle', 'pulse', 'hold', 'once'] as const;
export const EASES = ['Linear', 'Sine', 'Quad', 'Back', 'Bounce', 'Elastic'] as const;
/** Verbs that are a state with a position in between, so they can start on (`auto`) and, for swing, slide and fade, cycle. */
const STATE_VERBS = new Set<string>(['swing', 'slide', 'spin', 'bob', 'fade', 'light']);
const MOVERS = new Set<string>(['swing', 'slide', 'spin', 'bob']);

type Spec =
  | { t: 'num'; min: number; max: number; def: number; unit: string; nonzero?: boolean }
  | { t: 'enum'; values: readonly string[]; def: string }
  | { t: 'bool'; def: boolean }
  | { t: 'vec'; limit: number; unit: string; def?: number[]; nonzero?: boolean; min?: number };

const seconds = (def: number, max = 30, min = 0.05): Spec => ({ t: 'num', min, max, def, unit: 'seconds' });

/** The parameters each verb takes, with their ranges and defaults. This table IS the validation and the catalogue. */
export const PARAMS: Record<Verb, Record<string, Spec>> = {
  swing: { angle: { t: 'num', min: -360, max: 360, def: 90, unit: 'degrees, right-hand rule about the hinge axis', nonzero: true }, seconds: seconds(0.6) },
  slide: { offset: { t: 'vec', limit: 1000, unit: 'studs', nonzero: true }, space: { t: 'enum', values: ['local', 'world'], def: 'local' }, seconds: seconds(0.6) },
  spin: { speed: { t: 'num', min: -1440, max: 1440, def: 90, unit: 'degrees a second', nonzero: true } },
  bob: {
    axis: { t: 'enum', values: ['x', 'y', 'z'], def: 'y' },
    amount: { t: 'num', min: 0.02, max: 100, def: 1, unit: 'studs' },
    period: { t: 'num', min: 0.2, max: 60, def: 2, unit: 'seconds a cycle' },
    shape: { t: 'enum', values: ['sine', 'hop'], def: 'sine' },
  },
  fade: { to: { t: 'num', min: 0, max: 1, def: 1, unit: 'transparency' }, seconds: seconds(0.4), collide: { t: 'bool', def: true } },
  light: {
    color: { t: 'vec', limit: 1, min: 0, unit: 'r, g, b from 0 to 1', def: [1, 0.85, 0.6] },
    brightness: { t: 'num', min: 0, max: 20, def: 2, unit: '' },
    range: { t: 'num', min: 2, max: 120, def: 16, unit: 'studs' },
    seconds: seconds(0.25, 5, 0),
    glow: { t: 'bool', def: false },
  },
  sound: {
    volume: { t: 'num', min: 0, max: 4, def: 0.6, unit: '' },
    pitch: { t: 'num', min: 0.1, max: 4, def: 1, unit: 'playback speed' },
    variance: { t: 'num', min: 0, max: 0.5, def: 0.04, unit: 'random pitch spread' },
    range: { t: 'num', min: 4, max: 1000, def: 60, unit: 'studs it can be heard' },
    fade: seconds(0.3, 5, 0),
    loop: { t: 'bool', def: false },
  },
  emit: { count: { t: 'num', min: 1, max: 500, def: 20, unit: 'particles a burst' }, sustain: { t: 'bool', def: false } },
  bounce: {
    power: { t: 'num', min: 10, max: 400, def: 80, unit: 'studs a second' },
    direction: { t: 'vec', limit: 1, unit: 'in the target\'s own frame; need not be unit length', def: [0, 1, 0], nonzero: true },
    cooldown: { t: 'num', min: 0.1, max: 10, def: 0.6, unit: 'seconds' },
  },
};

/** Parameters every verb takes, besides the ones above (and `hinge` for swing and spin, `sound` / `soundId` for sound). */
const COMMON = ['id', 'verb', 'target', 'with', 'trigger', 'mode', 'hold', 'delay', 'ease'];
const SPECIAL: Partial<Record<Verb, string[]>> = { swing: ['hinge'], spin: ['hinge'], sound: ['sound', 'soundId'] };

const WHAT: Record<Verb, string> = {
  swing: 'turn the target (and `with` parts) about a hinge line and back; hinge = {pivot: a point on the target\'s box as -1..1 of each half-size, axis: its own x|y|z}',
  slide: 'move the target (and `with`) by an offset and back',
  spin: 'turn without end about an axis through a pivot (hinge = {pivot?, axis?}, default centre about y)',
  bob: 'rise and fall about rest, as a sine or as hops',
  fade: 'go to a transparency (not solid once gone) and back',
  light: 'switch the lights under the target (or make one), optionally glow Neon',
  sound: 'play a Sound from the target: `sound` = path of a Sound in the place (cloned) or `soundId` from find_sound; loop starts/stops with the trigger',
  emit: 'burst the particle emitters under the target, or sustain true to switch them on and off',
  bounce: 'launch whoever touches the target; always listens for touch',
};

const takes = (name: string, s: Spec): string =>
  s.t === 'num' ? `${name} ${s.min}..${s.max}${s.nonzero ? ' (not 0)' : ''} =${s.def}`
    : s.t === 'enum' ? `${name} ${s.values.join('|')} =${s.def}`
      : s.t === 'bool' ? `${name} =${s.def}`
        : `${name} [x,y,z] ${s.min === 0 ? '0' : '±'}${s.limit}${s.nonzero ? ' (not all 0)' : ''}${s.def ? ` =[${s.def.join(',')}]` : ''}`;

/**
 * The verbs and what each takes, generated from PARAMS (the table that validates), as one short line per verb: a tool result is
 * cut at 3000 characters, and this is returned whole on the lookup call.
 */
export function describeVerbs(): Record<string, unknown> {
  const verbs: Record<string, string> = {};
  for (const verb of VERBS) {
    verbs[verb] = `${WHAT[verb]}. takes: ${Object.entries(PARAMS[verb]).map(([n, s]) => takes(n, s)).join('; ')}`;
  }
  return {
    verbs,
    every: 'id (edit/remove later; the same id replaces); target (a part or sub-model, default the whole model); with [paths that move together]; ' +
      `trigger {on: ${TRIGGERS.join('|')}, at: the part that carries the click/prompt, text, reach studs, cooldown s} or just the name (default click; spin, bob auto; bounce touch); ` +
      'mode toggle|pulse|hold|once (click toggles, touch pulses, near holds); hold s; delay s; ' + `ease ${EASES.join('|')}. ` +
      'auto starts on its own (swing, slide, fade then go back and forth), not for a one-shot sound or burst.',
    paths: 'relative to the model (Cover, Group.Cover) or full; the 2nd of a repeated name is Name#2',
    runs: 'when the game runs, not in Edit. Moving parts are anchored; a joint between a moving part and one that stays is switched off.',
  };
}

// ------------------------------------------------------------------------------------------------ reading the request

type Ref = { segs: Seg[]; abs?: true };

interface Ctx {
  tree: ModelTree;
  ctx: AgentCtx;
  /**
   * The record is one this tool wrote earlier and is being re-read, not a new request. Its structure is checked again (every path
   * must still resolve, every number be in range); its sound is NOT re-judged against Apple's library, because a sound found by
   * search in an earlier run is no longer in this run's discovered set and re-judging would silently delete it on the next merge.
   */
  stored?: boolean;
}

function isModelLike(n: TNode): boolean {
  return isPartClass(n.className) || n.className === 'Model';
}

/** A path as a reference the runtime resolves, and the node it names; or why not. */
function refTo(c: Ctx, raw: unknown, what: string): { ref: Ref; node: TNode } | { error: string } {
  if (typeof raw !== 'string' || !raw) return { error: `${what} must be a path string` };
  const node = findNode(c.tree, raw, parseInstancePath);
  if ('error' in node) return { error: `${what}: ${node.error}` };
  if (!isModelLike(node)) return { error: `${what}: ${node.address} is a ${node.className}; name a part or a Model (model_anatomy lists them)` };
  return { ref: { segs: node.segs }, node };
}

function readSpec(name: string, spec: Spec, raw: unknown, verb: string): { value: unknown } | { error: string } {
  switch (spec.t) {
    case 'num':
      if (!finite(raw)) return { error: `${verb}.${name} must be a number` };
      if (raw < spec.min || raw > spec.max) return { error: `${verb}.${name} must be ${spec.min}..${spec.max}${spec.unit ? ` (${spec.unit})` : ''}, got ${raw}` };
      if (spec.nonzero && raw === 0) return { error: `${verb}.${name} must not be 0` };
      return { value: raw };
    case 'enum':
      if (typeof raw !== 'string' || !spec.values.includes(raw)) return { error: `${verb}.${name} must be one of ${spec.values.join(', ')}` };
      return { value: raw };
    case 'bool':
      if (typeof raw !== 'boolean') return { error: `${verb}.${name} must be true or false` };
      return { value: raw };
    case 'vec': {
      if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(finite)) return { error: `${verb}.${name} must be three numbers [x, y, z]` };
      if ((raw as number[]).some((n) => Math.abs(n) > spec.limit)) return { error: `${verb}.${name} must stay within ${spec.min === 0 ? '0..' : '±'}${spec.limit} (${spec.unit})` };
      if (spec.min !== undefined && (raw as number[]).some((n) => n < spec.min!)) return { error: `${verb}.${name} must not go below ${spec.min} (${spec.unit})` };
      if (spec.nonzero && (raw as number[]).every((n) => n === 0)) return { error: `${verb}.${name} must not be all 0` };
      return { value: raw };
    }
  }
}

/** One behaviour as the agent wrote it, validated against the live tree and the verb's table, with every default written out. */
export async function readBehaviour(c: Ctx, raw: unknown, index: number): Promise<{ record: BehaviourRecord; notes: string[] } | { error: string }> {
  const at = `behaviours[${index}]`;
  const r = obj(raw);
  const verb = String(r.verb ?? '');
  if (!(VERBS as readonly string[]).includes(verb)) return { error: `${at}.verb must be one of ${VERBS.join(', ')} (add_behaviour {model} with no behaviours lists what each takes)` };
  const v = verb as Verb;
  const allowed = new Set([...COMMON, ...(SPECIAL[v] ?? []), ...Object.keys(PARAMS[v])]);
  for (const key of Object.keys(r)) {
    if (!allowed.has(key)) return { error: `${at}: ${verb} does not take "${key}" (it takes: ${[...allowed].filter((k) => k !== 'verb').join(', ')})` };
  }
  const notes: string[] = [];
  const record: Record<string, unknown> = {};

  if (r.id !== undefined) {
    if (typeof r.id !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(r.id)) return { error: `${at}.id must be letters, digits and _ (up to 32), starting with a letter` };
    record.id = r.id;
  }
  record.verb = verb;

  // -- what it is done to
  let targetNode = c.tree.root;
  if (r.target !== undefined) {
    const t = refTo(c, r.target, `${at}.target`);
    if ('error' in t) return t;
    record.target = t.ref;
    targetNode = t.node;
  } else {
    record.target = { segs: [] };
  }
  if (r.with !== undefined) {
    if (!Array.isArray(r.with) || r.with.length > 60) return { error: `${at}.with must be a list of up to 60 paths` };
    if (r.with.length && !MOVERS.has(verb)) return { error: `${at}: \`with\` only goes with swing, slide, spin and bob (they move parts together)` };
    const list: Ref[] = [];
    for (const [k, w] of r.with.entries()) {
      const t = refTo(c, w, `${at}.with[${k}]`);
      if ('error' in t) return t;
      if (t.node !== targetNode && !list.some((x) => JSON.stringify(x) === JSON.stringify(t.ref))) list.push(t.ref);
    }
    if (list.length) record.with = list;
  }

  // -- when
  const trig = typeof r.trigger === 'string' ? { on: r.trigger } : obj(r.trigger);
  if (r.trigger !== undefined && typeof r.trigger !== 'string' && (typeof r.trigger !== 'object' || r.trigger === null || Array.isArray(r.trigger))) return { error: `${at}.trigger must be an object or one of ${TRIGGERS.join(', ')}` };
  for (const key of Object.keys(trig)) if (!['on', 'at', 'text', 'reach', 'cooldown'].includes(key)) return { error: `${at}.trigger does not take "${key}" (on, at, text, reach, cooldown)` };
  const defaultOn = verb === 'spin' || verb === 'bob' ? 'auto' : verb === 'bounce' ? 'touch' : 'click';
  const on = trig.on === undefined ? defaultOn : String(trig.on);
  if (!(TRIGGERS as readonly string[]).includes(on)) return { error: `${at}.trigger.on must be one of ${TRIGGERS.join(', ')}` };
  if (verb === 'bounce' && on !== 'touch') return { error: `${at}: a launcher listens for touch; drop the trigger or use "touch"` };
  const stateful = STATE_VERBS.has(verb) || (verb === 'sound' && r.loop === true) || (verb === 'emit' && r.sustain === true);
  if (on === 'auto' && !stateful) return { error: `${at}: "auto" starts a behaviour on its own, which needs a state: swing, slide, spin, bob, fade, light, a looped sound (loop: true) or a sustained emitter (sustain: true). A one-shot sound or a burst needs click, prompt, touch or near` };
  const trigger: Record<string, unknown> = { on };
  if (trig.at !== undefined) {
    const t = refTo(c, trig.at, `${at}.trigger.at`);
    if ('error' in t) return t;
    trigger.at = t.ref;
    const carrier = t.node;
    if (on === 'click' && isPartClass(carrier.className) && obj(carrier.props.CanQuery).v === false) notes.push(`${at}: ${carrier.address} has CanQuery off, so a click on it will not register`);
    if (on === 'touch' && isPartClass(carrier.className) && obj(carrier.props.CanTouch).v === false) notes.push(`${at}: ${carrier.address} has CanTouch off, so touching it will not fire`);
  } else if (on === 'click' && isPartClass(targetNode.className) && obj(targetNode.props.CanQuery).v === false) {
    notes.push(`${at}: the target has CanQuery off, so a click on it will not register; put the click on another part with trigger.at`);
  } else if (on === 'touch' && isPartClass(targetNode.className) && obj(targetNode.props.CanTouch).v === false) {
    notes.push(`${at}: the target has CanTouch off, so touching it will not fire; put the trigger on another part with trigger.at`);
  }
  if (trig.text !== undefined) {
    if (typeof trig.text !== 'string' || !trig.text.trim() || trig.text.length > 30) return { error: `${at}.trigger.text must be 1 to 30 characters` };
    if (on !== 'prompt') return { error: `${at}.trigger.text is the prompt's action text and only goes with trigger "prompt"` };
    trigger.text = trig.text.trim();
  }
  for (const [key, lo, hi] of [['reach', 1, 500], ['cooldown', 0, 60]] as const) {
    if (trig[key] === undefined) continue;
    if (!finite(trig[key]) || (trig[key] as number) < lo || (trig[key] as number) > hi) return { error: `${at}.trigger.${key} must be ${lo}..${hi}` };
    trigger[key] = trig[key];
  }
  record.trigger = trigger;

  const mode = r.mode === undefined ? (on === 'touch' ? 'pulse' : on === 'near' ? 'hold' : 'toggle') : String(r.mode);
  if (!(MODES as readonly string[]).includes(mode)) return { error: `${at}.mode must be one of ${MODES.join(', ')}` };
  record.mode = mode;
  for (const [key, lo, hi] of [['hold', 0.05, 600], ['delay', 0, 60]] as const) {
    if (r[key] === undefined) continue;
    if (!finite(r[key]) || (r[key] as number) < lo || (r[key] as number) > hi) return { error: `${at}.${key} must be ${lo}..${hi} seconds` };
    record[key] = r[key];
  }
  if (r.ease !== undefined) {
    if (typeof r.ease !== 'string' || !(EASES as readonly string[]).includes(r.ease)) return { error: `${at}.ease must be one of ${EASES.join(', ')}` };
    record.ease = r.ease;
  }

  // -- how: the verb's own parameters, every default written out so the module says what it does
  for (const [name, spec] of Object.entries(PARAMS[v])) {
    if (r[name] === undefined) {
      if (spec.t === 'vec' && !spec.def) return { error: `${at}: ${verb} needs ${name} (${spec.unit})` };
      record[name] = spec.def;
      continue;
    }
    const got = readSpec(name, spec, r[name], verb);
    if ('error' in got) return { error: `${at}: ${got.error}` };
    record[name] = got.value;
  }

  if (verb === 'swing' || verb === 'spin') {
    const h = obj(r.hinge);
    if (r.hinge === undefined && verb === 'swing') return { error: `${at}: swing needs hinge = { pivot: [x,y,z], axis: "x"|"y"|"z" } (model_anatomy {model, part} lists the candidates for a part)` };
    if (r.hinge !== undefined && (typeof r.hinge !== 'object' || r.hinge === null || Array.isArray(r.hinge))) return { error: `${at}.hinge must be an object { pivot, axis }` };
    for (const key of Object.keys(h)) if (key !== 'pivot' && key !== 'axis') return { error: `${at}.hinge does not take "${key}" (pivot, axis)` };
    const pivot = h.pivot === undefined ? [0, 0, 0] : h.pivot;
    if (!Array.isArray(pivot) || pivot.length !== 3 || !pivot.every(finite) || pivot.some((n) => Math.abs(n as number) > 1)) {
      return { error: `${at}.hinge.pivot must be three numbers from -1 to 1: a point on the target's box as a share of each half-size ([0,-1,-1] is the middle of the bottom edge on its -z side)` };
    }
    const axis = h.axis === undefined ? 'y' : h.axis;
    if (axis !== 'x' && axis !== 'y' && axis !== 'z') return { error: `${at}.hinge.axis must be "x", "y" or "z" (an axis of the target's own box)` };
    record.hinge = { pivot, axis };
  }

  if (verb === 'sound') {
    if (r.sound !== undefined && r.soundId !== undefined) return { error: `${at}: give the sound as \`sound\` (a path) or \`soundId\`, not both` };
    if (r.sound === undefined && r.soundId === undefined) return { error: `${at}: sound needs \`sound\` (path of a Sound in the place) or \`soundId\` (an id from find_sound / insert_sound)` };
    if (r.soundId !== undefined) {
      const id = String(r.soundId).trim().replace(/^rbxassetid:\/\//i, '');
      if (!/^\d{1,20}$/.test(id)) return { error: `${at}.soundId must be rbxassetid://<number>` };
      const refused = c.stored ? null : refuseSoundId({ SoundId: `rbxassetid://${id}` }, c.ctx.discoveredAssetIds);
      if (refused) return { error: `${at}: ${refused.error}` };
      record.soundId = `rbxassetid://${id}`;
    } else {
      if (typeof r.sound !== 'string') return { error: `${at}.sound must be a path string` };
      const inside = findNode(c.tree, r.sound, parseInstancePath);
      let soundIdProp: unknown;
      if (!('error' in inside)) {
        if (inside.className !== 'Sound') return { error: `${at}.sound: ${inside.address} is a ${inside.className}, not a Sound` };
        soundIdProp = inside.props.SoundId;
        record.sound = { segs: inside.segs };
      } else {
        // Not under the model: a Sound elsewhere in the place (SoundService, a folder), read once for its class and id.
        const segs = parseInstancePath(r.sound);
        if (!segs || !/^(Workspace|SoundService|ReplicatedStorage|ServerStorage)$/.test(segs[0] ?? '')) return { error: `${at}.sound: ${inside.error}` };
        const got = await c.ctx.execStudioOp({ op: 'get_instance', path: r.sound }, 20_000);
        if (!got.ok) return { error: `${at}.sound: ${clip(got.error)}` };
        const info = obj(got.data);
        if (info.class !== 'Sound') return { error: `${at}.sound: ${r.sound} is a ${String(info.class)}, not a Sound` };
        soundIdProp = obj(info.props).SoundId;
        record.sound = { segs, abs: true };
      }
      const value = obj(soundIdProp).v ?? soundIdProp;
      if (typeof value !== 'string' || !value) return { error: `${at}.sound: that Sound has no SoundId, so it would play nothing` };
      const refused = c.stored ? null : refuseSoundId({ SoundId: value }, c.ctx.discoveredAssetIds);
      if (refused) return { error: `${at}.sound: its SoundId is not from Apple's library. ${refused.error}` };
    }
  }

  if (verb === 'emit') {
    const has = (n: TNode): boolean => n.className === 'ParticleEmitter' || n.children.some(has);
    if (!targetNode.children.some(has) && targetNode.className !== 'ParticleEmitter') return { error: `${at}: ${targetNode.address} has no ParticleEmitter under it to emit from (insert_vfx adds one)` };
  }
  if (verb === 'light' && !subtree(targetNode).some((n) => isLightClass(n.className))) notes.push(`${at}: there is no light under ${targetNode.address}, so a PointLight will be made when the game runs`);

  return { record: record as BehaviourRecord, notes };
}

function subtree(n: TNode): TNode[] {
  return [n, ...n.children.flatMap(subtree)];
}

/** The node a stored reference names, or null when the model no longer has it. */
function nodeAt(tree: ModelTree, ref: unknown): TNode | null {
  let at: TNode | undefined = tree.root;
  for (const seg of (obj(ref).segs as Seg[] | undefined) ?? []) {
    const name = typeof seg === 'string' ? seg : seg.name;
    const nth = typeof seg === 'string' ? 1 : seg.nth;
    at = at.children.filter((c) => c.name === name)[nth - 1];
    if (!at) return null;
  }
  return at;
}

/** A stored record turned back into what an agent would write (references as path strings), so it can be validated afresh. */
function inputOf(tree: ModelTree, rec: BehaviourRecord): Record<string, unknown> {
  const path = (ref: unknown): unknown => {
    const r = obj(ref);
    if (r.abs === true) return `game${((r.segs as string[]) ?? []).map((s) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? `.${s}` : `["${s}"]`)).join('')}`;
    // A part the model no longer has is written out by its names, so the fresh validation says which child is gone.
    return nodeAt(tree, ref)?.address ?? `${tree.root.path}${((r.segs as Seg[]) ?? []).map((g) => { const n = typeof g === 'string' ? g : `${g.name}#${g.nth}`; return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? `.${n}` : `["${n}"]`; }).join('')}`;
  };
  const out: Record<string, unknown> = { ...rec };
  if (rec.target !== undefined) out.target = path(rec.target);
  if (Array.isArray(rec.with)) out.with = rec.with.map(path);
  const trig = obj(rec.trigger);
  if (trig.at !== undefined) out.trigger = { ...trig, at: path(trig.at) };
  if (rec.sound !== undefined) out.sound = path(rec.sound);
  return out;
}

// ------------------------------------------------------------------------------------------------- checks across them

/** Facts about the whole set that no single record shows: joints cut, rigs fought, parts moved by two verbs. */
export function crossChecks(tree: ModelTree, records: readonly BehaviourRecord[]): string[] {
  const notes: string[] = [];
  const a = analyse(tree);
  const movedBy = new Map<string, Set<TNode>>();
  for (const rec of records) {
    if (!MOVERS.has(rec.verb)) continue;
    const roots = [nodeAt(tree, rec.target), ...(((rec.with as unknown[]) ?? []).map((w) => nodeAt(tree, w)))].filter((n): n is TNode => !!n);
    movedBy.set(rec.id, new Set(roots.flatMap(subtree).filter((n) => isPartClass(n.className))));
  }
  const moved = new Set([...movedBy.values()].flatMap((s) => [...s]));
  const nameOf = (i: number) => a.parts[i - 1]?.node.name ?? '?';
  const cut: string[] = [];
  const rigged: string[] = [];
  for (const j of a.joints) {
    const pa = a.parts[j.a - 1]!.node, pb = a.parts[j.b - 1]!.node;
    const ina = moved.has(pa), inb = moved.has(pb);
    if (ina !== inb) cut.push(`${j.class} ${j.name} (${nameOf(j.a)} to ${nameOf(j.b)})`);
    if ((ina || inb) && j.class === 'Motor6D') rigged.push(j.name);
  }
  if (cut.length) notes.push(`a joint joins a moving part to one that stays still, and is switched off when the game runs so the move is not fought: ${cut.slice(0, 6).join('; ')}. If the part it joins should move too, add it to \`with\`.`);
  if (rigged.length) notes.push(`${rigged.slice(0, 4).join(', ')} is a Motor6D on a moving part (rigged for animate_model); a Motor6D re-sets its part every frame and fights a behaviour that moves the same part. Use one or the other.`);
  const count = new Map<TNode, string[]>();
  for (const [id, set] of movedBy) for (const n of set) count.set(n, [...(count.get(n) ?? []), id]);
  const shared = [...count].filter(([, ids]) => ids.length > 1);
  if (shared.length) notes.push(`${shared.length} part(s) are moved by more than one behaviour (${[...new Set(shared.flatMap(([, ids]) => ids))].slice(0, 5).join(', ')}); they compose: rotations in the order listed, then translations.`);
  return notes;
}

// ---------------------------------------------------------------------------------------------------------- the tool

/** `open:swing:prompt/toggle`: one short string per behaviour, because a tool result is cut at 3000 characters. */
const summaryOf = (r: BehaviourRecord): string => `${r.id}:${r.verb}:${String(obj(r.trigger).on)}/${String(r.mode)}`;

/** The notes that fit: the first few, each clipped, and a count of the rest. */
export function fitNotes(notes: readonly string[], keep = 5, each = 260): string[] {
  const shown = notes.slice(0, keep).map((n) => (n.length > each ? `${n.slice(0, each - 1)}…` : n));
  return notes.length > keep ? [...shown, `…and ${notes.length - keep} more`] : shown;
}

const MAX_BEHAVIOURS = 40;

export async function addBehaviour(ctx: AgentCtx, a: Record<string, unknown>) {
  if (!behaviourEnabled(ctx.env)) return { error: 'add_behaviour is switched off on this deployment (BEHAVIOUR_V2=off)' };
  const model = String(a.model ?? '');
  if (!model.startsWith('game.Workspace.')) return { error: 'model must be the path of a Model (or a part) in Workspace, e.g. game.Workspace.MyModel' };
  for (const key of Object.keys(a)) if (!['model', 'behaviours', 'remove', 'replace'].includes(key)) return { error: `add_behaviour does not take "${key}" (model, behaviours, remove, replace)` };
  if (a.behaviours !== undefined && (!Array.isArray(a.behaviours) || a.behaviours.length === 0 || a.behaviours.length > MAX_BEHAVIOURS)) return { error: `behaviours must be a list of 1 to ${MAX_BEHAVIOURS}` };
  if (a.remove !== undefined && (!Array.isArray(a.remove) || a.remove.some((x) => typeof x !== 'string'))) return { error: 'remove must be a list of behaviour ids' };
  if (a.replace !== undefined && typeof a.replace !== 'boolean') return { error: 'replace must be true or false' };

  // 1. The model as it is in the place now: every path below is resolved against this, not against the agent's memory.
  const got = await ctx.execStudioOp({ op: 'get_tree', root: model, maxDepth: 12, maxNodes: 1200 }, 30_000);
  if (!got.ok) return { error: `could not read ${model}: ${clip(got.error)}` };
  const tree = parseTree(got.data);
  if ('error' in tree) return tree;
  if (!isModelLike(tree.root)) return { error: `${tree.root.address} is a ${tree.root.className}; add_behaviour needs a Model or a part` };
  if (tree.truncated) return { error: `${tree.root.address} is too big to read in one go (the place cut its tree short), so paths inside it cannot all be checked. Add behaviours to a smaller Model inside it.` };

  // 2. What is already there.
  const cfgNode = tree.root.children.find((c) => c.className === 'ModuleScript' && c.name === BEHAVIOUR_MODULE);
  let existing: BehaviourRecord[] = [];
  let currentSource = '';
  const notes: string[] = [];
  if (cfgNode) {
    const read = await ctx.execStudioOp({ op: 'read_script', path: cfgNode.path }, 20_000);
    if (!read.ok) return { error: `${tree.root.address} already has ${BEHAVIOUR_MODULE} and it could not be read (${clip(read.error)}). Nothing was changed.` };
    currentSource = String(obj(read.data).source ?? '');
    if (a.replace !== true) {
      const parsed = parseConfigSource(currentSource);
      if ('error' in parsed) return { error: `${parsed.error}. Nothing was changed. Pass replace: true to write it afresh.` };
      if (parsed.edited) return { error: `${BEHAVIOUR_MODULE} in ${tree.root.address} was edited by hand since add_behaviour wrote it, so it cannot be merged into safely. Nothing was changed. Read it (read_script ${cfgNode.address}), then pass replace: true with the behaviours you want.` };
      // Re-validated, not trusted: the marker line is only a list the file claims.
      for (const [i, rec] of parsed.records.entries()) {
        const again = await readBehaviour({ tree, ctx, stored: true }, inputOf(tree, rec), i);
        if ('error' in again) notes.push(`dropped an existing behaviour that no longer holds (${String(rec.id)}): ${again.error}`);
        else existing.push(again.record);
      }
    }
  }

  const catalogue = describeVerbs();
  if (a.behaviours === undefined && a.remove === undefined) {
    return {
      model: tree.root.address,
      behaviours: fitNotes(existing.map(summaryOf), 10, 80),
      ...catalogue,
      next: 'add_behaviour {model, behaviours: [{verb, target, trigger, ...parameters}]}; read the model first with model_anatomy {model}',
    };
  }

  // 3. The new records.
  const removed: string[] = [];
  for (const id of (a.remove as string[] | undefined) ?? []) {
    const had = existing.length;
    existing = existing.filter((r) => r.id !== id);
    if (existing.length === had) return { error: `remove: there is no behaviour with id "${id}" on ${tree.root.address} (it has: ${existing.map((r) => r.id).join(', ') || 'none'})` };
    removed.push(id);
  }
  const added: BehaviourRecord[] = [];
  const replaced: string[] = [];
  const used = new Set<string>(existing.map((r) => r.id));
  for (const [i, raw] of ((a.behaviours as unknown[] | undefined) ?? []).entries()) {
    const read = await readBehaviour({ tree, ctx }, raw, i);
    if ('error' in read) return { error: `${read.error}. Nothing was written.` };
    notes.push(...read.notes);
    const rec = read.record;
    if (obj(raw).id === undefined) {
      let n = 1;
      while (used.has(`${rec.verb}${n === 1 ? '' : n}`) || added.some((x) => x.id === `${rec.verb}${n === 1 ? '' : n}`)) n++;
      rec.id = `${rec.verb}${n === 1 ? '' : n}`;
    } else if (added.some((x) => x.id === rec.id)) {
      return { error: `behaviours[${i}].id "${rec.id}" is used twice in this call. Nothing was written.` };
    } else if (used.has(rec.id)) {
      replaced.push(rec.id);
      existing = existing.filter((x) => x.id !== rec.id);
    }
    added.push(rec);
  }
  const all = [...existing, ...added];
  if (all.length > MAX_BEHAVIOURS) return { error: `that would be ${all.length} behaviours on one model; the limit is ${MAX_BEHAVIOURS}. Nothing was written.` };
  notes.push(...crossChecks(tree, all));

  // 4. Write the data, then the runtime that reads it.
  const source = renderConfigSource(tree.root.name, all);
  const write = cfgNode
    ? await ctx.execStudioOp({ op: 'edit_script', path: cfgNode.path, source, baseHash: sourceHash(currentSource) }, 60_000)
    : await ctx.execStudioOp({ op: 'edit_script', path: `${tree.root.path}.${BEHAVIOUR_MODULE}`, source, create: { className: 'ModuleScript', parent: tree.root.path } }, 60_000);
  if (!write.ok) return { error: `The behaviours were not written: ${clip(write.error)}` };
  const installed = await installRuntime(ctx);
  if (installed.error) return { changed: true, projectMutated: true, error: `The behaviours are written but the runtime that plays them was not installed: ${installed.error}` };

  // 5. Say only what was measured: read both scripts back.
  const verified: Record<string, string> = {};
  const back = await ctx.execStudioOp({ op: 'read_script', path: cfgNode ? cfgNode.path : `${tree.root.path}.${BEHAVIOUR_MODULE}` }, 20_000);
  verified.behaviours = !back.ok ? `unchecked (${clip(back.error)})` : String(obj(back.data).source ?? '') === source ? 'read back and matches' : 'READ BACK DIFFERENT from what was sent';
  verified.runtime = installed.verified;
  if (verified.behaviours.startsWith('READ BACK')) notes.push('the behaviours script reads back different from what was sent; read_script it before saying it works');

  return {
    changed: true,
    model: tree.root.address,
    behaviours: all.map(summaryOf),
    added: added.map((r) => r.id),
    ...(replaced.length ? { replaced } : {}),
    ...(removed.length ? { removed } : {}),
    verified,
    ...(notes.length ? { notes: fitNotes(notes) } : {}),
    next: 'These run when the game runs, not in Edit. Check it in play (play_check or run_and_check) before saying it works; ask for the model\'s state with model_anatomy if a path may have changed.',
  };
}

/** The runtime script: one copy per place, always the current version. Reads first, so an up-to-date copy costs one call. */
export async function installRuntime(ctx: AgentCtx): Promise<{ error?: string; verified: string }> {
  const files = COMPONENTS.behave!.files;
  let verified = 'unchecked';
  for (const f of files) {
    const path = `game.${f.parent}.${f.name}`;
    const current = await ctx.execStudioOp({ op: 'read_script', path }, 20_000);
    if (current.ok && String(obj(current.data).source ?? '') === f.source) { verified = 'already current'; continue; }
    await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);
    const out = await ctx.execStudioOp({ op: 'edit_script', path, source: f.source, create: { className: f.className, parent: `game.${f.parent}` } }, 60_000);
    if (!out.ok) return { error: clip(out.error), verified };
    const back = await ctx.execStudioOp({ op: 'read_script', path }, 20_000);
    verified = !back.ok ? `unchecked (${clip(back.error)})` : String(obj(back.data).source ?? '') === f.source ? 'installed and read back' : 'READ BACK DIFFERENT';
  }
  return { verified };
}

