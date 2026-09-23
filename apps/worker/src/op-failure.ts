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
import { REFUSAL_REMEDIES, isRefusalRemedyCode, studioFictionIn } from '@golem/shared';
import type { OpFailureKind, OpResult, StudioOp, RefusalRemedyCode } from '@golem/shared';

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

/**
 * WHAT THE USER CAN DO — or, said out loud, that there is nothing.
 *
 * On 2026-09-19 the live product refused a write with "writes require explicit edit consent", and
 * the model relayed that correctly and then invented the fix: open "File > Project Settings >
 * Security" and enable "Allow Scripted Updates". No such menu, page or setting exists in Roblox
 * Studio. The real remedy was two clicks away in the Apple panel and went unmentioned.
 *
 * The model did not misread anything. It was handed a refusal with no remedy and a user who plainly
 * wanted one, and it filled the gap. Every silence in a tool result is filled eventually; the only
 * question is by whom. So:
 *
 *   - a refusal with a known code gets the product's own remedy, verbatim;
 *   - a refusal explicitly coded `none` gets a sentence saying no setting enables this AND telling
 *     the model not to suggest one, which is a far harder thing to contradict than a silence;
 *   - a refusal from a plugin too old to send a code gets an admission of ignorance, not a guess.
 *
 * That last branch matters. "Unknown" and "there is nothing to do" are different facts, and a
 * worker that printed the second when it meant the first would be committing this module's own
 * original sin one level up.
 */
export function remedyHint(result: Pick<OpResult, 'ok' | 'failure' | 'remedy'>): string | null {
  if (result.ok) return null;
  if (asFailureKind(result.failure) !== 'refused') return null;
  if (isRefusalRemedyCode(result.remedy)) return REFUSAL_REMEDIES[result.remedy];
  return (
    'This build does not report what would resolve this refusal. Say that you do not know how to ' +
    'enable it rather than guessing at a Studio setting; a wrong instruction costs the user more ' +
    'than an honest "I am not sure".'
  );
}

/**
 * WHOSE LIMIT IT IS — a claim the heading makes in the product's own voice, so it has to be true of
 * the refusal it is attached to rather than true of most of them.
 *
 * The original heading said "this is Apple's own limit" about every remedy, which was correct for
 * as long as the only remedies that could actually reach a user were Apple's own gates. It stopped
 * being correct the moment `take_asset_first` became reachable: Roblox refuses to load an asset the
 * signed-in account does not own, Apple has no say in it, and the remedy's own sentence says so —
 * so the signed heading and the instruction underneath it would have contradicted each other in one
 * paragraph, with the bolded half being the false one.
 *
 * A SET OF CODES, not a guess from the text. Same reason the remedy is a code: deciding whose limit
 * it is by reading the sentence would make a reword silently change who the product blames.
 *
 * Both headings still end by denying that a Studio setting exists, because that denial is the whole
 * reason w34 wrote a heading at all — the model invented "File > Place Settings > Security", and a
 * spelled-out "there is no such setting" is much harder to contradict than a silence.
 */
const ROBLOX_IMPOSED: ReadonlySet<RefusalRemedyCode> = new Set<RefusalRemedyCode>(['take_asset_first']);

const APPLE_LIMIT_HEADING = "**Apple could not change your place, and this is Apple's own limit, not a Roblox Studio setting.**";
const ROBLOX_LIMIT_HEADING = "**Apple could not change your place, and this one is Roblox's rule rather than Apple's — no Roblox Studio setting lifts it.**";

function remedyHeading(remedy: RefusalRemedyCode): string {
  return ROBLOX_IMPOSED.has(remedy) ? ROBLOX_LIMIT_HEADING : APPLE_LIMIT_HEADING;
}

/**
 * The reply the USER sees when a run hit a refusal the product can explain.
 *
 * Pure, exported and tested, rather than inline in finishRun, because the sentence is the whole
 * point of w34 and a source-text assertion is not a test of a sentence.
 *
 * TWO CASES, AND THE SECOND ONE IS WHY THIS IS NOT JUST A CONCATENATION.
 *
 * Normally it APPENDS. The model's own text usually contains something true about what it
 * attempted, and the user should see both accounts and believe the one that is signed.
 *
 * But when the reply contains one of the settings the model INVENTS — `STUDIO_FICTIONS`, a closed
 * list of four seen in the wild on 2026-09-19 — appending is not enough, and w35 is the row that
 * says so. Two accounts of one event, one of them false, is worse than one; and the false one is
 * the specific, numbered, actionable-looking one. A user reading "go to File > Place Settings >
 * Security" followed by "actually it is in the Apple panel" does not average them — they go looking
 * for the settings page, because it is the instruction that sounds like it was written by someone
 * who checked.
 *
 * So the fiction is REPLACED, on the same reasoning `incomplete` is replaced rather than appended
 * to in finishRun: a reply that reports something that did not happen is worse than an error,
 * because the user has no reason to doubt it. The trigger requires BOTH a refusal the product can
 * explain AND a named fiction in the text, which is narrow enough that a legitimate sentence
 * mentioning one of these phrases in some other run is untouched.
 */
export function replyWithRemedy(content: string, remedy: RefusalRemedyCode | undefined | null): string {
  if (!isRefusalRemedyCode(remedy)) return content;
  const fiction = studioFictionIn(content);
  if (fiction) {
    return (
      `${remedyHeading(remedy)} ${REFUSAL_REMEDIES[remedy]}\n\n` +
      'Nothing in your place was changed, so there is nothing to undo.'
    );
  }
  const closing = `${remedyHeading(remedy)} ${REFUSAL_REMEDIES[remedy]}`;
  // An empty reply is finishRun asking for the remedy AS the closing (F-045): no leading blank.
  return content.trim() ? `${content}\n\n${closing}` : closing;
}

/** What was removed and why — for the run record, never for the reply itself. */
export function replacedFiction(content: string, remedy: RefusalRemedyCode | undefined | null): string | null {
  return isRefusalRemedyCode(remedy) ? studioFictionIn(content) : null;
}
