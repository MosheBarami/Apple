// The `look` tool: the registry's door onto studio-look.ts (cameras and pixels) and look-observe.ts
// (what the vision role saw). Defined here and registered in tools.ts with one entry, the way the audio
// and phase-A tools are, so tools.ts — the contention point of the worker — grows by a call site and
// not by a body. This module imports `AgentCtx` back from tools.ts as a TYPE only, so there is no cycle.
//
// What the agent gets is OBSERVATIONS about what it changed — seen, not seen, cannot tell — and which
// of the views they came from. Never a score: whether the work looks right and fits the request is the
// agent's call, and the whole point of the tool is that the agent has SEEN the place before it speaks.
import type { GatewayToolDef, StudioFrame } from '@apple/shared';
import type { AgentCtx } from './tools';
import { chat } from './gateway';
import { runLook, DEFAULT_SETTLE_MS, type LookArgs } from './studio-look';
import { observeFrames, LOOK_FRAME_MAX, type LookFrame, type ObserveInput } from './look-observe';
import { recordLook } from './evidence-ledger';
import { SELF_CHECK_LIMITS } from './self-check';
import { decodeRgbBase64, encodePng, bytesToBase64 } from './png';
import { critiqueFrames, type Critique } from './blind-critique';

export const LOOK_TOOL = 'look';

// KEPT SHORT ON PURPOSE. Every character of a tool definition is sent on every step and comes out of the transcript
// budget (prompt-budget.ts: the budget a step reports is derived from the definitions it carries, and a test holds it
// above 60,000 characters). How to use the observations is taught in the prompt, only to runs that are offered this tool.
export const LOOK_DEF: GatewayToolDef = {
  name: LOOK_TOOL,
  description:
    "Look at what you changed as a player would: frames it in the user's Studio viewport from several angles (front, high, player eye level) and returns OBSERVATIONS, not a score: for each thing in `expect`, seen / not seen / cannot tell. You judge them. " +
    'Moves the viewport camera and puts it back; costs one vision call. Cannot see on-screen UI text, motion, sound or effects (cannot tell); play_check shows a player\'s screen.',
  parameters: {
    type: 'object',
    properties: {
      targets: { type: 'array', items: { type: 'string' } },
      expect: { type: 'array', items: { type: 'string' } },
      questions: { type: 'array', items: { type: 'string' } },
      views: { type: 'array', items: { type: 'string', enum: ['front', 'high', 'side', 'eye'] } },
    },
    required: [],
  },
};

const strings = (v: unknown, max: number, chars: number): string[] =>
  (Array.isArray(v) ? v : []).filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, max).map((s) => s.trim().slice(0, chars));

/** The software box views, for a Studio with no native capture. The same frames the user is shown by render_view. */
async function boxViews(ctx: AgentCtx, target: string | undefined): Promise<{ frames: LookFrame[] } | { error: string }> {
  const res = await ctx.execStudioOp({ op: 'render_view', ...(target ? { target } : {}), view: 'all' }, 90_000);
  if (!res.ok) return { error: res.error ?? 'render failed' };
  const data = res.data as { views?: { name: string; rgbBase64: string; meta: { width: number; height: number } }[]; subject?: string } | undefined;
  const frames: LookFrame[] = [];
  for (const v of (data?.views ?? []).slice(0, LOOK_FRAME_MAX)) {
    try {
      const rgb = decodeRgbBase64(v.rgbBase64);
      if (rgb.length !== v.meta.width * v.meta.height * 3) continue;
      const png = bytesToBase64(await encodePng(rgb, v.meta.width, v.meta.height));
      frames.push({ label: `${v.name} (box approximation)`, source: 'box_approximation', pngBase64: png, width: v.meta.width, height: v.meta.height });
      ctx.emitFrame?.({
        rgbBase64: v.rgbBase64, encoding: 'rgb24', source: 'software_render', width: v.meta.width, height: v.meta.height,
        view: v.name, subject: data?.subject ?? 'game.Workspace', capturedAt: Date.now(),
      } as StudioFrame);
    } catch { /* a frame that will not encode is a frame not used */ }
  }
  return frames.length ? { frames } : { error: 'the renderer returned no views' };
}

/** SELF_CHECK_SETTLE_MS: how long the viewport gets to draw a new camera pose before it is captured (0..2000). Anything else is the default. */
function settleMsOf(env: unknown): number {
  const raw = Number((env as { SELF_CHECK_SETTLE_MS?: unknown } | null)?.SELF_CHECK_SETTLE_MS);
  return Number.isFinite(raw) && raw >= 0 && raw <= 2000 ? raw : DEFAULT_SETTLE_MS;
}

