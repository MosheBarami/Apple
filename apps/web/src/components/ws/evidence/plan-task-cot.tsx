// Evidence renderers for Task (UI05), Plan (UI08) and Chain of Thought (UI15). Each composes the
// vendored AI Elements over already-reduced run data and returns null when there is none.
// The Chain of Thought is the public Activity timeline (ActivityRun), never model reasoning.
import type { RunIntent } from '@golem/shared';
import type { ActivityRun } from '../activity-model';
import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from '../../ai-elements/task';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '../../ai-elements/chain-of-thought';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import { cotSteps, planView, taskGroups } from './plan-task-cot-model';

export function TaskEvidence({ activity }: { activity: ActivityRun | null | undefined }) {
  const groups = taskGroups(activity);
  if (groups.length === 0) return null;
  return (
    <div className="evidence-tasks">
      {groups.map((g) => (
        <Task key={g.key} data-task-state={g.state}>
          <TaskTrigger title={g.title}>
            <button type="button" className="evidence-task__trigger">{g.title}</button>
          </TaskTrigger>
          <TaskContent>
            {g.items.map((i) => (
              <TaskItem key={i.key} data-step-state={i.state}>
                {i.label}
                {i.detail ? ` · ${i.detail}` : ''}
              </TaskItem>
            ))}
            {g.files.length > 0 && (
              <TaskItem>
                {g.files.map((f) => (
                  <TaskItemFile key={f} data-file="">{f}</TaskItemFile>
                ))}
              </TaskItem>
            )}
          </TaskContent>
        </Task>
      ))}
    </div>
  );
}

function List({ title, rows }: { title: string; rows: string[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h4>{title}</h4>
      <ul>
        {rows.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </section>
  );
}

/** A plan card, not a mode: it has no approve/reject control. */
export function PlanEvidence({
  intent,
  upcoming,
}: {
  intent: RunIntent | null | undefined;
  upcoming?: readonly { title: string }[];
}) {
  const plan = planView(intent, upcoming);
  if (!plan) return null;
  return (
    <Collapsible className="evidence-plan" defaultOpen>
      <CollapsibleTrigger className="evidence-plan__trigger">Plan</CollapsibleTrigger>
      <CollapsibleContent>
        {plan.summary && <p>{plan.summary}</p>}
        <List title="What you asked for" rows={plan.items} />
        <List title="Coming up" rows={plan.upcoming} />
        <List title="Assumed" rows={plan.assumptions} />
        <List title="Still open" rows={plan.questions} />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ActivityChain({ activity }: { activity: ActivityRun | null | undefined }) {
  const steps = cotSteps(activity);
  if (steps.length === 0) return null;
  return (
    <ChainOfThought>
      <ChainOfThoughtHeader>Activity</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((s) => (
          <ChainOfThoughtStep key={s.key} label={s.label} description={s.description} status={s.status} />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
