"use client";

import { Fragment, memo, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import type { UIMessage } from "ai";
import {
  BarChart3Icon, BookOpenIcon, FileIcon, FileTextIcon, FolderIcon, GitBranchIcon, GitCommitIcon, MapIcon, SearchIcon, SparklesIcon,
  type LucideIcon,
} from "lucide-react";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtSearchResult, ChainOfThoughtSearchResults, ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Sources, SourcesContent, SourcesTrigger, Source } from "@/components/ai-elements/sources";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { CitationCode, EvidenceContext } from "@/components/citation-code";
import { buildEvidence } from "@/lib/evidence";

type AnyPart = { type: string; state?: string; input?: unknown; output?: unknown; errorText?: string; text?: string; toolCallId?: string; [k: string]: unknown };

const ICONS: Record<string, LucideIcon> = {
  search_code: SearchIcon, read_file: FileTextIcon, list_dir: FolderIcon, repo_map: MapIcon, git_log: GitCommitIcon, git_show: GitCommitIcon,
  git_branches: GitBranchIcon, git_worktrees: GitBranchIcon, search_knowledge: BookOpenIcon, bench_results: BarChart3Icon, load_skill: SparklesIcon,
};

// Streamdown's `inlineCode` slot (its typings widen to react-markdown's index signature).
const MD_COMPONENTS = { inlineCode: CitationCode } as unknown as ComponentProps<typeof MessageResponse>["components"];

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function summarize(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "search_code": return `Search code for "${clip(String(i.query ?? ""), 60)}"${i.glob ? ` in ${i.glob}` : ""}`;
    case "read_file": return `Read ${i.path ?? "file"}${i.startLine ? ` (lines ${i.startLine}-${i.endLine ?? "…"})` : ""}`;
    case "list_dir": return `List ${i.path ?? "."}`;
    case "repo_map": return "Map the repo layout";
    case "git_log": return `Git log${i.path ? ` for ${i.path}` : ""}${i.rev ? ` @ ${i.rev}` : ""}`;
    case "git_show": return `Git show ${i.rev ?? ""}`;
    case "git_branches": return "List branches";
    case "git_worktrees": return "List worktrees";
    case "search_knowledge": return `Search knowledge base for "${clip(String(i.query ?? ""), 60)}"`;
    case "bench_results": return "Read the owner benchmark results";
    case "load_skill": return `Load skill ${i.name ?? ""}`;
    default: return name;
  }
}

