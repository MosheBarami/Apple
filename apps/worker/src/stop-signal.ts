/**
 * The stop button, and why it needs a key of its own.
 *
 * A run holds its own copy of the `agent` blob for the whole length of a step — an LLM call
 * and every tool it asks for, seconds at a time — and writes that copy back at the tail.
 * The stop handler runs on the websocket, concurrently, against the same blob.
 *
 * Putting the stop signal INSIDE that blob makes the two paths writers of one value, and
 * whichever write lands last silently discards the other:
 *
 *   * the run's tail write lands last -> `status: 'running'` overwrites the `'stopping'` the
 *     user just asked for. The button did nothing, and the next alarm carries on.
 *   * the stop's write lands last -> a blob read BEFORE the step overwrites the step's
 *     transcript and trace. The alarm then replays a step whose paid LLM call already ran and
 *     whose mutating tools already executed against the user's place.
 *
 * The second is the worse one and the less obvious. Neither is fixable by ordering the checks
 * more carefully, because the gap being raced is the step itself.
 *
 * So the signal lives under its own key with exactly one writer (the socket) and one reader
 * (the run). Nothing about a blob write can erase it, and it cannot erase a blob write.
 * `AgentState.status` still carries `'stopping'` for everything downstream; this is only how
 * the request crosses between the two.
 *
 * See A2 in docs/FAILURES.md.
 */

export const STOP_KEY = 'stopRequested';

/** The slice of Durable Object storage this needs. Narrow on purpose: passing the real
 *  storage satisfies it, and so does a Map in a test. */
export interface StopStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<boolean>;
}

/** Ask the current run to stop. `at` is stored rather than `true` so a log or a snapshot can
 *  say WHEN, and because a truthy timestamp reads the same to every caller. */
export async function requestStop(storage: StopStorage, at: number = Date.now()): Promise<void> {
  await storage.put(STOP_KEY, at);
}

/** Has a stop been asked for and not yet consumed? */
export async function stopRequested(storage: StopStorage): Promise<boolean> {
  return (await storage.get<number>(STOP_KEY)) !== undefined;
}

/** When the stop was asked for, or null. */
export async function stopRequestedAt(storage: StopStorage): Promise<number | null> {
  return (await storage.get<number>(STOP_KEY)) ?? null;
}

/**
 * Clear the signal.
 *
 * Called when a run ends AND when one begins. The second is not redundant: a stop that
 * arrives in the moment a run is finishing would otherwise still be sitting there when the
 * user sends their next message, and would stop that run before its first step. A stop
 * applies to the run it was pressed during, and to no other.
 */
export async function clearStop(storage: StopStorage): Promise<void> {
  await storage.delete(STOP_KEY);
}
