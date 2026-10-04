/**
 * LOOK, THE CAMERA HALF — frame what was changed from several angles, player eye level included, and
 * put the user's camera back.
 *
 * It uses ONLY plugin operations that already exist, so no plugin release is needed for it:
 *   viewport_info           the camera now (to restore it), the top-level layout, where the spawn is
 *   spatial_query (bounds)  how big the thing that changed is, and where
 *   set_props               on `game.Workspace.Camera` only: aim the camera
 *   camera_focus            Studio's own single framing, if set_props on the camera is refused
 *   capture_studio_viewport native pixels of the viewport
 *   render_view             (through `boxViews`) the old software rasteriser, when there are no native pixels
 * Nothing is created or deleted, so there is nothing to leave behind.
 *
 * WHAT IT DECIDES, AND WHAT IT DOES NOT. It decides where to stand: a front view, a high view, a side
 * view and one at a player's eye height. It does not decide what looks good; the pixels go to the vision
 * role for OBSERVATIONS (look-observe.ts) and the agent reads them and judges.
 *
 * HONEST ABOUT WHAT IT COULD NOT DO. If native capture is missing it says the views are a "box
 * approximation". If the camera cannot be aimed it falls back to one framed view and says the camera
 * could not be put back. If there is no pixel at all it reports a failure to look, never an
 * observation.
 *
 * Every dependency is injected (`LookDeps`), so the whole thing runs in tests with a fake plugin.
 */
import type { OpResult, StudioFrame, StudioOp } from '@studpilot/shared';
import { bytesToBase64, decodeRgbBase64, encodePng } from './png.ts';
import type { LookFrame, ObserveInput, ObserveResult, Observation, Answer } from './look-observe.ts';
import { LOOK_FRAME_MAX } from './look-observe.ts';

export const CAMERA_PATH = 'game.Workspace.Camera';
/** A player's eyes above the surface they stand on, in studs (a default R15 head is about here). */
const EYE_HEIGHT = 4.7;
/** Pause between aiming the camera and capturing, so the viewport has drawn the new pose. */
export const DEFAULT_SETTLE_MS = 350;

export const LOOK_VIEWS = Object.freeze({
  default: ['front', 'high', 'eye'] as const,
  all: ['front', 'high', 'side', 'eye'] as const,
});
const VIEW_NAMES: ReadonlySet<string> = new Set(LOOK_VIEWS.all);

type Vec = [number, number, number];
export interface Box { centre: Vec; size: Vec }
export interface Pose { name: string; label: string; cframe: number[]; focus: Vec }

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * The 12 components of a Roblox CFrame at `pos` looking at `target` (Roblox's CFrame.lookAt):
 * x, y, z, then the rotation matrix row by row, whose COLUMNS are the right, up and back vectors.
 */
export function lookAtComponents(pos: Vec, target: Vec): number[] {
  const look = norm(sub(target, pos));
  // Looking straight up or down has no "right" from world-up: borrow another axis.
  const worldUp: Vec = Math.abs(look[1]) > 0.999 ? [0, 0, -1] : [0, 1, 0];
  const right = norm(cross(look, worldUp));
  const up = cross(right, look);
  const back: Vec = [-look[0], -look[1], -look[2]];
  // `n === 0 ? 0 : n` turns -0 into 0, so a pose compares and prints like the number it is.
  return [pos[0], pos[1], pos[2], right[0], up[0], back[0], right[1], up[1], back[1], right[2], up[2], back[2]].map((n) => (n === 0 ? 0 : n));
}

function union(boxes: Box[]): { centre: Vec; radius: number; groundY: number } {
  const lo: Vec = [Infinity, Infinity, Infinity];
  const hi: Vec = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let i = 0; i < 3; i++) {
    lo[i] = Math.min(lo[i]!, b.centre[i]! - b.size[i]! / 2);
    hi[i] = Math.max(hi[i]!, b.centre[i]! + b.size[i]! / 2);
  }
  const centre: Vec = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  return { centre, radius: Math.max(3, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2), groundY: lo[1] };
}

