"use client";

// One request = one turn. While the agent works, its process streams in order: thinking, steps, short notes. When
// the turn ends, the process folds into one line ("Worked for 1m 12s · 14 steps") above the final reply.
import {
  type DynamicToolUIPart,
  getToolName,
  isToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleSlashIcon,
  PauseCircleIcon,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type Components, Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  type CitedSource,
  InlineCitationChip,
} from "@/components/ai-elements/inline-citation";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
  hostOf,
} from "@/components/ai-elements/sources";
import { cn } from "@/lib/utils";
import { formatDuration, isDocSearch, stepLabel } from "./labels";

type Part = UIMessage["parts"][number];
type ToolPart = ToolUIPart | DynamicToolUIPart;

const plugins = { code };

/** A height transition that works for any content (grid 0fr -> 1fr). */
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

export function UserTurn({ message }: { message: UIMessage }) {
  const text = message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
  return (
    <div className="flex justify-end animate-in fade-in-0 duration-300 motion-reduce:animate-none">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[15px] text-foreground leading-relaxed">
        {text}
      </div>
    </div>
  );
}

const isProcess = (p: Part) =>
  p.type === "reasoning" || isToolUIPart(p) || p.type === "data-progress";

export function AssistantTurn({
  message,
  live,
  timing,
}: {
  message: UIMessage;
  live: boolean;
  /** When the turn started and (if done) ended, in ms. */
  timing?: { start: number; end?: number };
}) {
  const parts = message.parts;
  const lastProcess = parts.findLastIndex(isProcess);
  const process = lastProcess >= 0 ? parts.slice(0, lastProcess + 1) : [];
  const final = parts.slice(lastProcess + 1).filter((p) => p.type === "text");
  // Why the turn ended when it did not simply finish (step limit, cut-off reply, model failure): written by the agent.
  const stop = parts.findLast((p) => p.type === "data-stop") as { data?: { note?: string } } | undefined;
  const sources = useMemo(() => {
    const seen = new Map<string, CitedSource>();
    for (const p of parts) {
      if (p.type === "source-url" && !seen.has(p.url)) {
        seen.set(p.url, { title: p.title, url: p.url });
      }
    }
    return [...seen.values()];
  }, [parts]);
  const steps = parts.filter(isToolUIPart);
  const failed = steps.filter((p) => p.state === "output-error").length;
  const progress = live
    ? (parts.findLast((p) => p.type === "data-progress") as
        | { data?: { label?: string } }
        | undefined)
    : undefined;

  // Open while the agent works; folds itself away when the turn ends. A click reopens it.
  const [manual, setManual] = useState<boolean | null>(null);
  useEffect(() => {
    if (!live) {
      setManual(null);
    }
  }, [live]);
  const open = manual ?? live;

  const now = useNow(live);
  const elapsed = timing ? (timing.end ?? now) - timing.start : null;
  const summary = [
    live ? "Working" : elapsed === null ? "Worked" : `Worked for ${formatDuration(elapsed)}`,
    live && elapsed !== null ? formatDuration(elapsed) : null,
    steps.length ? `${steps.length} ${steps.length === 1 ? "step" : "steps"}` : null,
    failed ? `${failed} failed` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3 animate-in fade-in-0 duration-300 motion-reduce:animate-none" data-testid="assistant-turn">
      {process.length ? (
        <div>
          <button
            aria-expanded={open}
            className="group flex items-center gap-1.5 rounded-sm text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            data-testid="work-summary"
            onClick={() => setManual(!open)}
            type="button"
          >
            <ChevronRightIcon
              className={cn(
                "size-3.5 transition-transform duration-200 motion-reduce:transition-none",
                open && "rotate-90"
              )}
            />
            {live ? (
              <Shimmer as="span" duration={2}>
                {summary}
              </Shimmer>
            ) : (
              <span className="tabular-nums">{summary}</span>
            )}
          </button>
          <Fold open={open}>
            <div className="mt-2 ml-[7px] flex flex-col gap-2 border-border border-l pl-4" data-testid="work-process">
              {process.map((p, i) => (
                <ProcessPart
                  key={partKey(p, i)}
                  live={live}
                  part={p}
                  sources={sources}
                />
              ))}
              {progress?.data?.label ? (
                <Shimmer as="span" className="text-[13px]" duration={2}>
                  {progress.data.label}
                </Shimmer>
              ) : null}
            </div>
          </Fold>
        </div>
      ) : null}
      {final.map((p, i) => (
        <Markdown
          key={`final-${i}`}
          live={live && i === final.length - 1}
          sources={sources}
          text={p.type === "text" ? p.text : ""}
        />
      ))}
      {live && !final.length && !process.length ? (
        <Shimmer as="span" className="text-[13px]" duration={2}>
          Thinking
        </Shimmer>
      ) : null}
      {!live && stop?.data?.note ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground" data-testid="turn-stop" role="status">
          <PauseCircleIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{stop.data.note}</span>
        </p>
      ) : null}
      {!live && sources.length ? <SourcesRow sources={sources} /> : null}
    </div>
  );
}

