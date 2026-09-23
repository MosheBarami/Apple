/**
 * THE OPEN FILE, AS CODE — the right-hand pane of the UI Layouts "Tree Code Viewer" pick (MIT,
 * ui-layouts.com), with the Eldora "GitHub Inline Comments" bubble on every line.
 *
 * The pick draws a path header ("ServerScriptService / LavaRise.server.lua"), a copy button in the
 * corner, and Luau with keywords, strings, numbers and Roblox globals coloured. The colouring here is
 * the app's own lib/highlight.ts — tokens rendered as React children, never an HTML string — so a
 * file cannot smuggle markup into the drawer however it is written.
 */
import { Fragment, useMemo, useState } from 'react';
import { tokenize, type Token } from '../../../lib/highlight';
import type { CodeLanguage } from '../../../lib/generative-ui/schema';
import { useCopy } from './use-copy';
import { CheckIcon, CopyIcon } from './icons';
import { LineCommentButton, LineThread } from './line-thread';
import './tech-ui.css';
import './code-viewer.css';

/** Split a token stream at newlines, so each line renders on its own row. */
export function tokensByLine(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const t of tokens) {
    const parts = t.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ kind: t.kind, text: part });
    });
  }
  return lines;
}

export function TokenText({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((t, i) =>
        t.kind === 'plain' ? <Fragment key={i}>{t.text}</Fragment> : <span key={i} className={`tok--${t.kind}`}>{t.text}</span>,
      )}
    </>
  );
}

export function CodeViewer({
  path,
  content,
  language,
  onAsk,
}: {
  path: string;
  content: string;
  language: CodeLanguage;
  /** Present when a question about a line can be handed to the message box. */
  onAsk?: (line: number, code: string, question: string) => boolean;
}) {
  const lines = useMemo(() => tokensByLine(tokenize(content, language)), [content, language]);
  const raw = useMemo(() => content.split('\n'), [content]);
  const [asking, setAsking] = useState<number | null>(null);
  const { copied, copy } = useCopy();

  return (
    <div className="cv">
      <div className="cv-head">
        <span className="cv-path">{path.split('/').join(' / ')}</span>
        <button
          type="button"
          className="tq-btn tq-btn--icon tq-btn--bare"
          aria-label={copied ? 'Copied' : 'Copy the text'}
          title="Copy the text"
          onClick={() => void copy(content)}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
        <span className="tq-sr" role="status">{copied ? 'Copied' : ''}</span>
      </div>
      <ol className={`cv-lines${onAsk ? ' cv-lines--ask' : ''}`}>
        {lines.map((tokens, i) => (
          <li key={i} className={`cv-line${asking === i + 1 ? ' is-asking' : ''}`}>
            <div className="cv-row">
              {onAsk && (
                <LineCommentButton line={i + 1} open={asking === i + 1} onClick={() => setAsking(asking === i + 1 ? null : i + 1)} />
              )}
              <span className="cv-no" aria-hidden="true">{i + 1}</span>
              <code className="cv-code"><TokenText tokens={tokens} />{'\n'}</code>
            </div>
            {onAsk && asking === i + 1 && (
              <LineThread
                line={i + 1}
                code={raw[i] ?? ''}
                onAsk={(q) => onAsk(i + 1, raw[i] ?? '', q)}
                onClose={() => setAsking(null)}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
