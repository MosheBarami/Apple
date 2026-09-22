"use client";

// Adapted from AI Elements `packages/shadcn-ui/components/ui/scroll-area.tsx` at the pinned commit
// (see ../NOTICE). Same two exports and inert Tailwind strings. Radix ScrollArea hides the native
// scrollbar and draws its own; this stand-in keeps the platform's native scrolling (a real
// scrollbar, momentum, keyboard and assistive-technology support for free), so `ScrollBar` renders
// nothing and exists only so upstream markup that places one still compiles and reads the same.
import * as React from 'react';
import { cn } from '../lib/utils';
import './ui.css';

const ScrollArea = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(function ScrollArea(
  { className, children, ...props },
  ref,
) {
  return (
    <div data-slot="scroll-area" ref={ref} className={cn('relative ai-scroll-area', className)} {...props}>
      <div
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1 ai-scroll-area__viewport"
      >
        {children}
      </div>
      <ScrollBar />
    </div>
  );
});

function ScrollBar(_props: React.ComponentPropsWithoutRef<'div'> & { orientation?: 'vertical' | 'horizontal' }) {
  return null;
}

export { ScrollArea, ScrollBar };
