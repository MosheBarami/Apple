// Adapted from AI Elements `packages/shadcn-ui/components/ui/textarea.tsx` at the pinned commit (see
// ../NOTICE). The one export and its inert Tailwind string are upstream's. Local changes: forwardRef
// (React 18 drops a ref handed to a function component, and the composer measures, focuses and
// places the caret in this element through one), and an `ai-textarea` class that ./ui.css styles.
import * as React from 'react';

import { cn } from '../lib/utils';
import './ui.css';

const Textarea = /* @__PURE__ */ React.forwardRef<HTMLTextAreaElement, React.ComponentPropsWithoutRef<'textarea'>>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      data-slot="textarea"
      ref={ref}
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'ai-textarea',
        className,
      )}
      {...props}
    />
  );
});

export { Textarea };
