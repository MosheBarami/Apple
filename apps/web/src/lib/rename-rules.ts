// What counts as an edit to a project's name and description. No imports, on purpose: this is the
// part worth testing directly, and a module that reaches for React Query or the Supabase client
// cannot be loaded by `node --test` without dragging a browser runtime and a live config in with it.

export const PROJECT_NAME_MAX = 80;
/** The same 500 the create dialog has always enforced on the field it collects. */
export const PROJECT_DESCRIPTION_MAX = 500;

/**
 * What a surface is offering to change.
 *
 * `description` is OPTIONAL and the distinction is load-bearing: the workspace title editor knows
 * the name and nothing else, so for it "not given" must mean "leave it alone". If absence meant
 * empty, every inline rename would quietly delete the project's description.
 */
export interface ProjectEdit {
  name: string;
  description?: string | null;
}

/** The columns to write, in one Supabase update. */
export interface ProjectPatch {
  name?: string;
  description?: string | null;
}

/**
 * What to write, or null when there is nothing worth writing.
 *
 * Blank is not a name. Unchanged is not an edit — writing it anyway bumps `updated_at`, reorders
 * the dashboard by recency, and pops a toast announcing a change that did not happen. Over the
 * limit is refused rather than truncated: the inputs carry `maxLength`, but a paste on some engines
 * and any programmatic set can exceed it, and silently cutting it saves something the user never
 * typed.
 *
 * AN UNUSABLE NAME REFUSES THE WHOLE EDIT, including a description that was fine. Writing half of
 * what the form shows and reporting success is the failure shape this codebase keeps finding.
 */
export function projectEditPatch(next: ProjectEdit, current: ProjectEdit): ProjectPatch | null {
  const name = next.name.trim();
  if (name.length === 0 || name.length > PROJECT_NAME_MAX) return null;

  const patch: ProjectPatch = {};
  if (name !== current.name) patch.name = name;

  if (next.description !== undefined) {
    const description = (next.description ?? '').trim();
    if (description.length > PROJECT_DESCRIPTION_MAX) return null;
    // A cleared description is null, never ''. The card falls back to memory_summary on null, and
    // an empty string is not null — it would render an empty line under the title instead.
    if (description !== (current.description ?? '').trim()) patch.description = description.length > 0 ? description : null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Is this name worth writing? The name-only question, for the one surface that can only ask it.
 *
 * Defined in terms of the patch rule rather than beside it, so there is one answer to "is this a
 * change" and not two that can drift apart.
 */
export function isRenameWorthwhile(next: string, current: string): boolean {
  const patch = projectEditPatch({ name: next }, { name: current });
  return patch !== null && patch.name !== undefined;
}
