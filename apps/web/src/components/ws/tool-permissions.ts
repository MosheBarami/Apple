/**
 * WHICH TOOLS APPLE MAY USE IN THIS PROJECT.
 *
 * The server side of this has been real and enforced for a long time. `normalisePreferences`
 * validates `tool_permissions` against the live tool registry; the value INTERSECTS towards the
 * most restrictive across org, user and project instead of overriding, so a block set by an
 * organisation cannot be undone by a project; and `applyToolPermissions` narrows the mode's
 * toolset on every step of every run. All of it pinned by apps/worker/tests/preferences.test.mjs.
 *
 * Nothing in the product could set it. `grep -rn tool_permissions apps/web/src` found exactly one
 * line — the TYPE in api.ts. A user could not withhold `run_luau` from an agent working inside
 * their own game. This module is the missing half.
 *
 * WHY IT IS A BLOCK LIST AND NOT THREE RADIO BUTTONS PER TOOL:
 *
 *   `allow` is not a capability. `applyToolPermissions` only ever REMOVES from the set the mode
 *   already grants — it is documented there as "the absence of a restriction" — so an `allow`
 *   entry would be a stored setting that grants nothing while reading like permission. The
 *   honest control has two states, and the stored value has one.
 *
 *   `ask` is not offered at all. preferences.ts collapses it to a refusal, in its own words
 *   because "nothing in this product can interrupt a run to ask". An Ask option would promise a
 *   confirmation step that does not exist and would silently behave as Block. When a
 *   suspend-and-confirm path exists, this is where the third state goes.
 *
 * WHAT IS OFFERED: the tools that change the project or spend money outside the run's own
 * inference. Read-only tools are deliberately absent — blocking `read_script` buys no safety and
 * breaks the agent — and tool-permissions.test.mjs holds that line against Plan mode's toolset,
 * as well as checking every name here against the worker's real registry, because the server
 * rejects an unknown name and the checkbox would then save nothing.
 */
import { GOVERNED_TOOLS, type ToolPermission } from '@golem/shared';

export interface GovernableTool {
  /** The exact registered tool name. Validated against the worker's TOOLS registry by the test. */
  tool: string;
  /** What it does, in the user's terms rather than the registry's. */
  label: string;
  /** Why someone would withhold it. A control with no reason is a control nobody can use. */
  why: string;
  group: 'changes' | 'spends';
}

/**
 * The offered list, DERIVED rather than typed out again.
 *
 * It used to be a hand-written array here. The same twelve-ish tools were also written down in
 * @golem/shared, where the worker's own test holds every name against the live registry and the
 * run transcript reads the labels to say which tools a run was denied. Two lists that agree today
 * is not one list: the failure only shows up when somebody edits one of them, and the shape it
 * takes is a checkbox the server rejects, or a withheld tool the transcript cannot name. The
 * vocabulary lives in one file; this module renames its fields for the checkbox that renders it.
 */
export const GOVERNABLE_TOOLS: readonly GovernableTool[] = GOVERNED_TOOLS.map((g) => ({
  tool: g.name,
  label: g.label,
  why: g.why,
  group: g.group,
}));

/**
 * Which tools are withheld, as the checkboxes should draw them.
 *
 * `ask` reads as BLOCKED, because that is what it does: preferences.ts removes an `ask` tool from
 * the set exactly as it removes a denied one. Drawing it unticked would tell the user a tool is
 * available when the worker has already taken it away — the failure-to-observe shape, in a
 * checkbox. Values this build does not recognise are left unticked rather than guessed at.
 */
export function blockedTools(perms: Record<string, ToolPermission> | undefined): Set<string> {
  const out = new Set<string>();
  for (const [tool, perm] of Object.entries(perms ?? {})) {
    if (perm === 'deny' || perm === 'ask') out.add(tool);
  }
  return out;
}

/**
 * Tick or untick one tool, returning the value to store.
 *
 * Only ever writes `deny`. Unticking DELETES the entry rather than writing `allow`, and clearing
 * the last one returns `undefined` rather than `{}` — the server treats an empty map as "not set"
 * and deletes the row, so a client holding an empty object would disagree with what was stored
 * and show a state the settings page can never reach.
 */
export function withToolBlocked(
  perms: Record<string, ToolPermission> | undefined,
  tool: string,
  blocked: boolean,
): Record<string, ToolPermission> | undefined {
  const next: Record<string, ToolPermission> = { ...(perms ?? {}) };
  if (blocked) next[tool] = 'deny';
  else delete next[tool];
  return Object.keys(next).length > 0 ? next : undefined;
}