const brief = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** One look, end to end: frame, observe, record in the ledger, report compactly. */
export async function runLookTool(ctx: AgentCtx, a: Record<string, unknown>): Promise<unknown> {
  const ledger = ctx.evidence;
  if (ledger && ledger.lookCount >= SELF_CHECK_LIMITS.looksPerRun) {
    return { error: `look limit reached: ${SELF_CHECK_LIMITS.looksPerRun} looks in one run. Use what the earlier looks showed, and say plainly what you did not check.` };
  }
  const input: LookArgs = {
    request: ctx.request ?? ctx.userRequest?.() ?? '',
    touched: ledger?.touched ?? [],
    targets: strings(a.targets, 6, 300).filter((p) => /^game(\.|\[|$)/.test(p)),
    expect: strings(a.expect, 8, 140),
    questions: strings(a.questions, 3, 140),
    views: strings(a.views, 4, 12),
  };
  const outcome = await runLook(
    {
      exec: (op, timeoutMs) => ctx.execStudioOp(op, timeoutMs),
      boxViews: (target) => boxViews(ctx, target),
      observe: (obs: ObserveInput) => observeFrames(obs, (req, opts) => chat(ctx.env, req as never, opts) as Promise<{ text: string; neurons: number }>),
      emitFrame: ctx.emitFrame ? (f) => ctx.emitFrame?.(f) : undefined,
      settleMs: settleMsOf(ctx.env),
    },
    input,
  );
  // The vision call is a model call made inside a tool: it has to reach the run's Credits like any other.
  if (outcome.neurons > 0) ctx.addNeurons?.(outcome.neurons);
  if (ledger) {
    recordLook(ledger, {
      ok: outcome.ok, source: outcome.source, views: outcome.views, observations: outcome.observations,
      answers: outcome.answers, issues: outcome.issues, ...(outcome.error ? { error: outcome.error } : {}),
    });
  }
  if (!outcome.ok) {
    return { error: outcome.error ?? 'I could not look at the place.', ...(outcome.note ? { note: outcome.note } : {}), notVerified: 'Nothing about how the work looks was observed.' };
  }
  const notSeen = outcome.observations.filter((o) => o.verdict === 'not_seen').map((o) => brief(o.about, 100));
  const cannotTell = outcome.observations.filter((o) => o.verdict === 'cannot_tell').map((o) => brief(o.about, 100));
  return {
    looked: true,
    source: outcome.source,
    views: outcome.views,
    observations: outcome.observations.slice(0, 10).map((o) => ({ about: brief(o.about, 100), verdict: o.verdict, note: brief(o.note, 140) })),
    ...(outcome.answers.length ? { answers: outcome.answers.map((x) => ({ question: brief(x.question, 100), answer: brief(x.answer, 140), verdict: x.verdict })) } : {}),
    issues: outcome.issues.slice(0, 5).map((s) => brief(s, 140)),
    notSeen,
    cannotTell,
    cameraRestored: outcome.cameraRestored,
    note:
      `${outcome.note} These are observations, not a score: decide what they mean. ` +
      (notSeen.length ? 'Fix what is not seen or wrong before you answer. ' : '') +
      (cannotTell.length ? 'Do not tell the user a cannot_tell item was seen; say it was not checked.' : ''),
  };
}

export function lookSummary(_args: Record<string, unknown>, result: unknown, failed: boolean): string {
  if (failed) return 'Could not look at the place';
  const views = (result as { views?: unknown[] } | null)?.views;
  return `Looked at what was built${Array.isArray(views) && views.length > 1 ? ` from ${views.length} angles` : ''}`;
}

/**
 * The blind critique's pictures and verdict, end to end (blind-critique.ts): the same camera work as `look` (four views, the
 * camera put back), then ONE vision call that is given the user's request and the frames and nothing else. `touched` only decides
 * where the camera stands; it is not sent to the critic. Not recorded as a look in the ledger: it is a review, not an observation
 * the agent may cite. Never throws.
 */
export async function runBlindCritique(ctx: AgentCtx, request: string): Promise<{ ok: true; critique: Critique; neurons: number; source: string } | { ok: false; error: string; neurons: number }> {
  let verdict: Awaited<ReturnType<typeof critiqueFrames>> | undefined;
  let source = 'none';
  const outcome = await runLook(
    {
      exec: (op, timeoutMs) => ctx.execStudioOp(op, timeoutMs),
      boxViews: (target) => boxViews(ctx, target),
      observe: async (obs: ObserveInput) => {
        source = obs.source;
        verdict = await critiqueFrames(
          { request, frames: obs.frames, source: obs.source },
          (req, opts) => chat(ctx.env, req as never, opts) as Promise<{ text: string; neurons: number }>,
        );
        return { ok: verdict.ok, observations: [], answers: [], issues: [], neurons: verdict.neurons, ...(verdict.ok ? {} : { error: verdict.error }) };
      },
      emitFrame: ctx.emitFrame ? (f) => ctx.emitFrame?.(f) : undefined,
      settleMs: settleMsOf(ctx.env),
    },
    { request, touched: ctx.evidence?.touched ?? [], views: ['front', 'high', 'side', 'eye'] },
  );
  if (verdict?.ok) return { ok: true, critique: verdict.critique, neurons: verdict.neurons, source };
  return { ok: false, neurons: verdict?.neurons ?? outcome.neurons, error: verdict && !verdict.ok ? verdict.error : (outcome.error ?? 'no picture of the place') };
}
