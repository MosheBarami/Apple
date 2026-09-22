"use client";

// Adapted from AI Elements `packages/shadcn-ui/components/ui/collapsible.tsx` at the pinned commit
// (see ../NOTICE). The three exports are upstream's; Radix `Collapsible.*` is replaced by the small
// React 18 implementation that used to live in ../reasoning-compat.tsx (which now re-exports this).
//
// ONE CHANGE FROM THAT EARLIER COPY, AND IT IS A FIX. The trigger always carried
// `aria-controls={contentId}`, but the content only exists in the DOM while it is mounted — and
// the workspace's Thinking card never mounts one — so assistive technology was pointed at an id
// that was not there. The trigger now names the content only while a CollapsibleContent is mounted,
// and it names the id that content actually carries.
//
// A CALLER'S `aria-controls` AND `id` WIN, as they do in Radix: its CollapsibleTrigger spreads the
// caller's props after its own `aria-controls`, and its CollapsibleContent spreads them after its
// own `id` (radix-ui/primitives, packages/react/collapsible/src/collapsible.tsx). AI Elements relies
// on that: ChainOfThoughtHeader and ChainOfThoughtContent each wrap their own Collapsible, so the
// only way their trigger can name their content is for the caller to pass both.
import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '../lib/utils';
import { useIsomorphicLayoutEffect } from '../lib/use-isomorphic-layout-effect';
import './ui.css';

interface CollapsibleContextValue {
  open: boolean;
  disabled: boolean;
  contentId: string;
  /** The id of the CollapsibleContent that is in the DOM right now, or null while none is. */
  mountedContentId: string | null;
  setMountedContentId: (id: string | null) => void;
  setOpen: (open: boolean) => void;
}

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

function useCollapsible() {
  const context = useContext(CollapsibleContext);
  if (!context) {
    throw new Error('Collapsible components must be used within Collapsible');
  }
  return context;
}

export type CollapsibleProps = Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  asChild?: boolean;
};

export function Collapsible({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  asChild = false,
  className,
  children,
  ...props
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [mountedContentId, setMountedContentId] = useState<string | null>(null);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const contentId = useId();

  const setOpen = useCallback(
    (next: boolean) => {
      if (disabled || next === open) return;
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, disabled, onOpenChange, open],
  );

  const shared = {
    'data-slot': 'collapsible',
    ...props,
    className,
    'data-state': open ? 'open' : 'closed',
    'data-disabled': disabled ? '' : undefined,
  };

  let root: ReactNode;
  if (asChild) {
    const child = Children.only(children);
    if (!isValidElement(child)) throw new Error('Collapsible asChild expects one React element');
    root = cloneElement(child as ReactElement<HTMLAttributes<HTMLElement>>, {
      ...shared,
      ...child.props,
      className: cn(className, (child.props as HTMLAttributes<HTMLElement>).className),
    });
  } else {
    root = <div {...shared}>{children}</div>;
  }

  return (
    <CollapsibleContext.Provider value={{ contentId, disabled, mountedContentId, open, setMountedContentId, setOpen }}>
      {root}
    </CollapsibleContext.Provider>
  );
}

export type CollapsibleTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
};

export const CollapsibleTrigger = forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(function CollapsibleTrigger(
  { asChild = false, children, className, disabled: triggerDisabled, onClick, type, 'aria-controls': controls, ...props },
  ref,
) {
  const context = useCollapsible();
  const disabled = context.disabled || Boolean(triggerDisabled);
  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] = (event) => {
    onClick?.(event);
    if (event.defaultPrevented || disabled) return;
    context.setOpen(!context.open);
  };

  const shared = {
    'data-slot': 'collapsible-trigger',
    ...props,
    'aria-controls': controls ?? context.mountedContentId ?? undefined,
    'aria-expanded': context.open,
    'data-state': context.open ? 'open' : 'closed',
    'data-disabled': disabled ? '' : undefined,
    className,
    onClick: handleClick,
  };

  if (asChild) {
    const child = Children.only(children);
    if (!isValidElement(child)) throw new Error('CollapsibleTrigger asChild expects one React element');
    const childProps = child.props as HTMLAttributes<HTMLElement>;
    return cloneElement(child as ReactElement<HTMLAttributes<HTMLElement>>, {
      ...shared,
      ...childProps,
      className: cn(className, childProps.className),
      onClick: (event) => {
        childProps.onClick?.(event);
        if (!event.defaultPrevented) handleClick(event as never);
      },
      'aria-disabled': disabled || undefined,
    });
  }

  return (
    <button {...shared} ref={ref} disabled={disabled} type={type ?? 'button'}>
      {children}
    </button>
  );
});

export type CollapsibleContentProps = ComponentPropsWithoutRef<'div'> & {
  forceMount?: boolean;
  asChild?: boolean;
};

export function CollapsibleContent({
  forceMount = false,
  asChild = false,
  children,
  className,
  id: idProp,
  ...props
}: CollapsibleContentProps) {
  const context = useCollapsible();
  const mounted = forceMount || context.open;
  const id = idProp ?? context.contentId;
  const { setMountedContentId } = context;

  useIsomorphicLayoutEffect(() => {
    if (!mounted) return;
    setMountedContentId(id);
    return () => setMountedContentId(null);
  }, [id, mounted, setMountedContentId]);

  if (!mounted) return null;

  const shared = {
    'data-slot': 'collapsible-content',
    ...props,
    id,
    'data-state': context.open ? 'open' : 'closed',
    'data-disabled': context.disabled ? '' : undefined,
    className,
    hidden: !context.open,
  };

  if (asChild) {
    const child = Children.only(children);
    if (!isValidElement(child)) throw new Error('CollapsibleContent asChild expects one React element');
    const childProps = child.props as HTMLAttributes<HTMLElement>;
    return cloneElement(child as ReactElement<HTMLAttributes<HTMLElement>>, {
      ...shared,
      ...childProps,
      className: cn(className, childProps.className),
    });
  }

  return <div {...shared}>{children}</div>;
}
