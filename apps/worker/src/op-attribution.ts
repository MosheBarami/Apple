/**
 * Which queued Studio ops belong to a run that has ended.
 *
 * A5 established the rule: a run's queued ops must not reach the user's place after
 * that run is over. The user presses stop, the run ends, and the plugin's next poll
 * would otherwise collect whatever was already queued and apply it — mutations from a
 * run they explicitly cancelled, arriving after the UI said it had stopped.
 *
 * WHAT THIS FILE FIXES, AND WHY IT NEEDED ITS OWN MODULE.
 *
 * The rule was right and the attribution behind it was not. `execStudioOp` tags every
 * op with `this.currentMsgId`, and nothing cleared that field when a run finished. So
 * an op queued when NO run was in flight — a checkpoint from
 * `POST /api/projects/:id/checkpoints`, or the automatic snapshot taken as a run is
 * starting — inherited the id of the last run to have ended, and was then discarded
 * on the next poll with "The run this change belonged to has ended".
 *
 * Observed twice against the deployed Worker on 2026-09-01, in both golden creation
 * exercises. The second one is the one that matters: the automatic pre-run checkpoint
 * is the undo point a user relies on, and it silently did not exist.
 *
 * The distinction the queue actually needs is three-way, not two:
 *
 *   * `runId === liveRunId` — this run's work. KEEP.
 *   * `runId === undefined` — attributable to no run: an out-of-run checkpoint, or an
 *     op queued by a deploy that predates the field. KEEP. An op that never belonged
 *     to a run cannot belong to an ENDED one, which is the whole claim A5 makes.
 *   * any other `runId` — a different, finished run's work. DROP.
 *
 * Clearing `currentMsgId` when a run ends is what makes the middle case reachable for
 * out-of-run ops, and it is the actual fix; this module exists so the partition itself
 * is testable without standing up a Durable Object.
 */
import type { PendingOp } from '@golem/shared';

export interface OpPartition {
  keep: PendingOp[];
  drop: PendingOp[];
}

/**
 * Split the queue into what may still run and what belongs to a finished run.
 *
 * @param liveRunId the run currently in flight, or `undefined` when none is.
 */
export function partitionOpsByRun(ops: readonly PendingOp[], liveRunId: string | undefined): OpPartition {
  const keep: PendingOp[] = [];
  const drop: PendingOp[] = [];
  for (const op of ops) {
    if (op.runId === undefined || op.runId === liveRunId) keep.push(op);
    else drop.push(op);
  }
  return { keep, drop };
}
