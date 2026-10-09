// Plain words for what the agent is doing. Tool names come from the agent (apps/studio); anything unknown falls
// back to its own name, made readable. No role or teammate wording.

type Input = Record<string, unknown> | undefined;

const str = (input: Input, ...keys: string[]): string | null => {
  for (const key of keys) {
    const v = input?.[key];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  return null;
};

/** "game.ServerScriptService.Shop.Buy" -> "Buy"; keeps short names whole. */
const leaf = (path: string | null) =>
  path ? (path.split(/[./\\]/).filter(Boolean).at(-1) ?? path) : null;

const humanize = (name: string) => {
  const words = name.replace(/^(get|run|do)_/, "").replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const LABELS: Record<string, (input: Input) => string> = {
  build_ui: (i) => `Building ${str(i, "name", "title") ?? "the interface"}`,
  check_layout: () => "Checking the layout on phone and desktop",
  checkpoint: () => "Saving a checkpoint",
  clone_instances: () => "Copying objects",
  console_output: () => "Reading the output",
  create_instances: (i) => {
    const name = str(i, "name");
    return name ? `Creating ${name}` : "Creating objects";
  },
  delete_instances: () => "Removing objects",
  edit_script: (i) => `Editing ${leaf(str(i, "path", "script", "name")) ?? "a script"}`,
  execute_luau: () => "Running code in Studio",
  get_instance: (i) => `Looking at ${leaf(str(i, "path")) ?? "an object"}`,
  get_output_logs: () => "Reading the output",
  get_project_tree: () => "Reading the place",
  group_instances: () => "Grouping objects",
  insert_asset: (i) => `Inserting ${str(i, "name", "title") ?? "a model"}`,
  list_scripts: () => "Listing scripts",
  load_skill: (i) => `Reading notes on ${(str(i, "name", "skill") ?? "a topic").replaceAll("-", " ")}`,
  make_image: (i) => `Drawing ${str(i, "name") ?? `a ${str(i, "kind") ?? "picture"}`}`,
  measure_ui: () => "Checking the layout on phone and desktop",
  move_instances: () => "Moving objects",
  play_check: () => "Play-testing",
  play_test: () => "Play-testing",
  read_doc: (i) => `Reading ${str(i, "title") ?? leaf(str(i, "url", "path")) ?? "a docs page"}`,
  read_script: (i) => `Reading ${leaf(str(i, "path", "script", "name")) ?? "a script"}`,
  read_tree: () => "Reading the place",
  rename_instance: () => "Renaming an object",
  search_assets: (i) => `Searching the Creator Store${suffix(str(i, "query", "keyword"))}`,
  search_creator_store: (i) => `Searching the Creator Store${suffix(str(i, "query", "keyword"))}`,
  search_docs: (i) =>
    str(i, "url") ? `Reading ${leaf(str(i, "url")) ?? "a docs page"}` : `Searching Roblox docs${suffix(str(i, "query", "q"))}`,
  search_scripts: (i) => `Searching scripts${suffix(str(i, "query", "pattern"))}`,
  set_properties: () => "Adjusting properties",
};

function suffix(q: string | null) {
  return q ? `: ${q}` : "";
}

export function stepLabel(toolName: string, input: unknown): string {
  const make = LABELS[toolName];
  const i = input && typeof input === "object" ? (input as Record<string, unknown>) : undefined;
  return make ? make(i) : humanize(toolName);
}

export function isDocSearch(toolName: string) {
  return toolName === "search_docs";
}

export function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) {
    return `${s}s`;
  }
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}
