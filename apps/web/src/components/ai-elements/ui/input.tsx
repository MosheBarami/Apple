// Adapted from AI Elements `packages/shadcn-ui/components/ui/input.tsx` at the pinned commit (see
// ../NOTICE). The one export and its inert Tailwind string are upstream's. Local changes: forwardRef
// (React 18 drops a ref handed to a function component, and InputGroupInput is focused through
// one), and an `ai-input` class that ./ui.css styles with the app's tokens.
import * as React from 'react';

import { cn } from '../lib/utils';
import './ui.css';

const Input = /* @__PURE__ */ React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<'input'>>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      type={type}
      data-slot="input"
      ref={ref}
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        'ai-input',
        className,
      )}
      {...props}
    />
  );
});

export { Input };
