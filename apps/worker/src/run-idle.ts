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
 * read bound could see it. This counts successful changes in a row to one target (tool + what it was
 * aimed at): at RETUNE_NUDGE the model is told to stop tuning, and at RETUNE_LIMIT the run ends on what
 * it built. A change to any other target restarts the count: Candy Garden v2 (2026-09-29) was ended
 * after 60 minutes for its 12th edit of the client script, spread across a 219-call game build.
 */
export const RETUNE_NUDGE = 6;
export const RETUNE_LIMIT = 12;

export type RetuneAction = 'none' | 'nudge' | 'finish';

export function afterChange(counts: Record<string, number> | undefined, key: string): { counts: Record<string, number>; action: RetuneAction } {
  const n = (counts?.[key] ?? 0) + 1;
  const action: RetuneAction = n >= RETUNE_LIMIT ? 'finish' : n === RETUNE_NUDGE ? 'nudge' : 'none';
  return { counts: { [key]: n }, action };
}


/**
 * Changing two things back and forth. afterChange forgets everything when the target changes, so tweak A, read, tweak B,
 * read never reaches its limit (scripted S3 and S3b: 400 steps, 1,107 Credits). This keeps the last CHANGE_WINDOW
 * changes. When one target holds WINDOW_NUDGE of them the model is told, once per WINDOW_NUDGE changes; the second
 * time the window is still dominated, the run ends on what it built. Work spread over many targets never counts, and a
 * target that is one change in a few is building, not retuning. A change aimed at nothing (a script's own code names its
 * target inside the code) is not counted at all: twelve different run_luau scripts in a row ended successful
 * script-built maps through afterChange, which is the capability this window must not cut.
 */
export const CHANGE_WINDOW = 24;
export const WINDOW_NUDGE = 12;
export const WINDOW_FINISH_AT_NUDGES = 2;

export interface ChangeWindow { keys: string[]; since: number; nudges: number }

export function afterChangeWindow(state: ChangeWindow | undefined, key: string): { state: ChangeWindow; action: RetuneAction } {
  const keys = [...(state?.keys ?? []), key].slice(-CHANGE_WINDOW);
  const since = (state?.since ?? WINDOW_NUDGE) + 1; // changes since the last nudge
  const dominated = keys.filter((k) => k === key).length >= WINDOW_NUDGE;
  // Once NO target holds WINDOW_NUDGE of the window, that bout is over: a later, unrelated one starts again with a nudge,
  // not an end (review of the credits branch). A key that merely is not the dominant one (A, A, B) does not reset it.
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const anyDominated = [...counts.values()].some((n) => n >= WINDOW_NUDGE);
  const nudgesSoFar = anyDominated ? (state?.nudges ?? 0) : 0;
  if (!dominated || since < WINDOW_NUDGE) return { state: { keys, since, nudges: nudgesSoFar }, action: 'none' };
  const nudges = nudgesSoFar + 1;
  return { state: { keys, since: 0, nudges }, action: nudges >= WINDOW_FINISH_AT_NUDGES ? 'finish' : 'nudge' };
}


/**
 * A tool that keeps failing, whatever it is sent. Measured 2026-10-02 (owner benchmark, map runs of 434 and
 * 584 Credits): the model hand-computed coordinates for ~75 parts and retried failed calls dozens of times.
 * Each retry changed its numbers, so the identical-call guard (MAX_SAME_FAILURES, which is keyed on tool +
 * arguments) never saw a repeat, and every failed step was billed. This counts consecutive failures per TOOL
 * across any arguments; one success of that tool clears its count. At FAIL_STEER_AT (and again at twice that)
 * the model is told the calls failed the same way and to read state or change approach; at FAIL_END_AT the
 * run ends on what it built. The tool is never withheld: that would change the offered tools and void the
 * cached prefix, and the agent decides what to try next.
 */
export const FAIL_STEER_AT = 3;
export const FAIL_END_AT = 8;

export type FailureAction = 'none' | 'steer' | 'finish';

