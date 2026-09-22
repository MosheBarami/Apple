"use client";

// Adapted from AI Elements `packages/shadcn-ui/components/ui/dialog.tsx` at the pinned commit (see
// ../NOTICE). It is here because ./command.tsx's CommandDialog is built on it, and prompt-input
// re-exports the Command parts; the composer itself opens no dialog. The ten shadcn wrappers — names,
// props, `data-slot`s, the sr-only Close label and the inert Tailwind strings — are upstream's and
// still read `DialogPrimitive.<Part>`; `DialogPrimitive` is the local implementation below rather
// than Radix. What it keeps from Radix's Dialog:
//   * `role="dialog"` with `aria-modal`, named by its Title and described by its Description;
//   * focus moves into the dialog when it opens and back to what had it when it closes;
//   * Escape and a click on the overlay close it, and so does any Close;
//   * the content is portalled to <body>.
// What it does not do: trap Tab inside the dialog, or hide the page behind it from assistive
// technology (Radix's `hideOthers`).
import * as React from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '../icons';

import { cn } from '../lib/utils';
import { composeRefs, Slot } from './slot';
import './ui.css';

// ============================================================================
// The local primitive
// ============================================================================

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  contentId: string;
}

const DialogContext = /* @__PURE__ */ React.createContext<DialogContextValue | null>(null);

function useDialog(part: string): DialogContextValue {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error(`${part} must be used within Dialog`);
  return context;
}

type RootProps = {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  'data-slot'?: string;
};

function Root({ children, open: openProp, defaultOpen = false, onOpenChange }: RootProps) {
  const [inner, setInner] = React.useState(defaultOpen);
  const open = openProp !== undefined ? openProp : inner;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setInner(next);
      onOpenChange?.(next);
    },
    [onOpenChange, openProp],
  );
  const titleId = React.useId();
  const descriptionId = React.useId();
  const contentId = React.useId();
  const value = React.useMemo(() => ({ contentId, descriptionId, open, setOpen, titleId }), [contentId, descriptionId, open, setOpen, titleId]);
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

type ButtonishProps = React.ComponentPropsWithoutRef<'button'> & { asChild?: boolean };

const Trigger = /* @__PURE__ */ React.forwardRef<HTMLButtonElement, ButtonishProps>(function Trigger({ asChild = false, onClick, ...props }, ref) {
  const dialog = useDialog('DialogTrigger');
  const shared = {
    'aria-haspopup': 'dialog' as const,
    'aria-expanded': dialog.open,
    'aria-controls': dialog.open ? dialog.contentId : undefined,
    'data-state': dialog.open ? 'open' : 'closed',
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) dialog.setOpen(!dialog.open);
    },
  };
  if (asChild) return <Slot {...(props as React.HTMLAttributes<HTMLElement>)} {...(shared as React.HTMLAttributes<HTMLElement>)} ref={ref as React.Ref<HTMLElement>} />;
  return <button type="button" {...props} {...shared} ref={ref} />;
});

const Close = /* @__PURE__ */ React.forwardRef<HTMLButtonElement, ButtonishProps>(function Close({ asChild = false, onClick, ...props }, ref) {
  const dialog = useDialog('DialogClose');
  const shared = {
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) dialog.setOpen(false);
    },
  };
  if (asChild) return <Slot {...(props as React.HTMLAttributes<HTMLElement>)} {...(shared as React.HTMLAttributes<HTMLElement>)} ref={ref as React.Ref<HTMLElement>} />;
  return <button type="button" {...props} {...shared} ref={ref} />;
});

function Portal({ children }: { children?: React.ReactNode; container?: Element | null; forceMount?: boolean; 'data-slot'?: string }) {
  const dialog = useDialog('DialogPortal');
  if (!dialog.open) return null;
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(children, document.body);
}

const Overlay = /* @__PURE__ */ React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'> & { forceMount?: boolean }>(function Overlay(
  { onClick, forceMount: _forceMount, ...props },
  ref,
) {
  const dialog = useDialog('DialogOverlay');
  return (
    <div
      data-state={dialog.open ? 'open' : 'closed'}
      aria-hidden="true"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) dialog.setOpen(false);
      }}
      {...props}
      ref={ref}
    />
  );
});

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const Content = /* @__PURE__ */ React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & {
    forceMount?: boolean;
    onOpenAutoFocus?: (event: Event) => void;
    onCloseAutoFocus?: (event: Event) => void;
    onEscapeKeyDown?: (event: KeyboardEvent) => void;
    onPointerDownOutside?: (event: Event) => void;
    onInteractOutside?: (event: Event) => void;
  }
>(function Content(
  { onKeyDown, forceMount: _forceMount, onOpenAutoFocus: _onOpen, onCloseAutoFocus: _onClose, onEscapeKeyDown, onPointerDownOutside: _outside, onInteractOutside: _interact, ...props },
  forwardedRef,
) {
  const dialog = useDialog('DialogContent');
  const node = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = node.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      id={dialog.contentId}
      aria-labelledby={dialog.titleId}
      aria-describedby={dialog.descriptionId}
      data-state={dialog.open ? 'open' : 'closed'}
      tabIndex={-1}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== 'Escape') return;
        onEscapeKeyDown?.(event.nativeEvent);
        if (event.nativeEvent.defaultPrevented) return;
        event.preventDefault();
        dialog.setOpen(false);
      }}
      {...props}
      ref={composeRefs(forwardedRef, node)}
    />
  );
});

const Title = /* @__PURE__ */ React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<'h2'>>(function Title(props, ref) {
  const dialog = useDialog('DialogTitle');
  return <h2 id={dialog.titleId} {...props} ref={ref} />;
});

const Description = /* @__PURE__ */ React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<'p'>>(function Description(props, ref) {
  const dialog = useDialog('DialogDescription');
  return <p id={dialog.descriptionId} {...props} ref={ref} />;
});

const DialogPrimitive = { Close, Content, Description, Overlay, Portal, Root, Title, Trigger };

// ============================================================================
// The shadcn wrappers — upstream's, over the primitive above
// ============================================================================

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 ai-dialog__overlay',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg ai-dialog',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ai-dialog__close"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-2 text-center sm:text-left ai-dialog__header', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ai-dialog__footer', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('text-lg leading-none font-semibold ai-dialog__title', className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm ai-dialog__description', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
