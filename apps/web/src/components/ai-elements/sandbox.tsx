// AI Elements `sandbox`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) is the card an isolated run lives in: a
// collapsible header with the run's title and state, and tabs over its code and its output. Export
// names follow upstream; Radix Collapsible and Tabs are replaced by native state and a WAI-ARIA tab
// list (←/→/Home/End move between tabs, the panel follows).
//
// Where it is used: a finished playtest's results sit in a Sandbox inside the Playtest card — the
// run mode Studio ran is Apple's sandbox — with "Checks" first and "Details" (the raw numbers)
// second (components/ws/playtest-card.tsx).
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from './lib/utils';
import { ChevronIcon } from '../picks/tech/icons';
import '../picks/tech/tech-ui.css';
import './sandbox.css';

export type SandboxState = 'running' | 'done' | 'error';

interface SandboxCtx { open: boolean; setOpen: (v: boolean) => void; bodyId: string }
const SandboxContext = createContext<SandboxCtx>({ open: true, setOpen: () => undefined, bodyId: '' });

export type SandboxProps = HTMLAttributes<HTMLDivElement> & { defaultOpen?: boolean };
export const Sandbox = ({ defaultOpen = true, className, children, ...props }: SandboxProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <SandboxContext.Provider value={{ open, setOpen, bodyId }}>
      <div className={cn('ai-sandbox', open && 'is-open', className)} {...props}>{children}</div>
    </SandboxContext.Provider>
  );
};

const STATE_WORD: Record<SandboxState, string> = { running: 'Running', done: 'Finished', error: 'Did not run' };

export const SandboxHeader = ({ title, state, className }: { title: string; state: SandboxState; className?: string }) => {
  const { open, setOpen, bodyId } = useContext(SandboxContext);
  return (
    <button
      type="button"
      className={cn('ai-sandbox__header', className)}
      aria-expanded={open}
      aria-controls={bodyId}
      onClick={() => setOpen(!open)}
    >
      <span className={cn('ai-sandbox__chev', open && 'is-open')} aria-hidden="true"><ChevronIcon size={12} /></span>
      <span className="ai-sandbox__title">{title}</span>
      <span className={cn('ai-sandbox__state', `ai-sandbox__state--${state}`)}>{STATE_WORD[state]}</span>
    </button>
  );
};

export const SandboxContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  const { open, bodyId } = useContext(SandboxContext);
  return <div id={bodyId} hidden={!open} className={cn('ai-sandbox__content', className)} {...props} />;
};

interface TabsCtx { value: string; setValue: (v: string) => void; base: string }
const TabsContext = createContext<TabsCtx>({ value: '', setValue: () => undefined, base: '' });

export const SandboxTabs = ({ defaultValue, children, className }: { defaultValue: string; children: ReactNode; className?: string }) => {
  const [value, setValue] = useState(defaultValue);
  const base = useId();
  return (
    <TabsContext.Provider value={{ value, setValue, base }}>
      <div className={cn('ai-sandbox__tabs', className)}>{children}</div>
    </TabsContext.Provider>
  );
};

export const SandboxTabsBar = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-sandbox__bar', className)} {...props} />
);

export const SandboxTabsList = ({ className, children, label }: { className?: string; children: ReactNode; label: string }) => {
  const list = useRef<HTMLDivElement>(null);
  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const tabs = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    const at = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const go = (i: number) => { const t = tabs[(i + tabs.length) % tabs.length]; t?.focus(); t?.click(); };
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
    if (e.key === 'Home') { e.preventDefault(); go(0); }
    if (e.key === 'End') { e.preventDefault(); go(tabs.length - 1); }
  }, []);
  return (
    <div ref={list} role="tablist" aria-label={label} className={cn('ai-sandbox__list', className)} onKeyDown={onKey}>
      {children}
    </div>
  );
};

export const SandboxTabsTrigger = ({ value, children }: { value: string; children: ReactNode }) => {
  const ctx = useContext(TabsContext);
  const selected = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.base}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${ctx.base}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      className={cn('ai-sandbox__tab', selected && 'is-selected')}
      onClick={() => ctx.setValue(value)}
    >
      {children}
    </button>
  );
};

export const SandboxTabContent = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => {
  const ctx = useContext(TabsContext);
  return (
    <div
      role="tabpanel"
      id={`${ctx.base}-panel-${value}`}
      aria-labelledby={`${ctx.base}-tab-${value}`}
      hidden={ctx.value !== value}
      className={cn('ai-sandbox__panel', className)}
    >
      {children}
    </div>
  );
};
