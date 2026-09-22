// Adapted from AI Elements `packages/shadcn-ui/components/ui/spinner.tsx` at the pinned commit (see
// ../NOTICE). The one export, its role and its name are upstream's; lucide's Loader2Icon comes from
// ../icons, and the spin is `ai-spinner` in ./ui.css (off under prefers-reduced-motion).
import * as React from 'react';
import { Loader2Icon } from '../icons';

import { cn } from '../lib/utils';
import './ui.css';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin ai-spinner', className)}
      {...props}
    />
  );
}

export { Spinner };
