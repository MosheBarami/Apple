/**
 * ONE TABLE OF TOOLS, AND THE ACTIVITY VOCABULARY THEY MAP ONTO.
 *
 * There were three copies of the tool table: `TOOL_KIND` and `STEP_LABEL` in
 * activity-model, and `TOOL_LABEL` in thinking-model. The two label tables were
 * word-for-word identical across 23 entries, which is the strongest possible
 * evidence that they were one table wearing two names.
 *
 * They had already drifted in both available directions:
 *
 *   - all three were missing `generate_image`, so a run that generated an image
 *     showed the underscore-stripped fallback, "generate image", where every
 *     other step showed a written sentence;
 *   - two of them carried `visual_critique`, which is not a tool at all — it is
 *     the name of a JSON schema in the worker's vision.ts. Vocabulary for a tool
 *     that cannot run reads like coverage and is worth less than nothing.
 *
 * `tool-vocabulary.test.mjs` now checks this table against the worker's own TOOLS
 * registry in both directions, so neither kind of drift can return.
 *
 * §16.1 Board C names the canonical activity vocabulary, C01-C18. `canonical` on
 * each entry is that identifier. Three entries have no C number and say so: a
 * `null` is a deliberate statement that the product needed a word the reference
 * set does not have, which is a different thing from an unlabelled guess.
 */

/** The C-series, plus the three states this product needs beyond it. */
export const ACTIVITY = {
  understanding: { canonical: 'C01', label: 'Understanding' },
  inspecting: { canonical: 'C02', label: 'Inspecting project' },
  planning: { canonical: 'C03', label: 'Planning' },
  searching_knowledge: { canonical: 'C04', label: 'Searching the Roblox docs' },
  searching_assets: { canonical: 'C05', label: 'Searching assets' },
  reading_scripts: { canonical: 'C06', label: 'Reading scripts' },
  writing_luau: { canonical: 'C07', label: 'Writing Luau' },
  editing: { canonical: 'C08', label: 'Editing project' },
  building: { canonical: 'C09', label: 'Building world' },
  generating: { canonical: 'C11', label: 'Generating' },
  rendering: { canonical: 'C13', label: 'Rendering' },
  playtesting: { canonical: 'C14', label: 'Playtesting' },
  // C15 is "Diagnosing". The product says what the step actually did, because
  // reading a log is the concrete thing and "diagnosing" is the claim about it.
  debugging: { canonical: 'C15', label: 'Reading the output' },
  repairing: { canonical: 'C16', label: 'Repairing' },
  verifying: { canonical: 'C17', label: 'Verifying' },
  saving: { canonical: 'C18', label: 'Saving project' },

  // --- beyond the reference set ------------------------------------------
  // Judging a render for quality. Not C17: verifying asks whether the change
  // landed, this asks whether it is any good, and they disagree often enough
  // that collapsing them would hide the interesting half.
  critiquing: { canonical: null, label: 'Evaluating' },
  // Writing project memory. C18 is saving the PLACE, which is `create_checkpoint`.
  remembering: { canonical: null, label: 'Noting what changed' },
  // Reading something OUTSIDE the project: a web page, a search, a repository, an image the agent
  // did not render. Not C04, which is specifically the Roblox documentation and says so on screen
  // — telling a user "Searching the Roblox docs" while the agent reads a GitHub issue is a wrong
  // sentence, and the whole reason this table exists is that wrong sentences shipped.
  browsing: { canonical: null, label: 'Reading the web' },
  // The project's scratch files, which are Golem's storage and not the Roblox place. C08 is
  // "Editing project", and using it here would claim the agent touched the user's game.
  filing: { canonical: null, label: 'Working with project files' },
  // The honest fallback for a tool this build has never heard of.
  working: { canonical: null, label: 'Working' },
} as const;

export type ActivityKind = keyof typeof ACTIVITY;

/**
 * Two canonical activities this product cannot honestly show, recorded here so
 * their absence is a decision on the record rather than an oversight — the same
 * treatment M06 gets in `empty-state-model.ts`.
 */
export const ACTIVITY_NOT_MODELLED: Record<string, string> = {
  C10: 'Creating UI. There is no signal for it: `tool_start` on the wire carries a tool '
    + 'name and a free-text summary, and no arguments, so nothing distinguishes creating a '
    + 'ScreenGui from creating a wall. Deriving it by string-matching the summary would be a '
    + 'guess wearing a canonical label. It needs the class names on the wire first.',
  C12: 'Connecting Studio. Not an activity in a run at all — pairing happens outside the '
    + 'agent loop and has its own surface in pairing-dialog.tsx and the M04/M05 states. '
    + 'Putting it in the activity stream would claim the agent did something it never did.',
};

/**
 * Tool -> the activity it is, and how to say what it did.
 *
 * `label` is past tense: it is read in a finished list far more often than while
 * the step is running.
 */
