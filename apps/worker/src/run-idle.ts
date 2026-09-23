// Built and checked, then only reading.
//
// Measured 2026-09-22 on every customer-mission run (76b59615, fad0ab1b, a95f86fa): the model changed
// the place, ran a check, and then spent 20–40 paid steps on search_scripts / get_project_tree with
// DIFFERENT arguments each time — invisible to the duplicate guard, which only sees identical calls —
// until something else ended the run. This counts those steps and says when to intervene.
//
// A new change clears the check, so a run that is still fixing things is never counted: only a run
// whose latest change has passed a verifier, and which has since only read, is idle.

export const IDLE_AFTER_VERIFY_NUDGE = 4;
export const IDLE_AFTER_VERIFY_LIMIT = 8;
/**
 * A run that was told not to change anything has no change for a check to follow, so the bound above
 * never starts. Measured 2026-09-22 (run 5034f8f2): "What parts make up the StreetLamp model? Just tell
 * me, don't change anything." — it read the model and the tree, then kept reading until the duplicate
 * guard ended it without an answer. Such a run is told to answer after this many read-only steps.
 */
export const ANSWER_ONLY_NUDGE = 5;

/**
 * Reading without building. Measured 2026-09-23 (run c71b89a9, "make a coin game!" on an empty
 * baseplate): after installing the coin module the run made 88 read-only calls — get_tree,
 * read_script, search_scripts in a fixed cycle — for 242 Credits and built nothing. Every call sent the
 * same ~21.5k tokens: each new result pushed the previous read out of the trimmed transcript, and the
 * duplicate guard deliberately forgets trimmed reads, so the cycle never repeated a call it could see.
 * The one mutation (the install) switched off the "you have not built anything" steer, and no check
 * ever passed, so neither bound above started. This one counts read-only steps since the last change
 * in any run that can build, tells the model to build at the nudge, and ends the run at the limit.
 */
export const READ_STALL_NUDGE = 10;
export const READ_STALL_LIMIT = 20;

export interface IdleState {
  /** A verifier passed after the latest change to the place. */
  verifiedAfterMutation?: boolean;
  /** Consecutive read-only steps since then. */
  idleAfterVerify?: number;
  /** Consecutive read-only steps since the last change or check, in a run that can build. */
  readsSinceChange?: number;
}

export interface StepFacts {
  /** A tool in this step changed the place. */
  mutated: boolean;
  /** A verifier in this step succeeded, with the place already changed by this run. */
  verified: boolean;
  /** Tool calls the step made, executed or refused as duplicates. Zero is a prose step. */
  calls: number;
  /** The run owes no change (the person forbade one), so reading is idle from the first step. */
  answerOnly?: boolean;
  /** The run is offered tools that change the place (Agent mode with Studio connected). */
  canBuild?: boolean;
}

export type IdleAction = 'none' | 'nudge' | 'finish' | 'answer' | 'build' | 'stall';

export function afterStep(state: IdleState, step: StepFacts): IdleState & { action: IdleAction } {
  let verifiedAfterMutation = state.verifiedAfterMutation === true;
  if (step.mutated) verifiedAfterMutation = false;
  if (step.verified && !step.mutated) verifiedAfterMutation = true;
  const onlyRead = !step.mutated && !step.verified && step.calls > 0;
  const counting = step.answerOnly ? onlyRead : verifiedAfterMutation && onlyRead;
  const idleAfterVerify = counting ? (state.idleAfterVerify ?? 0) + 1 : 0;
  const stalling = step.canBuild === true && !step.answerOnly && onlyRead;
  const readsSinceChange = stalling ? (state.readsSinceChange ?? 0) + 1 : 0;
  let action: IdleAction = step.answerOnly
    ? idleAfterVerify === ANSWER_ONLY_NUDGE ? 'answer' : 'none'
    : idleAfterVerify >= IDLE_AFTER_VERIFY_LIMIT ? 'finish' : idleAfterVerify === IDLE_AFTER_VERIFY_NUDGE ? 'nudge' : 'none';
  if (action === 'none' && !verifiedAfterMutation) {
    if (readsSinceChange >= READ_STALL_LIMIT) action = 'stall';
    else if (readsSinceChange === READ_STALL_NUDGE) action = 'build';
  }
  return { verifiedAfterMutation, idleAfterVerify, readsSinceChange, action };
}

