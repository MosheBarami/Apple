/**
 * WHO TOOK THIS CHECKPOINT, IN THE WORDS THE DRAWER USES.
 *
 * The checkpoints list showed a timestamp and two counts and never said who. Under the old schema
 * it could not: there was no author column, and the one place that tried — search — guessed from
 * the kind and so told every member of a shared project that a teammate's checkpoint was theirs.
 *
 * Five answers, and the last two are the ones that matter. This function will say "we do not know"
 * twice over rather than pick the reader, because the reader is the wrong guess in precisely the
 * situation the whole field exists for: an argument about whose work a restore is about to discard.
 */
export type CheckpointAuthorView =
  /** Apple took it: an automatic or pre-run checkpoint has no human author. */
  | { who: 'apple'; label: 'Apple' }
  | { who: 'you'; label: 'You' }
  /** A member we can put a name to. */
  | { who: 'member'; label: string }
  /** A member we cannot: they have left, or the roster has not loaded. Named as unknown, not as you. */
  | { who: 'unknown-member'; label: 'Another member' }
  /** Taken before the author column existed. There is no answer, and inventing one is the defect. */
  | { who: 'unrecorded'; label: 'Author not recorded' };

export function checkpointAuthorView(
  cp: { kind: 'auto' | 'manual' | 'pre_agent'; authorId?: string | null },
  viewerId: string | null,
  names: Record<string, string | null> = {},
): CheckpointAuthorView {
  // The kind is stronger than the column: an `auto` row with an author_id — which only a bug could
  // write — still was not taken by a person, and crediting one would be worse than saying Apple.
  if (cp.kind !== 'manual') return { who: 'apple', label: 'Apple' };
  const id = cp.authorId ?? null;
  if (id === null) return { who: 'unrecorded', label: 'Author not recorded' };
  if (viewerId !== null && id === viewerId) return { who: 'you', label: 'You' };
  const name = names[id];
  if (name) return { who: 'member', label: name };
  return { who: 'unknown-member', label: 'Another member' };
}

/**
 * userId → display name, from the project roster.
 *
 * `displayName ?? handle`: a member with no display name still has a handle, and "Another member"
 * for someone whose name we DO hold in a different column would be a gap we created ourselves.
 */
export function rosterNames(members: { userId: string; displayName: string | null; handle?: string }[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const m of members) out[m.userId] = m.displayName ?? m.handle ?? null;
  return out;
}
