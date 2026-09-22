"use client";

// Local stand-in for `cmdk`'s `Command` and the parts shadcn's ui/command.tsx uses from it
// (Command.Input, .List, .Empty, .Group, .Item, .Separator). This app installs no cmdk, and
// prompt-input re-exports these as PromptInputCommand*; the composer itself uses none of them.
//
// Kept from cmdk:
//   * the input filters the items as it is typed into, and Empty shows only when none is left;
//   * a group with no visible item hides, heading and all;
//   * ArrowUp/ArrowDown (and Home/End) move the selection among visible, enabled items, and Enter
//     runs the selected item's `onSelect(value)`; a click does the same;
//   * the ARIA shape: the input is a combobox naming the list and the active option, the list is a
//     listbox, each item an option with `aria-selected` and `data-selected`, and the `cmdk-*`
//     attributes shadcn's class strings select on.
// Not kept: cmdk's fuzzy command-score ranking (a case-insensitive substring match against the
// item's value and keywords decides visibility, and items keep their order), `loop`, `vimBindings`
// and Command.Dialog (shadcn's CommandDialog is built on ./ui/dialog instead).
import * as React from 'react';

interface Entry {
  value: string;
  keywords: string[];
  disabled: boolean;
  groupId: string | null;
}

interface CommandContextValue {
  search: string;
  setSearch: (search: string) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  register: (id: string, entry: Entry) => void;
  unregister: (id: string) => void;
  matches: (entry: Pick<Entry, 'value' | 'keywords'>) => boolean;
  visibleCount: number;
  visibleGroups: Set<string>;
  listId: string;
  shouldFilter: boolean;
  onSelectRef: React.MutableRefObject<Map<string, () => void>>;
  order: React.MutableRefObject<string[]>;
}

const CommandContext = /* @__PURE__ */ React.createContext<CommandContextValue | null>(null);
const GroupContext = /* @__PURE__ */ React.createContext<string | null>(null);

function useCommand(part: string): CommandContextValue {
  const context = React.useContext(CommandContext);
  if (!context) throw new Error(`${part} must be used within Command`);
  return context;
}

const itemDomId = (listId: string, id: string) => `${listId}-${id.replace(/[^\w-]/g, '')}`;

type CommandRootProps = Omit<React.ComponentPropsWithoutRef<'div'>, 'onChange'> & {
  label?: string;
  shouldFilter?: boolean;
  filter?: (value: string, search: string, keywords?: string[]) => number;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  loop?: boolean;
  vimBindings?: boolean;
};

const CommandRoot = /* @__PURE__ */ React.forwardRef<HTMLDivElement, CommandRootProps>(function Command(
  { label, shouldFilter = true, filter, value: _value, defaultValue: _defaultValue, onValueChange: _onValueChange, loop: _loop, vimBindings: _vim, onKeyDown, children, ...props },
  ref,
) {
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState(() => new Map<string, Entry>());
  const onSelectRef = React.useRef(new Map<string, () => void>());
  const order = React.useRef<string[]>([]);
  const listId = React.useId();

  const matches = React.useCallback(
    (entry: Pick<Entry, 'value' | 'keywords'>) => {
      if (!shouldFilter || !search) return true;
      if (filter) return filter(entry.value, search, entry.keywords) > 0;
      const needle = search.toLowerCase();
      return [entry.value, ...entry.keywords].some((text) => text.toLowerCase().includes(needle));
    },
    [filter, search, shouldFilter],
  );

  const register = React.useCallback((id: string, entry: Entry) => {
    setEntries((prev) => {
      const known = prev.get(id);
      if (known && known.value === entry.value && known.disabled === entry.disabled && known.groupId === entry.groupId && known.keywords.join() === entry.keywords.join()) return prev;
      const next = new Map(prev);
      next.set(id, entry);
      return next;
    });
    if (!order.current.includes(id)) order.current.push(id);
  }, []);

  const unregister = React.useCallback((id: string) => {
    setEntries((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    order.current = order.current.filter((known) => known !== id);
  }, []);

  const visible = order.current.filter((id) => {
    const entry = entries.get(id);
    return entry ? matches(entry) : false;
  });
  const visibleGroups = new Set(visible.map((id) => entries.get(id)?.groupId).filter((g): g is string => Boolean(g)));
  const enabled = visible.filter((id) => !entries.get(id)?.disabled);

  // The selection follows the filter: the first enabled visible item, unless the current one survives.
  React.useEffect(() => {
    if (selected && enabled.includes(selected)) return;
    setSelected(enabled[0] ?? null);
  });

  const context = React.useMemo(
    () => ({
      listId,
      matches,
      onSelectRef,
      order,
      register,
      search,
      selected,
      setSearch,
      setSelected,
      shouldFilter,
      unregister,
      visibleCount: visible.length,
      visibleGroups,
    }),
    [listId, matches, register, search, selected, shouldFilter, unregister, visible.length, [...visibleGroups].join()],
  );

  return (
    <CommandContext.Provider value={context}>
      <div
        cmdk-root=""
        aria-label={label}
        ref={ref}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || !enabled.length) return;
          const at = selected ? enabled.indexOf(selected) : -1;
          const go = (to: number) => {
            event.preventDefault();
            const id = enabled[Math.max(0, Math.min(enabled.length - 1, to))];
            if (id === undefined) return;
            setSelected(id);
            document.getElementById(itemDomId(listId, id))?.scrollIntoView?.({ block: 'nearest' });
          };
          if (event.key === 'ArrowDown') go(at + 1);
          else if (event.key === 'ArrowUp') go(at - 1);
          else if (event.key === 'Home') go(0);
          else if (event.key === 'End') go(enabled.length - 1);
          else if (event.key === 'Enter' && selected && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSelectRef.current.get(selected)?.();
          }
        }}
        {...props}
      >
        {children}
      </div>
    </CommandContext.Provider>
  );
});

