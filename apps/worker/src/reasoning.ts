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
import { PRODUCT_MODE_INFO } from '@golem/shared';
import type { ProductMode, ProductModel } from '@golem/shared';

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
  mode: ProductMode;
  /**
   * The model entitlement the account SELECTED for this request, which is a different axis from
   * `mode` and was missing here entirely.
   *
   * `gatewayModelFor`, `maxStepsFor` and `baseTokensFor` in do/session.ts all branch on it; this
   * policy did not, so the one thing a person buys when they choose Apple MAX — a better answer —
   * was the one thing it could not affect. Picking MAX and Plan together produced `low`, because
   * Plan baselines to `low` no matter who is asking.
   */
  productModel?: ProductModel;
  /** 1-based step index within the current run */
  step: number;
  /** how many high-effort steps this run has already spent */
  highEffortUsed: number;
  /** the previous step errored, or a tool reported failure */
  priorStepFailed?: boolean;
  /**
   * This run has already changed the project. Together with `step` it is what falsifies a stale
   * `conversational` verdict — see the early return in chooseEffort.
   */
  mutated?: boolean;
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
  /**
   * The message is talk rather than work — a greeting, thanks, or a question about the assistant.
   * It must not escalate effort and must not make the run "owe" a mutation; see classifyRequest.
   */
  conversational?: boolean;
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

/**
 * Talk, not work: greetings, thanks, acknowledgements, and questions about the assistant itself.
 *
 * These need a reply, not a build, and the distinction is not cosmetic. Before this existed the
 * only short-text signal was `ambiguousRequest`, which fires on anything under 25 characters — so
 * "hi" was classified as an under-specified BUILD request. In Agent mode with Studio connected that
 * escalated the step to `high` effort, spent a Credit, took a full `snapshot` of the user's place,
 * fired the "you have not changed the project yet" nudge twice more, and ended by apologising:
 * "I did not change anything in your project... which is a fault on my side". For the word "hi".
 *
 * The competitive capture shows the same class of waste from the other side: a greeting there
 * carried 458 input tokens plus 16,654 cache-creation tokens of build harness.
 *
 * NOTE ON \b — it is deliberately NOT used here. JavaScript's word boundary is defined over
 * [A-Za-z0-9_], so no Hebrew letter is a word character and `\u05e9\u05dc\u05d5\u05dd\b` never matches at end of
 * input. Every Hebrew greeting would have fallen through to `ambiguousRequest` and routed an entire
 * language's small talk into a build. The Unicode-aware `(?![\p{L}\p{N}])` with the `u` flag is
 * what makes the boundary mean the same thing in both scripts.
 */
const CONVERSATIONAL_RE =
  /^(?:\s*(?:hi|hey|hello|yo|sup|hiya|howdy|thanks?|thank you|thx|ty|ok|okay|k|cool|nice|great|awesome|got it|sure|yes|yeah|no|nope|bye|goodbye|see ya|good (?:morning|afternoon|evening|night))(?![\p{L}\p{N}])[\s!.,?]*)+$/iu;

