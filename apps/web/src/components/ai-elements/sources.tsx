"use client";

// Vendored from Vercel AI Elements (Apache-2.0), packages/elements/src/sources.tsx at
// 6a9d5b1822ffb10bba4bd97175f01edd7d8651cd. The verbatim original is ./upstream/sources.tsx.txt and
// ./NOTICE lists every local substitution: imports are swapped for the local stand-ins and
// `ai-sources*` classes are appended beside the inert Tailwind strings. One type is widened, and
// nothing else changes: upstream types `Sources` as a <div>'s props while rendering a Collapsible,
// so its open state could not be set without a type error. `open`, `defaultOpen` and
// `onOpenChange` are the Collapsible's own, and they reach it through the same spread as before.

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { cn } from "./lib/utils";
import { BookIcon, ChevronDownIcon } from "./icons";
import type { ComponentProps } from "react";
import "./sources.css";

export type SourcesProps = ComponentProps<"div"> &
  Pick<ComponentProps<typeof Collapsible>, "open" | "defaultOpen" | "onOpenChange">;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible
    className={cn("not-prose mb-4 text-primary text-xs ai-sources", className)}
    {...props}
  />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => (
  <CollapsibleTrigger
    className={cn("flex items-center gap-2 ai-sources__trigger", className)}
    {...props}
  >
    {children ?? (
      <>
        <p className="font-medium ai-sources__count">Used {count} sources</p>
        <ChevronDownIcon className="h-4 w-4 ai-sources__chevron" />
      </>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({
  className,
  ...props
}: SourcesContentProps) => (
  <CollapsibleContent
    className={cn(
      "mt-3 flex w-fit flex-col gap-2 ai-sources__content",
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type SourceProps = ComponentProps<"a">;

export const Source = ({ href, title, children, ...props }: SourceProps) => (
  <a
    className="flex items-center gap-2 ai-sources__source"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="h-4 w-4 ai-sources__icon" />
        <span className="block font-medium ai-sources__title">{title}</span>
      </>
    )}
  </a>
);
