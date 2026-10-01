/**
 * UI06 ToolInvocation, UI01 ReasoningSummary, UI02 RunShimmer, UI21 StreamingText.
 * Each renders nothing for an absent input. Real socket data only; see tool-reasoning-stream-model.ts.
 */
import type { AgentStatus, ToolEvent } from '../../../lib/use-project-socket';
import { Tool, ToolContent, ToolHeader } from '../../ai-elements/tool';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '../../ai-elements/reasoning';
import { Shimmer } from '../../ai-elements/shimmer';
import { reasoningView, toolView } from './tool-reasoning-stream-model';
import './tool-reasoning-stream.css';

export function ToolInvocation({ tool, defaultOpen }: { tool: ToolEvent | undefined; defaultOpen?: boolean }) {
  const v = toolView(tool);
  if (!v) return null;
  return (
    <Tool defaultOpen={defaultOpen ?? v.state === 'output-error'}>
      <ToolHeader type="dynamic-tool" toolName={v.name} state={v.state} />
      <ToolContent>
        {v.summary && <p className="evidence-tool__summary">{v.summary}</p>}
        {v.target && <p className="evidence-tool__meta">Target: {v.target}</p>}
        {v.durationMs !== undefined && <p className="evidence-tool__meta">Took {(v.durationMs / 1000).toFixed(1)}s</p>}
        {v.outcomeUnavailable && <p className="evidence-tool__note">Outcome not reported.</p>}
        {v.detail !== undefined && (
          <pre className="evidence-tool__detail">
            {v.detail}
            {v.truncated ? '\n... result truncated' : ''}
          </pre>
        )}
      </ToolContent>
    </Tool>
  );
}

/** `status` is the live agent_status; pass `running` false once the run ended, paused or errored. */
export function ReasoningSummary({ status, running, defaultOpen = false }: { status: AgentStatus | null | undefined; running: boolean; defaultOpen?: boolean }) {
  const v = reasoningView(status);
  if (!v) return null;
  return (
    <Reasoning isStreaming={running} defaultOpen={defaultOpen}>
      <ReasoningTrigger getThinkingMessage={(streaming) => (streaming ? <Shimmer as="span" duration={1.6}>{v.phase}</Shimmer> : <span>How this run was planned</span>)} />
      {/* Upstream's ReasoningContent renders markdown from a string: one paragraph per fact. */}
      <ReasoningContent>{[v.phase, v.effort ? `Effort: ${v.effort}` : '', v.reason ?? ''].filter(Boolean).join('\n\n')}</ReasoningContent>
    </Reasoning>
  );
}

/** Shimmer only while something is really in flight; plain text otherwise. */
export function RunShimmer({ active, children }: { active: boolean; children: string | undefined }) {
  if (!children) return null;
  if (!active) return <span>{children}</span>;
  return <Shimmer as="span" duration={1.6}>{children}</Shimmer>;
}

/** The message text once, with a caret only while the stream is open. No replayed typing. */
export function StreamingText({ text, streaming }: { text: string | undefined; streaming: boolean }) {
  if (!text) return null;
  return (
    <span className="evidence-stream-text">
      {text}
      {streaming && <span className="evidence-stream-text__caret" aria-hidden="true" />}
    </span>
  );
}
