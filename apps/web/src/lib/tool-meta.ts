// What each agent tool *means* to a person watching.
//
// The timeline must read as: reasoning state → tool → Studio → observation →
// result. That requires knowing which stage a tool belongs to and what it does
// in plain words. Private chain-of-thought is never surfaced — only the state,
// the tool, and the observed result.

export type ToolStage = 'inspect' | 'build' | 'run' | 'verify' | 'knowledge';

export interface ToolMeta {
  stage: ToolStage;
  /** Human label shown next to the mono tool name. */
  label: string;
  /** Does this tool reach into the user's open Studio place? */
  touchesStudio: boolean;
}

const TOOLS: Record<string, ToolMeta> = {
  get_project_tree: { stage: 'inspect', label: 'Reading the place', touchesStudio: true },
  list_scripts: { stage: 'inspect', label: 'Listing scripts', touchesStudio: true },
  read_script: { stage: 'inspect', label: 'Reading a script', touchesStudio: true },
  search_scripts: { stage: 'inspect', label: 'Searching scripts', touchesStudio: true },
  get_instance: { stage: 'inspect', label: 'Inspecting an instance', touchesStudio: true },
  get_selection: { stage: 'inspect', label: 'Reading your selection', touchesStudio: true },

  edit_script: { stage: 'build', label: 'Editing a script', touchesStudio: true },
  create_instances: { stage: 'build', label: 'Placing instances', touchesStudio: true },
  set_properties: { stage: 'build', label: 'Setting properties', touchesStudio: true },
  delete_instances: { stage: 'build', label: 'Deleting instances', touchesStudio: true },
  move_instances: { stage: 'build', label: 'Reparenting instances', touchesStudio: true },
  insert_asset: { stage: 'build', label: 'Inserting an asset', touchesStudio: true },

  run_luau: { stage: 'run', label: 'Running Luau in Studio', touchesStudio: true },
  run_and_check: { stage: 'run', label: 'Playtesting', touchesStudio: true },
  get_output_logs: { stage: 'run', label: 'Reading the output log', touchesStudio: true },

  render_view: { stage: 'verify', label: 'Rendering the scene', touchesStudio: true },
  inspect_visually: { stage: 'verify', label: 'Looking at the result', touchesStudio: true },

  search_docs: { stage: 'knowledge', label: 'Checking the docs', touchesStudio: false },
  remember: { stage: 'knowledge', label: 'Updating project memory', touchesStudio: false },
  create_checkpoint: { stage: 'knowledge', label: 'Saving a checkpoint', touchesStudio: true },
};

const UNKNOWN: ToolMeta = { stage: 'inspect', label: 'Working', touchesStudio: false };

export function toolMeta(tool: string): ToolMeta {
  return TOOLS[tool] ?? UNKNOWN;
}

export const STAGE_LABEL: Record<ToolStage, string> = {
  inspect: 'Reading',
  build: 'Building',
  run: 'Running',
  verify: 'Verifying',
  knowledge: 'Recalling',
};

/**
 * The headline state for a run, chosen from what it is *doing*, not from what it
 * is thinking. Falls back to the worker's own agent_status phase.
 */
export function runPhase(tools: { tool: string; done: boolean }[], fallback: string | null): string {
  const live = tools.find((t) => !t.done);
  if (live) return STAGE_LABEL[toolMeta(live.tool).stage];
  if (fallback === 'planning') return 'Planning';
  if (fallback === 'thinking') return 'Thinking';
  if (fallback === 'working') return 'Working';
  if (tools.length > 0) return STAGE_LABEL[toolMeta(tools[tools.length - 1]!.tool).stage];
  return 'Thinking';
}

/** Loading sequences differ per operation — see components/loading.tsx. */
export type OperationKind = 'building' | 'verifying' | 'rendering' | 'restoring' | 'connecting' | 'recalling';

export const OPERATION_STEPS: Record<OperationKind, string[]> = {
  building: ['Reading the place', 'Writing the changes', 'Applying in Studio', 'Checking the result'],
  verifying: ['Running the place', 'Reading the output', 'Judging what changed'],
  rendering: ['Framing the camera', 'Rasterising the scene', 'Packing the pixels', 'Grading the composition'],
  restoring: ['Loading the snapshot', 'Rewinding the place', 'Re-linking scripts'],
  connecting: ['Minting a pairing code', 'Waiting for Studio', 'Handshaking'],
  recalling: ['Opening the session', 'Recalling the conversation', 'Loading checkpoints'],
};
