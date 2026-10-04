/**
 * dress_object: the opt-in presentation for an object that is already in the place (a library model, or one made with
 * build_object). Every option is off unless the agent asks for it, and an empty call is an error that asks it to choose:
 * the harness used to put the same stage, wobble, counter and "Click it!" on every object, whatever it was, and a
 * treasure chest got the treatment of a butter stick.
 *
 *   stage    a slab under it (the object is raised by the slab's height so it stands ON it)
 *   click    the whole object moves when clicked or walked into, with a library sound if the agent names one
 *   counter  a number on the player's screen that counts those moves (needs click)
 *   attach   another ready-made piece fixed to it, where the agent says (the agent chose the piece from its own search)
 *
 * It never deletes a path it did not create, never touches the ground, the spawn, the lighting or the camera, and says in
 * its result what it added and what it did not.
 */
import type { AgentCtx } from './tools';
import { luau } from './compose';
import { typed } from './compose-run';
import { findSounds, soundAssetId } from './fx-library';
import { installAnimationPlayer } from './animate-tool';
import { contrastStage, motionClip, writeObjectHud, type ObjectPart } from './object-tool';
import { bounds, candidateOf, colourName, mainColourOf, safeObjectName, worldBox, type LibraryCandidate } from './library-object';
import { LIBRARY_IMPORT_MS, libraryMaterials } from './local-owner-corpus';

