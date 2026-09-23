"use client";

/**
 * Vendored/adapted from Vercel AI Elements:
 * https://github.com/vercel/ai-elements/blob/6a9d5b1822ffb10bba4bd97175f01edd7d8651cd/packages/elements/src/reasoning.tsx
 *
 * Upstream is Apache-2.0. See ./NOTICE and ./LICENSE.
 * Compatibility adaptations are dependency-only: this React 18 + Vite app uses local
 * Collapsible/useControllableState/icon primitives, its existing safe Markdown renderer in place
 * of Streamdown, and scoped CSS in place of Tailwind utilities. The Reasoning public API and the
 * upstream streaming/open/duration state machine are preserved.
 *
 * ONE ADDITION: ReasoningContent also renders React children as they are. Upstream types its
 * children as a string and renders it as markdown, because upstream fills it with the model's
 * reasoning text. This product has none to show — no reasoning token crosses the wire
 * (docs/THINKING-UX.md) — so the workspace fills the disclosure with components built from
 * observed run activity instead. A string still renders through the markdown path, as upstream's
 * does; no caller in this app passes one (tests/thinking-surface.test.mjs).
 *
 * TWO PICKS MERGED IN (2026-09-23, the owner's component picks, Thinking lane):
 *   * Animate UI "Collapsible" + React Bits "Thought Line": the disclosure body now animates open
 *     (height 0 -> measured, opacity, y) and animates closed before it is hidden. The state machine
 *     is upstream's; only the moment the content hides is deferred by the collapse
 *     (../picks/thinking/disclosure.ts). Re-implemented with the Web Animations API, no motion lib.
 *   * ReasoningTrigger takes an optional `icon`, drawn where upstream draws the Brain. Without one
 *     the Brain is drawn, as upstream does; the workspace passes its live state glyph.
 */
import type { ComponentProps, ReactNode } from 'react';
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Markdown } from '../../lib/markdown';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  useControllableState,
} from './reasoning-compat';
import { BrainIcon, ChevronDownIcon } from './icons';
import { Shimmer } from './shimmer';
import { useAnimatedClose, useExpandOnOpen } from '../picks/thinking/disclosure';
import './reasoning.css';

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
  /** The id of the mounted ReasoningContent, so a close can animate it before it is hidden. */
  contentIdRef: { current: string | null };
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const resolvedDefaultOpen = defaultOpen ?? isStreaming;
    // Track if defaultOpen was explicitly set to false (to prevent auto-open)
    const isExplicitlyClosed = defaultOpen === false;

    const [isOpen = false, setOpenState] = useControllableState<boolean>({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    // Every close — the reader's, and the auto-close after streaming — collapses first.
    const contentIdRef = useRef<string | null>(null);
    const setIsOpen = useAnimatedClose(contentIdRef, setOpenState);
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    });

    const hasEverStreamedRef = useRef(isStreaming);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    const startTimeRef = useRef<number | null>(null);

    // Track when streaming starts and compute duration
    useEffect(() => {
      if (isStreaming) {
        hasEverStreamedRef.current = true;
        if (startTimeRef.current === null) {
          startTimeRef.current = Date.now();
        }
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
        startTimeRef.current = null;
      }
    }, [isStreaming, setDuration]);

    // Auto-open when streaming starts (unless explicitly closed)
    useEffect(() => {
      if (isStreaming && !isOpen && !isExplicitlyClosed) {
        setIsOpen(true);
      }
    }, [isStreaming, isOpen, setIsOpen, isExplicitlyClosed]);

    // Auto-close when streaming ends (once only, and only if it ever streamed)
    useEffect(() => {
      if (
        hasEverStreamedRef.current &&
        !isStreaming &&
        isOpen &&
        !hasAutoClosed
      ) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setIsOpen(newOpen);
      },
      [setIsOpen],
    );

    const contextValue = useMemo(
      () => ({ contentIdRef, duration, isOpen, isStreaming, setIsOpen }),
      [duration, isOpen, isStreaming, setIsOpen],
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          className={cn('not-prose mb-4 ai-reasoning', className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
  /** Drawn in the Brain's place. Omitted, the Brain is drawn, as upstream does. */
  icon?: ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming || duration === 0) {
    return <Shimmer duration={1}>Thinking...</Shimmer>;
  }
  if (duration === undefined) {
    return <p>Thought for a few seconds</p>;
  }
  return <p>Thought for {duration} seconds</p>;
};

export const ReasoningTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
    icon,
    ...props
  }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration } = useReasoning();

    return (
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground ai-reasoning__trigger',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            {icon ?? <BrainIcon className="size-4 ai-reasoning__icon" />}
            {getThinkingMessage(isStreaming, duration)}
            <ChevronDownIcon
              className={cn(
                'size-4 transition-transform ai-reasoning__icon ai-reasoning__chevron',
                isOpen ? 'rotate-180 is-open' : 'rotate-0',
              )}
            />
          </>
        )}
      </CollapsibleTrigger>
    );
  },
);

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: ReactNode;
};

export const ReasoningContent = memo(
  ({ className, children, id: idProp, ...props }: ReasoningContentProps) => {
    const { contentIdRef, isOpen } = useReasoning();
    const generated = useId();
    const id = idProp ?? generated;
    contentIdRef.current = id;
    useExpandOnOpen(id, isOpen);
    return (
    <CollapsibleContent
      id={id}
      className={cn(
        'mt-4 text-sm data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in ai-reasoning__content',
        className,
      )}
      {...props}
    >
      {typeof children === 'string' ? <Markdown source={children} /> : children}
    </CollapsibleContent>
    );
  },
);

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
