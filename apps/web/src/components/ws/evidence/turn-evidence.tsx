// G12: the technical detail of one assistant turn, behind a single collapsed disclosure so the reply
// stays readable. Every renderer here draws only facts the run reported and draws nothing without them.
import type { AgentStatus, ChatItem } from '../../../lib/use-project-socket';
import type { ActivityRun } from '../activity-model';
import { PlanEvidence, ActivityChain, TaskEvidence } from './plan-task-cot';
import { ToolInvocation, ReasoningSummary } from './tool-reasoning-stream';
import { TurnSources, TurnCitations, AgentIdentityCard } from './sources-citation-suggest-agent';
import { RunContext } from './context-checkpoint';
import { ScriptCodeBlock, AffectedTree } from './files-code-media-table';
import { scriptOf, treeOf, pathsOf } from './files-code-media-table-model';
import './evidence.css';

export function TurnEvidence({
  item,
  status,
  activity,
  upcoming,
}: {
  item: ChatItem;
  status: AgentStatus | null;
  activity: ActivityRun | null | undefined;
  upcoming?: readonly { title: string }[];
}) {
  if (item.tools.length === 0 && !item.intent && !item.context && !item.streaming) return null;
  return (
    <details className="gx-evidence">
      <summary>Details</summary>
      <ReasoningSummary status={status} running={item.streaming} />
      <PlanEvidence intent={item.intent} upcoming={upcoming} />
      <ActivityChain activity={activity} />
      <TaskEvidence activity={activity} />
      {item.tools.map((t) => (
        <div key={t.toolId}>
          <ToolInvocation tool={t} />
          <ScriptCodeBlock script={scriptOf(t.detail)} />
          <AffectedTree rows={treeOf(pathsOf(t.detail))} />
        </div>
      ))}
      <TurnSources tools={item.tools} />
      <TurnCitations tools={item.tools} />
      <RunContext context={item.context} creditsSpent={item.creditsSpent} />
      <AgentIdentityCard productModel={item.productModel} deniedTools={item.deniedTools} />
    </details>
  );
}
