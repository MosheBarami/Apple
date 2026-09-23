// A secret that decodes itself on arrival.
//
// Pick: React Bits "Decrypted Text" (MIT + Commons Clause — re-implemented, not copied): the text
// starts as scrambled glyphs and resolves one character at a time, left to right. Used where a
// credential appears once — a new API key, a pairing code — so the moment it arrives is marked.
//
// The real text is in the document from the first frame (visually hidden) and is the only thing
// assistive technology reads; the scramble is aria-hidden. Once resolved the plain text is
// rendered, so selecting and copying it behaves like any other text. Reduced motion skips straight
// to the result.
import { useEffect, useState } from 'react';
import { reducedMotion } from './motion';
import './decrypted-text.css';

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function DecryptedText({ text, className }: { text: string; className?: string }) {
  const [revealed, setRevealed] = useState(() => (reducedMotion() ? text.length : 0));

  useEffect(() => {
    if (reducedMotion()) {
      setRevealed(text.length);
      return;
    }
    setRevealed(0);
    const every = Math.max(12, Math.min(45, Math.round(900 / Math.max(1, text.length))));
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setRevealed(n);
      if (n >= text.length) window.clearInterval(id);
    }, every);
    return () => window.clearInterval(id);
  }, [text]);

  if (revealed >= text.length) return <span className={className}>{text}</span>;

  return (
    <span className={`pk-decrypt${className ? ` ${className}` : ''}`}>
      <span className="pk-decrypt__sr">{text}</span>
      <span aria-hidden="true">
        {text.split('').map((c, i) =>
          i < revealed || /[\s\-_.:]/.test(c) ? (
            <span key={i} className="pk-decrypt__rev">
              {c}
            </span>
          ) : (
            <span key={i} className="pk-decrypt__enc">
              {GLYPHS[Math.floor(Math.random() * GLYPHS.length)]}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
