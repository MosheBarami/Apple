/**
 * THE OWNER'S BENCHMARK EVALUATOR (owner, 2026-10-02: "a fixed set of at least 30 varied requests, each in a new clean
 * chat, scored on fixed criteria: works, looks professional, matches the request, polished, no errors, performance").
 *
 * After a benchmark request's run has ended, this measures the place as it is: real Studio photos from four angles
 * around what was built, what the place holds (parts, scripts, sounds, animations, effects, screens), one play test, and
 * a vision judge's scores against the fixed rubric. It never builds or fixes anything, and the agent never sees it: it
 * is reached only through the benchmark routes.
 */
import type { AgentCtx } from './tools';
import type { Env } from './env';
import { runTool } from './tools';
import { chat as llmChat } from './gateway';
import { rgbBase64ToDataUrl } from './png';
import { imagePathFor, storeImage } from './imagegen';
import { clearChildren } from './dup-names';

type V3 = [number, number, number];

export const BENCH_CRITERIA = ['works', 'professional', 'matches', 'polished', 'noErrors', 'performance', 'sound', 'animation', 'fx'] as const;
export type BenchScores = Record<(typeof BENCH_CRITERIA)[number], number>;

/** What a request's place holds, counted by class. */
export interface BenchCensus { parts: number; scripts: number; sounds: number; animations: number; fx: number; screens: number; lights: number; truncated: boolean }

const SKIP = new Set(['Camera', 'Terrain', 'Baseplate', 'SpawnLocation']);
const FX = new Set(['ParticleEmitter', 'Beam', 'Trail', 'Fire', 'Smoke', 'Sparkles', 'Highlight']);
const ANIM = new Set(['Animation', 'AnimationController', 'Animator', 'Motor6D', 'KeyframeSequence']);
const LIGHT = new Set(['PointLight', 'SpotLight', 'SurfaceLight', 'Atmosphere', 'Sky', 'BloomEffect', 'ColorCorrectionEffect', 'SunRaysEffect', 'DepthOfFieldEffect']);
const PART = /^(Part|MeshPart|WedgePart|CornerWedgePart|TrussPart|UnionOperation|SpawnLocation|Seat|VehicleSeat)$/;

/** Counts a get_tree node by class. Pure. */
export function countTree(root: unknown, into: BenchCensus): BenchCensus {
  const walk = (n: { class?: string; children?: unknown[] }) => {
    const c = n.class ?? '';
    if (PART.test(c)) into.parts++;
    if (/Script$/.test(c)) into.scripts++;
    if (c === 'Sound') into.sounds++;
    if (ANIM.has(c)) into.animations++;
    if (FX.has(c)) into.fx++;
    if (c === 'ScreenGui' || c === 'SurfaceGui' || c === 'BillboardGui') into.screens++;
    if (LIGHT.has(c)) into.lights++;
    for (const k of n.children ?? []) walk(k as typeof n);
  };
  if (root && typeof root === 'object') walk(root as { children?: unknown[] });
  return into;
}

/** A camera CFrame looking from `eye` at `at`, as the plugin's 12 components. Pure. */
export function lookAt(eye: V3, at: V3): number[] {
  const f = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
  const fl = Math.hypot(...f) || 1;
  const fw = f.map((v) => v / fl);
  // right = forward x up, up = right x forward; a Roblox CFrame's look vector is -Z.
  let r = [fw[1]! * 0 - fw[2]! * 1, fw[2]! * 0 - fw[0]! * 0, fw[0]! * 1 - fw[1]! * 0];
  const rl = Math.hypot(...r) || 1;
  r = r.map((v) => v / rl);
  const u = [r[1]! * fw[2]! - r[2]! * fw[1]!, r[2]! * fw[0]! - r[0]! * fw[2]!, r[0]! * fw[1]! - r[1]! * fw[0]!];
  const b = fw.map((v) => -v);
  return [eye[0], eye[1], eye[2], r[0]!, u[0]!, b[0]!, r[1]!, u[1]!, b[1]!, r[2]!, u[2]!, b[2]!];
}

