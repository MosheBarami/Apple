/** UI12 Context, UI14 Checkpoint, UI13 Confirmation, UI16 Attachments — drawn only from real run data. */
import type { CheckpointMeta, ChatAttachment } from '@apple/shared';
import { attachmentSizeLabel } from '@apple/shared';
import { Button } from '../../ui/button';
import { Attachment, AttachmentInfo, AttachmentPreview, Attachments } from '../../ai-elements/attachments';
import type { ContextBudget } from '../context-model';
import {
  attachmentRows,
  checkpointContents,
  checkpointKindLabel,
  contextView,
  type AttachmentRow,
} from './context-checkpoint-model';
import './context-checkpoint.css';

/** Run context + spend. Renders nothing when neither is known; an unknown half says "unavailable". */
export function RunContext({ context, creditsSpent }: { context?: ContextBudget | null; creditsSpent?: number | null }) {
  const v = contextView(context, creditsSpent);
  if (!v) return null;
  return (
    <div className="ev-context" data-over={v.budget?.over ? 'true' : 'false'} aria-label="Run context">
      {v.budget ? (
        <>
          <span>{v.budget.label}</span>
          <div className="ev-context__meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.budget.fill * 100)} aria-label="Context used">
            <span style={{ width: `${v.budget.fill * 100}%` }} />
          </div>
        </>
      ) : (
        <span>Context unavailable</span>
      )}
      {v.dropped && <span>{v.dropped}</span>}
      <span>{v.credits ?? 'Credits unavailable'}</span>
    </div>
  );
}

/** Marker for the restore point taken during a run. Restore is offered only when the caller passes a handler. */
export function RunCheckpoint({ checkpoint, onRestore }: { checkpoint?: CheckpointMeta | null; onRestore?: (c: CheckpointMeta) => void }) {
  if (!checkpoint) return null;
  const contents = checkpointContents(checkpoint);
  return (
    <div className="ev-checkpoint" role="group" aria-label="Restore point">
      <span>{checkpoint.label}</span>
      <span>{checkpointKindLabel(checkpoint.kind)}{contents ? ` · ${contents}` : ''}</span>
      <span className="ev-checkpoint__rule" aria-hidden="true" />
      {onRestore && (
        <Button type="button" variant="outline" size="sm" onClick={() => onRestore(checkpoint)}>
          Restore
        </Button>
      )}
    </div>
  );
}

/**
 * Authorization to restore over edits made after the snapshot. Not a plan gate: shown only when the
 * caller is about to send `checkpoint_restore`. `decision` present means it was already answered.
 */
export function RestoreConfirmation({
  checkpoint, decision, onApprove, onDeny,
}: {
  checkpoint?: CheckpointMeta | null;
  decision?: 'approved' | 'denied';
  onApprove?: () => void;
  onDeny?: () => void;
}) {
  if (!checkpoint) return null;
  return (
    <div className="ev-confirm" role="alertdialog" aria-label="Confirm restore" data-decision={decision ?? 'pending'}>
      <strong>Restore “{checkpoint.label}”?</strong>
      <span>This replaces the current place with the snapshot. Edits made after it was taken will be lost.</span>
      {decision === 'approved' && <span>Restore authorized.</span>}
      {decision === 'denied' && <span>Restore declined. Nothing was changed.</span>}
      {!decision && (
        <div className="ev-confirm__actions">
          <Button type="button" variant="destructive" size="sm" onClick={onApprove}>Restore anyway</Button>
          <Button type="button" variant="outline" size="sm" onClick={onDeny}>Keep current place</Button>
        </div>
      )}
    </div>
  );
}

function AttachmentList({ title, rows }: { title: string; rows: AttachmentRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="ev-attachments aie">
      <span className="ev-attachments__title">{title}</span>
      <Attachments variant="list">
        {rows.map((r) => (
          <Attachment key={r.id} data={{ type: 'file', id: r.id, filename: r.filename, mediaType: r.mediaType, url: '' }}>
            <AttachmentPreview />
            <AttachmentInfo showMediaType />
            {r.size != null && r.size >= 0 && <span className="shrink-0 text-muted-foreground text-xs">{attachmentSizeLabel(r.size)}</span>}
          </Attachment>
        ))}
      </Attachments>
    </div>
  );
}

/** Files the user sent with this turn, and files the run produced. Nothing when both are empty. */
export function TurnAttachments({ sent, produced }: { sent?: ChatAttachment[] | null; produced?: { name: string; mime?: string; size?: number }[] | null }) {
  const rows = attachmentRows(sent, produced);
  if (rows.sent.length === 0 && rows.produced.length === 0) return null;
  return (
    <>
      <AttachmentList title="Sent" rows={rows.sent} />
      <AttachmentList title="Produced" rows={rows.produced} />
    </>
  );
}
