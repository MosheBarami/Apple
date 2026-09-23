// AI Elements `snippet`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) is a one-line, read-only input group — a
// prefix, the text, a copy button — for handing a short string to the user. Export names follow
// upstream; the code is written here with no InputGroup/Radix dependency.
//
// Where it is used: the Files drawer puts the open file's path in one, so it can be copied into a
// message to Apple ("look at notes/plan.md") without retyping it (files-panel.tsx).
import { createContext, useContext, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './lib/utils';
import { useCopy } from '../picks/tech/use-copy';
import { CheckIcon, CopyIcon } from '../picks/tech/icons';
import '../picks/tech/tech-ui.css';
import './snippet.css';

const SnippetContext = createContext<{ code: string }>({ code: '' });

export type SnippetProps = HTMLAttributes<HTMLDivElement> & { code: string };
export const Snippet = ({ code, className, children, ...props }: SnippetProps) => (
  <SnippetContext.Provider value={{ code }}>
    <div className={cn('ai-snippet', className)} {...props}>{children}</div>
  </SnippetContext.Provider>
);

export const SnippetAddon = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-snippet__addon', className)} {...props} />
);

export const SnippetText = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-snippet__text', className)} {...props} />
);

export type SnippetInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'readOnly'>;
export const SnippetInput = ({ className, ...props }: SnippetInputProps) => {
  const { code } = useContext(SnippetContext);
  return (
    <input
      className={cn('ai-snippet__input', className)}
      value={code}
      readOnly
      spellCheck={false}
      onFocus={(e) => e.currentTarget.select()}
      {...props}
    />
  );
};

export type SnippetCopyButtonProps = {
  onCopy?: () => void;
  onError?: (error: unknown) => void;
  timeout?: number;
  label?: string;
  children?: ReactNode;
  className?: string;
};
export const SnippetCopyButton = ({ onCopy, onError, timeout = 2000, label = 'Copy', children, className }: SnippetCopyButtonProps) => {
  const { code } = useContext(SnippetContext);
  const { copied, copy } = useCopy(timeout, onError);
  return (
    <button
      type="button"
      className={cn('tq-btn tq-btn--icon tq-btn--bare ai-snippet__copy', className)}
      aria-label={copied ? 'Copied' : label}
      title={label}
      onClick={() => void copy(code).then((ok) => ok && onCopy?.())}
    >
      {children ?? (copied ? <CheckIcon /> : <CopyIcon />)}
    </button>
  );
};