/** files mentioned in a tool's text output, for the little result chips */
function filesOf(name: string, input: unknown, output: unknown): string[] {
  const out = typeof output === "string" ? output : "";
  const found: string[] = [];
  const add = (p: string) => !found.includes(p) && found.push(p);
  if (name === "read_file") add(String((input as { path?: string })?.path ?? ""));
  else if (name === "search_code") for (const l of out.split("\n").slice(1)) { const m = /^(.+?):\d+: /.exec(l); if (m) add(m[1]); }
  else if (name === "search_knowledge") for (const m of out.matchAll(/^### (.+?):\d+-\d+ /gm)) add(m[1]);
  return found.filter(Boolean).slice(0, 6);
}

function ToolDetail({ part, name }: { part: AnyPart; name: string }) {
  const out = part.output;
  let rendered: ReactNode = undefined;
  if (typeof out === "string") rendered = <CodeBlock code={clip(out, 20000)} language="log" />;
  return (
    <Tool>
      <ToolHeader type={part.type as `tool-${string}`} state={part.state as never} title={name} />
      <ToolContent>
        <ToolInput input={part.input as never} />
        <ToolOutput output={(rendered ?? (out as never)) as never} errorText={part.errorText as never} />
      </ToolContent>
    </Tool>
  );
}

function ToolStep({ part }: { part: AnyPart }) {
  const name = part.type.slice(5);
  const Icon = ICONS[name] ?? SearchIcon;
  const done = part.state === "output-available" || part.state === "output-error";
  const failed = part.state === "output-error";
  const out = typeof part.output === "string" ? part.output : "";
  const files = filesOf(name, part.input, part.output);
  const firstLine = out.split("\n")[0] ?? "";
  const description = failed ? clip(part.errorText ?? "failed", 160) : done && name !== "load_skill" && !/^[{[]/.test(firstLine) ? clip(firstLine, 140) : done ? undefined : "running…";
  const skillSteps = name === "load_skill" ? out.split("\n").filter((l) => /^\d+\.\s/.test(l.trim())).slice(0, 8) : [];
  return (
    <ChainOfThoughtStep icon={Icon} label={summarize(name, part.input)} description={description} status={done ? "complete" : "active"}>
      {files.length > 0 && (
        <ChainOfThoughtSearchResults>
          {files.map((f) => (
            <ChainOfThoughtSearchResult key={f}>
              <FileIcon className="size-3" />
              {f}
            </ChainOfThoughtSearchResult>
          ))}
        </ChainOfThoughtSearchResults>
      )}
      {skillSteps.length > 0 && (
        <Task defaultOpen={false}>
          <TaskTrigger title={`Method: ${(part.input as { name?: string })?.name}`} />
          <TaskContent>
            {skillSteps.map((l, i) => (
              <TaskItem key={i}>{clip(l.trim(), 200)}</TaskItem>
            ))}
          </TaskContent>
        </Task>
      )}
      <ToolDetail part={part} name={name} />
    </ChainOfThoughtStep>
  );
}

/** Everything the model did before its final answer: thinking, notes and tool calls, as one chain of thought. */
function Investigation({ parts, streaming, lastIsActive }: { parts: AnyPart[]; streaming: boolean; lastIsActive: boolean }) {
  const [open, setOpen] = useState(streaming);
  useEffect(() => {
    if (!streaming) setOpen(false); // collapse once the turn has finished; the user can reopen it
  }, [streaming]);
  const calls = parts.filter((p) => p.type.startsWith("tool-")).length;
  const running = streaming && (lastIsActive || parts.some((p) => p.type.startsWith("tool-") && p.state !== "output-available" && p.state !== "output-error"));
  const plural = `${calls} tool call${calls === 1 ? "" : "s"}`;
  return (
    <ChainOfThought open={open} onOpenChange={setOpen} className="mb-4">
      <ChainOfThoughtHeader>{running ? <Shimmer>{`Investigating the repo (${plural})…`}</Shimmer> : `Investigated the repo with ${plural}`}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {parts.map((p, i) => {
          if (p.type.startsWith("tool-")) return <ToolStep key={p.toolCallId ?? i} part={p} />;
          if (p.type === "reasoning") {
            if (!p.text?.trim()) return null;
            return (
              <ChainOfThoughtStep
                key={`r-${i}`}
                label={
                  <Reasoning isStreaming={streaming && i === parts.length - 1}>
                    <ReasoningTrigger />
                    <ReasoningContent>{p.text}</ReasoningContent>
                  </Reasoning>
                }
              />
            );
          }
          if (p.type === "text" && p.text?.trim()) {
            return <ChainOfThoughtStep key={`t-${i}`} label={<span className="text-muted-foreground">{clip(p.text.trim(), 300)}</span>} />;
          }
          return null;
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

export function messageText(message: UIMessage): string {
  return (message.parts as AnyPart[])
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n\n");
}

export const AssistantBody = memo(function AssistantBody({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const evidence = useMemo(() => buildEvidence(message), [message]);
  const parts = message.parts as AnyPart[];
  let lastTool = -1;
  parts.forEach((p, i) => {
    if (p.type.startsWith("tool-")) lastTool = i;
  });
  const head = parts.slice(0, lastTool + 1);
  const tail = parts.slice(lastTool + 1);
  const blocks: ReactNode[] = [];
  if (head.length) blocks.push(<Investigation key="inv" parts={head} streaming={streaming} lastIsActive={tail.length === 0} />);
  tail.forEach((p, k) => {
    const isLast = k === tail.length - 1;
    if (p.type === "reasoning" && p.text?.trim()) {
      blocks.push(
        <Reasoning key={`r-${k}`} isStreaming={streaming && isLast}>
          <ReasoningTrigger />
          <ReasoningContent>{p.text}</ReasoningContent>
        </Reasoning>,
      );
    } else if (p.type === "text" && p.text?.trim()) {
      blocks.push(
        <MessageResponse key={`t-${k}`} components={MD_COMPONENTS} isAnimating={streaming && isLast}>
          {p.text}
        </MessageResponse>,
      );
    }
  });

  const unique = new Map<string, string>();
  for (const s of evidence.sources) unique.set(s.title, s.title);
  const titles = [...unique.keys()];

  return (
    <EvidenceContext.Provider value={evidence}>
      {blocks.length ? blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>) : streaming ? <Shimmer>Thinking…</Shimmer> : null}
      {titles.length > 0 && !streaming && (
        <Sources>
          <SourcesTrigger count={titles.length} />
          <SourcesContent className="max-h-56 overflow-y-auto">
            {titles.map((t) => (
              <Source key={t} title={t}>
                <FileIcon className="size-4 shrink-0" />
                <span className="font-mono">{t}</span>
              </Source>
            ))}
          </SourcesContent>
        </Sources>
      )}
    </EvidenceContext.Provider>
  );
});
