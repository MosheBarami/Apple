// What the StudPilot Studio agent (apps/studio, rebuild R2) may call through StudioGate.
//
// Reads are the read-only MCP surface's place reads; knowledge tools are offline reference data. Writes are the
// ordinary place edits and the reviewed blocks the product's own agent uses; each Studio turn that writes is preceded
// by a checkpoint (SessionDO `/studio-tool`), so the user can put the place back. Not here on purpose: `run_luau`
// (code execution), uploads, model generation, Creator Store inserts, and anything that spends beyond the model.
// apps/studio/scripts/gen-tools.mjs builds the agent's tools from this list.
export const STUDIO_READ_TOOLS = [
  'get_project_tree',
  'list_scripts',
  'read_script',
  'search_scripts',
  'get_instance',
  'get_output_logs',
] as const;

// Offline knowledge: reviewed patterns and data checked into the Worker bundle. No Studio op, no network, no spend.
export const STUDIO_KNOWLEDGE_TOOLS = [
  'find_mechanic',
  'get_verified_module',
  'get_ui_construction',
  'get_genre_kit',
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
  // The reviewed blocks (plan section 3): the model picks one and fills in its parameters; the harness runs it.
  'install_module',
  'build_object',
  'build_blocks',
  'set_mood',
  'add_effect',
  'add_behaviour',
] as const;

export const STUDIO_TOOLS: readonly string[] = [...STUDIO_READ_TOOLS, ...STUDIO_KNOWLEDGE_TOOLS, ...STUDIO_WRITE_TOOLS];
export const isStudioWriteTool = (name: string): boolean => (STUDIO_WRITE_TOOLS as readonly string[]).includes(name);
