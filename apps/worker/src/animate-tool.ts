/**
 * Making things MOVE, the way the owner's tutorial does it ("How to Animate Models in Roblox Studio!", 2026-10-01) with the
 * RigEdit Lite plugin he supplied: rig the model (Motor6Ds from a static root outwards, each named after its part and
 * parented to the part it hangs from), put each pivot on its hinge, then play keyframes on a trigger. The one step
 * Apple cannot do is publish an animation asset, so the keyframes are played from code by the animate component
 * (packages/components/animate) and the game runs without Apple.
 *
 * rig_model     -> plugin ops rig_model + set_joint_pivot   (apps/apple-plugin/src/ops/Joints.luau)
 * animate_model -> a ModuleScript AppleAnimations in the model + the AppleAnimate script in ServerScriptService
 */
import type { AgentCtx } from './tools';
import { COMPONENTS } from './components.generated';
import { luau } from './compose';
import { refuseSoundId } from './fx-library';

const clip = (s: unknown) => String(s ?? '').slice(0, 300);
const vec3 = (v: unknown): [number, number, number] | null =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e5) ? v as [number, number, number] : null;

export async function rigModel(ctx: AgentCtx, a: Record<string, unknown>) {
  const root = String(a.root ?? '');
  if (!root.startsWith('game.')) return { error: 'root must be the path of the part that stays still, e.g. game.Workspace.Cannon.Base' };
  const parts = Array.isArray(a.parts) ? a.parts.map((p) => typeof p === 'string' ? p : p && typeof p === 'object' ? { part: String((p as Record<string, unknown>).part ?? ''), to: String((p as Record<string, unknown>).to ?? '') } : '') : undefined;
  const joint = a.joint === 'weld' ? 'weld' : 'motor';
  const out = await ctx.execStudioOp({ op: 'rig_model', root, ...(parts ? { parts: parts as never } : {}), joint }, 60_000);
  if (!out.ok) return { error: `The model was not rigged: ${clip(out.error)}` };
  const rigged = out.data as { joints?: string[] };
  const pivots: unknown[] = Array.isArray(a.pivots) ? a.pivots : [];
  const placed: unknown[] = [];
  for (const p of pivots.slice(0, 200)) {
    const pv = (p ?? {}) as Record<string, unknown>;
    const at = vec3(pv.at), turn = vec3(pv.turn);
    if (!at && !turn) continue;
    const res = await ctx.execStudioOp({ op: 'set_joint_pivot', joint: String(pv.joint ?? ''), ...(at ? { at } : {}), ...(turn ? { turn } : {}) }, 30_000);
    if (!res.ok) return { changed: true, projectMutated: true, error: `Rigged, but a hinge was not placed (${String(pv.joint)}): ${clip(res.error)}`, joints: rigged.joints };
    placed.push(res.data);
  }
  return {
    changed: true,
    joints: rigged.joints,
    pivots: placed,
    note: 'Each joint is named after its part. Now animate_model {model, clips} to make it move; a joint rotates about its pivot.',
  };
}

const PLAYS = new Set(['loop', 'click', 'prompt', 'touch', 'once', 'key']);
const EASES = new Set(['Linear', 'Sine', 'Quad', 'Back', 'Bounce', 'Elastic']);
const JOINT = /^[A-Za-z_][A-Za-z0-9_ ]{0,39}$/;