/**
 * Where to stand. Each pose looks at the middle of what changed, from outside it. `eye` stands at a
 * player's eye height: on the spawn when the spawn is close enough to see the change, otherwise beside
 * the change at the same height, and the label says which, so the claim is never larger than the view.
 */
export function framePoses(i: { boxes: Box[]; spawn: Box | null; views: readonly string[] }): Pose[] {
  if (!i.boxes.length) return [];
  const { centre, radius, groundY } = union(i.boxes);
  const d = Math.min(600, Math.max(14, radius * 2.1 + 6));
  const floor = groundY - 2;
  const at = (offset: Vec): Vec => [centre[0] + offset[0], Math.max(centre[1] + offset[1], floor + 2), centre[2] + offset[2]];
  const out: Pose[] = [];
  for (const name of i.views) {
    if (!VIEW_NAMES.has(name)) continue;
    let pos: Vec;
    let label = name;
    let focus: Vec = centre;
    if (name === 'front') pos = at([0.15 * d, 0.35 * d, 0.92 * d]);
    else if (name === 'side') pos = at([0.95 * d, 0.3 * d, 0.05 * d]);
    else if (name === 'high') pos = at([-0.55 * d, 0.8 * d, -0.55 * d]);
    else {
      const spawn = i.spawn;
      const far = spawn ? Math.hypot(spawn.centre[0] - centre[0], spawn.centre[2] - centre[2]) : Infinity;
      if (spawn && far <= radius * 4 + 60 && far > radius * 0.5) {
        pos = [spawn.centre[0], spawn.centre[1] + spawn.size[1] / 2 + EYE_HEIGHT, spawn.centre[2]];
        label = 'eye (player eye level from the spawn)';
      } else {
        pos = [centre[0], groundY + EYE_HEIGHT, centre[2] + radius + 10];
        label = 'eye (player eye level, near the change)';
      }
      focus = [centre[0], pos[1] - 0.5, centre[2]];
    }
    out.push({ name, label, cframe: lookAtComponents(pos, focus), focus });
  }
  return out;
}

// ------------------------------------------------------------------------------------- the run ---

export interface LookDeps {
  exec(op: StudioOp, timeoutMs?: number): Promise<OpResult>;
  /** The software box views, for a Studio with no native capture. */
  boxViews(target: string | undefined): Promise<{ frames: LookFrame[] } | { error: string }>;
  observe(input: ObserveInput): Promise<ObserveResult>;
  emitFrame?(frame: StudioFrame): void;
  sleep?(ms: number): Promise<void>;
  /** How long the viewport gets to draw a new pose before it is captured. Default DEFAULT_SETTLE_MS. */
  settleMs?: number;
}

export interface LookArgs {
  request: string;
  /** Paths this run changed, newest last. */
  touched: string[];
  /** The agent's own choice of what to frame; defaults to the places the run changed. */
  targets?: string[];
  expect?: string[];
  questions?: string[];
  views?: string[];
}

export interface LookOutcome {
  ok: boolean;
  source: 'studio_viewport' | 'box_approximation' | 'none';
  views: string[];
  observations: Observation[];
  answers: Answer[];
  issues: string[];
  neurons: number;
  /** true: put back. false: could not be. null: never moved. */
  cameraRestored: boolean | null;
  note: string;
  error?: string;
}

