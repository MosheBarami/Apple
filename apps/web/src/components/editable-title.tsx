// The workspace title, renamable in place.
//
// Rename lives here as well as in the dashboard menu because this is where the name is actually in
// front of you — noticing a bad name and having to navigate away to fix it is the reason project
// names stay wrong. Both surfaces call the same `useRenameProject`, so they cannot disagree about
// what a rename does.
//
// Editing in place has one hazard worth naming: commit-on-blur. Blur fires when the user clicks
// Cancel, when they tab away, and when the browser takes focus for its own reasons, so a naive
// "save on blur" saves things nobody asked to save. Escape therefore sets a flag that blur checks,
// and that is the whole reason this is a component rather than three lines inline.
import { useEffect, useRef, useState } from 'react';
import { PROJECT_NAME_MAX, isRenameWorthwhile, useRenameProject } from '../lib/rename-project';
import { useToast } from './toast';

export function EditableProjectTitle({
  projectId,
  name,
  className,
}: {
  projectId: string;
  name: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const rename = useRenameProject(projectId, name, {
    onDone: (next) => toast(`Renamed to "${next}"`, 'success'),
    onFail: (msg) => {
      toast(`Rename failed: ${msg}`, 'error');
      // Put the edit back rather than discarding what they typed — a failed write is not a reason
      // to make someone retype the name.
      setEditing(true);
    },
  });

  // An edit begun before the name loaded, or while another surface renamed it, must not overwrite
  // the newer value with a stale draft.
  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (isRenameWorthwhile(draft, name)) rename.mutate(draft);
    else setDraft(name);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`gx-title-edit ${className ?? ''}`}
        // dir="auto" — the name is the user's string. Under an RTL interface an English name (or a
        // Hebrew one under LTR) otherwise inherits the page and reorders its own punctuation.
        dir="auto"
        onClick={() => {
          cancelled.current = false;
          setEditing(true);
        }}
        title="Rename project"
        disabled={rename.isPending}
      >
        {rename.isPending ? draft.trim() : name}
      </button>
    );
  }

  return (
    <input
      ref={input}
      className={`gx-title-input ${className ?? ''}`}
      // The same rule while it is being typed: the caret and alignment follow what is in the field.
      dir="auto"
      value={draft}
      maxLength={PROJECT_NAME_MAX}
      aria-label="Project name"
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          // Blur fires next and must not treat this as a save.
          cancelled.current = true;
          setDraft(name);
          setEditing(false);
        }
      }}
      onBlur={() => {
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        commit();
      }}
    />
  );
}
