// THE THIN ROW AFTER A TURN THAT CHANGED THE PLACE.
//
// Three picks, one row:
//   * AI Elements "checkpoint" — after each turn that changed the place, a quiet "Saved point ·
//     Restore" line, wired to the restore that already exists (the Checkpoints drawer);
//   * AI Elements "task" — what changed sits folded inside it as a task list, because the reply
//     already says what happened and the list is detail;
//   * Motion "Layout Anchor" (MIT, re-implemented without Motion) — the count badge stays pinned to
//     the card's top corner while the card grows open, instead of riding the resize.
//
// WHAT COUNTS AS A CHANGE is not decided here. @golem/shared's GOVERNED_TOOLS marks every tool that
// writes to the place ('changes'), from the worker's own registry; a step counts only when it
// finished and did not report a failure. A turn that only read, searched or planned draws nothing.
import { useRef, useState } from 'react';
import { GOVERNED_TOOLS } from '@golem/shared';
import type { ToolEvent } from '../../../lib/use-project-socket';
import { useShell } from '../../../lib/shell';
import { labelForTool } from '../../ws/tool-vocabulary';
import { Task, TaskContent, TaskItem, TaskTrigger } from '../../ai-elements/task';
import { ChevronDownIcon } from '../../ai-elements/icons';
import { useIsomorphicLayoutEffect } from '../../ai-elements/lib/use-isomorphic-layout-effect';
import { canAnimate, OVERSHOOT } from './motion';
import './turn-checkpoint.css';

const WRITERS = new Set(GOVERNED_TOOLS.filter((tool) => tool.group === 'changes').map((tool) => tool.name));

/** What a turn changed in the place, in plain words, with repeats counted. */
export function placeChanges(tools: readonly ToolEvent[]): { label: string; times: number }[] {
  const out = new Map<string, number>();
  for (const step of tools) {
    if (!step.done || step.ok === false || !WRITERS.has(step.tool)) continue;
    const label = labelForTool(step.tool);
    out.set(label, (out.get(label) ?? 0) + 1);
  }
  return [...out].map(([label, times]) => ({ label, times }));
}

/**
 * The Checkpoints opener the workspace lends the shell. Read defensively: a turn rendered outside
 * the app shell (a test, a preview route) has no shell, and a missing opener is a row with no
 * button — not a crash.
 */
function useCheckpointOpener(): (() => void) | null {
  try {
    return useShell().openCheckpoints;
  } catch {
    return null;
  }
}

export function TurnCheckpoint({ tools }: { tools: readonly ToolEvent[] }) {
  const changes = placeChanges(tools);
  const saved = tools.some((step) => step.tool === 'create_checkpoint' && step.done && step.ok !== false);
  const openCheckpoints = useCheckpointOpener();
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const height = useRef<number | null>(null);

  // The card's height tweens between closed and open; the badge is anchored to its corner, so it
  // stays where it is while everything under it moves.
  useIsomorphicLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const next = el.offsetHeight;
    if (height.current !== null && height.current !== next && canAnimate(el)) {
      el.animate([{ height: `${height.current}px`, overflow: 'hidden' }, { height: `${next}px`, overflow: 'hidden' }], {
        duration: 280,
        easing: OVERSHOOT,
      });
    }
    height.current = next;
  }, [open]);

  if (changes.length === 0) return null;
  const total = changes.reduce((sum, c) => sum + c.times, 0);

  return (
    <div ref={card} className="pk-cp" data-state={open ? 'open' : 'closed'}>
      <Task defaultOpen={false} open={open} onOpenChange={setOpen}>
        <TaskTrigger title={saved ? 'Saved point' : 'Your place changed'}>
          <button type="button" className="pk-cp__trigger">
            <span className="pk-cp__dot" aria-hidden="true" />
            <span className="pk-cp__title">{saved ? 'Saved point' : 'Your place changed'}</span>
            <ChevronDownIcon size={14} className="pk-cp__chevron" aria-hidden="true" />
          </button>
        </TaskTrigger>
        <span className="pk-cp__badge">
          {total} {total === 1 ? 'change' : 'changes'}
        </span>
        <TaskContent className="pk-cp__content">
          {changes.map((c) => (
            <TaskItem key={c.label}>
              {c.label}
              {c.times > 1 && <span className="pk-cp__times"> ×{c.times}</span>}
            </TaskItem>
          ))}
        </TaskContent>
      </Task>
      {openCheckpoints && (
        <button
          type="button"
          className="pk-cp__restore"
          onClick={openCheckpoints}
          title="Open Checkpoints to go back to an earlier version of your place"
        >
          {saved ? 'Restore' : 'Checkpoints'}
        </button>
      )}
    </div>
  );
}
