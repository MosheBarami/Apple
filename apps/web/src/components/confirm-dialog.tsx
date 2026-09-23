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
import { HoldButton } from './picks/settings/hold-button';

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
  /**
   * Press-and-hold to confirm (picks: Motion "Hold to confirm" + React Bits "Hold Button"). For a
   * danger action that cannot be undone, a click is too cheap: the confirm button becomes a hold,
   * which a slip of the finger cannot complete.
   */
  hold?: boolean;
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
  hold = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const ready = canConfirm({ ceremony, typed, subject });

  return (
    // Locked while the mutation is in flight: a dialog that vanishes mid-delete leaves the user
    // with no idea whether it happened.
    <Modal title={title} onClose={onClose} locked={busy} alert={tone === 'danger'}>
      {/* THIS PARAGRAPH WAS SET IN `--bad`, ON BOTH TONES.
          On a delete it made the whole explanation red beside a red button — two things claiming
          the same urgency, which is how a reader learns that red means nothing in particular. On
          `tone='primary'`, a dialog whose only job is to make somebody READ a prorated figure
          before they commit to it, it was simply a lie told in colour. The sentence is the thing
          being read, so it takes the reading ink; the screen's one warning is the button. */}
      <p className="confirm-copy">{children}</p>
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
            aria-describedby="confirm-subject-hint"
            autoComplete="off"
            spellCheck={false}
            // Not editable mid-mutation: the dialog is locked, and a field that still takes
            // keystrokes says the opposite.
            disabled={busy}
            autoFocus
          />
          {/* The rule, stated once and never changing. `confirmMatches` trims but does not fold
              case, and somebody who cannot see why the button stays dead will try the same string
              in lower case three times before giving up on their own delete. A hint that flipped
              to an error on every keystroke would say the same thing more loudly and less often
              usefully — the button going live is the feedback. */}
          <span className="field-hint" id="confirm-subject-hint">
            Capitals and spacing have to match.
          </span>
        </label>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        {/* A DISABLED CONTROL SAYS WHY IT IS DISABLED. Without the title this button is grey for
            two entirely different reasons — the name has not been typed yet, and the mutation is
            already running — and a reader cannot tell which, so it reads as broken rather than as
            waiting. `aria-busy` is the same sentence for a screen reader. */}
        {hold && tone === 'danger' && ready ? (
          <>
            {/* Said out loud: a hold looks like a button, and a click on it does nothing. */}
            {!busy && <span className="modal-hold-hint">Press and hold to confirm</span>}
            <HoldButton label={confirmLabel} busy={busy} busyLabel={busyLabel} onConfirm={onConfirm} />
          </>
        ) : (
          <button
            type="button"
            className={tone === 'primary' ? 'btn btn-primary' : 'btn btn-danger'}
            disabled={!ready || busy}
            aria-busy={busy || undefined}
            title={busy ? 'Working — this finishes on its own' : ready ? undefined : 'Type the name above to confirm'}
            onClick={onConfirm}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        )}
      </div>
    </Modal>
  );
}