type V3 = [number, number, number];
const MOTIONS = ['wobble', 'spin', 'bob', 'pop', 'press', 'open'] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;
const OPTIONS = ['stage', 'click', 'counter', 'attach'] as const;
const clip = (s: unknown) => String(s ?? '').slice(0, 160);
const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/** The model's own name from its path, when it stands directly in Workspace. Pure. */
export function targetName(path: unknown): string | null {
  const m = /^game\.Workspace\.([^.[\]\\"]{1,40})$/.exec(String(path ?? '').trim());
  return m ? m[1]! : null;
}

export async function dressObject(ctx: AgentCtx, a: Record<string, unknown>) {
  const asked = OPTIONS.filter((k) => a[k] !== undefined && a[k] !== null && a[k] !== false);
  if (!asked.length) {
    return { error: `choose at least one of ${OPTIONS.join(', ')}: nothing is added by default (no stage, no click response, no counter, no effect). Decide what THIS object calls for, or add nothing.` };
  }
  const name = targetName(a.target);
  if (!name) return { error: 'target must be the path of an object directly in Workspace, e.g. game.Workspace.Chest' };
  const model = `game.Workspace.${name}`;
  if (a.counter && !a.click && !(await ctx.execStudioOp({ op: 'get_instance', path: `${model}.AppleBody` }, 10_000).catch(() => null))?.ok) {
    return { error: 'counter counts the moves a click or a walk-in sets off: ask for click in the same call (or dress it with click first)' };
  }
  const tree = await ctx.execStudioOp({ op: 'get_tree', root: model, maxDepth: 12, maxNodes: 600 }, 30_000).catch(() => null);
  if (!tree?.ok) return { error: `${model} is not in the place` };
  const whole = !(tree.data as { truncated?: unknown }).truncated;
  const root = (tree.data as { root?: unknown }).root;
  const box = (whole ? worldBox(root) : null) ?? await bounds(ctx.execStudioOp, model);
  if (!box) return { error: `${model} has no measurable size` };
  const added: string[] = [];
  const problems: string[] = [];
  let mutated = false;
  const [cx, , cz] = box.center;
  const [sx, sy, sz] = box.size;
  let bottomY = box.bottomY;
  let hasBody = (await ctx.execStudioOp({ op: 'get_instance', path: `${model}.AppleBody` }, 10_000).catch(() => null))?.ok === true;
  const mk = (spec: Parameters<typeof typed>[0], parent: string) => ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed(spec), parent }] }, 20_000);

  // stage: a slab under the object; the object is raised by its height so it stands on it.
  if (a.stage) {
    const o = (typeof a.stage === 'object' ? a.stage : {}) as Record<string, unknown>;
    const stageName = `${name}Stage`;
    const taken = await ctx.execStudioOp({ op: 'get_instance', path: `game.Workspace.${stageName}` }, 10_000).catch(() => null);
    if (taken?.ok) problems.push(`stage: game.Workspace.${stageName} already exists; not replaced (delete it first, or leave it)`);
    else {
      const h = num(o.height, 2, 0.2, 10), pad = num(o.pad, 6, 0, 60);
      const color = HEX.test(String(o.color ?? '')) ? String(o.color) : contrastStage(mainColourOf(root));
      const lift = await ctx.execStudioOp({ op: 'transform_instances', paths: [model], move: [0, h, 0] }, 20_000).catch(() => null);
      if (!lift?.ok) problems.push(`stage: the object could not be raised (${clip(lift?.error)})`);
      else {
        bottomY += h;
        const made = await mk({ className: 'Model', name: stageName, children: [
          { className: 'Part', name: 'Stage', props: { Size: [sx + pad * 2, h, sz + pad * 2], Position: [cx, bottomY - h / 2, cz], Anchored: true, Color: color, Material: 'Plastic' } },
        ] }, 'game.Workspace');
        if (made.ok) { added.push(`a ${colourName(color)} stage ${h} studs high under it (the object was raised by ${h})`); mutated = true; }
        else problems.push(`stage: ${clip(made.error)}`);
      }
    }
  }

  // click: the whole object moves as one, from an invisible body every part is welded to and one motor turns.
  let moves = false;
  if (a.click) {
    const o = (typeof a.click === 'object' ? a.click : {}) as Record<string, unknown>;
    const as = String(o.motion ?? '').toLowerCase();
    if (!(MOTIONS as readonly string[]).includes(as)) return { error: `click.motion must be one of ${MOTIONS.join(', ')}: choose how THIS object should react`, ...(mutated ? { changed: true, projectMutated: true, added } : {}) };
    if (hasBody) problems.push('click: it already has a click response (AppleBody); delete AppleBody and AppleRoot first to change it');
    else {
      const body: ObjectPart = { name: 'AppleBody', shape: 'block', size: [sx + 0.2, sy + 0.2, sz + 0.2], at: [0, 0, 0], color: '#ffffff', move: { as, on: 'click', ...(Number.isFinite(Number(o.amount)) ? { amount: Number(o.amount) } : {}) } };
      const madeBody = await mk({ className: 'Part', name: 'AppleBody', props: { Size: body.size, Position: [cx, bottomY + sy / 2, cz], Anchored: true, CanCollide: false, CanTouch: true, CanQuery: true, Transparency: 1 } }, model);
      if (!madeBody.ok) problems.push(`click: ${clip(madeBody.error)}`);
      else {
        mutated = true;
        const welded = await ctx.execStudioOp({ op: 'rig_model', root: `${model}.AppleBody`, joint: 'weld' }, 60_000);
        const madeRoot = welded.ok ? await mk({ className: 'Part', name: 'AppleRoot', props: { Size: [1, 1, 1], Position: [cx, bottomY + 0.5, cz], Anchored: true, CanCollide: false, CanTouch: false, CanQuery: false, Transparency: 1 } }, model) : welded;
        const motor = madeRoot.ok ? await ctx.execStudioOp({ op: 'rig_model', root: `${model}.AppleRoot`, parts: [`${model}.AppleBody`], joint: 'motor' }, 60_000) : madeRoot;
        if (!motor.ok) problems.push(`click rig: ${clip(motor.error)}`);
        else {
          await ctx.execStudioOp({ op: 'set_joint_pivot', joint: `${model}.AppleRoot.AppleBody`, at: [cx, bottomY, cz] }, 20_000).catch(() => undefined);
          // The sound is the agent's: an asset id, or words for the sound library. Said in the result either way.
          let sound: string | undefined, soundSaid = 'no sound (none asked for)';
          if (o.sound !== undefined && String(o.sound).trim()) {
            const direct = soundAssetId(o.sound);
            const hit = direct ? undefined : findSounds(String(o.sound), { limit: 1, maxSeconds: 4 })[0];
            sound = direct ? `rbxassetid://${direct}` : hit?.soundId;
            soundSaid = sound ? `sound ${direct ? `id ${direct}` : `"${hit?.name ?? o.sound}"`}` : `no sound: nothing in the library matched "${String(o.sound).slice(0, 40)}"`;
          }
          const clips = { [`AppleBody.${as}`]: { ...motionClip(body), ...(sound ? { sound, volume: 0.7 } : {}) } };
          const wrote = await ctx.execStudioOp({ op: 'edit_script', path: `${model}.AppleAnimations`, source: `-- What ${luau(name).slice(1, -1)} does when clicked or walked into, played by AppleAnimate. Written by StudPilot's dress_object; edit freely.\nreturn ${luau(clips)}\n`, create: { className: 'ModuleScript', parent: model } }, 60_000);
          const player = wrote.ok ? await installAnimationPlayer(ctx) : 'animations not written';
          moves = wrote.ok && !player;
          hasBody = true;
          if (moves) added.push(`it ${as === 'spin' ? 'spins' : as === 'bob' ? 'bobs' : as === 'pop' ? 'pops' : as === 'press' ? 'presses down' : as === 'open' ? 'swings open' : 'wobbles'} when clicked or walked into (${soundSaid})`);
          else problems.push(`click motion: ${clip(wrote.ok ? player : wrote.error)}`);
        }
      }
    }
  }

  // counter: a number on the player's screen that counts the moves players set off.
  if (a.counter) {
    const o = (typeof a.counter === 'object' ? a.counter : {}) as Record<string, unknown>;
    const label = String(o.label ?? '').trim();
    if (!label) problems.push('counter: give a label (what the number counts, in the user\'s language)');
    else if (!moves && !hasBody) problems.push('counter: nothing to count; the click response was not made');
    else {
      const failed = await writeObjectHud(ctx, name, { counter: label, ...(o.hint ? { hint: o.hint } : {}) });
      if (failed) problems.push(failed); else { added.push(`a counter "${label.slice(0, 24)}" on the player's screen${o.hint ? ' with a hint' : ''}`); mutated = true; }
    }
  }

  // attach: other ready-made pieces fixed to it, where the agent says.
  if (Array.isArray(a.attach)) {
    let n = 0;
    for (const raw of a.attach.slice(0, 6)) {
      n++;
      const item = (raw ?? {}) as Record<string, unknown>;
      const c = candidateOf(item);
      if ('error' in c) { problems.push(`attach ${n}: ${c.error}`); continue; }
      const done = await attachPiece(ctx, model, name, c, item, { cx, cz, topY: bottomY + sy, bottomY, sx, sz, hasBody });
      if (typeof done === 'string') problems.push(`attach ${n} (${c.name}): ${done}`); else { added.push(`${c.name} fixed ${done.where}${hasBody ? ', moving with it' : ''}`); mutated = true; }
    }
  }

  const left = OPTIONS.filter((k) => !asked.includes(k));
  return {
    ...(mutated ? { changed: true, projectMutated: true } : {}),
    object: model,
    added,
    ...(problems.length ? { problems } : {}),
    notAdded: left.length ? `not asked for, so not added: ${left.join(', ')}` : undefined,
    ...(!mutated && problems.length ? { error: `nothing was added: ${problems.join('; ')}` } : {}),
    note: 'Information, not a verdict: this is what dress_object did. Check it with play_check or a look, and tell the user only what is really there.',
  };
}

