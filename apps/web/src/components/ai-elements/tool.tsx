"use client";

// Vendored from Vercel AI Elements (Apache-2.0), packages/elements/src/tool.tsx at
// 6a9d5b1822ffb10bba4bd97175f01edd7d8651cd. The verbatim original is ./upstream/tool.tsx.txt and
// ./NOTICE lists every local substitution: imports are swapped for the local stand-ins and
// `ai-tool*` classes are appended beside the inert Tailwind strings. The components, the state
// labels and the state icons are upstream's.
//
// ToolInput and ToolOutput are kept because they are upstream's exports, and they print
// JSON.stringify of a tool's arguments and result. The workspace uses neither: a ToolEvent carries
// no arguments at all, and its `detail` payload is untrusted and never rendered directly
// (tests/thinking-surface.test.mjs holds both).

import { Badge } from "./ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { cn } from "./lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "./ai-types";
import {
  BookIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  FileTextIcon,
  ImageIcon,
  Monitor,
  SearchIcon,
  WrenchIcon,
  XCircleIcon,
  type LucideIcon,
} from "./icons";
import { kindForTool, type ActivityKind } from "../ws/tool-vocabulary";
import { classForTool } from "../studio-icon-model";
import { StudioIcon } from "../studio-icon";
import { StepMark } from "../picks/thinking/step-mark";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

import { CodeBlock } from "./code-block";
import "./tool.css";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("group not-prose mb-4 w-full rounded-md border ai-tool", className)}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Awaiting Approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-4 text-yellow-600 ai-tool__status-icon" />,
  "approval-responded": <CheckCircleIcon className="size-4 text-blue-600 ai-tool__status-icon" />,
  "input-available": <ClockIcon className="size-4 animate-pulse ai-tool__status-icon" />,
  "input-streaming": <CircleIcon className="size-4 ai-tool__status-icon" />,
  // LOCAL: a finished step's tick draws itself in (StepMark, the same mark a finished phase step
  // wears), once, because the state span below is keyed by the state.
  "output-available": <StepMark status="complete" className="size-4 ai-tool__status-icon" />,
  "output-denied": <XCircleIcon className="size-4 text-orange-600 ai-tool__status-icon" />,
  "output-error": <XCircleIcon className="size-4 text-red-600 ai-tool__status-icon" />,
};

// LOCAL (React Bits "Call Chip", MIT + Commons Clause, re-implemented in tool.css — no code
// copied): the state icon is keyed by the state, so each change mounts it fresh and it pops in;
// a failure gives the badge one short shake.
export const getStatusBadge = (status: ToolPart["state"]) => (
  <Badge className={`gap-1.5 rounded-full text-xs ai-tool__badge ai-tool__badge--${status}`} variant="secondary">
    <span key={status} className="ai-tool__state">{statusIcons[status]}</span>
    {statusLabels[status]}
  </Badge>
);

// LOCAL (Call Chip): the step's icon says what kind of work it is — a search, a script read, a
// render, a playtest — from the product's one tool table (ws/tool-vocabulary.ts), rather than the
// same wrench on every row. A tool this build does not know keeps upstream's wrench.
const KIND_ICON: Partial<Record<ActivityKind, LucideIcon>> = {
  searching_knowledge: BookIcon,
  searching_assets: SearchIcon,
  inspecting: SearchIcon,
  reading_scripts: FileTextIcon,
  writing_luau: FileTextIcon,
  generating: ImageIcon,
  rendering: ImageIcon,
  playtesting: Monitor,
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  // LOCAL: a step that acts on an object in the place wears that object's Roblox Studio icon
  // (studio-icon-model.ts); one that touches no object keeps its line icon below.
  const studioClass = classForTool(derivedName);
  const KindIcon = KIND_ICON[kindForTool(derivedName)] ?? WrenchIcon;

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-4 p-3 ai-tool__header",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2 ai-tool__heading">
        {studioClass
          ? <StudioIcon robloxClass={studioClass} className="ai-tool__icon ai-tool__icon--studio" />
          : <KindIcon className="size-4 text-muted-foreground ai-tool__icon" />}
        {/* A running step's title carries a shimmer (Call Chip's "in flight" wash). */}
        <span className={cn("font-medium text-sm ai-tool__title", state === "input-available" && "is-running")}>{title ?? derivedName}</span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 ai-tool__chevron" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-4 p-4 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in ai-tool__content",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden ai-tool__input", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide ai-tool__section-title">
      Parameters
    </h4>
    <div className="rounded-md bg-muted/50 ai-tool__code">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2 ai-tool__output", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide ai-tool__section-title">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full ai-tool__result",
          errorText
            ? "bg-destructive/10 text-destructive is-error"
            : "bg-muted/50 text-foreground"
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
