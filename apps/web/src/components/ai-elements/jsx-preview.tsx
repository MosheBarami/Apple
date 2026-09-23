// AI Elements `jsx-preview`, adapted for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) renders a string of generated markup as a
// live preview, closes tags the stream has not closed yet, and shows an error slot when the markup
// cannot be rendered. It does that with react-jsx-parser, which evaluates the string as JSX.
//
// THAT HALF IS DELIBERATELY NOT HERE. Text in this app is untrusted — a project file can hold
// anything a model or a person wrote — and the app has exactly one renderer allowed to turn text
// into markup: lib/markdown.tsx (marked → DOMPurify allow-list, code fences as React children).
// A second pipeline would be a second allow-list. So JSXPreviewContent renders through that one,
// and the streaming repair upstream does for JSX tags is done here for the construct that breaks a
// markdown render mid-stream: an unclosed code fence.
//
// Where it is used: a Markdown file opened in the Files drawer gets a "Reading view" — the notes
// and plans Apple writes, drawn as a page instead of as raw text (files-panel.tsx).
import { Component, createContext, useContext, useMemo, type HTMLAttributes, type ReactNode } from 'react';
import { Markdown } from '../../lib/markdown';
import { cn } from './lib/utils';
import './jsx-preview.css';

interface JSXPreviewContextValue {
  source: string;
  isStreaming: boolean;
  onError?: (error: Error) => void;
}
const JSXPreviewContext = createContext<JSXPreviewContextValue>({ source: '', isStreaming: false });

/** Close what a half-written document left open, so the preview renders what is there. */
export function completeMarkup(source: string): string {
  const fences = source.match(/^(```|~~~)/gm)?.length ?? 0;
  return fences % 2 === 1 ? `${source}\n\`\`\`` : source;
}

export type JSXPreviewProps = HTMLAttributes<HTMLDivElement> & {
  /** Upstream's `jsx`: the text to preview. */
  jsx: string;
  isStreaming?: boolean;
  onError?: (error: Error) => void;
};

export const JSXPreview = ({ jsx, isStreaming = false, onError, className, children, ...props }: JSXPreviewProps) => {
  const value = useMemo(() => ({ source: jsx, isStreaming, onError }), [jsx, isStreaming, onError]);
  return (
    <JSXPreviewContext.Provider value={value}>
      <div className={cn('ai-jsx', className)} {...props}>{children}</div>
    </JSXPreviewContext.Provider>
  );
};

class Boundary extends Component<{ onError?: (e: Error) => void; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export const JSXPreviewContent = ({ className }: { className?: string }) => {
  const { source, isStreaming, onError } = useContext(JSXPreviewContext);
  const text = isStreaming ? completeMarkup(source) : source;
  return (
    <div className={cn('ai-jsx__content', className)}>
      <Boundary onError={onError} fallback={<JSXPreviewError />}>
        <Markdown source={text} />
      </Boundary>
    </div>
  );
};

export const JSXPreviewError = ({ className, children }: { className?: string; children?: ReactNode }) => (
  <p className={cn('ai-jsx__error', className)} role="alert">
    {children ?? 'This file could not be shown as a page. The text view still has all of it.'}
  </p>
);
