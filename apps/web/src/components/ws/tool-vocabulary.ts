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
 *
 * `live` is what the one status line says WHILE the step runs, in words a young
 * creator uses ("Placing things around the map"), and `on` is the same line when
 * the step names one thing, with `{}` standing for its friendly name ("Editing the
 * {}" -> "Editing the shop"). lib/live-status.ts is the only reader. Owner decision
 * D-THINK-1: customers see this line and never the tool, its arguments or its trace.
 */
export const TOOL = {
  // C02 — reading the world.
  get_project_tree: { kind: 'inspecting', label: 'Read the project tree', live: 'Looking around your game' },
  inspect_model: { kind: 'inspecting', label: 'Inspected a model', live: 'Taking a closer look' },

  // C06 — reading the code. Distinct from C02: a project's scripts and its
  // instance tree answer different questions and fail in different ways.
  list_scripts: { kind: 'reading_scripts', label: 'Listed scripts', live: 'Looking through the scripts' },
  read_script: { kind: 'reading_scripts', label: 'Read a script', live: 'Reading a script', on: 'Reading the {} script' },
  search_scripts: { kind: 'reading_scripts', label: 'Searched scripts', live: 'Looking through the scripts' },
  // Three static-analysis tools the worker gained without labels here, so the trace rendered
  // `review_scripts` at a person. The kinds are chosen by what the user sees happen, not by where
  // the code lives: a review CRITIQUES, resolving a name READS, and the formatter WRITES.
  review_scripts: { kind: 'critiquing', label: 'Reviewed the scripts', live: 'Double-checking the scripts' },
  find_symbol: { kind: 'reading_scripts', label: 'Looked up a name', live: 'Looking through the scripts' },
  format_script: { kind: 'writing_luau', label: 'Formatted a script', live: 'Tidying up a script', on: 'Tidying up the {} script' },

  // C04 — reading the docs is not inspecting the user's project.
  search_docs: { kind: 'searching_knowledge', label: 'Searched the Roblox docs', live: 'Looking up how Roblox does it' },
  search_creation_skills: { kind: 'searching_knowledge', label: 'Searched the creation skills', live: 'Picking up some building tricks' },
  read_creation_skill: { kind: 'searching_knowledge', label: 'Read a creation skill', live: 'Picking up some building tricks' },
  get_genre_references: { kind: 'searching_knowledge', label: 'Reviewed references for this genre', live: 'Getting ideas from similar games' },
  // Named for the question, not the table. "Looked up how a shop is usually built" is what the
  // owner sees the agent doing; "Called find_mechanic" is a sentence about our tool registry.
  find_mechanic: { kind: 'searching_knowledge', label: 'Looked up how this mechanic is usually built', live: 'Figuring out how it should work' },
  // TWO TOOLS THE WORKER GAINED WHILE THIS TABLE STOOD STILL, which the cross-check in
  // tool-vocabulary.test.mjs caught: without an entry each would have rendered through the
  // underscore-stripping fallback as "get ui construction" and "get verified module" — our
  // registry's names, in the middle of a column of written sentences.
  // Named for the question the agent is answering, per the two notes below: what the owner sees is
  // Apple checking how a real shop screen is put together, and Apple reaching for logic that has
  // already been run rather than writing the arithmetic fresh.
  get_ui_construction: { kind: 'searching_knowledge', label: 'Looked up how this screen is usually built', live: 'Sketching the screen' },
  get_verified_module: { kind: 'searching_knowledge', label: 'Took logic that has already been checked', live: 'Grabbing a tried-and-tested piece' },

  // C05
  choose_asset_source: { kind: 'searching_assets', label: 'Chose an asset source', live: 'Choosing where to find things' },
  // Named for what the player gets, not for the table it read. "Picked the horror kit" is a
  // sentence the owner can check against the game on screen; "Got a genre kit" is a sentence about
  // our own data model, which is not a thing anybody watching a build is trying to find out.
  get_genre_kit: { kind: 'searching_assets', label: 'Picked the style for this genre', live: 'Choosing a style' },
  find_verified_asset: { kind: 'searching_assets', label: 'Looked for a verified asset', live: 'Looking for the right pieces' },
  find_ui_asset: { kind: 'searching_assets', label: 'Looked in the UI image library', live: 'Finding pictures for the screen' },
  find_sound: { kind: 'searching_assets', label: 'Looked in the sound library', live: 'Finding the right sound' },
  find_vfx: { kind: 'searching_assets', label: 'Looked in the effect library', live: 'Finding a cool effect' },
  find_library_model: { kind: 'searching_assets', label: 'Looked in the model library', live: 'Finding the right models' },
  play_library_sound: { kind: 'searching_assets', label: 'Played you a sound', live: 'Playing you a sound' },
  upload_ui_asset: { kind: 'generating', label: 'Uploaded a library image to Roblox', live: 'Adding pictures to your game' },

  // C11
  generate_model: { kind: 'generating', label: 'Generated a model', live: 'Making a new model' },
  generate_model_external: { kind: 'generating', label: 'Generated a model on Hugging Face', live: 'Making a new model' },
  generate_ui_image_hf: { kind: 'generating', label: 'Generated an image with the second model', live: 'Drawing a picture' },
  generate_image: { kind: 'generating', label: 'Generated an image', live: 'Drawing a picture' },
  // The two audio tools that MAKE something. Both produce a file the user can hear and download,
  // and neither puts anything in their Roblox place — so the label says what was made rather than
  // where it went, which is the same care `generate_image` takes.
  generate_sound: { kind: 'generating', label: 'Made a sound effect', live: 'Making a sound effect' },
  speak_line: { kind: 'generating', label: 'Spoke a line', live: 'Recording a voice line' },

  // C09 — adding to the world.
  create_instances: { kind: 'building', label: 'Created instances', live: 'Building new things', on: 'Building the {}' },
  insert_asset: { kind: 'building', label: 'Inserted an asset', live: 'Adding something to your game' },
  edit_terrain: { kind: 'building', label: 'Edited terrain', live: 'Shaping the ground' },
  build_scene: { kind: 'building', label: 'Built the scene', live: 'Building the scene' },
  // Arbitrary Luau against the place can do anything; `building` is the coarsest
  // honest answer rather than a specific claim about which.
  run_luau: { kind: 'building', label: 'Ran Luau', live: 'Making changes to your game' },

  // The two audio tools that change the PLACE. `design_sound` writes SoundService's reverb and the
  // SoundGroup mixer; `assign_sounds` routes Sounds that already exist onto those groups. Neither
  // creates geometry, and neither adds audio — which is why the labels say "acoustics" and "routed"
  // rather than anything that implies a sound was added.
  design_sound: { kind: 'building', label: 'Set the place\u2019s acoustics', live: 'Tuning how it sounds' },
  assign_sounds: { kind: 'editing', label: 'Routed sounds onto the mixer', live: 'Mixing the sounds' },

  // C08 — changing what is already there, which is not the same act as building it.
  set_properties: { kind: 'editing', label: 'Set properties', live: 'Tweaking the details', on: 'Editing the {}' },
  delete_instances: { kind: 'editing', label: 'Deleted instances', live: 'Tidying up', on: 'Removing the {}' },
  move_instances: { kind: 'editing', label: 'Moved instances to a new parent', live: 'Rearranging things', on: 'Moving the {}' },
  transform_instances: { kind: 'editing', label: 'Moved, rotated or scaled instances', live: 'Moving things into place', on: 'Moving the {}' },
  clone_instances: { kind: 'editing', label: 'Cloned instances', live: 'Making copies', on: 'Copying the {}' },
  group_instances: { kind: 'editing', label: 'Grouped instances', live: 'Grouping things together', on: 'Grouping the {}' },
  ungroup_instances: { kind: 'editing', label: 'Ungrouped instances', live: 'Taking things apart', on: 'Unpacking the {}' },
  rename_instance: { kind: 'editing', label: 'Renamed an instance', live: 'Naming things', on: 'Renaming the {}' },
  set_locked: { kind: 'editing', label: 'Changed instance locking', live: 'Locking things in place', on: 'Locking the {}' },
  set_visible: { kind: 'editing', label: 'Changed instance visibility', live: 'Showing and hiding things' },

  // C07
  edit_script: { kind: 'writing_luau', label: 'Edited a script', live: 'Writing a script', on: 'Writing the {} script' },

  // C13
  render_view: { kind: 'rendering', label: 'Rendered the scene', live: 'Taking a picture of it' },
  compose_thumbnail: { kind: 'rendering', label: 'Framed a store-page image', live: 'Making a thumbnail' },
  get_instance: { kind: 'inspecting', label: 'Read an instance back', live: 'Taking a closer look', on: 'Looking at the {}' },
  get_selection: { kind: 'inspecting', label: 'Checked what you have selected', live: 'Seeing what you picked' },
  focus_camera: { kind: 'inspecting', label: 'Moved the Studio camera', live: 'Moving the camera' },
  set_mood: { kind: 'building', label: 'Set the lighting mood', live: 'Setting the mood' },
  add_effect: { kind: 'building', label: 'Added an ambient effect', live: 'Adding some atmosphere' },
  audit_build: { kind: 'critiquing', label: 'Audited the build', live: 'Checking the build' },
  run_spec: { kind: 'verifying', label: 'Ran a spec against the project', live: 'Testing that it works' },
  select_instances: { kind: 'editing', label: 'Selected it in Studio', live: 'Pointing it out in Studio', on: 'Pointing out the {}' },
  viewport_info: { kind: 'inspecting', label: 'Looked at the workspace layout', live: 'Looking around your game' },
  install_module: { kind: 'writing_luau', label: 'Installed a vetted module', live: 'Adding a tried-and-tested piece' },
  remove_effect: { kind: 'editing', label: 'Removed an ambient effect', live: 'Clearing an effect' },
  search_instances: { kind: 'inspecting', label: 'Searched the project for matching objects', live: 'Looking around your game' },
  set_properties_bulk: { kind: 'editing', label: 'Changed many objects at once', live: 'Tweaking lots of things at once' },
  spatial_query: { kind: 'inspecting', label: 'Measured the space in the world', live: 'Measuring the space' },
  scatter_instances: { kind: 'building', label: 'Scattered copies across the ground', live: 'Placing things around the map' },
  collision_groups: { kind: 'editing', label: 'Set up what collides with what', live: 'Setting what bumps into what' },
  shape_terrain: { kind: 'building', label: 'Shaped the terrain', live: 'Shaping the ground' },
  read_terrain: { kind: 'inspecting', label: 'Looked at the terrain', live: 'Looking at the ground' },
  create_rig: { kind: 'building', label: 'Added a character', live: 'Adding a character' },
  check_ui_layout: { kind: 'critiquing', label: 'Checked the screen on phone, tablet and PC sizes', live: 'Checking the screen on every device' },
  build_ui: { kind: 'building', label: 'Built a screen', live: 'Designing a screen' },
  insert_ui_component: { kind: 'building', label: 'Added a UI piece', live: 'Adding a button or panel' },
  insert_sound: { kind: 'building', label: 'Added a sound', live: 'Adding a sound' },
  insert_vfx: { kind: 'building', label: 'Added a visual effect', live: 'Adding a visual effect' },
  insert_library_model: { kind: 'building', label: 'Added a model from the library', live: 'Adding a model' },

  // beyond the C-series
  check_composition: { kind: 'critiquing', label: 'Checked composition and intent', live: 'Checking how it looks' },
  inspect_visually: { kind: 'critiquing', label: 'Looked at the result', live: 'Checking how it looks' },

  // C14 / C15 / C18
  run_and_check: { kind: 'playtesting', label: 'Ran the game and checked it', live: 'Playing your game' },
  play_check: { kind: 'playtesting', label: 'Played it as a player and checked the screen', live: 'Playing your game' },
  play_check_ui: { kind: 'playtesting', label: 'Played it and pressed the buttons on screen', live: 'Pressing the buttons to test them' },
  get_output_logs: { kind: 'debugging', label: 'Read the output log', live: 'Looking for problems' },
  create_checkpoint: { kind: 'saving', label: 'Saved a checkpoint', live: 'Saving your progress' },
  remember: { kind: 'remembering', label: 'Noted a fact about the project', live: 'Remembering what changed' },

  // C03. The past tense is the rule this whole table follows, and it is right here too: by the
  // time a row is drawn the plan HAS been announced. The panel under the row is the plan itself,
  // so the label says what happened rather than restating what the panel already shows.
  propose_plan: { kind: 'planning', label: 'Planned the work', live: 'Planning it out' },
  // The web-facing tools. Each label says what was READ and where, because "Working" over ten
  // different substrates is the fallback these entries exist to avoid.
  web_fetch: { kind: 'browsing', label: 'Fetched a page', live: 'Reading up on it' },
  browse_page: { kind: 'browsing', label: 'Read a web page', live: 'Reading up on it' },
  web_search: { kind: 'browsing', label: 'Searched the web', live: 'Searching the web' },
  docs_lookup: { kind: 'browsing', label: 'Read the documentation', live: 'Reading up on it' },
  screenshot_page: { kind: 'browsing', label: 'Captured a page', live: 'Looking at a web page' },
  ocr_image: { kind: 'browsing', label: 'Read the text in an image', live: 'Reading a picture' },
  github_lookup: { kind: 'browsing', label: 'Looked something up on GitHub', live: 'Reading up on it' },
  git_history: { kind: 'browsing', label: 'Read version history', live: 'Looking back at earlier changes' },
  workspace_list: { kind: 'filing', label: 'Listed the project files', live: 'Checking your notes' },
  workspace_read: { kind: 'filing', label: 'Read a project file', live: 'Reading your notes' },
  workspace_write: { kind: 'filing', label: 'Wrote a project file', live: 'Writing notes' },
} as const satisfies Record<string, { kind: ActivityKind; label: string; live: string; on?: string }>;

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
