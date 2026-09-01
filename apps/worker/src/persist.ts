/**
 * Persisting a run's state, and what to drop when it will not fit.
 *
 * Durable Object values are capped at 128 KiB. An oversized `put` rejects, and if the rejection
 * escapes the alarm handler the platform retries the alarm from the state persisted BEFORE the
 * step — which re-runs that step's paid LLM call and re-executes its mutating tools against the
 * user's place. The failure mode is duplicate mutation, not a lost write, so it is always better
 * to finish a run holding less history than to hand the platform a state it will replay.
 *
 * ## Why this is a module rather than a method
 *
 * It used to be a private method on the Durable Object, and it contained this:
 *
 *     private async persistAgent(agent) {
 *       try {
 *         await this.persistAgent(agent);   // <- itself
 *
 * Every persist recursed until the stack overflowed, the RangeError was caught by the shedding
 * path, and the run was saved WITHOUT its transcript — on every single step, silently, with only
 * a console warning that reads like a size problem. The agent forgot the conversation each step.
 *
 * Nothing caught it because nothing could: `SessionDO` extends `DurableObject` and cannot be
 * instantiated outside the Workers runtime, so the whole policy sat in a place no test reached.
 * Taking the `put` as an argument makes the policy ordinary code with ordinary tests, and leaves
 * the method on the DO a single line that only supplies storage. See F-31 in docs/FAILURES.md.
 */
import { turnGroups } from './transcript.ts';
import type { GatewayMessage } from '@golem/shared';

/** The fields shedding touches. Deliberately structural: this module has no business knowing
 *  what else a run carries, and typing it that way keeps it out of session.ts's import cycle. */
export interface Sheddable {
  llm: GatewayMessage[];
  trace: unknown[];
  seenCalls?: string[];
  lastCalls?: unknown[];
  status: 'idle' | 'running' | 'stopping';
  finalText: string;
}

/** What actually reached storage. Returned rather than logged so a caller — or a test — can tell
 *  a healthy save from a degraded one, which the console warning alone could not. */
export type PersistOutcome = 'full' | 'shed' | 'terminal';

export const TOO_LARGE_MESSAGE =
  'This run was stopped because its state grew too large to save.';

/** How much trace survives a shed. Enough to explain what the run was doing, not enough to be
 *  what made it too large. */
export const SHED_TRACE_KEEP = 10;

/**
 * Write `state`, dropping history rather than failing.
 *
 * `put` is the only side effect, and it is injected: pass `(v) => storage.put('agent', v)`.
 * `warn` defaults to `console.warn` and is injected for the same reason.
 */
export async function persistWithShedding<T extends Sheddable>(
  put: (value: T) => Promise<unknown>,
  state: T,
  warn: (message: string, detail: string) => void = (m, d) => console.warn(m, d),
): Promise<PersistOutcome> {
  try {
    await put(state);
    return 'full';
  } catch (err) {
    // Shed the transcript down to what a run genuinely cannot continue without: the system
    // prompt and anything pinned. `turnGroups` already knows which that is.
    const { head } = turnGroups(state.llm);
    const shed: T = {
      ...state,
      llm: head,
      seenCalls: [],
      lastCalls: [],
      trace: state.trace.slice(-SHED_TRACE_KEEP),
    };
    try {
      await put(shed);
      warn('[session] agent state too large; persisted without transcript', String(err).slice(0, 200));
      return 'shed';
    } catch (err2) {
      // Nothing about this run is recoverable, so record the smallest possible terminal state
      // rather than letting the alarm die and be retried.
      await put({
        ...shed,
        llm: [],
        trace: [],
        status: 'idle',
        finalText: TOO_LARGE_MESSAGE,
      });
      warn('[session] agent state unsaveable even when empty', String(err2).slice(0, 200));
      return 'terminal';
    }
  }
}
