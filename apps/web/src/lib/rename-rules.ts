// What counts as a rename. No imports, on purpose: this is the part worth testing directly, and a
// module that reaches for React Query or the Supabase client cannot be loaded by `node --test`
// without dragging a browser runtime and a live config in with it.

export const PROJECT_NAME_MAX = 80;

/**
 * Is this worth writing?
 *
 * Blank is not a name. Unchanged is not a rename — writing it anyway bumps `updated_at`, reorders
 * the dashboard by recency, and pops a toast announcing a change that did not happen. Over the
 * limit is refused rather than truncated: the input carries `maxLength`, but a paste on some
 * engines and any programmatic set can exceed it, and silently cutting it renames the project to
 * something the user never typed.
 */
export function isRenameWorthwhile(next: string, current: string): boolean {
  const trimmed = next.trim();
  return trimmed.length > 0 && trimmed.length <= PROJECT_NAME_MAX && trimmed !== current;
}
