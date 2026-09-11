// Adaptive reasoning policy.
//
// The GLM migration set every path to `reasoning: low`. Uniform `low` is the wrong policy: it
// spends the same on "what does this script do" as on "design and build a plaza", and thin
// thinking on design work is how Golem shipped a grey slab with coloured poles and called it done.
//
// The tiers are `low` and `high`. `medium` is DELIBERATELY UNUSED, and that is a measurement, not
// a preference. Against the live service on 2026-08-30, GLM-5.3-flash, two samples per cell:
//
//   task     effort  neurons  latency  answer chars  finish
//   trivial  low        2.2     17.6s      176       stop
//   trivial  medium     6.7      2.8s      125       stop      <- 3.0x the cost
//   trivial  high       2.7      1.3s      104       stop
//   design   low       39.7     15.4s     2283       stop
//   design   medium   109.8     41.2s        0       LENGTH    <- 2.8x cost, NO ANSWER AT ALL
//   design   high      40.8     14.9s     2361       stop
//
// `medium` sends the model into long deliberation (7,488 characters of reasoning on the design
// task) that consumes the whole output budget before it writes a word. `high` reasons briefly and
// decisively — 161 characters — and costs 2.8% more than `low` while returning a better answer.
// So escalating to `high` is nearly free, and `medium` is a trap.
import type { GolemMode } from '@golem/shared';

/** `medium` exists in the provider's API but is never selected — see the table above. */
export type Effort = 'low' | 'medium' | 'high';

const RANK: Record<Effort, number> = { low: 0, medium: 1, high: 2 };
const BY_RANK: Effort[] = ['low', 'medium', 'high'];

/**
 * How many steps in one run may use high effort. Measured cost of `high` is within 3% of `low`,
 * so this is a backstop against a pathological run rather than a meaningful economy — which is
 * why it is generous. It is deliberately not a reason to skimp on thinking.
 */
export const MAX_HIGH_EFFORT_STEPS = 8;

export interface ReasoningSignals {
  mode: GolemMode;
  /** 1-based step index within the current run */
  step: number;
  /** how many high-effort steps this run has already spent */
  highEffortUsed: number;
  /** the previous step errored, or a tool reported failure */
  priorStepFailed?: boolean;
  /** a visual critique came back failing, or carrying blocking/major defects */
  visualDefectsFound?: boolean;
  /** the task is about how something LOOKS, or how a space is laid out */
  visualDesignTask?: boolean;
  /**
   * The task is about INTERFACE — a screen, a panel, a HUD, a button — as distinct from
   * a world or a space. Separate from `visualDesignTask` because the two want different
   * briefs: a world brief talks about landmark dominance and density rhythm, and none of
   * that helps someone building a shop modal. They overlap often and that is fine; a
   * request can honestly be both.
   */
  uiDesignTask?: boolean;
  /** the task spans several scripts or several interacting systems */
  multiSystemTask?: boolean;
  /** the request is under-specified and needs interpretation */
  ambiguousRequest?: boolean;
  /** the next action deletes, overwrites or restores at scale */
  irreversibleChange?: boolean;
}

export interface ReasoningChoice {
  effort: Effort;
  /** why, for the admin trace — this is policy metadata, never user-facing chain-of-thought */
  reason: string;
}

/** Words that mean the user is asking about how something looks or is laid out. */
const VISUAL_RE =
  /\b(build|design|make|create|decorat|layout|scene|world|map|level|environment|theme|style|look|aesthetic|beautiful|pretty|ugly|polish|atmosphere|light(?:ing)?|colou?r|material|texture|plaza|lobby|room|interior|exterior|terrain|landscap|castle|shop|arena|dungeon|obby|spawn|prop|model)\w*/i;

/**
 * Words that mean the subject is an INTERFACE rather than a place.
 *
 * Deliberately narrower than VISUAL_RE. `shop` appears in both, because "build a shop" is
 * genuinely ambiguous between a building and a screen — so both briefs are offered and the
 * model picks. What is NOT here is anything spatial: a request about terrain or lighting
 * must not drag a UI grammar brief into the prompt and pay for it.
 */
const UI_RE =
  /\b(ui|gui|hud|screen|menu|panel|modal|dialog|button|icon|shops?\b|inventory|leaderboard|notification|toast|tooltip|popup|interface|layout|font|typography|currency|counter|gauge|progress ?bar|tab|nav(?:igation)?|onboarding|tutorial|codes?|settings|mobile|controller|touch|accessib)\w*/i;

