//[[ THE RESEARCHED SKILLS, BROUGHT TO THE STEP THAT NEEDS THEM.
//
//   Measured 2026-10-04 (t1 round 1): in 90 tool calls the agent made 0 calls to search_docs, search_creation_skills or
//   read_creation_skill, though ~360 researched skills exist. The model is small and fast; it does not go looking. So the
//   harness brings the knowledge: before each plan step it ranks the creator skills (creator-skills.ts, the same token
//   scoring search_creation_skills uses) for THAT step and hands the top one or two to the run as a harness note, next to
//   the card steer skill-cards.ts already pushes.
//
//   GENERAL, NEVER A SUBJECT. The query is the step's own words (title, detail, tool) with the request's words weighing a
//   quarter as much: a step is about what it says, and the request only breaks ties between skills that fit it equally.
//   A skill must match the STEP itself (MIN_STEP_SCORE: more than one word hitting its title or id) to be pushed at all, so
//   a step no skill is about gets nothing rather than the nearest thing. No table maps a request or a subject to a skill.
//   The one structural rule: a step whose tool builds in the workspace takes its skills from the worldbuilding domain
//   (building craft and world visuals), because that is the domain such a step is about.
//
//   BOUNDED THREE WAYS, all persisted on the run (`SkillPushState`), so a restart cannot reset them:
//     - never the same skill twice, and one batch per plan step;
//     - at most MAX_SKILL_PUSHES_PER_RUN skills and SKILL_PUSH_CHARS_PER_RUN characters in all;
//     - never while the transcript is past the share of its budget a trim would cut back to (the push would only evict
//       older turns): `contextUsedChars` / `contextMaxChars` are what session.ts already measures every step.
//
//   WHAT IS SENT is the skill's read payload (readCreatorSkill, at most 2,800 characters, the same text read_creation_skill
//   returns) laid out as plain lines. The text is reviewed source in this repository, never fetched or user-supplied; only
//   the plan step's title is model text, and it goes through fenceForQuote like every other quoted plan title. ]]
import { readCreatorSkill, scoreCreatorSkills, type CreatorSkillDomain } from './creator-skills';
import { settlePlan, type PlanTraceEntry, type RunPlan } from './run-plan';
import { fenceForQuote } from './run-parts';

/** Skills pushed in one run, all steps together. */
export const MAX_SKILL_PUSHES_PER_RUN = 8;
/** Skills pushed for one plan step. */
export const MAX_SKILLS_PER_STEP = 2;
/** One skill body: the read payload's own ceiling (creator-skills.ts MAX_READ_CHARS). */
export const SKILL_BODY_CHARS = 2800;
/**
 * All pushed skill text in one run. Measured: the average rendered skill is ~1,600 characters, so eight fit with room to
 * spare; the cap is what keeps eight worst-case bodies (8 x 2,800) from taking over a context whose floor is 60,000.
 */
export const SKILL_PUSH_CHARS_PER_RUN = 14_000;
/** A push is held back once the transcript is past this share of its budget (prompt-budget.ts TRIM_TARGET_SHARE is 0.7). */
export const SKILL_PUSH_CONTEXT_SHARE = 0.6;
/**
 * A skill must score at least this on the STEP's words alone, AND be named (id, title or keywords) by at least MIN_STEP_WORDS
 * different words of it: one word shared with a skill's title is a coincidence ("look", "name"), two are a topic.
 */
export const MIN_STEP_SCORE = 110;
export const MIN_STEP_WORDS = 2;
/** The request's words count this much next to the step's own. */
const REQUEST_WEIGHT = 0.25;
/** Query words kept from the step, and from the request (the tokeniser keeps 16 in all). */
const STEP_TOKENS = 12;
const REQUEST_TOKENS = 12;

