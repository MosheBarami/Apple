// What the StudPilot Studio agent (apps/studio, rebuild R2) may call through StudioGate.
//
// Reads are the read-only MCP surface's place reads. Writes are the ordinary place edits the product's own
// agent makes; each Studio turn that writes is preceded by a checkpoint (SessionDO `/studio-tool`), so the
// user can put the place back. Not here on purpose: `run_luau` (code execution), uploads, model generation,
// and anything that spends credits. apps/studio/scripts/gen-tools.mjs builds the agent's tools from this list.
export const STUDIO_READ_TOOLS = [
  'get_project_tree',
  'list_scripts',
  'read_script',
  'search_scripts',
  'get_instance',
  'get_output_logs',
] as const;

export const STUDIO_WRITE_TOOLS = [
  'edit_script',
  'create_instances',
  'set_properties',
  'delete_instances',
  'move_instances',
  'clone_instances',
  'group_instances',
  'rename_instance',
  'play_check',
] as const;

export const STUDIO_TOOLS: readonly string[] = [...STUDIO_READ_TOOLS, ...STUDIO_WRITE_TOOLS];
export const isStudioWriteTool = (name: string): boolean => (STUDIO_WRITE_TOOLS as readonly string[]).includes(name);
