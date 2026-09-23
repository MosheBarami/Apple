"use client";

// Vendored from Vercel AI Elements (Apache-2.0), packages/elements/src/chain-of-thought.tsx at
// 6a9d5b1822ffb10bba4bd97175f01edd7d8651cd. The verbatim original is
// ./upstream/chain-of-thought.tsx.txt and ./NOTICE lists every local substitution: imports are
// swapped for the local stand-ins, `ai-chain-of-thought*` classes are appended beside the inert
// Tailwind strings, and `isOpen` defaults to false while the controllable state has no value yet
// (as in ./reasoning.tsx). The components, their props and the open-state logic are upstream's.
//
// TWO PICKS MERGED IN (2026-09-23, the owner's component picks, Thinking lane):
//   * The content animates open and closed (Animate UI "Collapsible" + React Bits "Thought Line",
//     ../picks/thinking/disclosure.ts), as the Reasoning body above it does.
//   * A step with no icon of its own is marked by its status (../picks/thinking/step-mark.tsx): a
//     hollow ring while pending, Thought Line's pulse while active, and Motion's to-do check, drawn
//     in, once complete. Upstream draws the same dot for all three.

import { useControllableState } from "./reasoning-compat";
import { Badge } from "./ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { cn } from "./lib/utils";
import type { LucideIcon } from "./icons";
import { BrainIcon, ChevronDownIcon } from "./icons";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useId, useMemo, useRef } from "react";
import { useAnimatedClose, useExpandOnOpen } from "../picks/thinking/disclosure";
import { StepMark } from "../picks/thinking/step-mark";
import "./chain-of-thought.css";

interface ChainOfThoughtContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  contentIdRef: { current: string | null };
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null
);

const useChainOfThought = () => {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error(
      "ChainOfThought components must be used within ChainOfThought"
    );
  }
  return context;
};

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const ChainOfThought = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    children,
    ...props
  }: ChainOfThoughtProps) => {
    const [isOpen = false, setOpenState] = useControllableState({
      defaultProp: defaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const contentIdRef = useRef<string | null>(null);
    const setIsOpen = useAnimatedClose(contentIdRef, setOpenState);

    const chainOfThoughtContext = useMemo(
      () => ({ contentIdRef, isOpen, setIsOpen }),
      [isOpen, setIsOpen]
    );

    return (
      <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
        <div className={cn("not-prose w-full space-y-4 ai-chain-of-thought", className)} {...props}>
          {children}
        </div>
      </ChainOfThoughtContext.Provider>
    );
  }
);

export type ChainOfThoughtHeaderProps = ComponentProps<
  typeof CollapsibleTrigger
>;

export const ChainOfThoughtHeader = memo(
  ({ className, children, ...props }: ChainOfThoughtHeaderProps) => {
    const { isOpen, setIsOpen } = useChainOfThought();

    return (
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground ai-chain-of-thought__header",
            className
          )}
          {...props}
        >
          <BrainIcon className="size-4 ai-chain-of-thought__icon" />
          <span className="flex-1 text-left ai-chain-of-thought__title">
            {children ?? "Chain of Thought"}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-4 transition-transform ai-chain-of-thought__chevron",
              isOpen ? "rotate-180 is-open" : "rotate-0"
            )}
          />
        </CollapsibleTrigger>
      </Collapsible>
    );
  }
);

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  status?: "complete" | "active" | "pending";
};

const stepStatusStyles = {
  active: "text-foreground ai-chain-of-thought__step--active",
  complete: "text-muted-foreground ai-chain-of-thought__step--complete",
  pending: "text-muted-foreground/50 ai-chain-of-thought__step--pending",
};

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: Icon,
    label,
    description,
    status = "complete",
    children,
    ...props
  }: ChainOfThoughtStepProps) => (
    <div
      className={cn(
        "flex gap-2 text-sm ai-chain-of-thought__step",
        stepStatusStyles[status],
        "fade-in-0 slide-in-from-top-2 animate-in",
        className
      )}
      {...props}
    >
      <div className="relative mt-0.5 ai-chain-of-thought__rail">
        {Icon ? <Icon className="size-4 ai-chain-of-thought__icon" /> : <StepMark status={status} className="size-4 ai-chain-of-thought__icon" />}
        <div className="absolute top-7 bottom-0 left-1/2 -mx-px w-px bg-border ai-chain-of-thought__line" />
      </div>
      <div className="flex-1 space-y-2 overflow-hidden ai-chain-of-thought__body">
        <div className="ai-chain-of-thought__label">{label}</div>
        {description && (
          <div className="text-muted-foreground text-xs ai-chain-of-thought__description">{description}</div>
        )}
        {children}
      </div>
    </div>
  )
);

export type ChainOfThoughtSearchResultsProps = ComponentProps<"div">;

export const ChainOfThoughtSearchResults = memo(
  ({ className, ...props }: ChainOfThoughtSearchResultsProps) => (
    <div
      className={cn("flex flex-wrap items-center gap-2 ai-chain-of-thought__results", className)}
      {...props}
    />
  )
);

export type ChainOfThoughtSearchResultProps = ComponentProps<typeof Badge>;

export const ChainOfThoughtSearchResult = memo(
  ({ className, children, ...props }: ChainOfThoughtSearchResultProps) => (
    <Badge
      className={cn("gap-1 px-2 py-0.5 font-normal text-xs ai-chain-of-thought__result", className)}
      variant="secondary"
      {...props}
    >
      {children}
    </Badge>
  )
);

export type ChainOfThoughtContentProps = ComponentProps<
  typeof CollapsibleContent
>;

export const ChainOfThoughtContent = memo(
  ({ className, children, id: idProp, ...props }: ChainOfThoughtContentProps) => {
    const { contentIdRef, isOpen } = useChainOfThought();
    const generated = useId();
    const id = idProp ?? generated;
    contentIdRef.current = id;
    useExpandOnOpen(id, isOpen);

    return (
      <Collapsible open={isOpen}>
        <CollapsibleContent
          id={id}
          className={cn(
            "mt-2 space-y-3 ai-chain-of-thought__content",
            "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
            className
          )}
          {...props}
        >
          {children}
        </CollapsibleContent>
      </Collapsible>
    );
  }
);

export type ChainOfThoughtImageProps = ComponentProps<"div"> & {
  caption?: string;
};

export const ChainOfThoughtImage = memo(
  ({ className, children, caption, ...props }: ChainOfThoughtImageProps) => (
    <div className={cn("mt-2 space-y-2 ai-chain-of-thought__image", className)} {...props}>
      <div className="relative flex max-h-[22rem] items-center justify-center overflow-hidden rounded-lg bg-muted p-3 ai-chain-of-thought__image-frame">
        {children}
      </div>
      {caption && <p className="text-muted-foreground text-xs ai-chain-of-thought__caption">{caption}</p>}
    </div>
  )
);

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults";
ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
ChainOfThoughtImage.displayName = "ChainOfThoughtImage";
