// A fenced code block in an assistant reply: highlighted, and copyable.
//
// Both halves were missing, and both are the same kind of gap — the product knew something and did
// not act on it. `generative-ui/schema.ts` has declared CODE_LANGUAGES since the registry was
// written, and nothing tokenised any of them; `styles.css` styled `.markdown pre code` as plain
// monospace. Meanwhile the single most common thing anyone does with generated Luau is select it
// and copy it into Studio, by hand, from a block with no control on it.
//
// THE COPY BUTTON IS NOT OFFERED ON AN UNCLOSED FENCE. While a reply streams, the last block has
// no closing ``` yet — copying it would put half a function on the clipboard, and the user would
// find out in Studio. A control that is present and gives the wrong answer is worse than one that
// arrives a second later.
import { useEffect, useRef, useState } from 'react';
import { normaliseLanguage, tokenize } from '../../lib/highlight';
import './code-block.css';

/** How the language reads in the block's header. 'text' names nothing, so it says nothing. */
const LANG_NAME: Record<string, string> = {
  luau: 'Luau',
  lua: 'Lua',
  ts: 'TypeScript',
  js: 'JavaScript',
  json: 'JSON',
  text: '',
};

export function CodeBlock({ code, lang, closed }: { code: string; lang: string; closed: boolean }) {
  const language = normaliseLanguage(lang);
  const tokens = tokenize(code, language);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  // The tick is cleared on unmount as well as on its timer: a turn can be replaced mid-timeout by
  // an edit-and-resend, and a setState on an unmounted component is a warning in every console the
  // team looks at for real problems.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = () => {
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1600);
      },
      // A refused clipboard — a insecure context, a denied permission — leaves the button alone.
      // No tick appears for a copy that did not happen, which is the only promise this can keep.
      () => setCopied(false),
    );
  };

  const name = LANG_NAME[language] ?? '';

  return (
    <div className="gx-code">
      <div className="gx-code__head">
        <span className="gx-code__lang">{name}</span>
        {closed && (
          <button
            type="button"
            className="gx-code__copy"
            onClick={copy}
            aria-label={copied ? 'Copied to the clipboard' : 'Copy this code'}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      <pre className="gx-code__body">
        {/* Tokens are React CHILDREN, never an HTML string. Whatever the model wrote — a script
            tag, an entity, a stray backslash — is text here by construction, with no escaping
            step that could be got wrong. */}
        <code>
          {tokens.map((t, i) =>
            t.kind === 'plain' ? t.text : (
              <span key={i} className={`tok tok--${t.kind}`}>
                {t.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}
