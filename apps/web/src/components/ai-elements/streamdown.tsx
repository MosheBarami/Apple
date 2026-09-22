// Local stand-in for `streamdown` and its four plugins, as used by AI Elements' MessageResponse.
//
// WHY THIS IS NOT STREAMDOWN. Model output is untrusted, and this app already has the one renderer
// that is allowed to put it on screen: lib/markdown.tsx — marked, then DOMPurify with an explicit
// tag/attribute/URL allow-list, and fenced code pulled out first and rendered as React children by
// the code block. A second markdown pipeline would be a second allow-list, and the difference
// between the two would be where the next injection lives. So `Streamdown` here renders through
// `Markdown`, and nothing else.
//
// What that gives up, knowingly: Streamdown's math, mermaid and CJK plugins, and its repair of
// half-written markdown while a reply streams. The plugin objects are kept, inert, so the vendored
// component's `plugins={{ cjk, code, math, mermaid }}` still reads as upstream wrote it — they
// switch nothing on. Code highlighting is not lost: fences go to the code block, which highlights
// through lib/highlight.ts.
import type { HTMLAttributes } from 'react';
import { Markdown } from '../../lib/markdown';
import { cn } from './lib/utils';

export interface StreamdownPlugin {
  readonly name: 'cjk' | 'code' | 'math' | 'mermaid';
  readonly supported: false;
}

export const cjk: StreamdownPlugin = { name: 'cjk', supported: false };
export const code: StreamdownPlugin = { name: 'code', supported: false };
export const math: StreamdownPlugin = { name: 'math', supported: false };
export const mermaid: StreamdownPlugin = { name: 'mermaid', supported: false };

export type StreamdownProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** The markdown source. Only a string: this renderer never takes pre-built markup. */
  children?: string;
  plugins?: Partial<Record<StreamdownPlugin['name'], StreamdownPlugin>>;
  /** Upstream stops animating tokens in when this turns false; there is no token animation here. */
  isAnimating?: boolean;
  parseIncompleteMarkdown?: boolean;
};

export function Streamdown({
  children,
  className,
  plugins: _plugins,
  isAnimating: _isAnimating,
  parseIncompleteMarkdown: _parseIncompleteMarkdown,
  ...props
}: StreamdownProps) {
  return (
    <div className={cn('ai-streamdown', className)} {...props}>
      <Markdown source={children ?? ''} />
    </div>
  );
}
