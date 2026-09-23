/**
 * A QUESTION ABOUT ONE LINE — the Eldora UI "GitHub Inline Comments" pick (MIT, eldoraui.site).
 *
 * The pick: hover a line of a diff, press the + bubble, and a thread opens under that line with a
 * box to write in; Esc closes it. What it is FOR here: a young creator reading a script Apple wrote
 * can point at the exact line they do not understand ("what does this do?", "make this faster") and
 * the question lands in the message box with the file and line attached. Nothing is stored on the
 * line — the conversation is where Apple answers — so the thread says where the words went instead
 * of pretending to keep them.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { CloseIcon, CommentIcon } from './icons';
import './tech-ui.css';
import './line-thread.css';

/** The + bubble at the start of a line. Visible on hover and on keyboard focus of the line. */
export function LineCommentButton({ line, open, onClick }: { line: number; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="lt-bubble"
      aria-label={open ? `Close the question on line ${line}` : `Ask Apple about line ${line}`}
      aria-expanded={open}
      title="Ask about this line"
      onClick={onClick}
    >
      <CommentIcon size={12} />
    </button>
  );
}

export function LineThread({
  line,
  code,
  onAsk,
  onClose,
}: {
  line: number;
  code: string;
  /** Hand the question on. Returns false when it could not be delivered. */
  onAsk: (question: string) => boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  useEffect(() => { box.current?.focus(); }, []);

  const send = () => {
    const q = text.trim();
    if (!q) return;
    if (onAsk(q)) onClose();
    else setFailed(true);
  };

  return (
    <div
      className="lt-thread"
      role="group"
      aria-label={`Question about line ${line}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
      }}
    >
      <div className="lt-card">
        <div className="lt-head">
          <span className="lt-badge">Line {line}</span>
          <button type="button" className="tq-btn tq-btn--icon tq-btn--bare" aria-label="Close" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>
        {code.trim() && <pre className="lt-quote">{code.trim()}</pre>}
        <label className="tq-sr" htmlFor={id}>Your question for Apple</label>
        <textarea
          ref={box}
          id={id}
          className="lt-input"
          rows={2}
          placeholder="What do you want to know or change?"
          value={text}
          onChange={(e) => { setText(e.target.value); setFailed(false); }}
        />
        {failed && <p className="lt-note" role="alert">That could not be sent to the message box. Copy it and paste it there.</p>}
        <div className="lt-acts">
          <span className="lt-hint">Goes to your message box</span>
          <button type="button" className="tq-btn tq-btn--bare" onClick={onClose}>Cancel</button>
          <button type="button" className="tq-btn tq-btn--primary" disabled={!text.trim()} onClick={send}>Ask Apple</button>
        </div>
      </div>
    </div>
  );
}

/** The message the composer receives. The file and line travel with the words. */
export function lineQuestion(path: string, line: number, code: string, question: string): string {
  const quoted = code.trim() ? ` (\`${code.trim().slice(0, 120)}\`)` : '';
  return `In ${path}, line ${line}${quoted}: ${question}`;
}