/** Questions ABOUT the assistant rather than about the project — also talk, not work. */
const META_QUESTION_RE =
  /\b(?:who are you|what are you|what can you do|what do you do|how do you work|which model|what model|are you (?:an? )?(?:ai|bot|human)|help me understand you|what is apple|what's apple)\b/i;

/**
 * The person said not to change anything. Measured 2026-09-22 (run 5316f52b): "Playtest the game for 5
 * seconds and tell me what the output log shows. Do not change anything in the place." — and Agent mode
 * created a RemoteEvent anyway ("the only change made"). An explicit prohibition is not a preference.
 *
 * Deliberately narrow: the object has to be the whole thing (anything, the place, my game…), so "don't
 * change the colours", "without changing anything ELSE" and "don't touch my game's scripts" — all
 * requests FOR a change with a limit on it — never match.
 */
const FORBIDS_CHANGES_RE =
  /\b(?:do not|don['’]t|dont|never)\s+(?:change|modify|touch|edit|alter)\s+(?:anything|a thing|the place|my place|the game|my game)(?!\s+else)(?!['’]s)\b|\bwithout\s+(?:changing|modifying|touching|editing|altering)\s+(?:anything|the place|my place|the game|my game)(?!\s+else)(?!['’]s)\b|\bread[- ]only\b/i;

export function forbidsChanges(text: string): boolean {
  return FORBIDS_CHANGES_RE.test(text);
}

/** Cheap request classification, so the policy gets signals without paying a model for them. */
export function classifyRequest(
  text: string,
): Pick<ReasoningSignals, 'visualDesignTask' | 'uiDesignTask' | 'multiSystemTask' | 'ambiguousRequest' | 'conversational'> {
  const trimmed = text.trim();
  const conversational = CONVERSATIONAL_RE.test(trimmed) || META_QUESTION_RE.test(trimmed);
  return {
    visualDesignTask: VISUAL_RE.test(text),
    uiDesignTask: UI_RE.test(text),
    multiSystemTask: MULTI_SYSTEM_RE.test(text),
    // Short conversational text is not an under-specified request — it is a complete one that
    // happens to be short. Only genuinely terse BUILD asks ("a door") remain ambiguous.
    ambiguousRequest: !conversational && (AMBIGUOUS_RE.test(text) || trimmed.length < 25),
    conversational,
  };
}

/**
 * Baseline effort per mode, before escalation.
 *   Plan  — inspection, architecture reasoning and proposals, with no mutating tools. Low is
 *           the BASELINE, not the ceiling: a planning request that needs real judgement —
 *           architecture, layout, an under-specified ask — escalates to `high` through the signals
 *           below, and those signals fire on exactly the language such requests use. What the
 *           baseline actually governs is the rest: "what does this script do", "where is X
 *           defined". On lookups `high` has nothing to think about and buys nothing.
 *           Note the older rationale here — that low keeps Plan feeling instant — does not survive
 *           the table above: on the trivial probe `high` was FASTER (1.3s against 17.6s). Latency
 *           is not the argument; having nothing to deliberate about is.
 *           `irreversibleChange` never fires in this mode, because the mode cannot make one.
 *   Agent — the builder. High: this is where design judgement happens, and on the design
 *           probe `high` cost 40.8 neurons against `low`'s 39.7 for a better answer. That is the
 *           whole argument — good judgement here is essentially free.
 */
const BASELINE: Record<ProductMode, Effort> = { plan: 'low', agent: 'high' };

/**
 * THE FLOOR APPLE MAX BUYS, AND WHY IT IS A FLOOR RATHER THAN A BASELINE.
 *
 * The entitlement a person selects is a different axis from Plan/Agent. Apple MAX keeps a high
 * floor even when the request is in Plan mode.
 *
 * The cost argument in the table at the top of this file is what makes a floor safe: on the design
 * probe `high` cost 40.8 neurons against `low`'s 39.7, about 3%. Buying the better answer for
 * everyone who paid for the better answer is close to free, so the floor does not need to be
 * rationed the way a genuinely expensive tier would.
 *
 * It is a FLOOR, not an override: the escalation signals below can still raise a MAX run, and the
 * conversational early-return below still wins over it, because a greeting has nothing to
 * deliberate about no matter what the account is entitled to.
 */
const ENTITLEMENT_FLOOR: Record<ProductModel, Effort> = { apple: 'low', 'apple-max': 'high' };

export function chooseEffort(s: ReasoningSignals): ReasoningChoice {
  // Talk costs `low`, in every mode, with no escalation path. A greeting has nothing to deliberate
  // about, and the signals below would otherwise raise it: `ambiguousRequest` used to fire on any
  // text under 25 characters, which is most greetings. This returns before any of them run.
  //[[ THE CLASSIFICATION IS OF THE OPENING MESSAGE; THE PIN WAS OF THE WHOLE RUN.
  //
  //   `classifyRequest` runs ONCE, in startRun, and the verdict is stored on `agent.traits` and
  //   spread into every later step. CONVERSATIONAL_RE matches bare approvals — "ok", "sure",
  //   "yes", and the Hebrew "בסדר", "אוקיי", "יופי" — because on their own they ARE talk.
  //
  //   But "ok" is also how a person accepts a plan. Apple proposes, the user replies "ok", and
  //   Apple builds: sixteen steps of real work, every one of them pinned to `low` by a verdict
  //   about a two-letter message, with this return firing before the entitlement floor below so
  //   Apple MAX could not lift it either. The user paid for judgement and the approval itself
  //   switched it off.
  //
  //   A run that has taken a second step, or has already changed the project, has falsified the
  //   guess by its own behaviour. Past that point the opening word is not evidence about what is
  //   happening now, so the shortcut expires rather than persisting. A genuine greeting still
  //   answers in one step without mutating, and still costs `low`. ]]
  const stillJustTalk = !s.mutated && (s.step ?? 1) <= 1;
  if (s.conversational && !s.priorStepFailed && stillJustTalk) {
    return { effort: 'low', reason: 'conversational: reply, do not build' };
  }

  let effort = BASELINE[s.mode];
  const spoken = PRODUCT_MODE_INFO[s.mode].name;
  const reasons: string[] = [`${spoken} baseline`];

  // The entitlement floor, applied before the signals so a signal can still raise it further.
  const floor = s.productModel ? ENTITLEMENT_FLOOR[s.productModel] : undefined;
  if (floor !== undefined && RANK[floor] > RANK[effort]) {
    effort = floor;
    reasons.push(`${s.productModel === 'apple-max' ? 'Apple MAX' : 'Apple'} floor`);
  }

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
  //[[ INTERFACE WORK IS DESIGN WORK, and until this line the policy could not see it.
  //
  //   `uiDesignTask` was classified on every request, carried on `agent.traits`, spread into these
  //   signals — and read by nothing here. So on the free tier in Plan mode, asking about a lamp in
  //   the lobby bought careful thinking and asking about a tooltip on the settings icon bought
  //   cheap thinking, from the same policy, about the same product.
  //
  //   It is a SEPARATE line rather than being folded into `visualDesignTask` for the reason the
  //   signal itself is separate (see its declaration): the two want different briefs, they overlap
  //   often, and a request may honestly be both. `raise` is idempotent, so a request that is both
  //   is escalated once and names whichever reason it hit first. ]]
  if (s.uiDesignTask) raise('high', 'interface design work');
  if (s.multiSystemTask) raise('high', 'multiple interacting systems');
  if (s.ambiguousRequest) raise('high', 'request needs interpretation');

  // Budget guard: past the cap, fall back to low rather than compounding. `medium` is never a
  // fallback — it is both slower and more expensive than the tier it would be replacing.
  // The cap is a backstop against a pathological run, not an economy — `high` measures within 3%
  // of `low`. On Apple MAX it is skipped: a 16-step Agent run would otherwise spend steps 1-8 at
  // `high` and steps 9-16 at `low`, so the longest and usually hardest half of a run a person
  // specifically paid to have thought about would be the cheap half. That is the defect this
  // floor exists to remove, and re-introducing it at step 9 would remove it only for short runs.
  if (effort === 'high' && s.highEffortUsed >= MAX_HIGH_EFFORT_STEPS && s.productModel !== 'apple-max') {
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
  //[[ `high` USED TO GET LESS ROOM THAN `medium`, AND IT KILLED REAL RUNS.
  //
  //   The scale was `high ? 1.25 : medium ? 2.5 : 1`. On Agent that is 4400 x 1.25 = 5500
  //   against a gateway ceiling of 6500 — a thousand tokens of the model's own configured output
  //   left unasked for, on the effort tier chosen for the HARDEST steps. Observed in production on
  //   2026-09-20: a 16-step tower-defence build, "Reasoning effort: high", died on step 1 of 16
  //   with "The model reached its output limit before finishing this step", and the run was
  //   charged 30 Credits for nothing the customer could use.
  //
  //   The 1.25 was not arbitrary. The comment above it records the measurement it came from —
  //   `high` used 882 output tokens against `low`'s 858 on a design probe — and 1.25 is generous
  //   headroom over 882. The error was generalising one prompt's appetite into a policy for every
  //   prompt. A design probe answers in prose; a build step emits a complete Luau tool call, and
  //   a reasoning model spends its budget on thinking FIRST, so the step that thinks hardest is
  //   the one most likely to run out before it writes anything.
  //
  //   It also contradicted the ceiling directly above it in gateway.ts, which was raised to 6500
  //   expressly "so this ceiling can no longer be the thing that truncates a tool call". It was
  //   not the ceiling truncating the call. It was this line.
  //
  //   ASKING PAST THE CEILING IS FREE, and that is what makes this safe rather than expensive.
  //   gateway.ts clamps with `Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens)` at line 363
  //   and reserves neurons from the CLAMPED value at line 385 — clamp first, reserve second. So a
  //   request of 2x the base resolves to exactly the model's configured ceiling for every mode and
  //   reserves precisely what that ceiling costs, no more. `high` now means "everything this model
  //   will give me", which is what the tier was always supposed to mean.
  //
  //   That ordering is load-bearing. If gateway.ts is ever changed to estimate from the asked-for
  //   value instead of the clamped one, this doubles every reservation on the hardest steps — so a
  //   test asserts the clamp still precedes the estimate. ]]
  const scale = effort === 'high' ? 2 : effort === 'medium' ? 2.5 : 1;
  return Math.round(base * scale);
}

export function higher(a: Effort, b: Effort): Effort {
  return BY_RANK[Math.max(RANK[a], RANK[b])]!;
}