const isVec = (v: unknown): v is Vec => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The Workspace item that contains each path the run changed, so a whole built thing is framed, not one of its parts. */
function subjectsFrom(touched: string[]): string[] {
  const out: string[] = [];
  for (const p of [...touched].reverse()) {
    const m = /^(game\.Workspace(?:\.[A-Za-z_][A-Za-z0-9_]*|\["(?:[^"\\]|\\.)*"\]))/.exec(p);
    if (m && !out.includes(m[1]!)) out.push(m[1]!);
    if (out.length >= 4) break;
  }
  return out;
}

interface TopLevel { path: string; class: string; box: Box }

function topLevelOf(info: unknown): TopLevel[] {
  const rows = isObj(info) && isObj(info.data) ? info.data.workspaceTopLevel : undefined;
  if (!Array.isArray(rows)) return [];
  const out: TopLevel[] = [];
  for (const r of rows) {
    if (isObj(r) && typeof r.path === 'string' && isVec(r.center) && isVec(r.size)) {
      out.push({ path: r.path, class: typeof r.class === 'string' ? r.class : '', box: { centre: r.center, size: r.size } });
    }
  }
  return out;
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
// The plugin caps a capture at 240 KB (StudioCapture.luau MAX_PNG_BYTES); a smaller cap here dropped busy scenes.
const MAX_PNG_BYTES = 240 * 1024;

/** A native capture as a bounded PNG the vision role may be sent, or null. Never throws. */
async function toLookFrame(data: unknown, label: string): Promise<{ frame: LookFrame; raw: StudioFrame } | null> {
  try {
    if (!isObj(data) || data.source !== 'studio_viewport' || typeof data.rgbBase64 !== 'string' || !data.rgbBase64) return null;
    const w = data.width;
    const h = data.height;
    if (!Number.isInteger(w) || !Number.isInteger(h) || (w as number) < 1 || (h as number) < 1 || (w as number) > 640 || (h as number) > 480) return null;
    if (data.rgbBase64.length > 400 * 1024) return null;
    let bytes = decodeRgbBase64(data.rgbBase64);
    if (data.encoding === 'rgb24') {
      if (bytes.length !== (w as number) * (h as number) * 3) return null;
      bytes = await encodePng(bytes, w as number, h as number);
    } else if (data.encoding !== 'png') return null;
    if (bytes.length < 33 || bytes.length > MAX_PNG_BYTES || PNG_SIG.some((v, i) => bytes[i] !== v)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(16) !== w || view.getUint32(20) !== h) return null;
    return {
      frame: { label, source: 'studio_viewport', pngBase64: bytesToBase64(bytes), width: w as number, height: h as number },
      raw: data as unknown as StudioFrame,
    };
  } catch {
    return null;
  }
}

/** Look at the changed place. Never throws; the camera is put back on every path. */
export async function runLook(d: LookDeps, a: LookArgs): Promise<LookOutcome> {
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const settleMs = d.settleMs ?? DEFAULT_SETTLE_MS;
  const call = async (op: StudioOp, timeoutMs = 20_000): Promise<OpResult> => {
    try {
      return await d.exec(op, timeoutMs);
    } catch (e) {
      return { id: 'none', ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const info = await call({ op: 'viewport_info' });
  // A Studio that did not answer at all will not answer the next ten operations either: do not spend minutes of timeouts finding out.
  if (!info.ok && (info.failure === 'timeout' || info.failure === 'transport')) {
    return {
      ok: false, source: 'none', views: [], observations: [], answers: [], issues: [], neurons: 0, cameraRestored: null,
      note: 'Nothing was observed.',
      error: 'I could not look at the place: Studio did not answer. Do not claim anything about how it looks.',
    };
  }
  const saved = isObj(info.data) && isObj(info.data.camera) && Array.isArray(info.data.camera.cframe)
    && info.data.camera.cframe.length === 12 && info.data.camera.cframe.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
    ? (info.data.camera.cframe as number[])
    : null;
  const top = info.ok ? topLevelOf(info) : [];
  const subjects = (a.targets?.length ? a.targets.slice(0, 6) : subjectsFrom(a.touched ?? [])).filter((p) => typeof p === 'string' && p);
  const wanted = (a.views ?? []).filter((v) => VIEW_NAMES.has(v)).filter((v, i, all) => all.indexOf(v) === i);
  const views = wanted.length ? wanted : [...LOOK_VIEWS.default];

  // Where the change is. A bounds query per subject; the top-level summary answers if that op is not there.
  const boxes: Box[] = [];
  if (saved) {
    for (const path of subjects) {
      const b = await call({ op: 'spatial_query', action: 'bounds', path });
      const dat = b.ok && isObj(b.data) ? b.data : null;
      if (dat && isVec(dat.center) && isVec(dat.size)) { boxes.push({ centre: dat.center, size: dat.size }); continue; }
      const owner = top.filter((t) => path === t.path || path.startsWith(`${t.path}.`) || path.startsWith(`${t.path}[`)).sort((x, y) => y.path.length - x.path.length)[0];
      if (owner) boxes.push(owner.box);
    }
  }
  const spawn = top.find((t) => t.class === 'SpawnLocation')?.box ?? null;

  const frames: LookFrame[] = [];
  let moved = false;
  let nativeBroke = false;
  let restored: boolean | null = null;

  const grab = async (label: string): Promise<boolean> => {
    const cap = await call({ op: 'capture_studio_viewport' }, 45_000);
    const got = cap.ok ? await toLookFrame(cap.data, label) : null;
    if (!got) return false;
    frames.push(got.frame);
    d.emitFrame?.({ ...got.raw, view: label });
    return true;
  };

  try {
    if (saved && boxes.length) {
      const poses = framePoses({ boxes, spawn, views });
      let refused = false;
      for (const p of poses.slice(0, LOOK_FRAME_MAX)) {
        const set = await call({ op: 'set_props', path: CAMERA_PATH, props: { CFrame: { t: 'CFrame', v: p.cframe } } });
        if (!set.ok) { refused = frames.length === 0; break; }
        moved = true;
        await sleep(settleMs);
        if (!(await grab(p.label))) { nativeBroke = true; break; }
      }
      // Aiming the camera was refused: Studio's own single framing still gives one real picture of the change.
      if (refused && subjects[0]) {
        const focus = await call({ op: 'camera_focus', path: subjects[0] });
        if (focus.ok) {
          moved = true;
          await sleep(settleMs);
          if (!(await grab('framed by Studio'))) nativeBroke = true;
        }
      }
    } else if (!(await grab('current view'))) {
      nativeBroke = true;
    }
  } catch {
    nativeBroke = frames.length === 0;
  } finally {
    if (moved) {
      const back = saved ? await call({ op: 'set_props', path: CAMERA_PATH, props: { CFrame: { t: 'CFrame', v: saved } } }) : null;
      restored = back?.ok === true;
    }
  }

  let source: LookOutcome['source'] = frames.length ? 'studio_viewport' : 'none';
  if (!frames.length) {
    const box = await d.boxViews(subjects[0]).catch((): { error: string } => ({ error: 'the renderer failed' }));
    if ('frames' in box && box.frames.length) {
      frames.push(...box.frames.slice(0, LOOK_FRAME_MAX));
      source = 'box_approximation';
    }
  }
  const cameraNote = restored === false ? ' Your Studio camera could not be put back to where it was; the user may need to move it.' : '';
  if (!frames.length) {
    return {
      ok: false, source: 'none', views: [], observations: [], answers: [], issues: [], neurons: 0, cameraRestored: restored,
      note: `Nothing was observed.${cameraNote}`,
      error: `I could not look at the place: Studio gave no picture of it${nativeBroke ? ' (the capture failed)' : ''}. Do not claim anything about how it looks.`,
    };
  }

  const obs = await d.observe({
    request: a.request, expect: a.expect ?? [], questions: a.questions ?? [], frames, source: source as 'studio_viewport' | 'box_approximation', touched: a.touched ?? [],
  });
  const viewNames = frames.map((f) => (source === 'studio_viewport' ? (views.find((v) => f.label === v || f.label.startsWith(`${v} `)) ?? f.label) : f.label));
  const sourceNote = source === 'box_approximation'
    ? 'These views are a box approximation drawn by a diagnostic renderer: no lighting, textures, effects, terrain or interface. Colours and materials are not what a player sees.'
    : 'Observations from real Studio viewport pictures, taken from the views listed.';
  if (!obs.ok) {
    return {
      ok: false, source, views: viewNames, observations: [], answers: [], issues: [], neurons: obs.neurons, cameraRestored: restored,
      note: `${sourceNote}${cameraNote}`, error: `I could not look at the place: ${obs.error ?? 'the pictures could not be read'}. Do not claim anything about how it looks.`,
    };
  }
  return {
    ok: true, source, views: viewNames, observations: obs.observations, answers: obs.answers, issues: obs.issues,
    neurons: obs.neurons, cameraRestored: restored, note: `${sourceNote}${cameraNote}`,
  };
}
