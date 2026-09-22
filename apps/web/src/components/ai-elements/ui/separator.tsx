// Adapted from AI Elements `packages/shadcn-ui/components/ui/separator.tsx` at the pinned commit
// (see ../NOTICE). Radix `Separator.Root` is replaced by the element it renders: a div that is
// `role="none"` when decorative and `role="separator"` (with its orientation) when it means
// something. forwardRef because React 18 would otherwise drop the ref.
import * as React from 'react';
import { cn } from '../lib/utils';
import './ui.css';

export type SeparatorProps = React.ComponentPropsWithoutRef<'div'> & {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
};

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { className, orientation = 'horizontal', decorative = true, ...props },
  ref,
) {
  const semantics = decorative
    ? { role: 'none' as const }
    : {
        role: 'separator' as const,
        'aria-orientation': orientation === 'vertical' ? ('vertical' as const) : undefined,
      };
  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      {...semantics}
      ref={ref}
      className={cn(
        'bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px ai-separator',
        className,
      )}
      {...props}
    />
  );
});

export { Separator };
