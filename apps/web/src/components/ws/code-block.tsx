// A fenced code block in an assistant reply: highlighted, and copyable.
//
// Both halves were missing, and both are the same kind of gap — the product knew something and did
// not act on it. `generative-ui/schema.ts` has declared CODE_LANGUAGES since the registry was
// written, and nothing tokenised any of them; `styles.css` styled `.markdown pre code` as plain
// monospace. Meanwhile the single most common thing anyone does with generated Luau is select it
// and copy it into Studio, by hand, from a block with no control on it.
//
// THE BLOCK IS AI ELEMENTS' CodeBlock (../ai-elements/code-block.tsx), highlighted through
// lib/highlight.ts rather than shiki — the tokens are React children, never an HTML string, and
// they rejoin to the source byte for byte. A closed fence and a fence still streaming are the SAME
// block now: the one this replaced sent a closed fence to a copy-only component that dropped the
// highlighting it had just computed, so a finished script lost its colours the moment it finished.
//
// THE COPY BUTTON IS NOT OFFERED ON AN UNCLOSED FENCE. While a reply streams, the last block has
// no closing ``` yet — copying it would put half a function on the clipboard, and the user would
// find out in Studio. A control that is present and gives the wrong answer is worse than one that
// arrives a second later.
import { useEffect, useState } from 'react';
import { normaliseLanguage } from '../../lib/highlight';
import {
  CodeBlock as AICodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '../ai-elements/code-block';
import { FileTextIcon } from '../ai-elements/icons';
import './code-block.css';
// THE WRITING STATE, from two picks merged into this one block. Animate UI "Code" writes a script
// with a caret at the end of it and puts a file mark in the header; UI Layouts "Code Block" holds a
// placeholder where the code is about to be. Here both answer the same fact — the fence has not
// closed — so the caret blinks at the end of the last line while the model is still writing it, and
// a fence that has opened with nothing in it yet shows three shimmering lines instead of an empty
// box. Both are CSS (code-block.css), and neither moves under reduced motion.

/** How the language reads in the block's header. 'text' names nothing, so it says nothing. */
const LANG_NAME: Record<string, string> = {
  luau: 'Luau',
  lua: 'Lua',
  ts: 'TypeScript',
  js: 'JavaScript',
  json: 'JSON',
  text: '',
};

/** How long the copy control shows its tick — upstream CodeBlockCopyButton's own default. */
const COPIED_MS = 2000;

export function CodeBlock({ code, lang, closed }: { code: string; lang: string; closed: boolean }) {
  const language = normaliseLanguage(lang);
  const name = LANG_NAME[language] ?? '';

  // The button draws its own tick; this is the same fact for a screen reader, which cannot see an
  // icon change. It is only ever set by `onCopy`, which upstream calls after the clipboard write
  // resolved — a refused write says nothing, because nothing was copied.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <AICodeBlock
      className="gx-code"
      code={code}
      language={language}
      data-writing={closed ? undefined : ''}
      data-empty={!closed && !code ? '' : undefined}
    >
      <CodeBlockHeader className="gx-code__head">
        <CodeBlockTitle>
          <FileTextIcon size={13} className="gx-code__icon" />
          <CodeBlockFilename className="gx-code__lang">{name}</CodeBlockFilename>
        </CodeBlockTitle>
        {closed && (
          <CodeBlockActions>
            <CodeBlockCopyButton
              className="gx-code__copy"
              timeout={COPIED_MS}
              onCopy={() => setCopied(true)}
              aria-label="Copy code"
              title="Copy code"
            />
            <span className="gx-sr" role="status">
              {copied ? 'Copied to clipboard' : ''}
            </span>
          </CodeBlockActions>
        )}
      </CodeBlockHeader>
      {!closed && !code && (
        <div className="gx-code__skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
    </AICodeBlock>
  );
}
