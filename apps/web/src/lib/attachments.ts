// Staged attachments: what the composer holds between "the person picked a file" and "the message
// left", and what it says at every point in between.
//
// The composer's whole state was `text`, `modeOpen`, a box ref, a key ref and prefs. There was
// nowhere for a file to live, which is why four separate checklist rows — upload progress, upload
// cancellation, retry, and removal before sending — were all blocked on the same missing thing.
// They are one model, not four features, and every one of them is a TRANSITION, which is why this
// is a reducer with tests rather than five `useState`s in a component.
//
// The rules the reducer exists to keep:
//
//   ONLY A FINISHED UPLOAD RIDES ON A MESSAGE. A half-uploaded file reaches the model as "this
//   file could not be read", and the person is never told which half of the system failed them.
//
//   A ROW THAT IS STILL ON SCREEN IS STILL THE PERSON'S PROBLEM. Send is blocked while anything is
//   in flight or failed, and the sentence naming the block names both ways out of it.
//
//   A CANCEL IS NOT AN ERROR. It leaves no row and no message: the person already knows.
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  attachmentRefusalMessage,
  validateAttachment,
  type ChatAttachment,
} from '@golem/shared';
import { explainFailure } from './error-taxonomy.ts';

/** One file on its way up, or arrived, or stuck. */
export interface StagedAttachment {
  /** Local, and STABLE ACROSS A RETRY: a row that gets a new id jumps the list under the cursor. */
  id: string;
  name: string;
  size: number;
  phase: 'uploading' | 'ready' | 'failed';
  /** Bytes the browser has handed to the socket. Only meaningful while `phase` is 'uploading'. */
  sent: number;
  /** The server's record of the file. Null until it exists — the browser never invents one. */
  attachment: ChatAttachment | null;
  error: string | null;
  /** Whether repeating this exact upload could succeed. A 413 is not retryable; a dropped TCP is. */
  retryable: boolean;
}

export type StageAction =
  | { type: 'stage'; id: string; name: string; size: number }
  | { type: 'progress'; id: string; sent: number }
  | { type: 'ready'; id: string; attachment: ChatAttachment | null }
  | { type: 'failed'; id: string; message: string; retryable: boolean }
  | { type: 'retry'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'clear' };

/**
 * The transitions, in one place.
 *
 * Every action that names a row is a no-op when the row is gone, and that is a REQUIREMENT rather
 * than defensiveness: a progress event is in flight while the person is pressing ×, and the
 * request has not been told yet.
 */
export function stageReducer(state: StagedAttachment[], action: StageAction): StagedAttachment[] {
  switch (action.type) {
    case 'stage':
      return [
        ...state,
        { id: action.id, name: action.name, size: action.size, phase: 'uploading', sent: 0, attachment: null, error: null, retryable: true },
      ];
    case 'progress':
      return patch(state, action.id, (row) => (row.phase === 'uploading' ? { ...row, sent: action.sent } : row));
    case 'ready':
      return patch(state, action.id, (row) =>
        action.attachment ? { ...row, phase: 'ready', sent: row.size, attachment: action.attachment, error: null } : row,
      );
    case 'failed':
      return patch(state, action.id, (row) => ({ ...row, phase: 'failed', error: action.message, retryable: action.retryable }));
    case 'retry':
      return patch(state, action.id, (row) => ({ ...row, phase: 'uploading', sent: 0, error: null, attachment: null }));
    case 'remove':
      return state.filter((row) => row.id !== action.id);
    case 'clear':
      return [];
    default:
      return state;
  }
}

function patch(state: StagedAttachment[], id: string, f: (row: StagedAttachment) => StagedAttachment): StagedAttachment[] {
  let touched = false;
  const next = state.map((row) => {
    if (row.id !== id) return row;
    touched = true;
    return f(row);
  });
  // The same array back when nothing matched, so a stray event cannot repaint the composer.
  return touched ? next : state;
}

/**
 * How full the bar is, 0–100.
 *
 * Clamped at both ends. A server that acknowledges more bytes than were sent — and XHR's
 * `loaded` can exceed the body length once the request headers are counted — must not paint a
 * 140% bar, and a file of unknown size must not divide by zero.
 */
export function progressPercent(row: StagedAttachment): number {
  if (row.phase === 'ready') return 100;
  if (row.size <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((row.sent / row.size) * 100)));
}

/** The attachments that actually exist on the server, in the order they were staged. */
export function readyAttachments(state: readonly StagedAttachment[]): ChatAttachment[] {
  return state.flatMap((row) => (row.phase === 'ready' && row.attachment ? [row.attachment] : []));
}

/**
 * Why this message may not be sent yet, or null.
 *
 * A sentence rather than a boolean, because a disabled Send with no explanation is the single most
 * common way a product wastes somebody's afternoon. Both blocks name their way out.
 */
export function blockingReason(state: readonly StagedAttachment[]): string | null {
  if (state.some((r) => r.phase === 'uploading')) {
    return 'One of your files is still uploading — this will send as soon as it lands.';
  }
  const failed = state.filter((r) => r.phase === 'failed');
  if (failed.length) {
    const one = failed.length === 1 ? `“${failed[0]?.name ?? 'a file'}”` : `${failed.length} files`;
    return `${one} didn’t upload. Retry it or remove it, and this will send.`;
  }
  return null;
}

/**
 * Which of these files may be staged, and why the others may not.
 *
 * REFUSED BEFORE THE UPLOAD, IN THE SERVER'S OWN WORDS. Spending somebody's upload on a file we
 * already know will be refused is rude; refusing it in different words than the server would is
 * worse, because the two then read as two different bugs. `validateAttachment` is the same
 * function the worker calls, minus the byte sniff — the browser has the name and the size before
 * it has read anything, and the server does the half that needs the content.
 */
export function admitFiles(
  existing: readonly StagedAttachment[],
  files: readonly { name: string; size: number; type: string }[],
): { admitted: { name: string; size: number; type: string }[]; refused: { name: string; message: string }[] } {
  const admitted: { name: string; size: number; type: string }[] = [];
  const refused: { name: string; message: string }[] = [];
  let room = MAX_ATTACHMENTS_PER_MESSAGE - existing.length;

  for (const f of files) {
    if (room <= 0) {
      refused.push({ name: f.name, message: attachmentRefusalMessage('too_many', { name: f.name }) });
      continue;
    }
    const verdict = validateAttachment({ name: f.name, declaredMime: f.type, size: f.size });
    if (!verdict.ok) {
      refused.push({ name: f.name, message: verdict.message });
      continue;
    }
    room -= 1;
    admitted.push(f);
  }
  return { admitted, refused };
}

/**
 * What to put on a failed row, and whether to offer Retry at all.
 *
 * Through the shared taxonomy, so an upload failure is explained in the same vocabulary as every
 * other failure in the product. The server's own sentence wins when there is one: the worker
 * already wrote "That file is larger than 32 KB", and replacing that with the taxonomy's generic
 * headline would throw away the only actionable half.
 */
export function attachmentFailure(err: unknown): { message: string; retryable: boolean } {
  const explained = explainFailure(err);
  const detail = explained.detail;
  return { message: detail && detail.trim() ? detail : explained.title, retryable: explained.retryable };
}