/** One ready-made piece fixed to the object (welded to its click body when it has one). The reason, or where it went. */
async function attachPiece(ctx: AgentCtx, model: string, name: string, c: LibraryCandidate, item: Record<string, unknown>, at: { cx: number; cz: number; topY: number; bottomY: number; sx: number; sz: number; hasBody: boolean }): Promise<string | { where: string }> {
  const pieceName = safeObjectName(item.pieceName ?? c.name) || 'Piece';
  const folderPath = 'game.ServerStorage.AppleParts.AppleDress';
  const parts = await ctx.execStudioOp({ op: 'get_instance', path: 'game.ServerStorage.AppleParts' }, 10_000).catch(() => null);
  const madeFolder = !parts?.ok;
  if (madeFolder) await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Folder', name: 'AppleParts' }), parent: 'game.ServerStorage' }] }, 20_000).catch(() => undefined);
  const drop = () => ctx.execStudioOp({ op: 'delete_instances', paths: [madeFolder ? 'game.ServerStorage.AppleParts' : folderPath] }, 20_000).catch(() => undefined);
  try {
    await ctx.execStudioOp({ op: 'delete_instances', paths: [folderPath] }, 20_000).catch(() => undefined);
    await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Folder', name: 'AppleDress' }), parent: 'game.ServerStorage.AppleParts' }] }, 20_000).catch(() => undefined);
    let from = folderPath;
    if (c.source === 'owner') {
      await libraryMaterials(ctx, c.gameId!).catch(() => undefined);
      const imported = await ctx.execStudioOp({ op: 'import_owner_library', gameId: c.gameId!, path: c.path!, mode: 'self', parent: folderPath, applyServiceProperties: false, studioData: true }, LIBRARY_IMPORT_MS).catch(() => null);
      if (!imported?.ok) return `could not be imported: ${clip(imported?.error)}`;
    } else {
      const { TOOLS } = await import('./tools');
      const inserted = await TOOLS.insert_library_model!.run(ctx, { id: c.id, parent: folderPath }).catch(() => ({ error: 'insert failed' })) as Record<string, unknown>;
      const paths = Array.isArray(inserted.inserted) ? inserted.inserted.filter((p): p is string => typeof p === 'string') : [];
      if ('error' in inserted || paths.length !== 1) return clip(inserted.error ?? 'was inserted as several pieces');
      from = paths[0]!;
    }
    await ctx.execStudioOp({ op: 'strip_descendants', root: folderPath, classes: ['LocalScript', 'Script', 'ModuleScript', 'Sound'] }, 30_000).catch(() => undefined);
    await ctx.execStudioOp({ op: 'strip_descendants', root: folderPath, classes: ['BillboardGui', 'ProximityPrompt', 'ClickDetector'] }, 30_000).catch(() => undefined);
    const where = item.at === 'top' || item.at === undefined ? 'top' : 'given';
    const at3: V3 = Array.isArray(item.at) && item.at.length === 3 && item.at.every((n) => Number.isFinite(Number(n))) ? item.at.map(Number) as V3 : [at.cx, at.topY - 0.2, at.cz];
    const width = num(item.width, Math.max(2, Math.min(Math.max(at.sx, at.sz) / 2, Math.min(at.sx, at.sz) * 1.1)), 0.2, 500);
    const placed = await ctx.execStudioOp({ op: 'place_copies', items: [{ from, parent: model, name: pieceName, at: at3, length: width }] }, 60_000).catch(() => null);
    if (!placed?.ok) return `could not be placed: ${clip(placed?.error)}`;
    if (at.hasBody) {
      const cb = await bounds(ctx.execStudioOp, `${model}.${pieceName}`);
      const rootName = `${pieceName}Root`;
      const root = cb ? await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Part', name: rootName, props: { Size: [1, 1, 1], Position: cb.center, Anchored: true, CanCollide: false, CanQuery: false, CanTouch: false, Transparency: 1 } }), parent: `${model}.${pieceName}` }] }, 20_000) : { ok: false as const };
      const inner = root.ok ? await ctx.execStudioOp({ op: 'rig_model', root: `${model}.${pieceName}.${rootName}`, joint: 'weld' }, 60_000) : root;
      const outer = inner.ok ? await ctx.execStudioOp({ op: 'rig_model', root: `${model}.AppleBody`, parts: [`${model}.${pieceName}.${rootName}`], joint: 'weld' }, 60_000) : inner;
      // rig_model anchors its root; the body is moved by its motor, so it is let go again.
      await ctx.execStudioOp({ op: 'set_props', path: `${model}.AppleBody`, props: { Anchored: { t: 'bool', v: false } } }, 20_000).catch(() => undefined);
      if (!outer.ok) { await ctx.execStudioOp({ op: 'delete_instances', paths: [`${model}.${pieceName}`] }, 20_000).catch(() => undefined); return `could not be fixed to ${name}: ${clip((outer as { error?: unknown }).error)}`; }
    }
    return { where: where === 'top' ? 'on top' : 'where you said' };
  } finally {
    await drop();
  }
}
