// WHAT THE RUN THOUGHT AND DID, STEP BY STEP — AI Elements Reasoning and Task (owner, 2026-10-01).
//
// The order comes from lib/run-trace.ts: each reasoning block is one AI Elements Reasoning, open and
// shimmering ("Thinking…") while its step streams and collapsing to "Thought for N seconds" when the
// step ends or a tool starts; the tools a step ran sit after it as one AI Elements Task, a row per
// tool. The rows are said in plain words (lib/live-status.ts) with the object they touched as a chip —
// never a tool name, an argument, a path or JSON (D-THINK-1: the readers are young creators).
import { useCallback, useRef, useState } from 'react';
import { ChevronDownIcon, SearchIcon, WrenchIcon, XIcon } from 'lucide-react';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '../ai-elements/reasoning';
import { Shimmer } from '../ai-elements/shimmer';
import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from '../ai-elements/task';
import type { ToolEvent } from '../../lib/use-project-socket';
import { disclosureChange, reasoningSeconds, traceSegments, type DisclosureState, type ReasoningBlock, type TraceFields } from '../../lib/run-trace';
import { friendlyName, toolPhrase } from '../../lib/live-status';
import { ACTIVITY_LABEL, kindForTool } from './tool-vocabulary';
import { StepMark } from '../picks/thinking/step-mark';
import { StudioIcon } from '../studio-icon';
import { classForTool } from '../studio-icon-model';

/** How a step ended, from what the wire said. `stopped` = the run ended before it reported. */
export type StepOutcome = 'running' | 'done' | 'failed' | 'stopped';
export function stepOutcome(tool: ToolEvent): StepOutcome {
  if (!tool.done) return 'running';
  if (tool.ok === true) return 'done';
  if (tool.ok === false) return 'failed';
  return 'stopped';
}

const OUTCOME_WORD: Record<StepOutcome, string> = {
  running: 'In progress',
  done: 'Done',
  failed: 'Did not work',
  stopped: 'Stopped before it finished',
};

/**
 * A step's mark, by how it ended — the owner's picks: Motion "To-do list"'s check drawing itself in
 * when the step finished, React Bits "Thought Line"'s breathing dot while it runs (StepMark), a
 * hollow ring for a step the run ended before it reported, and a cross for one that did not work.
 */
function OutcomeMark({ outcome }: { outcome: StepOutcome }) {
  switch (outcome) {
    case 'running': return <StepMark status="active" className="text-foreground" />;
    case 'done': return <StepMark key="done" status="complete" className="text-muted-foreground" />;
    case 'failed': return <XIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" />;
    default: return <StepMark status="pending" className="text-muted-foreground" />;
  }
}

