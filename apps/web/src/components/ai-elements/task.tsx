"use client";

// Vendored from Vercel AI Elements (Apache-2.0), packages/elements/src/task.tsx at
// 6a9d5b1822ffb10bba4bd97175f01edd7d8651cd. The verbatim original is ./upstream/task.tsx.txt and
// ./NOTICE lists every local substitution: imports are swapped for the local stand-ins and
// `ai-task*` classes are appended beside the inert Tailwind strings. The components are upstream's.
//
// KEYBOARD. Upstream's default TaskTrigger is a <div> handed to CollapsibleTrigger `asChild`, and a
// div is neither focusable nor activated by Enter or Space. It is kept as upstream wrote it; a
// caller that needs the disclosure reachable from the keyboard passes its own <button> as the
// children, which `asChild` then carries the trigger's props onto. The workspace does exactly that.

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { cn } from "./lib/utils";
import { ChevronDownIcon, SearchIcon } from "./icons";
import type { ComponentProps } from "react";
import "./task.css";

export type TaskItemFileProps = ComponentProps<"div">;

export const TaskItemFile = ({
  children,
  className,
  ...props
}: TaskItemFileProps) => (
  <div
    className={cn(
      "inline-flex items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 text-foreground text-xs ai-task__file",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type TaskItemProps = ComponentProps<"div">;

export const TaskItem = ({ children, className, ...props }: TaskItemProps) => (
  <div className={cn("text-muted-foreground text-sm ai-task__item", className)} {...props}>
    {children}
  </div>
);

export type TaskProps = ComponentProps<typeof Collapsible>;

export const Task = ({
  defaultOpen = true,
  className,
  ...props
}: TaskProps) => (
  <Collapsible className={cn("ai-task", className)} defaultOpen={defaultOpen} {...props} />
);

export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
};

export const TaskTrigger = ({
  children,
  className,
  title,
  ...props
}: TaskTriggerProps) => (
  <CollapsibleTrigger asChild className={cn("group ai-task__trigger", className)} {...props}>
    {children ?? (
      <div className="flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground ai-task__trigger-row">
        <SearchIcon className="size-4 ai-task__icon" />
        <p className="text-sm ai-task__title">{title}</p>
        <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180 ai-task__chevron" />
      </div>
    )}
  </CollapsibleTrigger>
);

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export const TaskContent = ({
  children,
  className,
  ...props
}: TaskContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in ai-task__content",
      className
    )}
    {...props}
  >
    <div className="mt-4 space-y-2 border-muted border-l-2 pl-4 ai-task__list">
      {children}
    </div>
  </CollapsibleContent>
);
