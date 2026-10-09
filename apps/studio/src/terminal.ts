/** How an agent turn ended, and what the person is told about it (agent.ts writes it as a `data-stop` part). */

/**
 * Why a turn ended. Every turn ends with one, so a run that stops is never silent: before 2026-10-09 a run that reached
 * MAX_STEPS mid-build just ended, and the island request "stopped before finishing" with no reason anyone could find.
 */
export type TerminalReason = 'completed' | 'cancelled' | 'open_defects' | 'step_limit' | 'output_limit' | 'content_filter' | 'provider_error' | 'incomplete';

export function terminalReason(finishReason: string | undefined, steps: number, maxSteps: number, openDefects = 0): TerminalReason {
  if (finishReason === 'stop') return openDefects > 0 ? 'open_defects' : 'completed';
  if (finishReason === 'tool-calls' && steps >= maxSteps) return 'step_limit';
  if (finishReason === 'length') return 'output_limit';
  if (finishReason === 'content-filter') return 'content_filter';
  if (finishReason === 'error') return 'provider_error';
  return 'incomplete';
}

/**
 * Defects left open by the turn's last UI measurement (build_ui's layout or check_ui), 0 when it passed or none ran.
 * The admin-panel run of 2026-10-09 ended "finished" on a check that still listed two overflows, after a clipping
 * "fix" it never measured; the person was told nothing.
 */
export function openUiDefects(steps: ReadonlyArray<{ toolResults?: ReadonlyArray<{ toolName?: string; output?: unknown }> }>): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    const results = steps[i]!.toolResults ?? [];
    for (let j = results.length - 1; j >= 0; j--) {
      const r = results[j]!;
      if (r.toolName !== 'build_ui' && r.toolName !== 'check_ui') continue;
      let o = r.output as Record<string, unknown> | string | null | undefined;
      if (typeof o === 'string') try { o = JSON.parse(o) as Record<string, unknown>; } catch { return 0; }
      const v = ((o as Record<string, unknown> | null)?.layout ?? o) as { verdict?: unknown; defects?: unknown } | null;
      return v?.verdict === 'defects' && Array.isArray(v.defects) ? v.defects.length : 0;
    }
  }
  return 0;
}

/** What the person reads under the reply when a turn did not finish on its own. */
export function stopNote(reason: TerminalReason, steps: number, openDefects = 0): string | null {
  switch (reason) {
    case 'completed':
      return null;
    case 'cancelled':
      return `Stopped after ${steps} step${steps === 1 ? '' : 's'}. Changes Studio had not picked up yet were discarded; what was already made is in your place.`;
    case 'open_defects':
      return `Finished with ${openDefects} layout defect${openDefects === 1 ? '' : 's'} still open in the last check. Say "fix the layout" and StudPilot works on them.`;
    case 'step_limit':
      return `Paused after ${steps} steps, so one request cannot run on without limit. Everything built so far is in your place. Say "continue" and StudPilot picks up from here.`;
    case 'output_limit':
      return 'The reply reached the length limit of one step and was cut off. Say "continue" to finish it.';
    case 'content_filter':
      return "The model's content filter stopped this reply. Rephrase the request and try again.";
    case 'provider_error':
      return 'The model failed partway through this request. What was built before the failure is in your place. Say "continue" to pick up from here.';
    case 'incomplete':
      return 'StudPilot stopped before giving a final answer. What was built so far is in your place. Say "continue" to pick up from here.';
  }
}
