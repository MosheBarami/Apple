// AI Elements `stack-trace`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) parses a JavaScript error into its type,
// message and frames and draws them as a collapsible card with copy. What Apple meets is Luau, so
// the parser is picks/tech/luau-trace.ts (Roblox's "Script 'X', Line N" frames and "X:N: message"
// headline). Export names follow upstream; written here with a native disclosure.
//
// Where it is used: a Studio change that failed shows its error behind "Details" in Studio
// activity — the kind of error in plain words first, the script and line after
// (components/ws/studio-activity.tsx).
import { useId, useMemo, useState, type HTMLAttributes } from 'react';
import { cn } from './lib/utils';
import { parseLuauTrace, type LuauTrace } from '../picks/tech/luau-trace';
import { useCopy } from '../picks/tech/use-copy';
import { AlertIcon, CheckIcon, ChevronIcon, CopyIcon } from '../picks/tech/icons';
import '../picks/tech/tech-ui.css';
import './stack-trace.css';

export type StackTraceProps = HTMLAttributes<HTMLDivElement> & {
  trace: string;
  defaultOpen?: boolean;
};

export const StackTrace = ({ trace, defaultOpen = false, className, ...props }: StackTraceProps) => {
  const parsed = useMemo<LuauTrace>(() => parseLuauTrace(trace), [trace]);
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const hasFrames = parsed.frames.length > 0 || parsed.rest.length > 0;
  return (
    <div className={cn('ai-trace', className)} {...props}>
      <StackTraceHeader>
        <span className="ai-trace__icon"><AlertIcon size={14} /></span>
        <StackTraceError>
          <StackTraceErrorType>{parsed.type}</StackTraceErrorType>
          <StackTraceErrorMessage>{parsed.message}</StackTraceErrorMessage>
        </StackTraceError>
        <StackTraceActions>
          <StackTraceCopyButton trace={trace} />
          {hasFrames && (
            <button
              type="button"
              className="tq-btn tq-btn--icon tq-btn--bare"
              aria-expanded={open}
              aria-controls={bodyId}
              aria-label={open ? 'Hide where it happened' : 'Show where it happened'}
              onClick={() => setOpen((v) => !v)}
            >
              <span className={cn('ai-trace__chev', open && 'is-open')}><ChevronIcon size={12} /></span>
            </button>
          )}
        </StackTraceActions>
      </StackTraceHeader>
      {hasFrames && (
        <StackTraceContent id={bodyId} hidden={!open}>
          <StackTraceFrames trace={parsed} />
        </StackTraceContent>
      )}
    </div>
  );
};

export const StackTraceHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-trace__header', className)} {...props} />
);
export const StackTraceError = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-trace__error', className)} {...props} />
);
export const StackTraceErrorType = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-trace__type', className)} {...props} />
);
export const StackTraceErrorMessage = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-trace__message', className)} {...props} />
);
export const StackTraceActions = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-trace__actions', className)} {...props} />
);

export const StackTraceCopyButton = ({ trace }: { trace: string }) => {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      className="tq-btn tq-btn--icon tq-btn--bare"
      aria-label={copied ? 'Copied' : 'Copy the error'}
      title="Copy the error"
      onClick={() => void copy(trace)}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
};

export const StackTraceContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-trace__content', className)} {...props} />
);

export const StackTraceFrames = ({ trace }: { trace: LuauTrace }) => (
  <ol className="ai-trace__frames">
    {trace.frames.map((f, i) => (
      <li key={`${f.source}:${f.line}:${i}`} className="ai-trace__frame">
        <span className="ai-trace__where">{f.source}</span>
        <span className="ai-trace__line">line {f.line}</span>
        {f.fn && <span className="ai-trace__fn">in {f.fn}</span>}
      </li>
    ))}
    {trace.rest.map((r, i) => <li key={`rest-${i}`} className="ai-trace__frame ai-trace__frame--raw">{r}</li>)}
  </ol>
);