/** Words that mean several moving parts have to agree with each other. */
const MULTI_SYSTEM_RE =
  /\b(system|architecture|refactor|integrat|pipeline|leaderboard|datastore|remote(?:event|function)|replicat|networking|matchmak|inventory|econom|save|load|state machine|multiplayer)\w*/i;

const AMBIGUOUS_RE = /\b(something|anything|whatever|surprise me|you decide|make it (?:good|better|nice|cool)|improve|fix it|idk|not sure)\b/i;

/** Cheap request classification, so the policy gets signals without paying a model for them. */
export function classifyRequest(
  text: string,
): Pick<ReasoningSignals, 'visualDesignTask' | 'uiDesignTask' | 'multiSystemTask' | 'ambiguousRequest'> {
  return {
    visualDesignTask: VISUAL_RE.test(text),
    uiDesignTask: UI_RE.test(text),
    multiSystemTask: MULTI_SYSTEM_RE.test(text),
    ambiguousRequest: AMBIGUOUS_RE.test(text) || text.trim().length < 25,
  };
}

/**
 * Baseline effort per mode, before escalation. (Clay is what the user picks as Plan, stone as
 * Agent, rune as Super Agent.)
 *   Clay  — Plan: inspection, architecture reasoning and proposals, with no mutating tools. Low is
 *           the BASELINE, not the ceiling: a planning request that needs real judgement —
 *           architecture, layout, an under-specified ask — escalates to `high` through the signals
 *           below, and those signals fire on exactly the language such requests use. What the
 *           baseline actually governs is the rest: "what does this script do", "where is X
 *           defined". On lookups `high` has nothing to think about and buys nothing.
 *           Note the older rationale here — that low keeps Plan feeling instant — does not survive
 *           the table above: on the trivial probe `high` was FASTER (1.3s against 17.6s). Latency
 *           is not the argument; having nothing to deliberate about is.
 *           `irreversibleChange` never fires in this mode, because the mode cannot make one.
 *   Stone — the default builder. High: this is where design judgement happens, and on the design
 *           probe `high` cost 40.8 neurons against `low`'s 39.7 for a better answer. That is the
 *           whole argument — good judgement here is essentially free.
 *   Rune  — the deliberate mode the user opted into. High.
 */
const BASELINE: Record<GolemMode, Effort> = { clay: 'low', stone: 'high', rune: 'high' };

export function chooseEffort(s: ReasoningSignals): ReasoningChoice {
  let effort = BASELINE[s.mode];
  const reasons: string[] = [`${s.mode} baseline`];

  const raise = (to: Effort, why: string) => {
    if (RANK[to] > RANK[effort]) {
      effort = to;
      reasons.push(why);
    }
  };

  // Recovery: the last attempt did not work, so repeating the same cheap thinking will not either.
  if (s.priorStepFailed) raise('high', 'recovering from a failed step');
  // A failing visual critique means the model's own judgement was wrong. Buy better judgement.
  if (s.visualDefectsFound) raise('high', 'fixing observed visual defects');
  // Large irreversible actions get the careful think BEFORE they happen, not after.
  if (s.irreversibleChange) raise('high', 'irreversible change ahead');
  if (s.visualDesignTask) raise('high', 'visual or spatial design work');
  if (s.multiSystemTask) raise('high', 'multiple interacting systems');
  if (s.ambiguousRequest) raise('high', 'request needs interpretation');

  // Budget guard: past the cap, fall back to low rather than compounding. `medium` is never a
  // fallback — it is both slower and more expensive than the tier it would be replacing.
  if (effort === 'high' && s.highEffortUsed >= MAX_HIGH_EFFORT_STEPS) {
    effort = 'low';
    reasons.push(`high-effort budget spent (${MAX_HIGH_EFFORT_STEPS} steps)`);
  }

  return { effort, reason: reasons.join('; ') };
}

/**
 * Output token budget for a step at a given effort. A reasoning model spends its budget on
 * thinking FIRST, so an under-budgeted step can burn everything on reasoning and return nothing —
 * which is exactly what `medium` did on the design probe (2,400 tokens, finish_reason "length",
 * zero answer). `high` needs only slight headroom: measured 882 output tokens against `low`'s 858
 * on the same prompt. `medium` is scaled generously purely as a safety net for a caller that
 * passes it explicitly; the policy never selects it.
 */
export function tokensForEffort(base: number, effort: Effort): number {
  const scale = effort === 'high' ? 1.25 : effort === 'medium' ? 2.5 : 1;
  return Math.round(base * scale);
}

export function higher(a: Effort, b: Effort): Effort {
  return BY_RANK[Math.max(RANK[a], RANK[b])]!;
}
