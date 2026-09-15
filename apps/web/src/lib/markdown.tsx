// Markdown rendering for assistant messages.
//
// TWO PATHS, DELIBERATELY, AND THE SPLIT IS THE POINT.
//
//   * PROSE goes marked → DOMPurify → innerHTML, exactly as it always has. Model output is
//     untrusted, the allowlist below is the whole contract, and none of that changes.
//   * FENCED CODE is pulled out FIRST (lib/code-fences.ts) and rendered as a real component
//     (components/ws/code-block.tsx): highlighted by lib/highlight.ts, with a copy control.
//
// The reason code cannot stay on the sanitiser path is not aesthetic. Sanitised HTML cannot carry a
// React handler, so a copy button rendered that way would have to be re-attached to the DOM by hand
// on every streaming delta — and the highlighter would have to return an escaped HTML string, in a
// pipeline whose entire reason for existing is that this text is untrusted. Tokens rendered as
// React children cannot be interpreted as markup at all, so the safest thing is also the simplest.
//
// INDENTED (four-space) code blocks still go through marked and render as a plain `pre` with no
// copy control. That is a known, bounded gap: the model writes fences, and treating an indented
// block as code here would misread every quoted transcript and every hanging list continuation.
import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { splitFences } from './code-fences';
import { CodeBlock } from '../components/ws/code-block';

marked.setOptions({ gfm: true, breaks: true });

// Force links to open in a new tab, safely.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

function Prose({ source }: { source: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Markdown({ source }: { source: string }) {
  const segments = useMemo(() => splitFences(source), [source]);
  return (
    <div className="markdown">
      {segments.map((seg, i) =>
        seg.kind === 'code' ? (
          <CodeBlock key={i} code={seg.value} lang={seg.lang} closed={seg.closed} />
        ) : (
          <Prose key={i} source={seg.value} />
        ),
      )}
    </div>
  );
}