/** Tools whose steps build in the workspace; their skills come from the worldbuilding domain. Each is a registered tool (held by a test). */
export const WORLD_BUILDING_TOOLS: readonly string[] = [
  'create_instances', 'clone_instances', 'scatter_instances', 'group_instances', 'shape_terrain', 'edit_terrain',
  'set_mood', 'insert_library_model', 'insert_asset', 'generate_model', 'transform_instances', 'create_rig',
];
const WORLD_DOMAIN: CreatorSkillDomain = 'worldbuilding';

export interface SkillPushState {
  /** Skill ids already pushed. */
  ids: string[];
  /** Plan steps already served, as `<plan tool row>#<step index>`. */
  steps: string[];
  /** Characters of skill text pushed so far. */
  chars: number;
}

export interface SkillPushInput {
  plan: RunPlan | undefined;
  trace: readonly PlanTraceEntry[];
  /** The user's request, as the run was started with it. */
  request: string;
  state: SkillPushState | undefined;
  /** What session.ts measured on the last step; both absent before the first measurement. */
  context?: { usedChars?: number; maxChars?: number };
}

export interface SkillPush {
  message: string;
  ids: string[];
  stepKey: string;
  chars: number;
}

const STOP = new Set(
  ('a an the and or of to in on at for with from by is are be this that it its as into then than so up out all any each one two three ' +
    'more most very make add set put use using new write place build create about tell show me my your you we how what when where which ' +
    'who will can should have has do does not no if also again now next first last step steps then they them their there these those').split(' '),
);

/** A word and, when it differs, its plain stem: "rewards" -> "reward", "selling" -> "sell". Crude on purpose: the catalogue has no stemmer. */
function stems(w: string): string[] {
  let stem = w;
  if (stem.length > 4 && stem.endsWith('ies')) stem = `${stem.slice(0, -3)}y`;
  else if (stem.length > 3 && stem.endsWith('s') && !stem.endsWith('ss')) stem = stem.slice(0, -1);
  else if (stem.length > 6 && stem.endsWith('ing')) stem = stem.slice(0, -3);
  return stem === w ? [w] : [w, stem];
}

