"use client";

// Adapted from AI Elements `packages/shadcn-ui/components/ui/hover-card.tsx` at the pinned commit
// (see ../NOTICE). The three exports, their props and the inert Tailwind string are upstream's;
// Radix `HoverCard.*` is replaced by the small implementation below, which keeps the behaviour the
// wrappers (PromptInputHoverCard, AttachmentHoverCard) rely on:
//   * opens `openDelay` ms after a pointer (not touch) enters the trigger, or it takes focus;
//   * closes `closeDelay` ms after the pointer leaves the trigger AND the card — moving from one to
//     the other keeps it open — and at once on blur or Escape;
//   * the card is portalled to <body> and placed with position:fixed (../lib/floating), so an
//     `overflow:hidden` ancestor cannot clip it;
//   * the trigger renders an <a> unless `asChild`, as Radix's does, and forwards its ref.
import * as React from 'react';
import { createPortal } from 'react-dom';
import { place, type Align, type Side } from '../lib/floating';
import { composeRefs, Slot } from './slot';
import { cn } from '../lib/utils';
import { useIsomorphicLayoutEffect } from '../lib/use-isomorphic-layout-effect';
import './ui.css';

interface HoverCardContextValue {
  open: boolean;
  openSoon: () => void;
  closeSoon: () => void;
  setOpen: (open: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
}

const HoverCardContext = /* @__PURE__ */ React.createContext<HoverCardContextValue | null>(null);

function useHoverCard(part: string): HoverCardContextValue {
  const context = React.useContext(HoverCardContext);
  if (!context) throw new Error(`${part} must be used within HoverCard`);
  return context;
}

export type HoverCardProps = {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  openDelay?: number;
  closeDelay?: number;
};

function HoverCard({
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  openDelay = 700,
  closeDelay = 300,
}: HoverCardProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const open = openProp !== undefined ? openProp : uncontrolled;
  const timer = React.useRef<number | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const clear = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const setOpen = React.useCallback(
    (next: boolean) => {
      clear();
      if (openProp === undefined) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [clear, onOpenChange, openProp],
  );

  const after = React.useCallback(
    (delay: number, next: boolean) => {
      clear();
      if (delay <= 0) setOpen(next);
      else timer.current = window.setTimeout(() => setOpen(next), delay);
    },
    [clear, setOpen],
  );

  const openSoon = React.useCallback(() => after(openDelay, true), [after, openDelay]);
  const closeSoon = React.useCallback(() => after(closeDelay, false), [after, closeDelay]);

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
    () => ({ closeSoon, open, openSoon, setOpen, triggerRef }),
    [closeSoon, open, openSoon, setOpen],
  );
  // Radix's root renders no element of its own, so neither does this one.
  return <HoverCardContext.Provider value={value}>{children}</HoverCardContext.Provider>;
}

export type HoverCardTriggerProps = React.ComponentPropsWithoutRef<'a'> & { asChild?: boolean };

const HoverCardTrigger = /* @__PURE__ */ React.forwardRef<HTMLAnchorElement, HoverCardTriggerProps>(function HoverCardTrigger(
  { asChild = false, onPointerEnter, onPointerLeave, onFocus, onBlur, ...props },
  forwardedRef,
) {
  const card = useHoverCard('HoverCardTrigger');
  const shared = {
    'data-slot': 'hover-card-trigger',
    'data-state': card.open ? 'open' : 'closed',
    onPointerEnter: (event: React.PointerEvent<HTMLAnchorElement>) => {
      onPointerEnter?.(event);
      if (!event.defaultPrevented && event.pointerType !== 'touch') card.openSoon();
    },
    onPointerLeave: (event: React.PointerEvent<HTMLAnchorElement>) => {
      onPointerLeave?.(event);
      if (!event.defaultPrevented && event.pointerType !== 'touch') card.closeSoon();
    },
    onFocus: (event: React.FocusEvent<HTMLAnchorElement>) => {
      onFocus?.(event);
      if (!event.defaultPrevented) card.openSoon();
    },
    onBlur: (event: React.FocusEvent<HTMLAnchorElement>) => {
      onBlur?.(event);
      card.setOpen(false);
    },
  };
  const ref = composeRefs<HTMLAnchorElement>(forwardedRef, card.triggerRef as React.MutableRefObject<HTMLAnchorElement | null>);
  if (asChild) {
    return <Slot {...(props as React.HTMLAttributes<HTMLElement>)} {...(shared as React.HTMLAttributes<HTMLElement>)} ref={ref as React.Ref<HTMLElement>} />;
  }
  return <a {...props} {...shared} ref={ref} />;
});

export type HoverCardContentProps = React.ComponentPropsWithoutRef<'div'> & {
  side?: Side;
  align?: Align;
  sideOffset?: number;
  forceMount?: boolean;
};

function HoverCardContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  style,
  onPointerEnter,
  onPointerLeave,
  forceMount: _forceMount,
  ...props
}: HoverCardContentProps) {
  const card = useHoverCard('HoverCardContent');
  const node = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number; side: Side } | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!card.open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const anchor = card.triggerRef.current;
      const panel = node.current;
      if (!anchor || !panel) return;
      setPosition(
        place(
          anchor.getBoundingClientRect(),
          { width: panel.offsetWidth, height: panel.offsetHeight },
          { side, align, sideOffset },
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
  }, [card.open, card.triggerRef, side, align, sideOffset]);

  if (!card.open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-slot="hover-card-content"
      data-state="open"
      data-side={position?.side ?? side}
      ref={node}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (event.pointerType !== 'touch') card.openSoon();
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        if (event.pointerType !== 'touch') card.closeSoon();
      }}
      className={cn(
        'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden ai-hover-card',
        className,
      )}
      style={{
        ...style,
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? undefined : 'hidden',
      }}
      {...props}
    />,
    document.body,
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
