// A fenced code block in an assistant reply: highlighted, and copyable.
//
// Both halves were missing, and both are the same kind of gap — the product knew something and did
// not act on it. `generative-ui/schema.ts` has declared CODE_LANGUAGES since the registry was
// written, and nothing tokenised any of them; `styles.css` styled `.markdown pre code` as plain
// monospace. Meanwhile the single most common thing anyone does with generated Luau is select it
// and copy it into Studio, by hand, from a block with no control on it.
//
// THE BLOCK IS AI ELEMENTS' CodeBlock (../ai-elements/code-block.tsx), highlighted by shiki
// through that component. Shiki returns TOKENS that React renders as children, never an HTML
// string, so model output is text no matter what it contains. A closed fence and a fence still
// streaming are the SAME block: a finished script does not lose its colours the moment it finishes.
// `normaliseLanguage` still decides which of the six declared languages a fence is; SHIKI_LANG maps
// that onto a shiki BundledLanguage (shiki has a real `luau` grammar, so Luau is not flattened to Lua).
//
// THE COPY BUTTON IS NOT OFFERED ON AN UNCLOSED FENCE. While a reply streams, the last block has
// no closing ``` yet — copying it would put half a function on the clipboard, and the user would
// find out in Studio. A control that is present and gives the wrong answer is worse than one that
// arrives a second later.
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { normaliseLanguage } from '../../lib/highlight';
import {
  CodeBlock as AICodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '../ai-elements/code-block';
import type { BundledLanguage } from 'shiki';
import { FileTextIcon } from 'lucide-react';
import type { CodeLanguage } from '../../lib/generative-ui/schema';
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

/** The declared languages, as shiki spells them. 'text' is shiki's plain-text special language. */
const SHIKI_LANG: Record<CodeLanguage, BundledLanguage> = {
  luau: 'luau',
  lua: 'lua',
  ts: 'typescript',
  js: 'javascript',
  json: 'json',
  text: 'text' as BundledLanguage,
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
      className={cn('aie gx-code')}
      code={code}
      language={SHIKI_LANG[language]}
      data-writing={closed ? undefined : ''}
      data-empty={!closed && !code ? '' : undefined}
    >
      <CodeBlockHeader className="gx-code__head">
        <CodeBlockTitle>
          <FileTextIcon size={13} className="gx-code__icon" aria-hidden="true" />
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
