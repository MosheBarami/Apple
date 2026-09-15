/**
 * WHETHER A FAILED STUDIO OP MAY BE TRIED AGAIN.
 *
 * THE STATE THIS REPLACES. `OpResult` was `{id, ok, data, error, durationMs}`. The only thing
 * separating "that path does not exist" from "Studio never answered" was an English sentence, so
 * anything deciding whether to retry had to pattern-match prose — the exact failure the repo's
 * discipline names: an assertion on a spelling rather than on a property. Reword an error and the
 * decision silently changes.
 *
 * TWO INPUTS, AND THE SECOND ONE IS THE POINT.
 *
 *   1. The failure KIND (`OpFailureKind`), set by whichever side actually knows: the plugin for
 *      what happened inside Studio, this worker for what happened before Studio ever saw it.
 *   2. Whether the op MUTATES the place.
 *
 * Retryability is not a property of the kind alone, and writing it as one would be the dangerous
 * simplification. `timeout` means the op may have been applied and the report lost — do/session.ts
 * states plainly that delivery is at-most-once, that a plugin can apply a batch and die before
 * reporting, and that redelivery would duplicate the mutation. So a timed-out READ may be retried
 * for free, and a timed-out WRITE may not be retried at all until the plugin keeps an applied-op-id
 * cache. Collapsing those two into one boolean is how you get a door built twice.
 *
 * THE DEFAULT IS "DO NOT RETRY". A kind this build does not recognise, a failure from a plugin too
 * old to send one, an `ok: true` result asked about by mistake — all of them answer no, with a
 * reason that says the classification is unknown. An optimistic default here re-runs a mutation
 * against somebody's place on the strength of a guess.
 */
import type { OpFailureKind, OpResult, StudioOp } from '@golem/shared';

/**
 * The ops that change the user's place. Mirrors the `MUTATING` table in apps/plugin/src/Ops.luau,
 * which is what decides whether an undo recording is opened — tests/op-failure.test.mjs reads both
 * files and fails if they drift, because two lists of the same fact kept in step by care alone is
 * precisely the arrangement this repo has already been bitten by.
 */
export const MUTATING_OPS: ReadonlySet<string> = new Set([
  'edit_script',
  'create_instances',
  'set_props',
  'delete_instances',
  'move_instances',
  'restore',
  'insert_asset',
  'run_code',
  'generate_model',
  'transform_instances',
  'clone_instances',
  'group_instances',
  'ungroup_instances',
  'rename_instance',
  'set_locked',
  'set_visible',
]);

export function mutates(op: StudioOp | { op: string } | string | null | undefined): boolean {
  const kind = typeof op === 'string' ? op : op?.op;
  return typeof kind === 'string' && MUTATING_OPS.has(kind);
}

const KINDS: ReadonlySet<string> = new Set([
  'not_found',
  'conflict',
  'refused',
  'invalid',
  'timeout',
  'transport',
  'internal',
]);

/** A wire value is a kind only if this build knows it. Anything else is `null`, never guessed. */
export function asFailureKind(raw: unknown): OpFailureKind | null {
  return typeof raw === 'string' && KINDS.has(raw) ? (raw as OpFailureKind) : null;
}

export interface RetryVerdict {
  kind: OpFailureKind | null;
  retryable: boolean;
  /** Why, in one clause, for the agent's transcript and for the diagnostics panel. */
  reason: string;
}

/**
 * The failures THIS worker produces, named at the one place each is produced rather than sniffed
 * out of the sentence afterwards. Exported so do/session.ts stamps the same values these tests
 * assert on, and so a new refusal has an obvious place to declare its kind.
 */
export const WORKER_FAILURES = {
  /** Refused before queueing: the plugin is not polling. It provably never ran. */
  notConnected: 'transport',
  /** Dropped from the queue when its run ended. It provably never ran. */
  runEnded: 'transport',
  /** Queued, delivered or not, and never answered. Whether it ran is UNKNOWN. */
  timeout: 'timeout',
  /** Refused before queueing: the open place is not the project's place. It never ran. */
  placeMismatch: 'transport',
} as const satisfies Record<string, OpFailureKind>;

/**
 * The decision.
 *
 * `result.failure` is consulted first because the side that produced the failure is the only side
 * that knows what it was. Nothing here reads `result.error`.
 */
export function retryEligibility(op: StudioOp | { op: string } | string | null | undefined, result: Pick<OpResult, 'ok' | 'failure'>): RetryVerdict {
  if (result.ok) return { kind: null, retryable: false, reason: 'the op succeeded' };
  const kind = asFailureKind(result.failure);
  if (kind === null) {
    return {
      kind: null,
      retryable: false,
      reason: 'the failure was not classified, so whether it can be repeated safely is unknown',
    };
  }
  switch (kind) {
    case 'transport':
      return { kind, retryable: true, reason: 'it never reached Studio, so nothing was applied' };
    case 'timeout':
      return mutates(op)
        ? {
            kind,
            retryable: false,
            reason:
              'Studio did not answer, so this change may already have been applied; repeating it could apply it twice',
          }
        : { kind, retryable: true, reason: 'Studio did not answer a read, which changes nothing when repeated' };
    case 'not_found':
      return { kind, retryable: false, reason: 'the target is not there; repeating the same request finds it again' };
    case 'conflict':
      return { kind, retryable: false, reason: 'the place is not in the state this op required' };
    case 'refused':
      return { kind, retryable: false, reason: 'Studio declined this op on purpose' };
    case 'invalid':
      return { kind, retryable: false, reason: 'the arguments were not acceptable' };
    case 'internal':
      return { kind, retryable: false, reason: 'the op broke in a way that is not understood' };
  }
}

/**
 * One line for the agent, so the model is told the classification rather than left to infer it
 * from the prose it is already being shown.
 */
export function retryHint(op: StudioOp | { op: string } | string | null | undefined, result: Pick<OpResult, 'ok' | 'failure'>): string | null {
  if (result.ok) return null;
  const v = retryEligibility(op, result);
  return v.retryable ? `This can be retried: ${v.reason}.` : `Do not retry this as-is: ${v.reason}.`;
}
