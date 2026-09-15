// The dialog half of lib/confirm-model.ts.
//
// It renders one of exactly two ceremonies, and the TYPE is what keeps it honest: `ceremony` is
// narrowed to the two verdicts that call for a dialog, so a reversible action cannot be routed here
// without the compiler objecting. The other two verdicts — 'none' and 'undo' — are not dialogs at
// all, and a product that opens one anyway has taught its users that dialogs mean nothing.
//
// Built on ./modal rather than beside it: the focus trap, the Escape handling and the focus restore
// are already correct there, and a second dialog implementation is a second one to get wrong.
import { useState, type ReactNode } from 'react';
import { Modal } from './modal';
import { canConfirm, type Confirmation } from '../lib/confirm-model';

export interface ConfirmDialogProps {
  title: string;
  /** The verdict from `confirmationFor`. Only the two that involve a dialog are accepted. */
  ceremony: Extract<Confirmation, 'dialog' | 'typed'>;
  /** What will happen, in full. The user is being asked to read this, so it is not a one-liner. */
  children: ReactNode;
  /**
   * Anything that has to sit OUTSIDE the paragraph — an itemised list, a table of figures.
   *
   * `children` is rendered inside a <p>, which may not contain a <ul>. A dialog that has to show
   * the working behind a number (the credit and the charge that make up a prorated total) needs
   * somewhere to put it that is still valid markup.
   */
  details?: ReactNode;
  /** The name the user must type. Required by 'typed' — and an unnameable subject is unconfirmable. */
  subject?: string;
  /**
   * `danger` is the default because the two callers this was built for both destroy something.
   *
   * A dialog can also exist to make someone READ a figure before they commit to it, and dressing
   * that in the delete colour teaches the user that red means nothing in particular.
   */
  tone?: 'danger' | 'primary';
  confirmLabel: string;
  /** Shown while the mutation is in flight, in place of `confirmLabel`. */
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  ceremony,
  children,
  details,
  subject,
  tone = 'danger',
  confirmLabel,
  busyLabel,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const ready = canConfirm({ ceremony, typed, subject });

  return (
    // Locked while the mutation is in flight: a dialog that vanishes mid-delete leaves the user
    // with no idea whether it happened.
    <Modal title={title} onClose={onClose} locked={busy}>
      <p className="danger-copy">{children}</p>
      {details}

      {ceremony === 'typed' && (
        <label className="field">
          <span className="field-label">
            Type <strong className="mono">{subject}</strong> to confirm
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            name="confirmSubject"
            id="confirm-subject"
            placeholder={subject}
            autoComplete="off"
            autoFocus
          />
        </label>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={tone === 'primary' ? 'btn btn-primary' : 'btn btn-danger'}
          disabled={!ready || busy}
          onClick={onConfirm}
        >
          {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
