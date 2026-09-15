// Editing a project's name and description — one implementation, used by the dashboard's menu and
// by the workspace title.
//
// There is no worker route behind this. `withOwnedProject` posts the CURRENT name from Supabase to
// the Durable Object's `/init` on every request, so the session picks a new name up on its next
// call without being told. An endpoint would exist only to repeat that, and would then be a second
// place the name could be wrong.
//
// What it does own is the part both surfaces would otherwise get subtly different: which caches
// hold these fields (three of them), and what counts as a change worth writing. The description was
// write-once until this hook learned to carry it — collected at creation, rendered on the card, and
// never correctable.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  isRenameWorthwhile,
  projectEditPatch,
  type ProjectEdit,
} from './rename-rules';

// Re-exported so callers have one import for the whole edit surface.
export { PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX, isRenameWorthwhile, projectEditPatch };
export type { ProjectEdit };

export interface EditOptions {
  onDone?: (edit: { name: string; description?: string | null }) => void;
  onFail?: (message: string) => void;
}

/**
 * @param current what the row holds now. A caller that cannot see the description simply leaves it
 *        out of both this and the edit it submits — see projectEditPatch for why that matters.
 */
export function useEditProject(projectId: string, current: ProjectEdit, opts: EditOptions = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (raw: ProjectEdit) => {
      const patch = projectEditPatch(raw, current);
      // Nothing worth writing is a success with no change, not a failure: the user asked for the
      // state that already exists.
      if (!patch) return null;
      const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
      if (error) throw new Error(error.message);
      return patch;
    },
    onSuccess: (patch) => {
      if (!patch) return;
      // Three caches hold these fields: the dashboard grid, the sidebar, and the open workspace.
      // Missing any one of them leaves the old text on screen next to the new one.
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['projects-nav'] });
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
      opts.onDone?.({ name: patch.name ?? current.name, description: patch.description });
    },
    onError: (e: Error) => opts.onFail?.(e.message),
  });
}
