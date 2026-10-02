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
