/**
 * Adapters for the Context, Checkpoint, Confirmation and Attachments renderers.
 *
 * Every function reads only fields the worker actually sent (`context_budget`, `creditsSpent`,
 * `checkpoint`, a sent `ChatAttachment`) and returns null/empty when they are absent. Unknown is
 * "unavailable", never zero. Pure and DOM-free.
 */
import { creditsText, type CheckpointMeta, type ChatAttachment } from '@studpilot/shared';
import { contextBudgetLabel, contextFill, contextOverBudget, type ContextBudget } from '../context-model';

export interface ContextView {
  /** null = the worker sent no usable budget. */
  budget: { label: string; fill: number; over: boolean } | null;
  /** Dropped-turns note; only when the worker said turns were removed. */
  dropped: string | null;
  /** null = unknown (absent, not a number, or negative). In credits: the worker's ledger units divided down. */
  credits: string | null;
}

export function contextView(context: ContextBudget | undefined | null, creditsSpent: number | undefined | null): ContextView | null {
  const label = contextBudgetLabel(context);
  const fill = contextFill(context);
  const credits = typeof creditsSpent === 'number' && Number.isFinite(creditsSpent) && creditsSpent >= 0
    ? `${creditsText(creditsSpent)} Credits spent`
    : null;
  if (label === null && credits === null) return null;
  const d = context?.dropped;
  return {
    budget: label !== null && fill !== null ? { label, fill, over: contextOverBudget(context) } : null,
    dropped: d && d.groups > 0 ? `${d.groups} earlier ${d.groups === 1 ? 'turn was' : 'turns were'} left out of this run's prompt.` : null,
    credits,
  };
}

/**
 * The restore point taken during a run: the checkpoints the worker reported whose `createdAt` falls
 * inside [startedAt, endedAt]. `pre_agent` wins, then the earliest. There is no run id on a
 * checkpoint, so time is the only honest link; null when none falls inside.
 */
export function checkpointForRun(
  checkpoints: readonly CheckpointMeta[] | undefined | null,
  run: { createdAt: number; endedAt?: number },
): CheckpointMeta | null {
  const inside = (checkpoints ?? []).filter((c) => c.createdAt >= run.createdAt && c.createdAt <= (run.endedAt ?? Infinity));
  if (inside.length === 0) return null;
  return [...inside].sort((a, b) => Number(b.kind === 'pre_agent') - Number(a.kind === 'pre_agent') || a.createdAt - b.createdAt)[0] ?? null;
}

export const checkpointKindLabel = (k: CheckpointMeta['kind']): string =>
  k === 'pre_agent' ? 'Before this run' : k === 'manual' ? 'Saved manually' : 'Automatic';

/** "12 scripts · 340 objects", or null if the counts are not numbers. */
export function checkpointContents(c: CheckpointMeta): string | null {
  if (!Number.isFinite(c.scriptCount) || !Number.isFinite(c.instanceCount)) return null;
  return `${c.scriptCount} ${c.scriptCount === 1 ? 'script' : 'scripts'} · ${c.instanceCount} ${c.instanceCount === 1 ? 'object' : 'objects'}`;
}

export interface AttachmentRow {
  id: string;
  filename: string;
  mediaType: string;
  size?: number;
}

/** Sent user attachments (`ChatAttachment`) and produced files ({name, mime, size?}) as one list; unnamed entries are dropped. */
export function attachmentRows(
  sent: readonly ChatAttachment[] | undefined | null,
  produced?: readonly { name: string; mime?: string; size?: number }[] | null,
): { sent: AttachmentRow[]; produced: AttachmentRow[] } {
  return {
    sent: (sent ?? []).filter((a) => a.name).map((a) => ({ id: a.attachmentId, filename: a.name, mediaType: a.mime, size: a.size })),
    produced: (produced ?? []).filter((a) => a.name).map((a) => ({ id: `produced:${a.name}`, filename: a.name, mediaType: a.mime ?? '', size: a.size })),
  };
}
