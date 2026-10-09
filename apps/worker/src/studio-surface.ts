// What the StudPilot agent (apps/studio, rebuild 2026-10-08) may call through StudioGate: the place reads and edits
// Roblox's own Studio MCP server offers (read the tree and scripts, edit instances and scripts, execute Luau, insert a
// store asset, play-test, read the console), plus terrain and animation. Each turn that writes is preceded by a
// checkpoint (SessionDO `/studio-tool`), so the user can put the place back. Not here: uploads to the owner's Roblox
// account and anything that spends beyond the model.
// apps/studio/scripts/gen-tools.mjs builds the agent's tools from this list.
// Plugin 2.0 (2026-10-08): read_instance (every writable property, from the API dump) replaced get_instance, glob
// (instances by path shape and class) replaced list_scripts, and grep (text or Lua pattern, context, path globs)
// replaced search_scripts. run_tests rides on play_check (tests:true): the surface is at its 25-tool cap.
export const STUDIO_READ_TOOLS = [
  'get_project_tree',
  'read_instance',
  'glob',
  'read_script',
  'grep',
  'get_output_logs',
  'model_anatomy',
  'check_ui',
] as const;

// No offline "knowledge" tools any more (rebuild 2026-10-08): no reviewed patterns, kits or verified modules. The agent's
// knowledge is the Roblox docs it searches and the skills it loads, both served by the Studio worker itself.
export const STUDIO_KNOWLEDGE_TOOLS = [] as const;

export const STUDIO_WRITE_TOOLS = [
  'build_ui',
  'create_instances',
  'set_properties',
  'delete_instances',
  'transform_instances',
  'apply_surface',
  'edit_script',
  'run_luau',
  'edit_terrain',
  'insert_from_store',
  'make_image',
  'animate_model',
  'play_check',
] as const;

export const STUDIO_TOOLS: readonly string[] = [...STUDIO_READ_TOOLS, ...STUDIO_KNOWLEDGE_TOOLS, ...STUDIO_WRITE_TOOLS];
export const isStudioWriteTool = (name: string): boolean => (STUDIO_WRITE_TOOLS as readonly string[]).includes(name);
