"use client";

// The local stand-in for Radix's DropdownMenu primitive (`radix-ui`, DropdownMenu.*), which this app
// does not install. It is its own module, imported as a namespace by ./dropdown-menu.tsx exactly as
// upstream imports Radix (`DropdownMenu as DropdownMenuPrimitive`), so the shadcn wrappers there
// read as upstream's and a bundler can drop the parts nothing uses (sub-menus, today).
//
// What it keeps from Radix, and what it does not, is listed at the top of ./dropdown-menu.tsx and
// in ../NOTICE.
import * as React from 'react';
import { createPortal } from 'react-dom';

import { place, type Align, type Side } from '../lib/floating';
import { useIsomorphicLayoutEffect } from '../lib/use-isomorphic-layout-effect';
import { composeRefs, Slot } from './slot';


interface MenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Close the whole menu, sub-menus included, and put focus back on the trigger. */
  dismiss: () => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  triggerId: string;
  contentId: string;
  /** Where focus goes when the content mounts: the first item (keyboard) or the content (pointer). */
  focusFirst: React.MutableRefObject<boolean>;
  /** Every mounted content node, the root's and its sub-menus', so "outside" means outside all of them. */
  surfaces: React.MutableRefObject<Set<HTMLElement>>;
}

const MenuContext = /* @__PURE__ */ React.createContext<MenuContextValue | null>(null);

function useMenu(part: string): MenuContextValue {
  const context = React.useContext(MenuContext);
  if (!context) throw new Error(`${part} must be used within DropdownMenu`);
  return context;
}

interface SubContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  contentId: string;
  focusFirst: React.MutableRefObject<boolean>;
}

const SubContext = /* @__PURE__ */ React.createContext<SubContextValue | null>(null);

interface RadioGroupContextValue {
  value: string | undefined;
  onValueChange?: (value: string) => void;
}

const RadioGroupContext = /* @__PURE__ */ React.createContext<RadioGroupContextValue | null>(null);

type CheckedState = boolean | 'indeterminate';

const ItemIndicatorContext = /* @__PURE__ */ React.createContext<CheckedState>(false);

const ITEM = '[role="menuitem"]:not([data-disabled]),[role="menuitemcheckbox"]:not([data-disabled]),[role="menuitemradio"]:not([data-disabled])';

function useControllable<T>(prop: T | undefined, initial: T, onChange?: (value: T) => void) {
  const [inner, setInner] = React.useState(initial);
  const controlled = prop !== undefined;
  const value = controlled ? (prop as T) : inner;
  const set = React.useCallback(
    (next: T) => {
      if (!controlled) setInner(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );
  return [value, set] as const;
}

type RootProps = {
  children?: React.ReactNode;
  'data-slot'?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  dir?: 'ltr' | 'rtl';
};

function Root({ children, open: openProp, defaultOpen = false, onOpenChange }: RootProps) {
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const focusFirst = React.useRef(false);
  const surfaces = React.useRef(new Set<HTMLElement>());
  const triggerId = React.useId();
  const contentId = React.useId();
  const dismiss = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen]);
  const value = React.useMemo(
    () => ({ contentId, dismiss, focusFirst, open, setOpen, surfaces, triggerId, triggerRef }),
    [contentId, dismiss, open, setOpen, triggerId],
  );
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

function Portal({ children }: { children?: React.ReactNode; container?: Element | null; forceMount?: boolean; 'data-slot'?: string }) {
  // Without a DOM (a server render, the node tests) the content renders in place.
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(children, document.body);
}

type TriggerProps = React.ComponentPropsWithoutRef<'button'> & { asChild?: boolean };

const Trigger = /* @__PURE__ */ React.forwardRef<HTMLButtonElement, TriggerProps>(function Trigger(
  { asChild = false, disabled, onPointerDown, onKeyDown, onClick, ...props },
  forwardedRef,
) {
  const menu = useMenu('DropdownMenuTrigger');
  const pointerToggled = React.useRef(false);
  const shared = {
    id: menu.triggerId,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': menu.open,
    'aria-controls': menu.open ? menu.contentId : undefined,
    'data-state': menu.open ? 'open' : 'closed',
    'data-disabled': disabled ? '' : undefined,
    disabled,
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event);
      if (event.defaultPrevented || disabled) return;
      // The left button only, and never with Control held (a macOS right click).
      if (event.button === 0 && !event.ctrlKey) {
        pointerToggled.current = true;
        menu.focusFirst.current = false;
        const opening = !menu.open;
        menu.setOpen(opening);
        // Opening: keep focus off the trigger so the content can take it without a contest.
        if (opening) event.preventDefault();
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || disabled) return;
      if (event.key === 'Enter' || event.key === ' ') {
        menu.focusFirst.current = true;
        menu.setOpen(!menu.open);
      }
      if (event.key === 'ArrowDown') {
        menu.focusFirst.current = true;
        menu.setOpen(true);
      }
      // So the key neither scrolls the page nor reaches the first item and chooses it.
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') event.preventDefault();
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      // A click with no pointer-down before it — a screen reader's virtual click, `element.click()` —
      // must still work the control. A real pointer already toggled on its way down.
      if (!pointerToggled.current && !event.defaultPrevented && !disabled) {
        menu.focusFirst.current = true;
        menu.setOpen(!menu.open);
      }
      pointerToggled.current = false;
    },
  };
  const ref = composeRefs<HTMLButtonElement>(forwardedRef, menu.triggerRef as React.MutableRefObject<HTMLButtonElement | null>);
  if (asChild) {
    return <Slot {...(props as React.HTMLAttributes<HTMLElement>)} {...(shared as React.HTMLAttributes<HTMLElement>)} ref={ref as React.Ref<HTMLElement>} />;
  }
  return <button type="button" {...props} {...shared} ref={ref} />;
});

