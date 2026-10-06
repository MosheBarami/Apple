// Puts the place back to the checkpoint the Studio agent took before its first change (the promise its instructions make).
import { Button } from '@cloudflare/kumo';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { latestStudioCheckpoint, restoreCheckpoint, type Checkpoint } from './api.ts';

export function UndoChanges({ projectId, busy }: { projectId: string; busy: boolean }) {
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'done' | string>('idle');

  // Looked up again whenever the agent finishes, since that is when a new checkpoint can appear.
  useEffect(() => {
    if (!busy) void latestStudioCheckpoint(projectId).then(setCheckpoint);
  }, [projectId, busy]);

  if (!checkpoint) return null;
  const undo = async () => {
    const when = new Date(checkpoint.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (!confirm(`Put the place back to how it was at ${when}, before StudPilot's changes? Changes made since then are undone.`)) return;
    setState('working');
    try {
      await restoreCheckpoint(projectId, checkpoint.id);
      setState('done');
    } catch (e) {
      setState((e as Error).message);
    }
  };
  const label = state === 'working' ? 'Undoing…' : state === 'done' ? 'Undone' : 'Undo changes';
  return (
    <span className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        icon={<ArrowCounterClockwiseIcon size={14} />}
        disabled={busy || state === 'working'}
        title={busy ? 'Wait for StudPilot to finish' : 'Put the place back to before StudPilot changed it'}
        onClick={undo}
      >
        {label}
      </Button>
      {state !== 'idle' && state !== 'working' && state !== 'done' && <span className="text-xs text-kumo-danger">{state}</span>}
    </span>
  );
}