/** The thing a step touched, as Studio draws it — or a plain tool mark for a step on no object. */
function StepObject({ tool }: { tool: ToolEvent }) {
  const robloxClass = classForTool(tool.tool);
  return robloxClass
    ? <StudioIcon robloxClass={robloxClass} className="shrink-0" />
    : <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

/** The Task's title: what kinds of work the group did, in the activity vocabulary. */
export function taskTitle(tools: readonly ToolEvent[]): string {
  const running = tools.find((tool) => !tool.done);
  if (running) return toolPhrase(running.tool, running.target);
  const labels: string[] = [];
  for (const tool of tools) {
    const label = ACTIVITY_LABEL[kindForTool(tool.tool)];
    if (label && !labels.includes(label)) labels.push(label);
  }
  const head = labels.slice(0, 3);
  // Only the first letter of a later label drops its capital: "and searching the Roblox docs".
  const later = (label: string) => `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  const said = head.length <= 1 ? (head[0] ?? 'Worked on your game') : `${head[0]}${head.slice(1, -1).map((l) => `, ${later(l)}`).join('')} and ${later(head[head.length - 1]!)}`;
  return tools.length > 1 ? `${said} · ${tools.length} steps` : said;
}

/**
 * One step's reasoning: AI Elements Reasoning, open and shimmering while the step streams, then
 * "Thought for N seconds". `open` is held here so the reader's own toggle wins over the component's
 * automatic open and close (lib/run-trace.ts disclosureChange): a click marks the next change as the
 * reader's, and Radix runs the trigger's onClick before it toggles.
 */
export function StepReasoning({ block, live }: { block: ReasoningBlock; live: boolean }) {
  const [state, setState] = useState<DisclosureState>({ open: live, readerTouched: false });
  const byReader = useRef(false);
  const onOpenChange = useCallback((next: boolean) => {
    const reader = byReader.current;
    byReader.current = false;
    setState((s) => disclosureChange(s, next, reader));
  }, []);
  return (
    <Reasoning className="mb-0 w-full" isStreaming={live} duration={reasoningSeconds(block)} open={state.open} onOpenChange={onOpenChange} data-step={block.step}>
      <ReasoningTrigger onClick={() => { byReader.current = true; }} />
      <ReasoningContent>{block.text}</ReasoningContent>
    </Reasoning>
  );
}

export function RunSteps({ item, tools, streaming }: { item: TraceFields; tools: readonly ToolEvent[]; streaming: boolean }) {
  const byId = new Map(tools.map((tool) => [tool.toolId, tool]));
  const segments = traceSegments(item, tools.map((tool) => tool.toolId));
  // While the run is live and nothing is visibly moving (before the first thought, or between a
  // finished step and the next), the run says so with AI Elements Shimmer — the only live line.
  const last = segments[segments.length - 1];
  const moving = last !== undefined && (last.kind === 'reasoning'
    ? last.block.endedAt === undefined
    : last.toolIds.some((id) => byId.get(id)?.done === false));
  const waiting = streaming && !moving;
  if (segments.length === 0 && !waiting) return null;
  return (
    <div className="flex flex-col gap-3" data-run-steps="">
      {segments.map((segment) => {
        if (segment.kind === 'reasoning') {
          const { block } = segment;
          return <StepReasoning key={block.id} block={block} live={streaming && block.endedAt === undefined} />;
        }
        const group = segment.toolIds.map((id) => byId.get(id)).filter((tool): tool is ToolEvent => Boolean(tool));
        if (group.length === 0) return null;
        const active = group.some((tool) => !tool.done);
        return (
          <Task key={segment.key} defaultOpen={streaming}>
            {/* Upstream's own trigger markup, as a <button> rather than its <div>: the Task has to open
                from the keyboard too, and a div is not in the tab order. */}
            <TaskTrigger title={taskTitle(group)}>
              <button type="button" aria-busy={active || undefined} className="flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
                <SearchIcon className="size-4" aria-hidden="true" />
                {active
                  ? <Shimmer as="p" className="text-sm" duration={1}>{taskTitle(group)}</Shimmer>
                  : <p className="text-sm">{taskTitle(group)}</p>}
                <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
              </button>
            </TaskTrigger>
            <TaskContent>
              {group.map((tool) => {
                const outcome = stepOutcome(tool);
                const name = friendlyName(tool.target);
                return (
                  <TaskItem key={tool.toolId} className="flex items-center gap-2" data-outcome={outcome}>
                    <OutcomeMark outcome={outcome} />
                    <StepObject tool={tool} />
                    {outcome === 'running'
                      ? <Shimmer as="span" duration={1}>{toolPhrase(tool.tool, tool.target)}</Shimmer>
                      : <span>{toolPhrase(tool.tool, tool.target)}</span>}
                    {name && <TaskItemFile>{name}</TaskItemFile>}
                    <span className="sr-only">{OUTCOME_WORD[outcome]}</span>
                  </TaskItem>
                );
              })}
            </TaskContent>
          </Task>
        );
      })}
      {waiting && <Shimmer as="p" className="text-sm" duration={1}>Thinking...</Shimmer>}
    </div>
  );
}
