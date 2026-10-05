// "New project" is one click: the project is made at once with a generated name and the person lands in its conversation.
//
// THERE IS NO DIALOG. The old one asked for a name, a description and a starting point before anything existed, and every
// answer was a decision somebody had not made yet. A name and a description are things a project grows (Rename and Edit are on
// the card and in the title), and "what are you building" is the first message, which is what the conversation is for.
//
// One hook, used by every way in: the shelf's button, its empty state, the rail's "New chat", the palette and the shortcut.
// It works from any screen, so nothing navigates to the shelf first to find a dialog to open.
//
// WHAT RIDES ALONG. The sentence a person typed on the landing page (lib/pending-start.ts) is MOVED, not copied, into the first
// project made after it: the workspace consumes `state.seed` and puts it in the composer. They read it and press send; nothing is
// built and no Credit is spent until they do. Nothing else seeds a project.
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MOCK_MODE, mockProjects } from './mock';
import { supabase, type ProjectRow } from './supabase';
import { useAuth } from './auth';
import { takePendingStart } from './pending-start';
import { UNTITLED_PREFIX, nextProjectName } from './project-names';
import { useToast } from '../components/toast';

/**
 * Whether a creation is in flight anywhere in this page. The shelf and the shell each hold the hook, and a button pressed
 * twice, or a button and the shortcut, must make one project and not two.
 */
let creating = false;

export function useCreateProject(): { create: () => void; pending: boolean } {
  const { session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  const make = useMutation({
    mutationFn: async (): Promise<{ id: string }> => {
      const ownerId = session?.user.id;
      if (!ownerId) throw new Error('Not signed in');
      if (MOCK_MODE) {
        // The mock app has no database: the row joins the fixture list so the shelf shows it when you go back to it.
        const row: ProjectRow = {
          id: `p-new-${mockProjects.length + 1}`,
          owner_id: ownerId,
          name: nextProjectName(mockProjects.map((p) => p.name)),
          description: null,
          place_name: null,
          place_id: null,
          memory_summary: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_activity_at: null,
        };
        mockProjects.unshift(row);
        return { id: row.id };
      }
      // Read the names this person already has, so the number is one more than the highest. Archived projects count: they keep their names.
      const taken = await supabase.from('projects').select('name').like('name', `${UNTITLED_PREFIX} %`);
      if (taken.error) throw new Error(taken.error.message);
      const { data, error } = await supabase
        .from('projects')
        .insert({ owner_id: ownerId, name: nextProjectName((taken.data ?? []).map((row) => row.name)) })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data as { id: string };
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['projects-nav'] });
      // No toast: the new conversation opening is the answer. A blank start navigates with no state at all, so the
      // workspace has nothing to consume and clear.
      const seed = takePendingStart();
      navigate(`/projects/${row.id}`, seed ? { state: { seed } } : undefined);
    },
    onError: (e: Error) => toast(`Could not create a project: ${e.message}`, 'error'),
    onSettled: () => {
      creating = false;
      setPending(false);
    },
  });

  const { mutate } = make;
  const create = useCallback(() => {
    if (creating) return;
    creating = true;
    setPending(true);
    mutate();
  }, [mutate]);

  return { create, pending };
}
