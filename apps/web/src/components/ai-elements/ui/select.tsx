"use client";

// Adapted from AI Elements `packages/shadcn-ui/components/ui/select.tsx` at the pinned commit (see
// ../NOTICE). The ten exports and their inert Tailwind strings are upstream's; Radix `Select.*` is
// replaced by the implementation below and lucide icons by ../icons.
//
// What it keeps from Radix, because the wrappers depend on it:
//   * a trigger with `role="combobox"`, `aria-expanded` and the chosen item's text (or the
//     placeholder, marked `data-placeholder`);
//   * a `role="listbox"` of `role="option"` items, portalled to <body> and placed with
//     position:fixed so an `overflow:hidden` ancestor (a code block header) cannot clip it;
//   * keyboard: Enter / Space / ArrowDown open it; arrows, Home and End move; Enter or Space
//     choose; Escape or Tab close and hand focus back to the trigger;
//   * a pointer-down outside closes it.
// What it does not do: typeahead and the scroll buttons (they render nothing — the list scrolls
// natively).
import * as React from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronDownIcon } from '../icons';
import { place, type Align, type Side } from '../lib/floating';
import { composeRefs } from './slot';
import { cn } from '../lib/utils';
import { useIsomorphicLayoutEffect } from '../lib/use-isomorphic-layout-effect';
import './ui.css';

interface SelectContextValue {
  value: string | undefined;
  choose: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled: boolean;
  contentId: string;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
  labels: React.MutableRefObject<Map<string, React.ReactNode>>;
  labelsChanged: () => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelect(part: string): SelectContextValue {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error(`${part} must be used within Select`);
  return context;
}

export type SelectProps = {
  children?: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  name?: string;
  required?: boolean;
  dir?: 'ltr' | 'rtl';
};

function Select({
  children,
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  name,
  required,
}: SelectProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const [, setVersion] = React.useState(0);
  const value = valueProp !== undefined ? valueProp : uncontrolledValue;
  const open = openProp !== undefined ? openProp : uncontrolledOpen;
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const labels = React.useRef(new Map<string, React.ReactNode>());
  const contentId = React.useId();

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (disabled && next) return;
      if (openProp === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [disabled, onOpenChange, openProp],
  );

  const choose = React.useCallback(
    (next: string) => {
      if (valueProp === undefined) setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [onValueChange, valueProp],
  );

  const labelsChanged = React.useCallback(() => setVersion((v) => v + 1), []);

  const context = React.useMemo(
    () => ({ choose, contentId, disabled, labels, labelsChanged, open, setOpen, triggerRef, value }),
    [choose, contentId, disabled, labelsChanged, open, setOpen, value],
  );

  return (
    <SelectContext.Provider value={context}>
      {children}
      {name ? <input type="hidden" name={name} value={value ?? ''} required={required} /> : null}
    </SelectContext.Provider>
  );
}

function SelectGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="select-group" role="group" className={className} {...props} />;
}

function SelectValue({
  placeholder,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'span'>, 'children'> & { placeholder?: React.ReactNode; children?: React.ReactNode }) {
  const select = useSelect('SelectValue');
  const chosen = select.value !== undefined ? select.labels.current.get(select.value) : undefined;
  return (
    <span data-slot="select-value" className={cn('ai-select__value', className)} {...props}>
      {children ?? chosen ?? placeholder}
    </span>
  );
}

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'> & {
    size?: 'sm' | 'default';
  }
>(function SelectTrigger({ className, size = 'default', children, onClick, onKeyDown, disabled, ...props }, ref) {
  const select = useSelect('SelectTrigger');
  const isDisabled = select.disabled || Boolean(disabled);
  return (
    <button
      type="button"
      role="combobox"
      aria-controls={select.open ? select.contentId : undefined}
      aria-expanded={select.open}
      aria-haspopup="listbox"
      data-slot="select-trigger"
      data-size={size}
      data-state={select.open ? 'open' : 'closed'}
      data-placeholder={select.value === undefined ? '' : undefined}
      disabled={isDisabled}
      ref={composeRefs(ref, select.triggerRef)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) select.setOpen(!select.open);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
          event.preventDefault();
          select.setOpen(true);
        }
      }}
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ai-select__trigger",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="size-4 opacity-50 ai-select__icon" />
    </button>
  );
});

