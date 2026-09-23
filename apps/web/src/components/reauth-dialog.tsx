// "Type your password again" — the ceremony that asks WHO, not HOW SURE.
//
// components/confirm-dialog.tsx already asks the other question, and the two are deliberately not
// merged. Typing a project's name proves you meant it and proves nothing about whose keyboard it
// was typed on; a password proves the opposite. An action can need both — resetting settings asks
// for a confirmation and then for a password — and neither substitutes for the other.
//
// Built on ./modal for the same reason the confirm dialog is: the focus trap, the Escape handling
// and the focus restore are already right there, and a second dialog implementation is a second one
// to get wrong.
import { useState, type FormEvent } from 'react';
import { Modal } from './modal';
import { supabase } from '../lib/supabase';
import { captchaOptions, turnstileToken } from '../lib/turnstile';
import { authErrorMessage, type SensitiveAction } from '../lib/auth-flows';
import { useAuth } from '../lib/auth';
import { PasswordInput } from './picks/settings/password-input';

const WHY: Readonly<Record<SensitiveAction, string>> = {
  'change-email': 'Changing the address on an account is how an account gets taken over, so this one asks first.',
  'change-password': 'Anyone sitting at an unlocked screen could otherwise lock you out of your own account.',
  'remove-two-step':
    'Removing the second step leaves your password as the only thing protecting this account, so this one asks first.',
  'sign-out-everywhere': 'This ends every session on every device, including ones you are not holding.',
  'reset-settings': 'This puts every personal setting back to its default and cannot be undone.',
  'export-data':
    'The file this produces holds everything we keep about you — your projects, your messages, your usage. Anyone who has it, has that.',
  'delete-account': 'This deletes your data from every store we can reach, and none of it can be brought back.',
};

export function ReauthDialog({
  action,
  title,
  onConfirmed,
  onClose,
}: {
  action: SensitiveAction;
  title: string;
  /** Called once the password has been accepted. The caller then does the actual work. */
  onConfirmed: () => void;
  onClose: () => void;
}) {
  const { session, markReauthenticated } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = session?.user.email ?? '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setError(null);
    setBusy(true);
    // The account's OWN address, from the session — never a field on this form. A re-auth dialog
    // that accepts an address as input is a login form, and a login form here would let someone
    // prove they are a different person and then act as this one.
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaOptions(await turnstileToken('reauth')),
    });
    setBusy(false);
    if (err) {
      setError(authErrorMessage(err));
      setPassword('');
      return;
    }
    markReauthenticated();
    onConfirmed();
  };

  return (
    <Modal title={title} onClose={onClose} locked={busy}>
      <form onSubmit={submit} noValidate>
        <p className="danger-copy">{WHY[action]}</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {/* A hidden username field so a password manager knows which entry this is. Without it
            managers offer the wrong credential, and people give up and type it by hand. */}
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <label className="field">
          <span className="field-label">Your password</span>
          {/* Picks: UI Layouts "Show/Hide Password" — the eye lets you check what you typed. */}
          <PasswordInput
            label="password"
            name="currentPassword"
            id="reauth-password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={setPassword}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Confirm'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
