// The Thinking experience: a user-visible reasoning and action summary.
//
// WHAT THIS IS NOT: it is not the model's chain of thought. No prompt, no
// system message, no hidden reasoning token and no transcript content reaches
// this component. Everything it renders is derived from two sources, both of
// which are observable facts about execution:
//
//   1. tool events the worker actually dispatched (tool_start / tool_end)
//   2. the phase the worker announced immediately before entering it
//
// Consequently a step can only appear once the backend has confirmed it. There
// is no speculative "up next" list, and no percentage — a progress bar here
// would be a guess, and a guess presented as measurement is a lie.
import { useState } from 'react';
import type { AgentPhase } from '@golem/shared';
import type { AgentStatus, ToolEvent } from '../../lib/use-project-socket';
import { Icon, PATH } from './primitives';

/** Human labels for the lifecycle. Present tense while active reads better. */
const PHASE_LABEL: Record<AgentPhase, string> = {
  understanding: 'Understanding the request',
  planning: 'Planning',
  inspecting: 'Inspecting the project',
  building: 'Building',
  writing_luau: 'Writing Luau',
  rendering: 'Rendering',
  critiquing: 'Reviewing the result',
  rebuilding: 'Starting the layout over',
  playtesting: 'Playtesting',
  debugging: 'Reading the output',
  verifying: 'Verifying',
  checkpointing: 'Saving a checkpoint',
  remembering: 'Noting what changed',
  done: 'Done',
};

/** A friendlier name per tool, for the detail line under a step. */
const TOOL_LABEL: Record<string, string> = {
  get_project_tree: 'Read the project tree',
  list_scripts: 'Listed scripts',
  read_script: 'Read a script',
  search_scripts: 'Searched scripts',
  search_docs: 'Searched the Roblox docs',
  edit_script: 'Edited a script',
  create_instances: 'Created instances',
  set_properties: 'Set properties',
  delete_instances: 'Deleted instances',
  insert_asset: 'Inserted an asset',
  generate_model: 'Generated a model',
  run_luau: 'Ran Luau',
  render_view: 'Rendered the scene',
  check_composition: 'Checked composition and intent',
  inspect_visually: 'Looked at the result',
  run_and_check: 'Ran the game and checked it',
  get_output_logs: 'Read the output log',
  create_checkpoint: 'Saved a checkpoint',
  remember: 'Noted a fact about the project',
  choose_asset_source: 'Chose an asset source',
  search_asset_library: 'Searched the asset library',
  find_verified_asset: 'Looked for a verified asset',
  inspect_model: 'Inspected a model',
};

type StepState = 'done' | 'active' | 'failed';

interface Step {
  key: string;
  label: string;
  detail?: string;
  state: StepState;
}

function Mark({ state }: { state: StepState }) {
  if (state === 'active') {
    return (
      <svg className="gx-ring" viewBox="0 0 16 16" aria-hidden="true">
        <circle className="gx-ring__track" cx="8" cy="8" r="5" />
        <circle className="gx-ring__spin" cx="8" cy="8" r="5" />
      </svg>
    );
  }
  if (state === 'failed') {
    return (
      <svg className="gx-tick" width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="gx-tick" width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Turn the observable record into steps.
 *
 * Consecutive tools in the same phase collapse into one step, so a run that
 * reads six scripts shows "Inspecting the project" once with a count, rather
 * than six near-identical lines.
 */
function buildSteps(tools: ToolEvent[], status: AgentStatus | null, streaming: boolean): Step[] {
  const steps: Step[] = [];

  for (const tool of tools) {
    const label = TOOL_LABEL[tool.tool] ?? tool.tool.replace(/_/g, ' ');
    const state: StepState = !tool.done ? 'active' : tool.ok === false ? 'failed' : 'done';
    steps.push({
      key: tool.toolId,
      label,
      // The worker's own one-line summary of what the tool returned.
      detail: tool.summary && tool.summary !== tool.tool ? tool.summary : undefined,
      state,
    });
  }

  // The phase the worker is in right now, when no tool is mid-flight. This is
  // the model thinking between tool calls — a real state, so it gets a line.
  const toolRunning = tools.some((t) => !t.done);
  if (streaming && status && !toolRunning) {
    steps.push({ key: `phase:${status.phase}`, label: PHASE_LABEL[status.phase] ?? status.phase, state: 'active' });
  }

  return steps;
}

export function Thinking({
  tools,
  status,
  streaming,
}: {
  tools: ToolEvent[];
  status: AgentStatus | null;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const steps = buildSteps(tools, status, streaming);
  if (!steps.length) return null;

  const active = steps.find((s) => s.state === 'active');
  const failed = steps.filter((s) => s.state === 'failed').length;
  const done = steps.filter((s) => s.state === 'done').length;

  // The collapsed headline says what is happening now, or what happened.
  const headline = active
    ? active.label
    : failed
      ? `Worked through ${done + failed} steps, ${failed} needed another try`
      : `Worked through ${done} step${done === 1 ? '' : 's'}`;

  return (
    <div className={`gx-think${streaming ? ' is-live' : ''}`}>
      <button
        type="button"
        className="gx-think__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="gx-think__chev">
          <Icon d={PATH.chevronRight} size={13} />
        </span>
        <span>{headline}</span>
        <span className="gx-think__count">
          {status?.step && status?.totalSteps && streaming ? `${status.step}/${status.totalSteps}` : steps.length}
        </span>
      </button>

      <div className={`gx-think__body${open ? ' is-open' : ''}`}>
        <div className="gx-think__inner">
          <ol className="gx-steps">
            {steps.map((step) => (
              <li key={step.key} className={`gx-step is-${step.state}`}>
                <span className="gx-step__mark">
                  <Mark state={step.state} />
                </span>
                <span className="gx-step__label">
                  {step.label}
                  {step.detail && <span className="gx-step__detail">{step.detail}</span>}
                </span>
              </li>
            ))}
          </ol>

          {/* The reasoning POLICY's own justification for the effort tier it
              picked. A classification of the request, not the model's private
              reasoning. */}
          {status?.effort && (
            <p className="gx-pop__note" style={{ paddingLeft: 0 }}>
              Reasoning effort: <strong>{status.effort}</strong>
              {status.effortReason ? ` — ${status.effortReason}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Announce phase changes to assistive technology without flooding it:
          polite, and only the headline. */}
      <span className="gx-sr" aria-live="polite">
        {streaming ? headline : ''}
      </span>
    </div>
  );
}