export const TOOL = {
  // C02 — reading the world.
  get_project_tree: { kind: 'inspecting', label: 'Read the project tree' },
  inspect_model: { kind: 'inspecting', label: 'Inspected a model' },

  // C06 — reading the code. Distinct from C02: a project's scripts and its
  // instance tree answer different questions and fail in different ways.
  list_scripts: { kind: 'reading_scripts', label: 'Listed scripts' },
  read_script: { kind: 'reading_scripts', label: 'Read a script' },
  search_scripts: { kind: 'reading_scripts', label: 'Searched scripts' },
  // Three static-analysis tools the worker gained without labels here, so the trace rendered
  // `review_scripts` at a person. The kinds are chosen by what the user sees happen, not by where
  // the code lives: a review CRITIQUES, resolving a name READS, and the formatter WRITES.
  review_scripts: { kind: 'critiquing', label: 'Reviewed the scripts' },
  find_symbol: { kind: 'reading_scripts', label: 'Looked up a name' },
  format_script: { kind: 'writing_luau', label: 'Formatted a script' },

  // C04 — reading the docs is not inspecting the user's project.
  search_docs: { kind: 'searching_knowledge', label: 'Searched the Roblox docs' },
  search_creation_skills: { kind: 'searching_knowledge', label: 'Searched the creation skills' },
  read_creation_skill: { kind: 'searching_knowledge', label: 'Read a creation skill' },
  get_genre_references: { kind: 'searching_knowledge', label: 'Reviewed references for this genre' },
  // Named for the question, not the table. "Looked up how a shop is usually built" is what the
  // owner sees the agent doing; "Called find_mechanic" is a sentence about our tool registry.
  find_mechanic: { kind: 'searching_knowledge', label: 'Looked up how this mechanic is usually built' },
  // TWO TOOLS THE WORKER GAINED WHILE THIS TABLE STOOD STILL, which the cross-check in
  // tool-vocabulary.test.mjs caught: without an entry each would have rendered through the
  // underscore-stripping fallback as "get ui construction" and "get verified module" — our
  // registry's names, in the middle of a column of written sentences.
  // Named for the question the agent is answering, per the two notes below: what the owner sees is
  // Apple checking how a real shop screen is put together, and Apple reaching for logic that has
  // already been run rather than writing the arithmetic fresh.
  get_ui_construction: { kind: 'searching_knowledge', label: 'Looked up how this screen is usually built' },
  get_verified_module: { kind: 'searching_knowledge', label: 'Took logic that has already been checked' },

  // C05
  choose_asset_source: { kind: 'searching_assets', label: 'Chose an asset source' },
  // Named for what the player gets, not for the table it read. "Picked the horror kit" is a
  // sentence the owner can check against the game on screen; "Got a genre kit" is a sentence about
  // our own data model, which is not a thing anybody watching a build is trying to find out.
  get_genre_kit: { kind: 'searching_assets', label: 'Picked the style for this genre' },
  find_verified_asset: { kind: 'searching_assets', label: 'Looked for a verified asset' },

  // C11
  generate_model: { kind: 'generating', label: 'Generated a model' },
  generate_image: { kind: 'generating', label: 'Generated an image' },
  // The two audio tools that MAKE something. Both produce a file the user can hear and download,
  // and neither puts anything in their Roblox place — so the label says what was made rather than
  // where it went, which is the same care `generate_image` takes.
  generate_sound: { kind: 'generating', label: 'Made a sound effect' },
  speak_line: { kind: 'generating', label: 'Spoke a line' },

  // C09 — adding to the world.
  create_instances: { kind: 'building', label: 'Created instances' },
  insert_asset: { kind: 'building', label: 'Inserted an asset' },
  edit_terrain: { kind: 'building', label: 'Edited terrain' },
  build_scene: { kind: 'building', label: 'Built the scene' },
  // Arbitrary Luau against the place can do anything; `building` is the coarsest
  // honest answer rather than a specific claim about which.
  run_luau: { kind: 'building', label: 'Ran Luau' },

  // The two audio tools that change the PLACE. `design_sound` writes SoundService's reverb and the
  // SoundGroup mixer; `assign_sounds` routes Sounds that already exist onto those groups. Neither
  // creates geometry, and neither adds audio — which is why the labels say "acoustics" and "routed"
  // rather than anything that implies a sound was added.
  design_sound: { kind: 'building', label: 'Set the place\u2019s acoustics' },
  assign_sounds: { kind: 'editing', label: 'Routed sounds onto the mixer' },

  // C08 — changing what is already there, which is not the same act as building it.
  set_properties: { kind: 'editing', label: 'Set properties' },
  delete_instances: { kind: 'editing', label: 'Deleted instances' },
  move_instances: { kind: 'editing', label: 'Moved instances to a new parent' },
  transform_instances: { kind: 'editing', label: 'Moved, rotated or scaled instances' },
  clone_instances: { kind: 'editing', label: 'Cloned instances' },
  group_instances: { kind: 'editing', label: 'Grouped instances' },
  ungroup_instances: { kind: 'editing', label: 'Ungrouped instances' },
  rename_instance: { kind: 'editing', label: 'Renamed an instance' },
  set_locked: { kind: 'editing', label: 'Changed instance locking' },
  set_visible: { kind: 'editing', label: 'Changed instance visibility' },

  // C07
  edit_script: { kind: 'writing_luau', label: 'Edited a script' },

  // C13
  render_view: { kind: 'rendering', label: 'Rendered the scene' },
  compose_thumbnail: { kind: 'rendering', label: 'Framed a store-page image' },
  get_instance: { kind: 'inspecting', label: 'Read an instance back' },
  get_selection: { kind: 'inspecting', label: 'Checked what you have selected' },
  focus_camera: { kind: 'inspecting', label: 'Moved the Studio camera' },
  set_mood: { kind: 'building', label: 'Set the lighting mood' },
  add_effect: { kind: 'building', label: 'Added an ambient effect' },
  audit_build: { kind: 'critiquing', label: 'Audited the build' },
  run_spec: { kind: 'verifying', label: 'Ran a spec against the project' },
  select_instances: { kind: 'editing', label: 'Selected it in Studio' },
  viewport_info: { kind: 'inspecting', label: 'Looked at the workspace layout' },
  install_module: { kind: 'writing_luau', label: 'Installed a vetted module' },
  remove_effect: { kind: 'editing', label: 'Removed an ambient effect' },
  search_instances: { kind: 'inspecting', label: 'Searched the project for matching objects' },
  set_properties_bulk: { kind: 'editing', label: 'Changed many objects at once' },
  spatial_query: { kind: 'inspecting', label: 'Measured the space in the world' },
  scatter_instances: { kind: 'building', label: 'Scattered copies across the ground' },
  collision_groups: { kind: 'editing', label: 'Set up what collides with what' },
  shape_terrain: { kind: 'building', label: 'Shaped the terrain' },
  read_terrain: { kind: 'inspecting', label: 'Looked at the terrain' },
  create_rig: { kind: 'building', label: 'Added a character' },
  check_ui_layout: { kind: 'critiquing', label: 'Checked the screen on phone, tablet and PC sizes' },
  build_ui: { kind: 'building', label: 'Built a screen' },

  // beyond the C-series
  check_composition: { kind: 'critiquing', label: 'Checked composition and intent' },
  inspect_visually: { kind: 'critiquing', label: 'Looked at the result' },

  // C14 / C15 / C18
  run_and_check: { kind: 'playtesting', label: 'Ran the game and checked it' },
  play_check: { kind: 'playtesting', label: 'Played it as a player and checked the screen' },
  play_check_ui: { kind: 'playtesting', label: 'Played it and pressed the buttons on screen' },
  get_output_logs: { kind: 'debugging', label: 'Read the output log' },
  create_checkpoint: { kind: 'saving', label: 'Saved a checkpoint' },
  remember: { kind: 'remembering', label: 'Noted a fact about the project' },

  // C03. The past tense is the rule this whole table follows, and it is right here too: by the
  // time a row is drawn the plan HAS been announced. The panel under the row is the plan itself,
  // so the label says what happened rather than restating what the panel already shows.
  propose_plan: { kind: 'planning', label: 'Planned the work' },
  // The web-facing tools. Each label says what was READ and where, because "Working" over ten
  // different substrates is the fallback these entries exist to avoid.
  web_fetch: { kind: 'browsing', label: 'Fetched a page' },
  browse_page: { kind: 'browsing', label: 'Read a web page' },
  web_search: { kind: 'browsing', label: 'Searched the web' },
  docs_lookup: { kind: 'browsing', label: 'Read the documentation' },
  screenshot_page: { kind: 'browsing', label: 'Captured a page' },
  ocr_image: { kind: 'browsing', label: 'Read the text in an image' },
  github_lookup: { kind: 'browsing', label: 'Looked something up on GitHub' },
  git_history: { kind: 'browsing', label: 'Read version history' },
  workspace_list: { kind: 'filing', label: 'Listed the project files' },
  workspace_read: { kind: 'filing', label: 'Read a project file' },
  workspace_write: { kind: 'filing', label: 'Wrote a project file' },
} as const satisfies Record<string, { kind: ActivityKind; label: string }>;

export type ToolName = keyof typeof TOOL;

/** Whether this build knows the tool at all. */
export function isKnownTool(tool: string | undefined): boolean {
  return tool !== undefined && tool in TOOL;
}

/** Tool -> activity. `working` for a name this build does not know. */
export function kindForTool(tool: string | undefined): ActivityKind {
  if (!tool) return 'working';
  return (TOOL as Record<string, { kind: ActivityKind }>)[tool]?.kind ?? 'working';
}

/**
 * Tool -> a sentence. An unknown tool is de-underscored rather than hidden: the
 * run really did do something, and printing the raw name is more honest than
 * dropping the step or inventing a description of it.
 */
export function labelForTool(tool: string | undefined): string {
  if (!tool) return 'A step with no reported name';
  return (TOOL as Record<string, { label: string }>)[tool]?.label ?? tool.replace(/_/g, ' ');
}

/** The activity labels, keyed by kind. */
export const ACTIVITY_LABEL = Object.fromEntries(
  Object.entries(ACTIVITY).map(([k, v]) => [k, v.label]),
) as Record<ActivityKind, string>;