function moveFocus(event: React.KeyboardEvent<HTMLElement>, node: HTMLElement | null): boolean {
  const items = Array.from(node?.querySelectorAll<HTMLElement>(ITEM) ?? []).filter(
    // Only this surface's own items: a sub-menu is portalled elsewhere and has its own list.
    (item) => item.closest('[role="menu"]') === node,
  );
  if (!items.length) return false;
  const index = items.indexOf(document.activeElement as HTMLElement);
  const to =
    event.key === 'ArrowDown' ? (index < 0 ? 0 : index + 1)
    : event.key === 'ArrowUp' ? (index < 0 ? items.length - 1 : index - 1)
    : event.key === 'Home' ? 0
    : event.key === 'End' ? items.length - 1
    : null;
  if (to === null) return false;
  event.preventDefault();
  items[Math.max(0, Math.min(items.length - 1, to))]?.focus();
  return true;
}

type ContentProps = React.ComponentPropsWithoutRef<'div'> & {
  side?: Side;
  align?: Align;
  sideOffset?: number;
  alignOffset?: number;
  loop?: boolean;
  forceMount?: boolean;
  avoidCollisions?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
};

/** Shared by the root content and a sub-menu's: placement, the outside rule and focus on mount. */
function useSurface(
  open: boolean,
  anchorRef: React.MutableRefObject<HTMLElement | null>,
  node: React.MutableRefObject<HTMLDivElement | null>,
  placement: { side: Side; align: Align; sideOffset: number },
  focusFirst: React.MutableRefObject<boolean>,
  surfaces: React.MutableRefObject<Set<HTMLElement>>,
) {
  const [position, setPosition] = React.useState<{ top: number; left: number; side: Side; room: number } | null>(null);
  const { side, align, sideOffset } = placement;

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const panel = node.current;
    if (panel) surfaces.current.add(panel);
    const update = () => {
      const anchor = anchorRef.current;
      const el = node.current;
      if (!anchor || !el) return;
      const rect = anchor.getBoundingClientRect();
      const view = { width: window.innerWidth, height: window.innerHeight };
      const placed = place(rect, { width: el.offsetWidth, height: el.offsetHeight }, { side, align, sideOffset }, view);
      // The room on the side it landed on, so a long menu scrolls instead of leaving the screen.
      const room =
        placed.side === 'top' ? rect.top - sideOffset - 8
        : placed.side === 'bottom' ? view.height - rect.bottom - sideOffset - 8
        : view.height - 16;
      setPosition({ ...placed, room });
    };
    update();
    if (panel) {
      const first = focusFirst.current ? panel.querySelector<HTMLElement>(ITEM) : null;
      (first ?? panel).focus({ preventScroll: true });
    }
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      if (panel) surfaces.current.delete(panel);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, side, align, sideOffset]);

  return position;
}