/**
 * The steer for a tool that keeps failing. It carries a count and a REGISTERED tool name (the run loop only counts calls
 * that were in the offered set) and nothing else: the error text stays in the tool results, where it is fenced as
 * untrusted output, and is not quoted into a user-role turn (packages/evals security.test.mjs A5 reviews this push).
 */
export function failureSteer(tool: string, failures: number): string {
  return `Your last ${failures} calls to ${tool} failed the same way, with different arguments each time (the errors are in the results above). ` +
    'Another variation of the same call will most likely fail too: read the current state to see what is really there, or change your approach ' +
    '(a different tool, or smaller steps), instead of retrying with new numbers.';
}

export function afterToolOutcome(streaks: Record<string, number> | undefined, tool: string, ok: boolean): { streaks: Record<string, number>; action: FailureAction } {
  const next = { ...streaks };
  if (ok) { delete next[tool]; return { streaks: next, action: 'none' }; }
  // Bounded like addMade: a tool name is a registry name, so this only guards a corrupted persisted record.
  if (!Object.prototype.hasOwnProperty.call(next, tool) && Object.keys(next).length >= 40) return { streaks: next, action: 'none' };
  const n = (next[tool] ?? 0) + 1;
  next[tool] = n;
  const action: FailureAction = n >= FAIL_END_AT ? 'finish' : n === FAIL_STEER_AT || n === FAIL_STEER_AT * 2 ? 'steer' : 'none';
  return { streaks: next, action };
}


/**
 * WHAT A CHANGE GAVE THE USER, in the words a young creator uses. A pair is a countable thing ("a sound", "3 sounds");
 * a string is a phrase that never takes a number. A tool that is not listed reads as "other changes", never as its own
 * name (tests/run-idle.test.mjs makes every project-changing tool answer for itself).
 */
const MADE: Record<string, string | [string, string]> = {
  edit_script: 'how the game works', format_script: 'how the game works', run_luau: 'how the game works', install_module: 'how the game works',
  create_instances: 'new objects', build_scene: 'a ready-made scene',
  set_properties: 'how things look', set_properties_bulk: 'how things look', set_locked: 'how things look', set_visible: 'how things look',
  edit_terrain: 'the terrain', shape_terrain: 'the terrain',
  delete_instances: 'removed objects',
  move_instances: 'moved or resized objects', transform_instances: 'moved or resized objects',
  group_instances: 'tidied objects', ungroup_instances: 'tidied objects', rename_instance: 'tidied objects',
  clone_instances: 'copies of objects', scatter_instances: 'copies of objects',
  set_mood: 'the lighting',
  add_effect: ['effect', 'effects'], insert_vfx: ['effect', 'effects'], remove_effect: 'removed effects',
  insert_sound: ['sound', 'sounds'], design_sound: 'the sound mix', assign_sounds: 'the sound mix',
  insert_asset: ['model', 'models'], insert_library_model: ['model', 'models'], insert_owner_component: ['model', 'models'],
  generate_model: ['model', 'models'], generate_model_external: ['model', 'models'],
  insert_ui_component: 'the on-screen parts', build_ui: 'the on-screen parts', build_studded_ui: 'the on-screen parts', add_upgrades: 'the upgrades', animate_model: 'the moving parts', build_object: 'new objects', dress_object: 'the object\'s stage, motion and extras',
  collision_groups: 'what things can pass through',
  create_rig: ['character', 'characters'],
};

