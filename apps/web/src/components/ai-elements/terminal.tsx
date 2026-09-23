// AI Elements `terminal`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) is a dark console panel — a header with a
// title, a streaming status and Copy / Clear, over monospace output that stays pinned to the bottom
// as lines arrive. Upstream colours ANSI escapes with ansi-to-react; this app installs no such
// package and the output here carries no escapes, so any that do arrive are stripped rather than
// shown as garbage. Export names follow upstream; the code is written here.
//
// Where it is used: Studio activity's "Details" shows the raw record Apple keeps of every Studio
// change — time, result, op, run — as a terminal log, for the reader who wants the plain facts
// behind the sentences above it (components/ws/studio-activity.tsx).
import { createContext, useContext, useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './lib/utils';
import { useCopy } from '../picks/tech/use-copy';
import { CheckIcon, CopyIcon, TerminalIcon } from '../picks/tech/icons';
import '../picks/tech/tech-ui.css';
import './terminal.css';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

interface TerminalContextValue {
  output: string;
  isStreaming: boolean;
  autoScroll: boolean;
  onClear?: () => void;
}
const TerminalContext = createContext<TerminalContextValue>({ output: '', isStreaming: false, autoScroll: true });

export type TerminalProps = HTMLAttributes<HTMLDivElement> & {
  output: string;
  isStreaming?: boolean;
  autoScroll?: boolean;
  onClear?: () => void;
  /** The header's words. Upstream's TerminalTitle default is "Terminal". */
  label?: string;
};

export const Terminal = ({ output, isStreaming = false, autoScroll = true, onClear, label, className, children, ...props }: TerminalProps) => (
  <TerminalContext.Provider value={{ output: output.replace(ANSI, ''), isStreaming, autoScroll, onClear }}>
    <div className={cn('ai-term', className)} {...props}>
      {children ?? (
        <>
          <TerminalHeader>
            <TerminalTitle>{label}</TerminalTitle>
            <TerminalStatus />
            <TerminalActions>
              <TerminalCopyButton />
              {onClear && <TerminalClearButton />}
            </TerminalActions>
          </TerminalHeader>
          <TerminalContent />
        </>
      )}
    </div>
  </TerminalContext.Provider>
);

export const TerminalHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-term__header', className)} {...props} />
);

export const TerminalTitle = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <span className={cn('ai-term__title', className)}>
    <TerminalIcon size={13} />
    {children ?? 'Terminal'}
  </span>
);

export const TerminalStatus = ({ className }: { className?: string }) => {
  const { isStreaming } = useContext(TerminalContext);
  if (!isStreaming) return null;
  return <span className={cn('ai-term__status', className)}>Receiving…</span>;
};

export const TerminalActions = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-term__actions', className)} {...props} />
);

export const TerminalCopyButton = ({ onCopy, className }: { onCopy?: () => void; className?: string }) => {
  const { output } = useContext(TerminalContext);
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      className={cn('tq-btn tq-btn--icon tq-btn--bare ai-term__btn', className)}
      aria-label={copied ? 'Copied' : 'Copy the log'}
      title="Copy the log"
      onClick={() => void copy(output).then((ok) => ok && onCopy?.())}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
};

export const TerminalClearButton = ({ className }: { className?: string }) => {
  const { onClear } = useContext(TerminalContext);
  return (
    <button type="button" className={cn('tq-btn tq-btn--bare ai-term__btn', className)} onClick={onClear}>
      Clear
    </button>
  );
};

export const TerminalContent = ({ className }: { className?: string }) => {
  const { output, autoScroll } = useContext(TerminalContext);
  const box = useRef<HTMLPreElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (el && autoScroll && pinned.current) el.scrollTop = el.scrollHeight;
  }, [output, autoScroll]);
  return (
    <pre
      ref={box}
      className={cn('ai-term__content', className)}
      tabIndex={0}
      aria-label="Log"
      onScroll={(e) => {
        const el = e.currentTarget;
        // Following stops the moment the reader scrolls up, and resumes when they return.
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
      }}
    >
      {output}
    </pre>
  );
};