/**
 * Changing the same thing over and over. Measured 2026-09-22 (F-036, "too foggy … a clear, warm
 * golden-hour sunset"): set_mood succeeded, then the run looped render_view → set_props on one Lighting
 * value → render_view for five minutes, 101 steps, ~262 Credits. Every step changed something, so no
 * read bound could see it. This counts successful changes per target (tool + what it was aimed at):
 * at RETUNE_NUDGE the model is told to stop tuning, and at RETUNE_LIMIT the run ends on what it built.
 */
export const RETUNE_NUDGE = 6;
export const RETUNE_LIMIT = 12;
/** Targets remembered per run; the oldest is forgotten past this, so the state stays small. */
export const RETUNE_KEYS = 24;

export type RetuneAction = 'none' | 'nudge' | 'finish';

export function afterChange(counts: Record<string, number> | undefined, key: string): { counts: Record<string, number>; action: RetuneAction } {
  const next: Record<string, number> = { ...(counts ?? {}) };
  const n = (next[key] ?? 0) + 1;
  delete next[key];
  next[key] = n; // re-inserted, so insertion order is recency and the oldest key is first
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - RETUNE_KEYS))) delete next[k];
  const action: RetuneAction = n >= RETUNE_LIMIT ? 'finish' : n === RETUNE_NUDGE ? 'nudge' : 'none';
  return { counts: next, action };
}


/** Plain words for what a change was, for a young reader. Anything unlisted reads as its tool name. */
const CHANGE_WORDS: Record<string, string> = {
  edit_terrain: 'terrain',
  create_instances: 'new objects',
  generate_model: 'generated models',
  transform_instances: 'moves and resizes',
  set_properties: 'property changes',
  set_mood: 'lighting',
  add_effect: 'effects',
  edit_script: 'script edits',
  delete_instances: 'deletions',
  clone_instances: 'copies',
  insert_asset: 'inserted assets',
  install_module: 'modules',
};

/**
 * What a run that a bound stopped actually changed, counted from its own trace. Measured 2026-09-23:
 * three sky-island runs ended "Apple stopped here … What it built is in your place" with no word of
 * what that was, and an earlier reply (F-033) guessed "about a dozen" edits for 149. A count from the
 * trace cannot be that wrong. Empty when nothing changed.
 */
export function builtSummary(trace: readonly { tool: string; ok: boolean }[], mutating: ReadonlySet<string>): string {
  const counts = new Map<string, number>();
  for (const t of trace) if (t.ok && mutating.has(t.tool)) counts.set(t.tool, (counts.get(t.tool) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return '';
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tool, n]) => `${CHANGE_WORDS[tool] ?? tool.replace(/_/g, ' ')} (${n})`);
  return `It made ${total} change${total === 1 ? '' : 's'} in your place: ${parts.join(', ')}.`;
}

/**
 * Autonomous runs that stop to ask. Measured 2026-09-23 (gauntlet round 2, Apple MAX, "make the full
 * game"): the run placed a landmark, passed check_composition, then wrote "audit_build still reports
 * one real defect I have not fixed yet … the full loop has not been playtested … Want me to fix the
 * z-fighting next, then run the playtest?" and the idle bound ended it. Autonomous means the person
 * already said yes, so a reply that names owed work or asks leave to continue is handed back as work,
 * at most AUTONOMOUS_CONTINUES times per run; MAX_RUN_STEPS, Credits and Stop still end it.
 */
export const AUTONOMOUS_CONTINUES = 3;

