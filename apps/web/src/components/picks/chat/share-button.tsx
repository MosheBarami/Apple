// SHARE A REPLY.
//
// Animate UI "Share Button" (MIT + Commons Clause, re-implemented): at rest it is one word; under
// the pointer or on focus the word lifts away and the ways to share rise into its place, one after
// another. Each way is a real button with its own name, so a keyboard reaches them by tabbing into
// the group — the reveal is presentation, never the only route.
//
// The ways are the ones this product can honestly offer. Copy the text; copy a link to this chat
// (it opens for people who already have access to the project, and says nothing to anyone else);
// and the system share sheet, only where the browser has one.
import { useState, type ReactNode } from 'react';
import { writeClipboard } from './copy-button';
import './share-button.css';

const LINK = <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />;
const TEXT = <path d="M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM4 16V4a1 1 0 0 1 1-1h11" />;
const SHEET = <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />;

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function ShareButton({ getText, title = 'Apple' }: { getText: () => string; title?: string }) {
  const [said, setSaid] = useState('');
  const canSheet = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const report = (ok: boolean, what: string) => {
    setSaid(ok ? `${what} copied` : 'Could not copy');
    window.setTimeout(() => setSaid(''), 2000);
  };

  return (
    <div className="pk-share" role="group" aria-label="Share this reply">
      <span className="pk-share__word" aria-hidden="true">
        {said || 'Share'}
      </span>
      <span className="pk-share__ways">
        <button
          type="button"
          className="pk-share__way"
          aria-label="Copy the text"
          title="Copy the text"
          onClick={() => void writeClipboard(getText()).then((ok) => report(ok, 'Text'))}
        >
          <Glyph>{TEXT}</Glyph>
        </button>
        <button
          type="button"
          className="pk-share__way"
          aria-label="Copy a link to this chat"
          title="Copy a link to this chat. It opens for people who can already see this project."
          onClick={() => void writeClipboard(`${window.location.origin}${window.location.pathname}`).then((ok) => report(ok, 'Link'))}
        >
          <Glyph>{LINK}</Glyph>
        </button>
        {canSheet && (
          <button
            type="button"
            className="pk-share__way"
            aria-label="Share with another app"
            title="Share with another app"
            onClick={() => void navigator.share({ title, text: getText() }).catch(() => undefined)}
          >
            <Glyph>{SHEET}</Glyph>
          </button>
        )}
      </span>
      <span className="gx-sr" role="status">{said}</span>
    </div>
  );
}