function partKey(p: Part, i: number) {
  return isToolUIPart(p) ? p.toolCallId : `${p.type}-${i}`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function ProcessPart({
  part,
  live,
  sources,
}: {
  part: Part;
  live: boolean;
  sources: CitedSource[];
}) {
  if (part.type === "reasoning") {
    if (!part.text.trim()) {
      return null;
    }
    return (
      <Reasoning isStreaming={live && part.state === "streaming"}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }
  if (isToolUIPart(part)) {
    return <StepRow part={part} />;
  }
  if (part.type === "text" && part.text.trim()) {
    return (
      <Markdown
        className="text-[14px] text-muted-foreground"
        live={live && part.state === "streaming"}
        sources={sources}
        text={part.text}
      />
    );
  }
  return null;
}

type StepState = "running" | "done" | "error" | "denied";

function stepState(part: ToolPart): StepState {
  switch (part.state) {
    case "output-available":
      return "done";
    case "output-error":
      return "error";
    case "output-denied":
      return "denied";
    default:
      return "running";
  }
}

interface DocHit {
  title?: string;
  url: string;
}

function docHits(output: unknown): DocHit[] {
  const list = Array.isArray(output)
    ? output
    : output && typeof output === "object"
      ? ((output as { results?: unknown; hits?: unknown }).results ??
        (output as { hits?: unknown }).hits)
      : null;
  return Array.isArray(list)
    ? list.filter(
        (h): h is DocHit =>
          Boolean(h) && typeof h === "object" && typeof (h as DocHit).url === "string"
      )
    : [];
}

export function StepRow({ part }: { part: ToolPart }) {
  const name = getToolName(part);
  const state = stepState(part);
  const label = stepLabel(name, part.input);
  const hits = isDocSearch(name) ? docHits(part.output) : [];
  const [open, setOpen] = useState(false);
  const hasDetail = state === "error" || hits.length > 0 || part.output !== undefined || part.input !== undefined;

  return (
    <div className="text-[13px]" data-state={state} data-testid="step-row">
      <button
        aria-expanded={hasDetail ? open : undefined}
        className="group flex w-full min-w-0 items-center gap-2 rounded-md py-0.5 text-left text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default"
        disabled={!hasDetail}
        onClick={() => setOpen(!open)}
        type="button"
      >
        <StepIcon state={state} />
        {state === "running" ? (
          <Shimmer as="span" className="truncate" duration={1.8}>
            {label}
          </Shimmer>
        ) : (
          <span className={cn("truncate", state === "error" && "text-destructive")}>{label}</span>
        )}
        {hits.length ? (
          <span className="shrink-0 text-muted-foreground/80 tabular-nums">
            · {hits.length} {hits.length === 1 ? "page" : "pages"}
          </span>
        ) : null}
      </button>
      <Fold open={open}>
        <div className="mt-1 mb-1 ml-6 space-y-1">
          {hits.length ? (
            <ul className="space-y-0.5">
              {hits.slice(0, 8).map((h) => (
                <li key={h.url}>
                  <a
                    className="flex min-w-0 gap-2 rounded px-1 py-0.5 hover:bg-muted"
                    href={h.url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    <span className="truncate text-foreground">{h.title ?? h.url}</span>
                    <span className="shrink-0 text-muted-foreground">{hostOf(h.url)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {state === "error" && part.errorText ? (
            <p className="text-destructive">{part.errorText}</p>
          ) : null}
          {!hits.length && state !== "error" ? <Detail input={part.input} output={part.output} /> : null}
        </div>
      </Fold>
    </div>
  );
}

function Detail({ input, output }: { input: unknown; output: unknown }) {
  const show = (v: unknown) =>
    typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return (
    <div className="space-y-1">
      {input === undefined ? null : (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11.5px] text-muted-foreground leading-relaxed">
          {show(input)}
        </pre>
      )}
      {output === undefined ? null : (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11.5px] text-muted-foreground leading-relaxed">
          {show(output)}
        </pre>
      )}
    </div>
  );
}

function StepIcon({ state }: { state: StepState }) {
  const box = "grid size-4 shrink-0 place-items-center";
  if (state === "running") {
    return (
      <span aria-label="Running" className={box} role="img">
        <span className="size-3 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-[color:var(--brand)] motion-reduce:animate-none" />
      </span>
    );
  }
  if (state === "error") {
    return <AlertCircleIcon aria-label="Failed" className="size-4 shrink-0 text-destructive" />;
  }
  if (state === "denied") {
    return <CircleSlashIcon aria-label="Skipped" className="size-4 shrink-0" />;
  }
  return <CheckIcon aria-label="Done" className="size-4 shrink-0 text-muted-foreground/80" />;
}

/** [n] in the reply becomes a citation chip when source n exists. Code spans and fences are left alone. */
function linkCitations(text: string, sources: CitedSource[]) {
  if (!sources.length) {
    return text;
  }
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((chunk, i) =>
      i % 2
        ? chunk
        : chunk.replace(/\[(\d{1,2})\](?![(:[])/g, (m, n) => {
            const s = sources[Number(n) - 1];
            return s ? `[${n}](${s.url})` : m;
          })
    )
    .join("");
}

function Markdown({
  text,
  live,
  sources,
  className,
}: {
  text: string;
  live: boolean;
  sources: CitedSource[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const label = typeof children === "string" ? children : Array.isArray(children) && children.length === 1 && typeof children[0] === "string" ? children[0] : null;
        const n = label && /^\d{1,2}$/.test(label) ? Number(label) : 0;
        const cited = n ? sources[n - 1] : undefined;
        if (cited && cited.url === href) {
          return <InlineCitationChip index={n} source={cited} />;
        }
        return (
          <a
            className="font-medium text-foreground underline decoration-border underline-offset-[3px] transition-colors hover:decoration-[color:var(--brand)]"
            href={href}
            rel="noreferrer noopener"
            target="_blank"
          >
            {children}
          </a>
        );
      },
    }),
    [sources]
  );
  return (
    <Streamdown
      animated={!reduce}
      className={cn(
        "size-full text-[15px] text-foreground leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:font-mono",
        className
      )}
      components={components}
      isAnimating={live}
      linkSafety={{ enabled: false }}
      plugins={plugins}
    >
      {linkCitations(text, sources)}
    </Streamdown>
  );
}

function SourcesRow({ sources }: { sources: CitedSource[] }) {
  return (
    <Sources data-testid="sources">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourcesTrigger count={sources.length} />
        <span className="flex min-w-0 flex-wrap gap-1.5">
          {sources.slice(0, 4).map((s, i) => (
            <a
              className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border border-border px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
              href={s.url}
              key={s.url}
              rel="noreferrer noopener"
              target="_blank"
              title={s.title ?? s.url}
            >
              <span className="font-mono tabular-nums">{i + 1}</span>
              <span className="truncate">{s.title ?? hostOf(s.url)}</span>
            </a>
          ))}
        </span>
      </div>
      <SourcesContent>
        {sources.map((s, i) => (
          <Source href={s.url} index={i + 1} key={s.url} title={s.title} />
        ))}
      </SourcesContent>
    </Sources>
  );
}
