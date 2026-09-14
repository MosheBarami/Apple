// Editing an earlier prompt and running again from it.
//
// This dialog exists because the action is irreversible and its consequence is not obvious from
// the button that opens it. Two things have to be said plainly, and the second is the one people
// get wrong:
//
//   1. Everything after this message is discarded. Editing message three of fifty throws away
//      forty-seven, and the number is shown rather than described because "later messages" reads
//      as two or three.
//
//   2. It does NOT undo what Apple already built. The conversation rewinds; the Roblox place does
//      not. Someone fixing a typo in an old prompt reasonably expects one of two things to happen
//      and the product has to say which. Checkpoints are the tool for reverting work, and keeping
//      them separate is deliberate — a wording fix should never silently revert a working door.
import { useState, type FormEvent } from 'react';
import { Modal } from '../modal';

export function EditMessageDialog({
  current,
  discards,
  busy,
  onCancel,
  onConfirm,
}: {
  current: string;
  /** How many messages will be thrown away, counted by the caller from what is on screen. */
  discards: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState(current);
  const trimmed = text.trim();
  const changed = trimmed.length > 0 && trimmed !== current.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!changed || busy) return;
    onConfirm(trimmed);
  };

  return (
    <Modal title="Edit and run again" onClose={onCancel} locked={busy}>
      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">Your message</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={8000}
            name="editedMessage"
            id="edited-message"
            autoFocus
          />
        </label>

        <div className="edit-warn">
          {discards > 0 ? (
            <p>
              This discards <strong>{discards}</strong> later {discards === 1 ? 'message' : 'messages'} and
              runs again from here. That cannot be undone.
            </p>
          ) : (
            <p>This runs again from here.</p>
          )}
          {/* The part people assume and would otherwise only discover afterwards. */}
          <p className="edit-warn__quiet">
            Anything Apple already built in your place stays as it is — this rewinds the
            conversation, not the work. Use a checkpoint to revert what was built.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!changed || busy}>
            {busy ? 'Sending…' : 'Discard and run again'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