const WORDS = (s: string) => s.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[^A-Za-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const SERVICE_PART: Record<string, string> = {
  Workspace: 'the game map', StarterGui: 'the game screens', Lighting: 'the game lighting', SoundService: 'the game sounds',
  StarterPack: 'the starter tools', Teams: 'the teams', MaterialService: 'the game materials',
};

/** "/StarterGui/ShopGui#2" -> "shop": the library name of a thing, as words. Empty when nothing readable is left (an id or a bare number is not a name). */
export function plainName(path: string): string {
  const last = path.split('/').filter(Boolean).pop() ?? '';
  const words = WORDS(last.replace(/#\d+$/, '')).replace(/ (gui|ui|screen|frame|model|folder)$/, '');
  return /[a-z]/.test(words) && (words.match(/\d/g) ?? []).length <= 4 ? words.slice(0, 40).trim() : '';
}

/** What a library path is called to a user: "/Workspace" is the game map, "/StarterGui/ShopGui" the shop screen. */
export function plainLibraryThing(path: string): string {
  const [service, ...rest] = path.split('/').filter(Boolean);
  if (!service) return 'a saved model';
  if (!rest.length) return SERVICE_PART[service] ?? 'the game systems';
  const name = plainName(path);
  const kind = service === 'StarterGui' ? 'screen' : service === 'StarterPack' ? 'tool' : service === 'SoundService' ? 'sound'
    : service === 'Workspace' ? '' : 'system';
  return name ? `the ${name}${kind ? ` ${kind}` : ''}` : kind ? `a ${kind}` : 'a model';
}

/** The key a successful project-changing call is filed under (see addMade): its tool, or "=" and what a library import brought. */
export function madeKey(tool: string, args: string | undefined): string {
  if (tool === 'recreate_owner_game') return '=the whole game';
  if (tool === 'build_game') return '=a whole new game from your saved games';
  if (tool === 'compose_game') return '=a whole new game made for your idea';
  if (tool === 'install_owner_system') return '=a ready-made feature from your saved games';
  if (tool !== 'import_owner_library') return tool;
  try {
    const path = (JSON.parse(args || '{}') as { path?: unknown }).path;
    if (typeof path === 'string') return '=' + plainLibraryThing(path);
  } catch { /* the tool already refused bad JSON */ }
  return '=part of a saved game';
}

/** Count one more change under its key. At most 30 different keys are kept; the rest count as other changes. */
export function addMade(made: Record<string, number> | undefined, key: string): Record<string, number> {
  const next = { ...made };
  const at = Object.prototype.hasOwnProperty.call(next, key) || Object.keys(next).length < 30 ? key : 'other';
  next[at] = (next[at] ?? 0) + 1;
  return next;
}

/**
 * What a run that a bound stopped gave the user, from its own record of successful changes. Measured 2026-09-23:
 * three sky-island runs ended "Apple stopped here … What it built is in your place" with no word of what that was,
 * and an earlier reply (F-033) guessed "about a dozen" edits for 149. A count from the record cannot be that wrong.
 * It names what the user got ("the shop screen", "3 sounds"), never a tool. Empty when nothing changed.
 */
export function builtSummary(made: Record<string, number> | undefined): string {
  const things = new Map<string, { one: string; n: number }>();
  for (const [key, n] of Object.entries(made ?? {})) {
    const what = key.startsWith('=') ? key.slice(1) : Object.prototype.hasOwnProperty.call(MADE, key) ? MADE[key]! : 'other changes';
    const [one, many] = typeof what === 'string' ? [what, what] : what;
    things.set(many, { one, n: (things.get(many)?.n ?? 0) + n });
  }
  const parts = [...things].map(([many, { one, n }]) =>
    one === many ? many : n === 1 ? `${/^[aeiou]/.test(one) ? 'an' : 'a'} ${one}` : `${n} ${many}`);
  const shown = parts.slice(0, 6);
  if (!shown.length) return '';
  const list = parts.length > shown.length ? `${shown.join(', ')} and more`
    : shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return `It worked on ${list}.`;
}

/**
 * Runs that stop to ask. Measured 2026-09-23 (gauntlet round 2, Apple MAX, "make the full
 * game"): the run placed a landmark, passed check_composition, then wrote "audit_build still reports
 * one real defect I have not fixed yet … the full loop has not been playtested … Want me to fix the
 * z-fighting next, then run the playtest?" and the idle bound ended it. The person asked for the whole
 * request (V3: proceed automatically, no routine approval gate), so a reply that names owed work or asks leave to continue is handed back as work,
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
  'The user already asked for this whole request to be finished, so do not ask them anything. ' +
  'Your last reply names work that is still missing, broken or unverified. Do that work now with tool ' +
  'calls — fix the defects your checks reported, then playtest the game loop the request asked for. ' +
  'Reply to the user only when nothing the request needs is left, and end that reply with a statement, not a question.';

/** For a run the idle bound would end: finishing is the model's call, reading is not. */
export const AUTONOMOUS_IDLE_STEER =
  'You have only been reading since your last check passed. If anything the request ' +
  'needs is still missing, broken or unverified (defects your checks reported, a game loop nobody has ' +
  'playtested), make that change now. If nothing is left, reply to the user with the final summary and no ' +
  'tool calls, ending with a statement, not a question.';

/**
 * Whether THIS RUN built something game-shaped, judged by what it built and not by the words of the request: a composed or saved
 * game (builtGame), or scripts together with at least two other kinds of change. (A keyword list of game genres used to decide
 * that a request "owed" a HUD and a playtest: a request in another language, or for a genre not on the list, owed nothing, and a
 * script fix that said "game" owed both.)
 */
export function builtAGame(run: { builtGame?: boolean; made?: Record<string, number> }): boolean {
  if (run.builtGame === true) return true;
  const kinds = Object.keys(run.made ?? {});
  return (run.made?.edit_script ?? 0) >= 1 && kinds.length >= 3;
}

/**
 * What a built game still lacks that a player notices in the first minute: nothing on screen (no
 * currency, no action buttons) or a loop nobody has played. Said from what the run built; the agent decides whether it matters.
 * Only what this run can supply is owed.
 */
export function gameGaps(
  run: { hudBuilt?: boolean; playChecked?: boolean; builtGame?: boolean; made?: Record<string, number> },
  canPlay: boolean,
): ('hud' | 'playtest')[] {
  if (!builtAGame(run)) return [];
  const gaps: ('hud' | 'playtest')[] = [];
  if (!run.hudBuilt) gaps.push('hud');
  if (canPlay && !run.playChecked) gaps.push('playtest');
  return gaps;
}

/** A mutating call that puts a HUD on screen. An owner game's original UI counts: a recreate or a StarterGui import brings its own. */
export function buildsHud(name: string, args: string | undefined): boolean {
  return name === 'build_ui' || name === 'insert_ui_component' || name === 'build_studded_ui' || name === 'add_upgrades' || name === 'recreate_owner_game' || name === 'build_game' || name === 'compose_game' ||
    /ScreenGui|ui_kit/.test(args ?? '') || (name === 'import_owner_library' && /StarterGui/.test(args ?? ''));
}

export function gameGapSteer(gaps: readonly ('hud' | 'playtest')[]): string {
  const owed: string[] = [];
  if (gaps.includes('hud')) {
    owed.push('The player has nothing on screen: this run built no ScreenGui. Insert the HUD the game needs with insert_ui_component — its ' +
      'currency counter bound to leaderstats and a button for each core action the request names (shop, sell, ' +
      'inventory…) — in the genre skin that matches the world; UI is never built by hand.');
  }
  if (gaps.includes('playtest')) {
    owed.push('Nobody has played the game loop yet. Run play_check as a real player through the loop the request ' +
      'asks for (earn, spend, grow, win — whatever it is), touching the parts that drive it, and fix what it reports.');
  }
  return `This is a game a player will open. ${owed.join(' ')} ` +
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
  /** A run that can change the place (gauntlet round 4, run a933ac87). */
  building: boolean;
  unstucks: number;
  workOpen: boolean;
}): 'continue' | 'unstick' | 'end' {
  if (f.streak < f.limit) return 'continue';
  return f.building && f.workOpen && f.unstucks < UNSTICKS_PER_RUN ? 'unstick' : 'end';
}

/**
 * The move-on allowance to use at this streak. It renews when less work is open than at the last move-on:
 * a run that built a part or finished a plan step between two walls was not stuck, it met a new one
 * (F-064). Nothing closed in between, and the run still ends after UNSTICKS_PER_RUN. Strictly less,
 * so renewals are bounded by the work that is open.
 */
export function unstucksAfterProgress(unstucks: number, openAtLastUnstick: number | undefined, openNow: number): number {
  return openAtLastUnstick !== undefined && openNow < openAtLastUnstick ? 0 : unstucks;
}