/** Four views round a box: front, a high three-quarter, the side, and close in. Pure. */
export function benchAngles(center: V3, size: V3): { name: string; eye: V3 }[] {
  const radius = Math.max(8, Math.hypot(size[0], size[1], size[2]) * 0.75);
  const [cx, cy, cz] = center;
  return [
    { name: 'front', eye: [cx, cy + radius * 0.35, cz + radius * 1.4] },
    { name: 'three-quarter', eye: [cx + radius * 1.1, cy + radius * 0.9, cz + radius * 1.1] },
    { name: 'side', eye: [cx - radius * 1.4, cy + radius * 0.3, cz] },
    { name: 'close', eye: [cx + radius * 0.35, cy + radius * 0.25, cz + radius * 0.75] },
  ];
}

/** The judge's question. The rubric is fixed; only the request and the evidence change. Pure. */
export function judgePrompt(request: string, census: BenchCensus, play: string, reply: string): string {
  return [
    'You are a harsh senior Roblox game reviewer. Score what was built for this request, from the photos (Studio views of the result, UI included) and the facts below.',
    `Request (the user's exact words, possibly several turns): ${request}`,
    `What the place holds: ${census.parts} parts, ${census.scripts} scripts, ${census.sounds} sounds, ${census.animations} animation pieces, ${census.fx} effects, ${census.screens} screens, ${census.lights} lighting objects${census.truncated ? ' (counts are lower bounds)' : ''}.`,
    `Play test: ${play}`,
    `The agent's final answer to the user: ${reply.slice(0, 600)}`,
    'Score each 0, 1 or 2 (0 = bad or absent, 1 = acceptable amateur, 2 = what a professional Roblox studio would ship):',
    'works (it functions as asked when played), professional (looks rich and detailed, not basic blocks), matches (it is what the user asked for, in its specifics), polished (finish: composition, lighting, UI and details), noErrors (no errors or broken pieces), performance (sensible part and script counts for what it is), sound (fitting sound design), animation (lively fitting motion), fx (fitting visual effects).',
    'Answer ONLY with JSON: {"works":n,"professional":n,"matches":n,"polished":n,"noErrors":n,"performance":n,"sound":n,"animation":n,"fx":n,"critique":["the harshest specific problems, most important first"]}',
  ].join('\n');
}

