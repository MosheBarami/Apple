/**
 * "Invite a friend" and "Made with StudPilot", as Settings shows them: the text itself, in a field a person can read and select, beside a
 * button that copies it. What each says about itself is in lib/growth.ts, and it is only what is true today: the link opens the sign-up page
 * and nothing records it, and no credit is promised for sharing it.
 */
import { useState } from 'react';
import { BADGE_NOTE, BADGE_TEXT, COPIED, COPY_FAILED, INVITE_NOTE } from '../lib/growth';
import { useInviteLink } from '../lib/use-invite-link';
import { writeClipboard } from './picks/chat/copy-button';
import './growth-cards.css';

/** One copyable line: its own label, the text in a read-only field, and a Copy button that says what happened. */
export function CopyLine({ id, label, value, onCopy }: { id: string; label: string; value: string | null; onCopy: () => Promise<boolean> }) {
  const [said, setSaid] = useState('');
  return (
    <div className="copy-line">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="copy-line__row">
        <input id={id} type="text" readOnly className="copy-line__field" value={value ?? ''} placeholder={value === null ? 'Not available in this browser' : undefined} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn"
          disabled={value === null}
          onClick={() => {
            void onCopy().then((ok) => setSaid(ok ? COPIED : COPY_FAILED));
          }}
        >
          Copy
        </button>
      </div>
      <p className="settings-note" role="status">{said}</p>
    </div>
  );
}

export function InviteLinkCard({ userId }: { userId: string | null }) {
  const { link, copy } = useInviteLink(userId);
  return (
    <>
      <h3 className="settings-sub">Invite a friend</h3>
      <p className="settings-note">{INVITE_NOTE}</p>
      <CopyLine id="invite-link-field" label="Invite link" value={link} onCopy={copy} />
    </>
  );
}

export function BadgeCard() {
  return (
    <>
      <h3 className="settings-sub">Made with StudPilot</h3>
      <p className="settings-note">{BADGE_NOTE}</p>
      <CopyLine id="badge-field" label="Badge text" value={BADGE_TEXT} onCopy={() => writeClipboard(BADGE_TEXT)} />
    </>
  );
}
