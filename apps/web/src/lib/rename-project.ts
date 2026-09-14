// Renaming a project — one implementation, used by the dashboard's menu and by the workspace title.
//
// There is no worker route behind this. `withOwnedProject` posts the CURRENT name from Supabase to
// the Durable Object's `/init` on every request, so the session picks a new name up on its next
// call without being told. An endpoint would exist only to repeat that, and would then be a second
// place the name could be wrong.
//
// What it does own is the part both surfaces would otherwise get subtly different: which caches
// hold the name (three of them), and what counts as a change worth writing.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { PROJECT_NAME_MAX, isRenameWorthwhile } from './rename-rules';

// Re-exported so callers have one import for the whole rename surface.
export { PROJECT_NAME_MAX, isRenameWorthwhile };

export interface RenameOptions {
  onDone?: (name: string) => void;
  onFail?: (message: string) => void;
}

export function useRenameProject(projectId: string, currentName: string, opts: RenameOptions = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (raw: string) => {
      const next = raw.trim();
      if (!isRenameWorthwhile(next, currentName)) return currentName;
      const { error } = await supabase.from('projects').update({ name: next }).eq('id', projectId);
      if (error) throw new Error(error.message);
      return next;
    },
    onSuccess: (next) => {
      // Three caches hold this name: the dashboard grid, the sidebar, and the open workspace.
      // Missing any one of them leaves the old name on screen next to the new one.
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['projects-nav'] });
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
      if (next !== currentName) opts.onDone?.(next);
    },
    onError: (e: Error) => opts.onFail?.(e.message),
  });
}