/** The judge's JSON, clamped to the rubric, or null. Pure. */
export function parseJudge(text: string): { scores: BenchScores; critique: string[] } | null {
  // The answer may come fenced, spaced, or after some thinking (live 2026-10-02: a ```json block was not read): the
  // last object that parses and holds "works" is the answer.
  const body = text.replace(/```(?:json)?/g, '');
  let o: Record<string, unknown> | null = null;
  const end = body.lastIndexOf('}');
  for (let i = body.lastIndexOf('{', end); i >= 0 && !o; i = body.lastIndexOf('{', i - 1)) {
    try { const v = JSON.parse(body.slice(i, end + 1)); if (v && typeof v === 'object' && 'works' in v) o = v; } catch { /* an inner brace: keep going out */ }
    if (i === 0) break;
  }
  if (!o) return null;
  const scores = {} as BenchScores;
  for (const k of BENCH_CRITERIA) {
    const v = Number(o[k]);
    if (!Number.isFinite(v)) return null;
    scores[k] = Math.max(0, Math.min(2, Math.round(v)));
  }
  return { scores, critique: Array.isArray(o.critique) ? o.critique.map(String).slice(0, 12) : [] };
}

/** Measures the place after a benchmark request. */
export async function benchEvaluate(ctx: AgentCtx, env: Env, projectId: string, request: string, reply: string) {
  const exec = ctx.execStudioOp;
  // 1. What the place holds.
  const census: BenchCensus = { parts: 0, scripts: 0, sounds: 0, animations: 0, fx: 0, screens: 0, lights: 0, truncated: false };
  for (const root of ['game.Workspace', 'game.StarterGui', 'game.ServerScriptService', 'game.ReplicatedStorage', 'game.StarterPlayer', 'game.Lighting', 'game.SoundService']) {
    // 12 is the plugin's deepest tree (a deeper ask is refused, and every count read 0, live 2026-10-02).
    const t = await exec({ op: 'get_tree', root, maxDepth: 12, maxNodes: 1200 }, 30_000).catch(() => null);
    if (!t?.ok) { census.truncated = true; continue; }
    const d = t.data as { root?: unknown; truncated?: unknown };
    countTree(d.root, census);
    if (d.truncated) census.truncated = true;
  }
  // 2. What was built, framed: the union of every top-level Workspace thing that is not the default scene.
  const top = await exec({ op: 'get_tree', root: 'game.Workspace', maxDepth: 1, maxNodes: 400 }, 20_000).catch(() => null);
  const names = top?.ok ? (((top.data as { root?: { children?: { name?: string; path?: string }[] } }).root?.children) ?? []).filter((c) => c.name && !SKIP.has(c.name)) : [];
  let lo: V3 | null = null, hi: V3 | null = null;
  for (const c of names.slice(0, 60)) {
    const b = await exec({ op: 'spatial_query', action: 'bounds', path: c.path ?? `game.Workspace.${c.name}` }, 15_000).catch(() => null);
    const d = (b?.ok ? b.data : null) as { center?: number[]; size?: number[] } | null;
    if (!d?.center || !d.size || d.size.some((v) => !Number.isFinite(v) || v > 4000)) continue;
    const a = d.center.map((v, i) => v - d.size![i]! / 2) as V3, z = d.center.map((v, i) => v + d.size![i]! / 2) as V3;
    lo = lo ? lo.map((v, i) => Math.min(v, a[i]!)) as V3 : a;
    hi = hi ? hi.map((v, i) => Math.max(v, z[i]!)) as V3 : z;
  }
  const center: V3 = lo && hi ? [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] : [0, 4, 0];
  const size: V3 = lo && hi ? [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] : [16, 8, 16];
  // 3. Real Studio pixels from four angles.
  const images: { name: string; png: string; path?: string }[] = [];
  const problems: string[] = [];
  for (const a of benchAngles(center, size)) {
    const moved = await exec({ op: 'set_props', path: 'game.Workspace.Camera', props: { CFrame: { t: 'CFrame', v: lookAt(a.eye, center) } } } as never, 15_000).catch(() => null);
    if (!moved?.ok) { problems.push(`camera ${a.name}: ${String((moved as { error?: unknown } | null)?.error ?? 'refused').slice(0, 120)}`); if (images.length) continue; await exec({ op: 'camera_focus', path: 'game.Workspace' }, 10_000).catch(() => undefined); }
    const shot = await exec({ op: 'capture_studio_viewport' }, 45_000).catch(() => null);
    const f = shot?.ok ? shot.data as { encoding?: string; rgbBase64?: string; width?: number; height?: number } : null;
    if (!f?.rgbBase64 || !f.width || !f.height) { problems.push(`photo ${a.name} failed`); continue; }
    const png = f.encoding === 'png' ? f.rgbBase64 : (await rgbBase64ToDataUrl(f.rgbBase64, f.width, f.height)).replace(/^data:image\/png;base64,/, '');
    let path: string | undefined;
    try { path = imagePathFor(projectId, await storeImage(env, png, projectId)); } catch { path = undefined; }
    images.push({ name: a.name, png, ...(path ? { path } : {}) });
  }
  // 4. One play test, as a player.
  const played = await runTool(ctx, 'play_check', JSON.stringify({ seconds: 8 })).catch((e) => ({ ok: false, summary: String(e), detail: undefined }));
  const pd = (played.detail ?? {}) as { verdict?: unknown; playerSees?: unknown; clientErrors?: unknown[]; serverErrors?: unknown[]; leaderstats?: unknown };
  const errors = [...(pd.clientErrors ?? []), ...(pd.serverErrors ?? [])].map(String);
  const play = played.ok
    ? `verdict ${String(pd.verdict ?? 'unknown')}; the screen shows: ${String(pd.playerSees ?? 'nothing read').slice(0, 500)}; leaderstats: ${String(pd.leaderstats ?? 'none').slice(0, 200)}; ${errors.length} errors${errors.length ? `: ${errors.slice(0, 5).join(' | ').slice(0, 600)}` : ''}`
    : `the play test could not run: ${String(played.summary).slice(0, 200)}`;
  // 5. The judge.
  let judged: ReturnType<typeof parseJudge> = null;
  let judgeText = '';
  if (images.length) {
    const content = [
      { type: 'text' as const, text: judgePrompt(request, census, play, reply) },
      ...images.map((i) => ({ type: 'image_url' as const, image_url: { url: `data:image/png;base64,${i.png}` } })),
    ];
    try {
      const res = await llmChat(env, { model: 'vision', messages: [{ role: 'user', content }], reasoningEffort: 'high', maxTokens: 4000 }, { kind: 'eval:owner-bench', cacheTtl: 0 });
      judgeText = res.text;
      judged = parseJudge(res.text);
    } catch (e) { problems.push(`judge: ${String(e).slice(0, 200)}`); }
  } else problems.push('no photos, so no visual judgement');
  return {
    census, frame: { center, size }, images: images.map((i) => ({ name: i.name, path: i.path })),
    play: { ok: played.ok, verdict: pd.verdict, errors: errors.slice(0, 10), summary: play },
    ...(judged ? { scores: judged.scores, critique: judged.critique, total: Object.values(judged.scores).reduce((a, b) => a + b, 0) } : { judgeRaw: judgeText.slice(0, 8000) }),
    ...(problems.length ? { problems } : {}),
  };
}

/** What a clean Baseplate keeps at the top of Workspace; everything else a request made goes. */
const KEEP_TOP = new Set(['Camera', 'Terrain', 'Baseplate', 'SpawnLocation']);
const CLEAR_ROOTS = ['game.Workspace', 'game.StarterGui', 'game.ServerScriptService', 'game.ServerStorage', 'game.ReplicatedStorage',
  'game.StarterPack', 'game.SoundService', 'game.Lighting', 'game.MaterialService', 'game.StarterPlayer.StarterPlayerScripts', 'game.StarterPlayer.StarterCharacterScripts'];

/**
 * Empties the place back to a bare Baseplate before a benchmark request (live 2026-10-02: a checkpoint restore put the
 * baseline back but left every earlier request's build standing, so items 2-8 were built and judged in a cluttered
 * place). Returns what is left over that should not be; empty means clean.
 *
 * A place after a request is full of same-named siblings (copies, a library model repeating a part name), and a plain
 * path cannot select one of them, so the old one-path-per-child reset left every such child standing and the next
 * request was judged in the previous one's clutter. Each root is now cleared by clearChildren (dup-names.ts), which
 * addresses a duplicate by its read reference. With a plugin that cannot, the duplicates come back in the answer by
 * name, with the reason, instead of being skipped.
 */
export async function benchClean(ctx: AgentCtx): Promise<string[]> {
  const exec = ctx.execStudioOp;
  const left: string[] = [];
  for (const root of CLEAR_ROOTS) {
    const keep = root === 'game.Workspace' ? (child: { name?: string }) => !!child.name && KEEP_TOP.has(child.name) : undefined;
    const cleared = await clearChildren(exec, root, { keep });
    for (const l of cleared.left) left.push(l.why === 'not removed' ? l.path : `${l.path} (${l.why})`);
  }
  await exec({ op: 'terrain_edit', action: 'clear' } as never, 30_000).catch(() => undefined);
  return left;
}
