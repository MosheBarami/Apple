"use client";

// Adapted from AI Elements `packages/shadcn-ui/components/ui/tooltip.tsx` at the pinned commit (see
// ../NOTICE). The four exports, their names and the inert Tailwind strings are upstream's; Radix
// `Tooltip.*` is replaced by the small implementation below, which keeps the behaviour the
// wrappers rely on:
//   * opens on pointer hover (not touch) after `delayDuration`, and on keyboard focus;
//   * closes on leave, blur, pointer-down and Escape;
//   * the trigger is described by the content (`aria-describedby`) only while it is open;
//   * the content is portalled to <body> and placed with position:fixed, so an `overflow:hidden`
//     ancestor cannot clip it.
// The trigger forwards its ref (React 18), and `asChild` goes through ./slot.
import * as React from 'react';
import { createPortal } from 'react-dom';
import { place, type Align, type Side } from '../lib/floating';
import { composeRefs, Slot } from './slot';
import { cn } from '../lib/utils';
import { useIsomorphicLayoutEffect } from '../lib/use-isomorphic-layout-effect';
import './ui.css';

interface ProviderValue {
  delayDuration: number;
}

const ProviderContext = React.createContext<ProviderValue>({ delayDuration: 700 });

interface TooltipContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openSoon: () => void;
  contentId: string;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltip(part: string): TooltipContextValue {
  const context = React.useContext(TooltipContext);
  if (!context) throw new Error(`${part} must be used within Tooltip`);
  return context;
}

export type TooltipProviderProps = {
  children?: React.ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
  disableHoverableContent?: boolean;
};

function TooltipProvider({ delayDuration = 0, children }: TooltipProviderProps) {
  const value = React.useMemo(() => ({ delayDuration }), [delayDuration]);
  return <ProviderContext.Provider value={value}>{children}</ProviderContext.Provider>;
}

export type TooltipProps = {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
  disableHoverableContent?: boolean;
};

function TooltipRoot({ children, open: openProp, defaultOpen = false, onOpenChange, delayDuration }: TooltipProps) {
  const provider = React.useContext(ProviderContext);
  const delay = delayDuration ?? provider.delayDuration;
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolled;
  const timer = React.useRef<number | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const contentId = React.useId();

  const clear = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const setOpen = React.useCallback(
    (next: boolean) => {
      clear();
      if (!controlled) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [clear, controlled, onOpenChange],
  );

  const openSoon = React.useCallback(() => {
    clear();
    if (delay <= 0) {
      setOpen(true);
      return;
    }
    timer.current = window.setTimeout(() => setOpen(true), delay);
  }, [clear, delay, setOpen]);

  React.useEffect(() => clear, [clear]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const value = React.useMemo(
    () => ({ contentId, open, openSoon, setOpen, triggerRef }),
    [contentId, open, openSoon, setOpen],
  );
  return <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>;
}

function Tooltip({ ...props }: TooltipProps) {
  return (
    <TooltipProvider>
      <TooltipRoot {...props} />
    </TooltipProvider>
  );
}

function focusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    // An engine without the selector cannot tell keyboard focus from a click; showing the tooltip
    // is the answer that keeps it reachable from the keyboard.
    return true;
  }
}

export type TooltipTriggerProps = React.ComponentPropsWithoutRef<'button'> & { asChild?: boolean };

const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipTriggerProps>(function TooltipTrigger(
  { asChild = false, onPointerEnter, onPointerLeave, onPointerDown, onFocus, onBlur, ...props },
  forwardedRef,
) {
  const tooltip = useTooltip('TooltipTrigger');
  const shared = {
    'data-slot': 'tooltip-trigger',
    'data-state': tooltip.open ? 'delayed-open' : 'closed',
    'aria-describedby': tooltip.open ? tooltip.contentId : undefined,
    onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerEnter?.(event);
      if (!event.defaultPrevented && event.pointerType !== 'touch') tooltip.openSoon();
    },
    onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerLeave?.(event);
      tooltip.setOpen(false);
    },
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event);
      tooltip.setOpen(false);
    },
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
      onFocus?.(event);
      // Keyboard focus only: a click also focuses a button, and the tooltip it just closed on
      // pointer-down must not reopen under the finger.
      if (!event.defaultPrevented && focusVisible(event.currentTarget)) tooltip.setOpen(true);
    },
    onBlur: (event: React.FocusEvent<HTMLButtonElement>) => {
      onBlur?.(event);
      tooltip.setOpen(false);
    },
  };
  const ref = composeRefs<HTMLButtonElement>(forwardedRef, tooltip.triggerRef as React.MutableRefObject<HTMLButtonElement | null>);

  if (asChild) {
    return <Slot {...(props as React.HTMLAttributes<HTMLElement>)} {...(shared as React.HTMLAttributes<HTMLElement>)} ref={ref as React.Ref<HTMLElement>} />;
  }
  return <button type="button" {...props} {...shared} ref={ref} />;
});

export type TooltipContentProps = React.ComponentPropsWithoutRef<'div'> & {
  side?: Side;
  align?: Align;
  sideOffset?: number;
  forceMount?: boolean;
};

function TooltipContent({
  className,
  sideOffset = 0,
  side = 'top',
  align = 'center',
  children,
  style,
  forceMount: _forceMount,
  ...props
}: TooltipContentProps) {
  const tooltip = useTooltip('TooltipContent');
  const node = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number; side: Side } | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!tooltip.open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const anchor = tooltip.triggerRef.current;
      const panel = node.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      // The arrow sits outside the panel's box, so the gap to the trigger includes it.
      setPosition(
        place(
          rect,
          { width: panel.offsetWidth, height: panel.offsetHeight },
          { side, align, sideOffset: sideOffset + 6 },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [tooltip.open, tooltip.triggerRef, side, align, sideOffset]);

  if (!tooltip.open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-slot="tooltip-content"
      data-state="delayed-open"
      data-side={position?.side ?? side}
      role="tooltip"
      id={tooltip.contentId}
      ref={node}
      className={cn(
        'bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance ai-tooltip',
        className,
      )}
      style={{
        ...style,
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        // Measured before it is shown, so the first paint is already in place.
        visibility: position ? undefined : 'hidden',
      }}
      {...props}
    >
      {children}
      <span
        aria-hidden="true"
        className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] ai-tooltip__arrow"
      />
    </div>,
    document.body,
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