type CommandInputProps = Omit<React.ComponentPropsWithoutRef<'input'>, 'value' | 'onChange' | 'type'> & {
  value?: string;
  onValueChange?: (search: string) => void;
};

const CommandInput = /* @__PURE__ */ React.forwardRef<HTMLInputElement, CommandInputProps>(function CommandInput(
  { value, onValueChange, ...props },
  ref,
) {
  const command = useCommand('CommandInput');
  const search = value ?? command.search;
  return (
    <input
      cmdk-input=""
      ref={ref}
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={true}
      aria-controls={command.listId}
      aria-activedescendant={command.selected ? itemDomId(command.listId, command.selected) : undefined}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      value={search}
      onChange={(event) => {
        command.setSearch(event.target.value);
        onValueChange?.(event.target.value);
      }}
      {...props}
    />
  );
});

const CommandList = /* @__PURE__ */ React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'> & { label?: string }>(function CommandList(
  { label, children, ...props },
  ref,
) {
  const command = useCommand('CommandList');
  return (
    <div cmdk-list="" role="listbox" aria-label={label} id={command.listId} ref={ref} {...props}>
      <div cmdk-list-sizer="">{children}</div>
    </div>
  );
});

const CommandEmpty = /* @__PURE__ */ React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(function CommandEmpty(props, ref) {
  const command = useCommand('CommandEmpty');
  if (command.visibleCount > 0) return null;
  return <div cmdk-empty="" role="presentation" ref={ref} {...props} />;
});

const CommandGroup = /* @__PURE__ */ React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentPropsWithoutRef<'div'>, 'value'> & { heading?: React.ReactNode; value?: string; forceMount?: boolean }
>(function CommandGroup({ heading, value: _value, forceMount = false, children, ...props }, ref) {
  const command = useCommand('CommandGroup');
  const id = React.useId();
  const headingId = React.useId();
  const hidden = !forceMount && command.search !== '' && !command.visibleGroups.has(id);
  return (
    <GroupContext.Provider value={id}>
      <div cmdk-group="" role="presentation" hidden={hidden || undefined} ref={ref} {...props}>
        {heading ? (
          <div cmdk-group-heading="" aria-hidden="true" id={headingId}>
            {heading}
          </div>
        ) : null}
        <div cmdk-group-items="" role="group" aria-labelledby={heading ? headingId : undefined}>
          {children}
        </div>
      </div>
    </GroupContext.Provider>
  );
});

const CommandSeparator = /* @__PURE__ */ React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'> & { alwaysRender?: boolean }>(
  function CommandSeparator({ alwaysRender = false, ...props }, ref) {
    const command = useCommand('CommandSeparator');
    if (!alwaysRender && command.search) return null;
    return <div cmdk-separator="" role="separator" ref={ref} {...props} />;
  },
);

type CommandItemProps = Omit<React.ComponentPropsWithoutRef<'div'>, 'onSelect' | 'value'> & {
  value?: string;
  keywords?: string[];
  disabled?: boolean;
  onSelect?: (value: string) => void;
  forceMount?: boolean;
};

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

const CommandItem = /* @__PURE__ */ React.forwardRef<HTMLDivElement, CommandItemProps>(function CommandItem(
  { value, keywords, disabled = false, onSelect, forceMount = false, onClick, onPointerMove, children, ...props },
  ref,
) {
  const command = useCommand('CommandItem');
  const groupId = React.useContext(GroupContext);
  const id = React.useId();
  const itemValue = (value ?? textOf(children)).trim();
  const words = keywords ?? [];
  const { register, unregister, onSelectRef } = command;

  React.useEffect(() => {
    register(id, { disabled, groupId, keywords: words, value: itemValue });
  }, [register, id, disabled, groupId, itemValue, words.join()]);
  React.useEffect(() => () => unregister(id), [unregister, id]);

  React.useEffect(() => {
    onSelectRef.current.set(id, () => onSelect?.(itemValue));
    return () => {
      onSelectRef.current.delete(id);
    };
  }, [id, itemValue, onSelect, onSelectRef]);

  if (!forceMount && !command.matches({ keywords: words, value: itemValue })) return null;
  const selected = command.selected === id;
  return (
    <div
      cmdk-item=""
      role="option"
      id={itemDomId(command.listId, id)}
      ref={ref}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      data-selected={selected}
      data-disabled={disabled}
      data-value={itemValue}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (!disabled && !selected) command.setSelected(id);
      }}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) onSelect?.(itemValue);
      }}
      {...props}
    >
      {children}
    </div>
  );
});

/** The cmdk export shape: `Command` is the root and carries its parts as properties. */
export const Command = /* @__PURE__ */ Object.assign(CommandRoot, {
  Empty: CommandEmpty,
  Group: CommandGroup,
  Input: CommandInput,
  Item: CommandItem,
  List: CommandList,
  Separator: CommandSeparator,
});
