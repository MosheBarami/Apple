// The tool timeline.
//
// This is the component that has to say "an AI is at work in your place" without
// ever showing private reasoning. What it shows is only: the *state* Golem is in
// (planning / building / verifying), the tool it reached for, whether that tool
// touched Studio, how long it took, and the observed result the tool reported
// back. Nothing here is model output beyond the tool's own one-line summary.
import { useState } from 'react';
import { formatDuration } from '../lib/format';
import { runPhase, STAGE_LABEL, toolMeta } from '../lib/tool-meta';
import type { ToolEvent } from '../lib/use-project-socket';

interface ToolTimelineProps {
  tools: ToolEvent[];
  /** Raw phase from the worker's agent_status, used only as a fallback label. */
  agentPhase?: string | null;
  running?: boolean;
  /** Present a tool's structured result on the work surface. */
  onOpen?: (tool: ToolEvent) => void;
  /** Start expanded (used while a run is live). */
  defaultOpen?: boolean;
}

function statusOf(tool: ToolEvent): 'running' | 'ok' | 'fail' {
  if (!tool.done) return 'running';
  return tool.ok === false ? 'fail' : 'ok';
}

export function ToolTimeline({ tools, agentPhase = null, running = false, onOpen, defaultOpen }: ToolTimelineProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  if (tools.length === 0) return null;

  const phase = runPhase(tools, agentPhase);
  const totalMs = tools.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const failed = tools.filter((t) => t.done && t.ok === false).length;

  return (
    <div className="timeline">
      <button
        type="button"
        className="timeline-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`timeline-phase${running ? ' is-live' : ''}`}>
          <span className="timeline-phase-dot" aria-hidden="true" />
          {phase}
        </span>
        <span className="timeline-count">
          {tools.length} step{tools.length === 1 ? '' : 's'}
          {failed > 0 ? ` · ${failed} failed` : ''}
          {totalMs > 0 ? ` · ${formatDuration(totalMs)}` : ''}
        </span>
        <span className="timeline-caret" aria-hidden="true">
          ▸
        </span>
      </button>

      {open && (
        <ol className="timeline-body">
          {tools.map((tool) => {
            const meta = toolMeta(tool.tool);
            const status = statusOf(tool);
            return (
              <li key={tool.toolId} className={`tl-step tl-step--${status}`}>
                <span className="tl-node" aria-hidden="true">
                  {status === 'running' ? <span className="tl-spinner" /> : status === 'ok' ? '✓' : '✗'}
                </span>
                <span className="tl-main">
                  <span className="tl-tool">
                    {tool.tool}
                    {meta.touchesStudio && <span className="visually-hidden"> (in Roblox Studio)</span>}
                  </span>
                  <span className="tl-summary">
                    {tool.summary || (status === 'running' ? `${meta.label}…` : 'No result reported.')}
                  </span>
                  {onOpen && tool.detail !== undefined && tool.detail !== null && (
                    <button type="button" className="tl-open" onClick={() => onOpen(tool)}>
                      Open result
                    </button>
                  )}
                </span>
                <span className="tl-time">
                  <span className="visually-hidden">{STAGE_LABEL[meta.stage]}, </span>
                  {tool.durationMs !== undefined ? formatDuration(tool.durationMs) : '…'}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
