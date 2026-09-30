/**
 * The end of the build flow, held by the run rather than asked of the model: once judge_game says a game is ready in a run, the
 * next thing the user hears is the answer. The model was told "answer now, change nothing more" and still went on changing the
 * game (a second money counter, renamed music the game's own scripts look for), so the run refuses the change instead.
 */

/** Did this judge_game result say the game is ready? */
export function saysReady(toolName: string, resultForLlm: string | undefined): boolean {
  return toolName === 'judge_game' && /"verdict"\s*:\s*"ready"/.test(resultForLlm ?? '');
}

/** The refusal a project-changing call gets after a ready verdict in the same run, or undefined when the call may go ahead. */
export function afterReady(judgedReady: boolean | undefined, toolName: string, writers: ReadonlySet<string>): string | undefined {
  if (!judgedReady || !writers.has(toolName)) return undefined;
  return 'The game passed the client check in this run, so nothing more is changed now. Answer the user from the check\'s forUser in your own ' +
    'friendly words; if you think something should still change, say what and let the user ask for it.';
}

/**
 * A SECOND REQUEST ON A BUILT PLACE CONTINUES THAT GAME. Seen live 2026-09-30 (project c5405278): the same request sent again on a
 * place build_game had already made was re-judged, and then the agent set out to build a new map. One project is one game, so after
 * build_game has made it the project remembers that (storage `builtGame`), and a later run is told it is continuing that game and is
 * refused a new plan, build or recreate unless the user asks for a new game in so many words.
 */
export interface BuiltGameRecord {
  at: number;
  request: string;
}

/** The user asked for a new or rebuilt game, not a change to the one this project holds. */
export function wantsNewGame(text: string): boolean {
  return /\b(start (over|again|fresh)|from scratch|(a |an )?(new|another|different|second) game|rebuild|build (it|the game|this game) again|replace (the|this) game)\b/i.test(text);
}

/** The tools that make a game from nothing; a run continuing a built game is refused them. */
export const REBUILD_TOOLS: ReadonlySet<string> = new Set(['plan_game', 'build_game', 'compose_game', 'recreate_owner_game']);

/** The context line a run continuing a built game carries, or undefined when this run may build one. */
export function continueGameLine(built: BuiltGameRecord | undefined, text: string): string | undefined {
  if (!built || wantsNewGame(text)) return undefined;
  return `This project already holds its game, built earlier from: "${built.request.slice(0, 300)}". The user's message is about THAT game. ` +
    'Answer a question from it, or change it in place with the ordinary tools. Never plan, build or import a new game or a new map. ' +
    'If the message asks for the same game again, say it is already built, what the player can do in it, and ask what they would like changed.';
}

/** The refusal a rebuild call gets in a run that continues a built game, or undefined when the call may go ahead. */
export function refuseRebuild(continuesGame: boolean | undefined, toolName: string): string | undefined {
  if (!continuesGame || !REBUILD_TOOLS.has(toolName)) return undefined;
  return 'This project already holds its game, so a new one is not planned or built over it. Change the existing game in place, or ' +
    'answer the user; if they want a different game, they can say so (for example "start over with a new game").';
}