/** The clips the model gave, checked and normalised, or why not. Pure (tests/animate.test.mjs). */
export function readClips(raw: unknown, discovered?: ReadonlySet<number>): { clips: Record<string, unknown> } | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'clips must be an object: { name: { play, length, keys } }' };
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 40) return { error: 'give 1 to 40 clips' };
  const clips: Record<string, unknown> = {};
  for (const [name, c] of entries) {
    if (!/^([A-Za-z_][A-Za-z0-9_]{0,39}\.)?[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(name)) return { error: `clip name "${name}" must be a plain name, or Part.name to start from one part` };
    const v = (c ?? {}) as Record<string, unknown>;
    const play = String(v.play ?? 'once');
    if (!PLAYS.has(play)) return { error: `${name}.play must be loop, click, prompt, touch, key or once` };
    if (play === 'key' && !(typeof v.key === 'string' && /^[A-Za-z][A-Za-z0-9]{0,19}$/.test(v.key))) return { error: `${name}.key must be an input key name (Enum.KeyCode), e.g. "A", "Space", "Return"` };
    const keysIn = Array.isArray(v.keys) ? v.keys : [];
    if (keysIn.length < 2 || keysIn.length > 120) return { error: `${name}.keys needs 2 to 120 keys` };
    const keys: Record<string, unknown>[] = [];
    let longest = 0;
    for (const [i, k] of keysIn.entries()) {
      const kv = (k ?? {}) as Record<string, unknown>;
      const t = Number(kv.t);
      if (!Number.isFinite(t) || t < 0 || t > 600) return { error: `${name}.keys[${i}].t must be seconds from 0` };
      longest = Math.max(longest, t);
      const key: Record<string, unknown> = { t };
      if (kv.ease !== undefined) {
        if (!EASES.has(String(kv.ease))) return { error: `${name}.keys[${i}].ease must be one of ${[...EASES].join(', ')}` };
        key.ease = String(kv.ease);
      }
      let poses = 0;
      for (const [joint, pose] of Object.entries(kv)) {
        if (joint === 't' || joint === 'ease') continue;
        if (!JOINT.test(joint)) return { error: `${name}.keys[${i}]: "${joint}" is not a joint name` };
        const pv = (pose ?? {}) as Record<string, unknown>;
        const rot = pv.rot === undefined ? undefined : vec3(pv.rot);
        const move = pv.move === undefined ? undefined : vec3(pv.move);
        if (rot === null || move === null || (!rot && !move)) return { error: `${name}.keys[${i}].${joint} needs rot and/or move as [x, y, z]` };
        key[joint] = { ...(rot ? { rot } : {}), ...(move ? { move } : {}) };
        poses++;
      }
      if (poses === 0) return { error: `${name}.keys[${i}] names no joint` };
      keys.push(key);
    }
    const length = v.length === undefined ? longest : Number(v.length);
    if (!Number.isFinite(length) || length <= 0 || length > 600) return { error: `${name}.length must be the clip's seconds` };
    const out: Record<string, unknown> = { play, length, keys };
    if (v.sound !== undefined && v.sound !== '') {
      const refused = refuseSoundId({ SoundId: v.sound }, discovered);
      if (refused) return { error: `${name}.sound: ${refused.error}` };
      out.sound = String(v.sound);
      for (const opt of ['volume', 'pitch'] as const) if (typeof v[opt] === 'number' && Number.isFinite(v[opt]) && (v[opt] as number) > 0 && (v[opt] as number) <= 4) out[opt] = v[opt];
    }
    if (typeof v.prompt === 'string') out.prompt = v.prompt.slice(0, 30);
    if (play === 'key') out.key = v.key;
    if (typeof v.reach === 'number' && v.reach > 0 && v.reach <= 200) out.reach = v.reach;
    clips[name] = out;
  }
  return { clips };
}

export async function animateModel(ctx: AgentCtx, a: Record<string, unknown>) {
  const model = String(a.model ?? '');
  if (!model.startsWith('game.Workspace.')) return { error: 'model must be the path of a Model in Workspace' };
  const read = readClips(a.clips, ctx.discoveredAssetIds);
  if ('error' in read) return { error: read.error };
  // Rig first when asked (RigEdit's way), so one call takes a model from still to moving.
  let rigged: Record<string, unknown> | undefined;
  if (a.rig && typeof a.rig === 'object') {
    const r = await rigModel(ctx, a.rig as Record<string, unknown>);
    if ('error' in r) return r;
    rigged = r;
  }
  const source = `-- What ${model.split('.').pop()} does, played by AppleAnimate (ServerScriptService). Written by Apple; edit freely.\n` +
    `-- Each clip: play = loop|click|prompt|touch|once, length in seconds, keys = { { t, ease?, <Joint> = { rot = {x,y,z} degrees, move = {x,y,z} studs } } }.\nreturn ${luau(read.clips)}\n`;
  const path = `${model}.AppleAnimations`;
  await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);
  const wrote = await ctx.execStudioOp({ op: 'edit_script', path, source, create: { className: 'ModuleScript', parent: model } }, 60_000);
  if (!wrote.ok) return { error: `The animations were not written: ${clip(wrote.error)}` };
  const installed = await installAnimationPlayer(ctx);
  if (installed) return { changed: true, projectMutated: true, error: `The animations are written but the player was not installed: ${installed}` };
  return {
    changed: true,
    ...(rigged ? { joints: rigged.joints } : {}),
    clips: Object.keys(read.clips),
    note: 'Loops start when the game starts; click/prompt/touch clips start on that action. Check it in play (play_check or run_and_check) before saying it moves.',
  };
}

/** The animation player (server and client halves): one copy per place, always the current version. Null when done. */
export async function installAnimationPlayer(ctx: AgentCtx): Promise<string | null> {
  for (const f of COMPONENTS.animate!.files) {
    const path = `game.${f.parent}.${f.name}`;
    await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);
    const out = await ctx.execStudioOp({ op: 'edit_script', path, source: f.source, create: { className: f.className, parent: `game.${f.parent}` } }, 60_000);
    if (!out.ok) return clip(out.error);
  }
  return null;
}
