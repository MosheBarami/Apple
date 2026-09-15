import type { RestoreFidelity, ServerMsg } from '@golem/shared';

/** The `restore_status` frame, narrowed out of the server union. */
export type RestoreStatus = Extract<ServerMsg, { type: 'restore_status' }>;

/**
 * WHAT A RESTORE IS DOING, IN A SENTENCE A PERSON CAN READ.
 *
 * Kept out of the route so it can be tested as itself. The route renders what this returns; it
 * does not decide what a phase means, because a phase whose wording lives inline next to a JSX
 * ternary is a phase nothing can assert about.
 *
 * Two rules the wording exists to keep:
 *
 *   A RESTORE IN FLIGHT NEVER READS AS FINISHED. 'reading' and 'applying' are present tense and
 *   say what is happening to the place right now, because this is the one operation that deletes
 *   the user's work before it puts it back and a sentence that sounds settled during it is a lie
 *   about the state of their game.
 *
 *   AN UNVERIFIED RESULT IS NOT A SUCCESS. A plugin too old to report sends no verdict; the
 *   worker's `note` says so, and the tone here is 'caveat', not 'good'. Rendering that green
 *   would be the failure-to-observe rendered as an observation.
 */
export type RestoreTone = 'working' | 'good' | 'caveat' | 'bad';

export function restoreTone(s: RestoreStatus): RestoreTone {
  if (s.phase === 'failed') return 'bad';
  if (s.phase !== 'done') return 'working';
  return s.note ? 'caveat' : 'good';
}

/** True while the restore is still touching the place — the drawer must not be dismissed. */
export function restoreInFlight(s: RestoreStatus | null): boolean {
  return s !== null && s.phase !== 'done' && s.phase !== 'failed';
}

export function restoreSentence(s: RestoreStatus): string {
  switch (s.phase) {
    case 'reading':
      return 'Reading the checkpoint…';
    case 'applying':
      return 'Rebuilding your place from the checkpoint…';
    case 'verifying':
      return 'Checking what came back…';
    case 'failed':
      return s.error ? `Restore failed: ${s.error}` : 'Restore failed.';
    case 'done':
      return s.note ?? 'Restored.';
  }
}

/**
 * The counts, as a line, or null when the plugin sent none.
 *
 * Null rather than "0 objects": zeros are a claim about the place, and a restore whose op never
 * reached Studio did not look. See RestoreFidelity.
 */
export function fidelityLine(f: RestoreFidelity | undefined): string | null {
  if (!f) return null;
  const parts = [`${f.instancesCreated} object${f.instancesCreated === 1 ? '' : 's'}`];
  // Restored AGAINST expected, always both: "12 scripts" cannot distinguish a complete restore
  // from one that dropped three of them.
  parts.push(`${f.scriptsRestored}/${f.scriptsExpected} scripts`);
  if (f.failedInstances > 0) parts.push(`${f.failedInstances} objects failed`);
  if (f.failedScripts > 0) parts.push(`${f.failedScripts} scripts failed`);
  if (f.failedProperties > 0) parts.push(`${f.failedProperties} properties failed`);
  return parts.join(' · ');
}