const ASKS_LEAVE = /\b(want me to|should i|shall i|would you like( me)? to|do you want( me)? to|let me know if|if you('d| would) like)\b/i;
const OWES_WORK = /\b((not|never) (yet )?(been )?(fixed|verified|done|built|finished|run|tested|playtested|implemented)|haven'?t (yet )?(fixed|verified|run|tested|playtested|built|finished)|still (owed|needs?|missing|to do)|is still owed|next step would be|remaining work)\b/i;

/** The reply leaves work it names undone, or asks permission to do more. */
export function leavesWorkOpen(text: string | null | undefined): boolean {
  if (!text) return false;
  return ASKS_LEAVE.test(text) || OWES_WORK.test(text);
}

export const AUTONOMOUS_CONTINUE_STEER =
  'Autonomous is ON: the user already approved finishing this request, so do not ask them anything. ' +
  'Your last reply names work that is still missing, broken or unverified. Do that work now with tool ' +
  'calls — fix the defects your checks reported, then playtest the game loop the request asked for. ' +
  'Reply to the user only when nothing the request needs is left, and end that reply with a statement, not a question.';

/** For an Autonomous run the idle bound would end: finishing is the model's call, reading is not. */
export const AUTONOMOUS_IDLE_STEER =
  'Autonomous is ON, and you have only been reading since your last check passed. If anything the request ' +
  'needs is still missing, broken or unverified (defects your checks reported, a game loop nobody has ' +
  'playtested), make that change now. If nothing is left, reply to the user with the final summary and no ' +
  'tool calls, ending with a statement, not a question.';

// A request to build a game, as opposed to a prop, a script or a question about one.
const GAME_REQUEST = /\b(game|simulator|tycoon|obby|roleplay|rpg|shooter|battlegrounds?|survival|horror|racing|tower defen[cs]e)\b/i;

/**
 * What a built game still lacks that a player notices in the first minute: nothing on screen (no
 * currency, no action buttons) or a loop nobody has played. Only what this run can supply is owed.
 */
export function gameGaps(
  request: string | null | undefined,
  run: { hudBuilt?: boolean; playChecked?: boolean },
  canPlay: boolean,
): ('hud' | 'playtest')[] {
  if (!request || !GAME_REQUEST.test(request)) return [];
  const gaps: ('hud' | 'playtest')[] = [];
  if (!run.hudBuilt) gaps.push('hud');
  if (canPlay && !run.playChecked) gaps.push('playtest');
  return gaps;
}

export function gameGapSteer(gaps: readonly ('hud' | 'playtest')[]): string {
  const owed: string[] = [];
  if (gaps.includes('hud')) {
    owed.push('The player has nothing on screen: this run built no ScreenGui. Build the HUD the game needs — its ' +
      'currency counter bound to leaderstats and a button for each core action the request names (shop, sell, ' +
      'inventory…) — under StarterGui, styled to match the world.');
  }
  if (gaps.includes('playtest')) {
    owed.push('Nobody has played the game loop yet. Run play_check as a real player through the loop the request ' +
      'asks for (earn, spend, grow, win — whatever it is), touching the parts that drive it, and fix what it reports.');
  }
  return `Autonomous is ON and this is a game a player will open. ${owed.join(' ')} ` +
    'Then reply with the final summary, ending with a statement, not a question.';
}

/**
 * A stuck step is not a finished run. Gauntlet round 3 (2026-09-23): chasing one defect, the model
 * re-read the same scripts, three all-duplicate steps ended the run, and the plan's next step (the
 * HUD) was never built. An Agent run with work still open is moved on instead — reads withheld
 * for one step, told to leave the detail — at most UNSTICKS_PER_RUN times; after that it ends as before.
 */
export const UNSTICKS_PER_RUN = 2;

export const UNSTICK_STEER =
  'You are stuck: your last steps repeated calls you already made, and they were not run again. Do not repeat ' +
  'any of them. Stop re-reading and stop investigating ' +
  'that detail — leave it as it is and note it for your final summary. Build the next missing piece of the ' +
  'request now with a tool call that changes the place; reading tools are unavailable for this one step.';

export function afterDuplicateStreak(f: {
  streak: number;
  limit: number;
  /** An Agent-mode run that can change the place — Autonomous or not (gauntlet round 4, run a933ac87). */
  building: boolean;
  unstucks: number;
  workOpen: boolean;
}): 'continue' | 'unstick' | 'end' {
  if (f.streak < f.limit) return 'continue';
  return f.building && f.workOpen && f.unstucks < UNSTICKS_PER_RUN ? 'unstick' : 'end';
}