/** Content words of some text: lower-case, no stop words, no repeats, in the order written, each with its stem. */
function contentWords(text: string, max: number): string[] {
  const out: string[] = [];
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (w.length < 2 || STOP.has(w)) continue;
    for (const form of stems(w)) if (!out.includes(form)) out.push(form);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

/** The skill as plain lines, never longer than SKILL_BODY_CHARS. Null when the read payload is not a skill. */
export function renderSkillBody(id: string): string | null {
  const payload = readCreatorSkill(id, SKILL_BODY_CHARS) as { skill?: Record<string, unknown> };
  const s = payload.skill;
  if (!s || typeof s.title !== 'string') return null;
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const lines = [
    `### ${s.title} [skill:${String(s.id)}]`,
    typeof s.summary === 'string' ? s.summary : '',
    list(s.steps).length ? `Steps:\n${list(s.steps).map((x, n) => `${n + 1}. ${x}`).join('\n')}` : '',
    list(s.verification).length ? `Check:\n${list(s.verification).map((x) => `- ${x}`).join('\n')}` : '',
    list(s.failureModes).length ? `Avoid:\n${list(s.failureModes).map((x) => `- ${x}`).join('\n')}` : '',
    list(s.qualityCriteria).length ? `Good looks like:\n${list(s.qualityCriteria).map((x) => `- ${x}`).join('\n')}` : '',
  ].filter(Boolean);
  const text = lines.join('\n');
  return text.length <= SKILL_BODY_CHARS ? text : `${text.slice(0, SKILL_BODY_CHARS - 1)}…`;
}

/** Why a push is held back, or null when one may go. Exported so the bound is testable on its own. */
export function skillPushHeldBack(state: SkillPushState | undefined, context?: SkillPushInput['context']): string | null {
  const ids = state?.ids.length ?? 0;
  if (ids >= MAX_SKILL_PUSHES_PER_RUN) return 'the per-run skill count is used';
  if ((state?.chars ?? 0) >= SKILL_PUSH_CHARS_PER_RUN) return 'the per-run skill text budget is used';
  const used = context?.usedChars;
  const max = context?.maxChars;
  if (typeof used === 'number' && typeof max === 'number' && max > 0 && used > max * SKILL_PUSH_CONTEXT_SHARE) {
    return 'the transcript is too full to add more without evicting older turns';
  }
  return null;
}

/** Creator skills for the plan's next pending step, or null (no plan, no match, a bound reached, the step already served). */
export function creatorSkillsForStep(i: SkillPushInput): SkillPush | null {
  if (!i.plan || skillPushHeldBack(i.state, i.context)) return null;
  const steps = settlePlan(i.plan, i.trace).steps;
  const at = steps.findIndex((s) => s.status === 'pending');
  const step = steps[at];
  if (!step) return null;
  const stepKey = `${i.plan.toolId}#${at}`;
  if (i.state?.steps.includes(stepKey)) return null;

  // The tool's name only speaks for a step that says too little itself: "edit script" is on half the steps and ranks every script skill.
  let stepWords = contentWords(`${step.title} ${step.detail ?? ''}`, STEP_TOKENS);
  if (stepWords.length < 3) stepWords = contentWords(`${step.title} ${step.detail ?? ''} ${step.tool.replace(/_/g, ' ')}`, STEP_TOKENS);
  if (!stepWords.length) return null;
  const byStep = new Map(scoreCreatorSkills(stepWords.join(' ')).map((r) => [r.id, r]));
  const requestWords = contentWords(i.request, REQUEST_TOKENS).filter((w) => !stepWords.includes(w));
  const byRequest = new Map(scoreCreatorSkills(requestWords.join(' ')).map((r) => [r.id, r.score]));
  const shown = new Set(i.state?.ids ?? []);
  const world = WORLD_BUILDING_TOOLS.includes(step.tool);

  const ranked = [...byStep.values()]
    .filter((r) => r.score >= MIN_STEP_SCORE && r.matched >= MIN_STEP_WORDS && !shown.has(r.id) && (!world || r.domain === WORLD_DOMAIN))
    .map((r) => ({ id: r.id, total: r.score + REQUEST_WEIGHT * (byRequest.get(r.id) ?? 0) }))
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));

  const room = Math.min(MAX_SKILLS_PER_STEP, MAX_SKILL_PUSHES_PER_RUN - (i.state?.ids.length ?? 0));
  const bodies: { id: string; text: string }[] = [];
  let chars = 0;
  for (const r of ranked) {
    if (bodies.length >= room) break;
    // The second skill must be about the step nearly as much as the first.
    if (bodies.length > 0 && r.total < ranked[0]!.total * 0.7) break;
    const text = renderSkillBody(r.id);
    if (!text) continue;
    if ((i.state?.chars ?? 0) + chars + text.length > SKILL_PUSH_CHARS_PER_RUN) break;
    bodies.push({ id: r.id, text });
    chars += text.length;
  }
  if (!bodies.length) return null;
  return {
    message:
      `Before "${fenceForQuote(step.title)}", ${bodies.length === 1 ? 'a researched skill' : 'researched skills'} for this kind of step. ` +
      'They are guidance to apply with the tools you have, in this place\'s own style, not a template to copy:\n\n' +
      bodies.map((b) => b.text).join('\n\n'),
    ids: bodies.map((b) => b.id),
    stepKey,
    chars,
  };
}

/** The state after a push. */
export function afterSkillPush(state: SkillPushState | undefined, push: SkillPush): SkillPushState {
  return {
    ids: [...(state?.ids ?? []), ...push.ids],
    steps: [...(state?.steps ?? []), push.stepKey].slice(-40),
    chars: (state?.chars ?? 0) + push.chars,
  };
}