const Content = /* @__PURE__ */ React.forwardRef<HTMLDivElement, ContentProps>(function Content(
  {
    className,
    style,
    side = 'bottom',
    align = 'center',
    sideOffset = 0,
    alignOffset: _alignOffset,
    loop: _loop,
    forceMount: _forceMount,
    avoidCollisions: _avoidCollisions,
    onCloseAutoFocus: _onCloseAutoFocus,
    onEscapeKeyDown,
    onKeyDown,
    children,
    ...props
  },
  forwardedRef,
) {
  const menu = useMenu('DropdownMenuContent');
  const node = React.useRef<HTMLDivElement | null>(null);
  const position = useSurface(menu.open, menu.triggerRef, node, { side, align, sideOffset }, menu.focusFirst, menu.surfaces);
  const { open, setOpen, triggerRef, surfaces } = menu;

  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      for (const surface of surfaces.current) if (surface.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, setOpen, triggerRef, surfaces]);

  if (!menu.open) return null;

  const labelled = props['aria-label'] || props['aria-labelledby'];
  return (
    <div
      data-state="open"
      data-side={position?.side ?? side}
      role="menu"
      aria-orientation="vertical"
      aria-labelledby={labelled ? undefined : menu.triggerId}
      id={menu.contentId}
      tabIndex={-1}
      ref={composeRefs(forwardedRef, node)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        // Keys from a sub-menu bubble here through React even though its DOM is elsewhere.
        if (event.defaultPrevented || !node.current?.contains(event.target as Node)) return;
        if (moveFocus(event, node.current)) return;
        if (event.key === 'Escape') {
          onEscapeKeyDown?.(event.nativeEvent);
          if (event.nativeEvent.defaultPrevented) return;
          event.preventDefault();
          menu.dismiss();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          menu.dismiss();
        }
      }}
      className={className}
      style={{
        ...style,
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        maxHeight: position ? Math.max(120, position.room) : undefined,
        // Measured before it is shown, so the first paint is already in place.
        // Opacity, not visibility: a hidden element cannot take the focus it is given on mount.
        opacity: position || typeof document === 'undefined' ? undefined : 0,
      }}
      {...props}
    >
      {children}
    </div>
  );
});

function Group(props: React.ComponentPropsWithoutRef<'div'>) {
  return <div role="group" {...props} />;
}

function Label(props: React.ComponentPropsWithoutRef<'div'> & { asChild?: boolean }) {
  const { asChild: _asChild, ...rest } = props;
  return <div {...rest} />;
}

type ItemBaseProps = Omit<React.ComponentPropsWithoutRef<'div'>, 'onSelect'> & {
  disabled?: boolean;
  onSelect?: (event: Event) => void;
  textValue?: string;
  asChild?: boolean;
};

type ItemInternals = {
  role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio';
  checked?: CheckedState;
  /** Runs after onSelect when it was not prevented, before the menu closes. */
  onActivate?: () => void;
  /** Sub-menu triggers open instead of choosing. */
  opensSub?: boolean;
};

