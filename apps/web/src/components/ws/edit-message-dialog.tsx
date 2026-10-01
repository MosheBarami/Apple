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
import { TriangleAlertIcon } from 'lucide-react';
import { Modal } from '../modal';
// The warning and the two answers are one AI Elements Confirmation block (the genuine upstream
// component, components/ai-elements/confirmation.tsx), so the sentence that says what will be lost
// sits directly over the button that loses it. Upstream draws it for a tool awaiting approval; here
// the approval being asked for is this edit, so it is always in the `approval-requested` state.
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '../ai-elements/confirmation';

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

        <Confirmation
          className="aie mt-4"
          approval={{ id: 'edit-message' }}
          state="approval-requested"
          variant={discards > 0 ? 'destructive' : 'default'}
        >
          {discards > 0 && <TriangleAlertIcon aria-hidden="true" />}
          <ConfirmationTitle>
            {discards > 0 ? (
              <>
                This discards <strong>{discards}</strong> later {discards === 1 ? 'message' : 'messages'} and
                runs again from here. That cannot be undone.
              </>
            ) : (
              <>This runs again from here.</>
            )}
          </ConfirmationTitle>
          <ConfirmationRequest>
            {/* The part people assume and would otherwise only discover afterwards. */}
            <p className="text-muted-foreground text-sm">
              Anything Apple already built in your place stays as it is — this rewinds the
              conversation, not the work. Use a checkpoint to revert what was built.
            </p>
          </ConfirmationRequest>
          <ConfirmationActions>
            <ConfirmationAction variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </ConfirmationAction>
            <ConfirmationAction type="submit" variant={discards > 0 ? 'destructive' : 'default'} disabled={!changed || busy}>
              {busy ? 'Sending…' : 'Discard and run again'}
            </ConfirmationAction>
          </ConfirmationActions>
        </Confirmation>
      </form>
    </Modal>
  );
}
