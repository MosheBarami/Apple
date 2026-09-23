/**
 * ONE SENTENCE PER STUDIO OP, FOR THE HISTORY A PERSON READS.
 *
 * The oplog stores the op's WIRE NAME — `set_props`, `delete_instances` — and its `summary` column
 * holds only the error text, so a successful row has nothing but its kind. Printing the wire name
 * would make the project's history read like a packet capture.
 *
 * `studio-activity.test.mjs` checks this table against the worker's own StudioOp union in BOTH
 * directions, because both kinds of drift are silent: an op with no entry renders as a bare
 * identifier, and an entry for an op that no longer exists reads as coverage while covering
 * nothing. That is the same discipline tool-vocabulary.ts is held to.
 *
 * PAST TENSE THROUGHOUT. This is a record of what happened, not a status line — "Read the scripts",
 * never "Reading the scripts", which is what the live activity card says while a run is going.
 */
export const OP_LABEL: Record<string, string> = {
  // --- reads -------------------------------------------------------------
  ping: 'Checked Studio was still there',
  get_tree: 'Looked at the object tree',
  get_instance: 'Inspected an object',
  list_scripts: 'Listed the scripts',
  read_script: 'Read a script',
  dump_scripts: 'Read the scripts',
  search_scripts: 'Searched the scripts',
  get_logs: 'Read the output log',
  project_census: 'Counted the project contents',
  get_selection: 'Read what was selected',
  viewport_info: 'Read the camera and viewport',
  inspect_model: 'Checked a model over',

  // --- writes to the place ----------------------------------------------
  edit_script: 'Edited a script',
  create_instances: 'Created objects',
  set_props: 'Changed properties',
  delete_instances: 'Deleted objects',
  move_instances: 'Moved objects to a new parent',
  transform_instances: 'Moved, rotated or scaled objects',
  clone_instances: 'Copied objects',
  group_instances: 'Grouped objects',
  ungroup_instances: 'Ungrouped objects',
  rename_instance: 'Renamed an object',
  set_locked: 'Locked or unlocked objects',
  set_visible: 'Showed or hid objects',
  insert_asset: 'Inserted an asset',
  generate_model: 'Generated a model',
  terrain_edit: 'Edited terrain',
  run_code: 'Ran Luau inside Studio',

  // --- the view, which changes nothing in the place ----------------------
  select: 'Selected objects',
  camera_focus: 'Pointed the camera at an object',
  render_view: 'Rendered a view',
  screenshot: 'Took a picture of the place',

  // --- history -----------------------------------------------------------
  snapshot: 'Saved a checkpoint of the place',
  restore: 'Put a checkpoint back',
  undo_waypoint: 'Marked an undo point',

  // --- playtest ----------------------------------------------------------
  run_mode: 'Started, paused or stopped a playtest',
  play_check: 'Played the game as a player and looked at the screen',

  // --- rows that are not StudioOps at all; see NON_OP_KINDS --------------
  frame_rejected: 'Refused a Studio picture',
};

/**
 * Oplog rows the worker writes that are NOT ops.
 *
 * `publishFrame` records a refused frame so a picture that never arrived leaves a trace instead of
 * vanishing. Listed separately so the both-directions check above can tell "an entry for something
 * the worker writes" from "an entry for an op that no longer exists".
 */
export const NON_OP_KINDS: Record<string, string> = {
  frame_rejected: 'A picture from Studio was refused before it reached the browser.',
};

/**
 * The sentence for a kind, or the kind itself made readable.
 *
 * NEVER an empty string and never a dropped row: a history that hides what it cannot name has a
 * hole in it that nobody can see. An underscore-stripped identifier is worse than a sentence and
 * far better than silence.
 */
export function opSentence(kind: string): string {
  return OP_LABEL[kind] ?? kind.replace(/_/g, ' ');
}

/** One row of `recentOps` as the worker serves it. */
export interface OpLogRow {
  op_id: string;
  kind: string;
  ok: number;
  summary: string;
  created_at: number;
  failure: string | null;
  runId?: string | null;
}

export interface ActivityRow {
  id: string;
  /** The op's wire name, kept so the row can wear the Studio icon of what it acted on. */
  kind: string;
  sentence: string;
  ok: boolean;
  /** The error text, or null. The `summary` column holds ONLY errors — see session.ts. */
  detail: string | null;
  /** The typed failure kind (see worker/src/op-failure.ts), or null on a success. */
  failure: string | null;
  at: number;
  /** The run that asked for this op, or null for one taken outside a run. */
  runId: string | null;
}

/**
 * Shape the payload for rendering. Order is NOT touched: the worker serves newest-first by the
 * oplog's own id, which is the only ordering that survives two rows written in the same
 * millisecond — re-sorting by `created_at` here would scramble exactly those.
 */
export function activityRows(rows: OpLogRow[]): ActivityRow[] {
  return rows.map((r) => ({
    id: r.op_id,
    kind: r.kind,
    sentence: opSentence(r.kind),
    ok: r.ok === 1,
    detail: r.summary ? r.summary : null,
    failure: r.failure ?? null,
    at: r.created_at,
    runId: r.runId ?? null,
  }));
}