const ItemBase = /* @__PURE__ */ React.forwardRef<HTMLDivElement, ItemBaseProps & { internals: ItemInternals }>(function ItemBase(
  { disabled = false, onSelect, textValue: _textValue, asChild = false, internals, onClick, onKeyDown, onPointerMove, onPointerLeave, onFocus, onBlur, children, ...props },
  forwardedRef,
) {
  const menu = useMenu('DropdownMenuItem');
  const [highlighted, setHighlighted] = React.useState(false);
  const node = React.useRef<HTMLDivElement | null>(null);

  const activate = () => {
    if (disabled) return;
    const event = new CustomEvent('menu.itemSelect', { bubbles: true, cancelable: true });
    onSelect?.(event);
    if (event.defaultPrevented) return;
    internals.onActivate?.();
    if (!internals.opensSub) menu.dismiss();
  };

  const itemProps = {
    role: internals.role,
    tabIndex: disabled ? undefined : -1,
    // A caller's own aria-disabled survives: a row can say it cannot be had and still be reachable
    // and clickable, which is how the composer's MAX row explains itself. `disabled` is the hard one.
    'aria-disabled': disabled || props['aria-disabled'] || undefined,
    'aria-checked': internals.checked === undefined ? undefined : internals.checked === 'indeterminate' ? ('mixed' as const) : internals.checked,
    'data-state': internals.checked === undefined ? undefined : internals.checked === true ? 'checked' : internals.checked === 'indeterminate' ? 'indeterminate' : 'unchecked',
    'data-disabled': disabled ? '' : undefined,
    'data-highlighted': highlighted ? '' : undefined,
    onClick: (event: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) activate();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerMove?.(event);
      if (!event.defaultPrevented && !disabled && event.pointerType === 'mouse' && document.activeElement !== node.current) {
        node.current?.focus({ preventScroll: true });
      }
    },
    onPointerLeave: (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerLeave?.(event);
      // Leaving an item un-highlights it; focus goes to the surface it sits on.
      if (!event.defaultPrevented && event.pointerType === 'mouse' && document.activeElement === node.current) {
        (node.current?.closest('[role="menu"]') as HTMLElement | null)?.focus({ preventScroll: true });
      }
    },
    onFocus: (event: React.FocusEvent<HTMLDivElement>) => {
      onFocus?.(event);
      setHighlighted(true);
    },
    onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
      onBlur?.(event);
      setHighlighted(false);
    },
  };

  const ref = composeRefs(forwardedRef, node);
  const content = <ItemIndicatorContext.Provider value={internals.checked ?? false}>{children}</ItemIndicatorContext.Provider>;
  if (asChild) {
    return (
      <Slot {...(props as React.HTMLAttributes<HTMLElement>)} {...(itemProps as React.HTMLAttributes<HTMLElement>)} ref={ref as React.Ref<HTMLElement>}>
        {children as React.ReactElement}
      </Slot>
    );
  }
  return (
    <div {...props} {...itemProps} ref={ref}>
      {content}
    </div>
  );
});

const Item = /* @__PURE__ */ React.forwardRef<HTMLDivElement, ItemBaseProps>(function Item(props, ref) {
  return <ItemBase {...props} ref={ref} internals={{ role: 'menuitem' }} />;
});

type CheckboxItemProps = ItemBaseProps & {
  checked?: CheckedState;
  onCheckedChange?: (checked: boolean) => void;
};

const CheckboxItem = /* @__PURE__ */ React.forwardRef<HTMLDivElement, CheckboxItemProps>(function CheckboxItem(
  { checked = false, onCheckedChange, ...props },
  ref,
) {
  return (
    <ItemBase
      {...props}
      ref={ref}
      internals={{
        role: 'menuitemcheckbox',
        checked,
        onActivate: () => onCheckedChange?.(checked === 'indeterminate' ? true : !checked),
      }}
    />
  );
});