const OPTION = '[role="option"]:not([data-disabled])';

function SelectContent({
  className,
  children,
  position = 'popper',
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  style,
  onKeyDown,
  ...props
}: React.ComponentProps<'div'> & {
  position?: 'popper' | 'item-aligned';
  align?: Align;
  side?: Side;
  sideOffset?: number;
}) {
  const select = useSelect('SelectContent');
  const node = React.useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = React.useState<{ top: number; left: number; side: Side } | null>(null);
  const { open, setOpen, triggerRef } = select;

  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const update = () => {
      const anchor = triggerRef.current;
      const panel = node.current;
      if (!anchor || !panel) return;
      setPlacement(
        place(
          anchor.getBoundingClientRect(),
          { width: panel.offsetWidth, height: panel.offsetHeight },
          { side, align, sideOffset },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };
    update();
    const panel = node.current;
    const selected = panel?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    (selected ?? panel?.querySelector<HTMLElement>(OPTION))?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (node.current?.contains(target) || triggerRef.current?.contains(target))) return;
      setOpen(false);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('pointerdown', outside, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('pointerdown', outside, true);
    };
  }, [open, setOpen, triggerRef, side, align, sideOffset]);

  const onListKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const items = Array.from(node.current?.querySelectorAll<HTMLElement>(OPTION) ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, to))]?.focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(items.length - 1);
    else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
    }
  };

  const list = (
    <div
      data-slot="select-content"
      data-state={open ? 'open' : 'closed'}
      data-side={placement?.side ?? side}
      role="listbox"
      id={select.contentId}
      ref={node}
      hidden={!open}
      onKeyDown={onListKey}
      className={cn(
        'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md ai-select__content',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className,
      )}
      style={
        open
          ? {
              ...style,
              position: 'fixed',
              top: placement?.top ?? 0,
              left: placement?.left ?? 0,
              minWidth: triggerRef.current?.offsetWidth,
              visibility: placement ? undefined : 'hidden',
            }
          : style
      }
      {...props}
    >
      <SelectScrollUpButton />
      <div
        className={cn(
          'p-1 ai-select__viewport',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1',
        )}
      >
        {children}
      </div>
      <SelectScrollDownButton />
    </div>
  );

  // Closed, the list still renders — hidden and in place — so each item can tell the trigger what
  // its label is. Open, it moves to <body> so nothing above it can clip it.
  if (!open || typeof document === 'undefined') return list;
  return createPortal(list, document.body);
}

function SelectLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="select-label"
      className={cn('text-muted-foreground px-2 py-1.5 text-xs ai-select__label', className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  value,
  disabled = false,
  onClick,
  onKeyDown,
  ...props
}: React.ComponentProps<'div'> & { value: string; disabled?: boolean; textValue?: string }) {
  const select = useSelect('SelectItem');
  const selected = select.value === value;
  const { labels, labelsChanged } = select;

  useIsomorphicLayoutEffect(() => {
    const known = labels.current.has(value);
    labels.current.set(value, children);
    if (!known) labelsChanged();
  }, [children, labels, labelsChanged, value]);

  React.useEffect(
    () => () => {
      labels.current.delete(value);
    },
    [labels, value],
  );

  const pick = () => {
    if (disabled) return;
    select.choose(value);
    select.setOpen(false);
    select.triggerRef.current?.focus();
  };

  return (
    <div
      data-slot="select-item"
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      data-state={selected ? 'checked' : 'unchecked'}
      data-disabled={disabled ? '' : undefined}
      tabIndex={disabled ? undefined : -1}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) pick();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pick();
        }
      }}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 ai-select__item",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center ai-select__indicator">
        {selected ? <CheckIcon className="size-4" /> : null}
      </span>
      <span className="ai-select__item-text">{children}</span>
    </div>
  );
}

function SelectSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="select-separator"
      role="none"
      className={cn('bg-border pointer-events-none -mx-1 my-1 h-px ai-select__separator', className)}
      {...props}
    />
  );
}

// The list scrolls natively (see the note at the top), so there is nothing for these to do. They
// are kept, empty, so the upstream exports and the markup that places them stay the same.
function SelectScrollUpButton(_props: React.ComponentProps<'div'>) {
  return null;
}

function SelectScrollDownButton(_props: React.ComponentProps<'div'>) {
  return null;
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