function RadioGroup({
  value,
  onValueChange,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & { value?: string; onValueChange?: (value: string) => void }) {
  const context = React.useMemo(() => ({ onValueChange, value }), [onValueChange, value]);
  return (
    <RadioGroupContext.Provider value={context}>
      <div role="group" {...props} />
    </RadioGroupContext.Provider>
  );
}

const RadioItem = /* @__PURE__ */ React.forwardRef<HTMLDivElement, ItemBaseProps & { value: string }>(function RadioItem(
  { value, ...props },
  ref,
) {
  const group = React.useContext(RadioGroupContext);
  return (
    <ItemBase
      {...props}
      ref={ref}
      internals={{
        role: 'menuitemradio',
        checked: group?.value === value,
        onActivate: () => group?.onValueChange?.(value),
      }}
    />
  );
});

function ItemIndicator({ forceMount, children, ...props }: React.ComponentPropsWithoutRef<'span'> & { forceMount?: boolean }) {
  const checked = React.useContext(ItemIndicatorContext);
  if (!checked && !forceMount) return null;
  return (
    <span data-state={checked === true ? 'checked' : checked === 'indeterminate' ? 'indeterminate' : 'unchecked'} {...props}>
      {children}
    </span>
  );
}

function Separator(props: React.ComponentPropsWithoutRef<'div'>) {
  return <div role="separator" aria-orientation="horizontal" {...props} />;
}

function Sub({ children, open: openProp, defaultOpen = false, onOpenChange }: { children?: React.ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; 'data-slot'?: string }) {
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const focusFirst = React.useRef(false);
  const contentId = React.useId();
  const value = React.useMemo(() => ({ contentId, focusFirst, open, setOpen, triggerRef }), [contentId, open, setOpen]);
  return <SubContext.Provider value={value}>{children}</SubContext.Provider>;
}

const SubTrigger = /* @__PURE__ */ React.forwardRef<HTMLDivElement, ItemBaseProps>(function SubTrigger({ onKeyDown, onPointerMove, ...props }, ref) {
  const sub = React.useContext(SubContext);
  if (!sub) throw new Error('DropdownMenuSubTrigger must be used within DropdownMenuSub');
  return (
    <ItemBase
      {...props}
      ref={composeRefs(ref, sub.triggerRef as React.MutableRefObject<HTMLDivElement | null>)}
      aria-haspopup="menu"
      aria-expanded={sub.open}
      aria-controls={sub.open ? sub.contentId : undefined}
      data-state={sub.open ? 'open' : 'closed'}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          sub.focusFirst.current = true;
          sub.setOpen(true);
        }
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (!event.defaultPrevented && event.pointerType === 'mouse' && !sub.open) {
          sub.focusFirst.current = false;
          sub.setOpen(true);
        }
      }}
      internals={{
        role: 'menuitem',
        opensSub: true,
        onActivate: () => {
          sub.focusFirst.current = true;
          sub.setOpen(true);
        },
      }}
    />
  );
});

const SubContent = /* @__PURE__ */ React.forwardRef<HTMLDivElement, ContentProps>(function SubContent(
  { className, style, sideOffset = 0, onKeyDown, children, side: _side, align: _align, alignOffset: _alignOffset, loop: _loop, forceMount: _forceMount, avoidCollisions: _avoid, onCloseAutoFocus: _onClose, onEscapeKeyDown: _onEscape, ...props },
  forwardedRef,
) {
  const menu = useMenu('DropdownMenuSubContent');
  const sub = React.useContext(SubContext);
  if (!sub) throw new Error('DropdownMenuSubContent must be used within DropdownMenuSub');
  const node = React.useRef<HTMLDivElement | null>(null);
  const position = useSurface(sub.open, sub.triggerRef, node, { side: 'right', align: 'start', sideOffset }, sub.focusFirst, menu.surfaces);
  if (!sub.open || !menu.open) return null;
  return (
    <Portal>
      <div
        data-state="open"
        data-side={position?.side ?? 'right'}
        role="menu"
        aria-orientation="vertical"
        id={sub.contentId}
        tabIndex={-1}
        ref={composeRefs(forwardedRef, node)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (moveFocus(event, node.current)) {
            event.stopPropagation();
            return;
          }
          if (event.key === 'ArrowLeft' || event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            sub.setOpen(false);
            sub.triggerRef.current?.focus();
          }
        }}
        className={className}
        style={{
          ...style,
          position: 'fixed',
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          // Opacity, not visibility: a hidden element cannot take the focus it is given on mount.
        opacity: position || typeof document === 'undefined' ? undefined : 0,
        }}
        {...props}
      >
        {children}
      </div>
    </Portal>
  );
});



export { CheckboxItem, Content, Group, Item, ItemIndicator, Label, Portal, RadioGroup, RadioItem, Root, Separator, Sub, SubContent, SubTrigger, Trigger };
