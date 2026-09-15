// Referring to what is selected in Studio, from the message box.
//
// The selection already travels the whole way: the plugin captures it with an honest
// count/truncated pair (apps/plugin/src/Companion.luau), the worker RE-DERIVES every field rather
// than trusting the sender (apps/worker/src/companion.ts readSelectionEvent) and broadcasts
// `studio_selection`, and the model can pull it with the `get_selection` tool. The one thing
// missing was a way for the person typing to say "this one" — so a user looking at a door they
// had clicked still had to type out its path, or hope the agent would think to ask.
//
// TWO RULES, and both are about not inventing what we do not have.
//
//   * The COUNT is the plugin's count, never the length of the list. A selection of 143 parts
//     arrives as 100 items and `count: 143`, and a reference that said "the 100 selected objects"
//     would be a rounding error the user cannot see and the agent cannot correct.
//   * Only paths we actually hold are NAMED. The rest are acknowledged as a number. "and 43 more"
//     is a fact; a made-up path is a instruction to edit something that may not exist.
import type { StudioEventSelection } from '@golem/shared';

/**
 * How many paths a reference names before it starts counting instead.
 *
 * Eight is about the length of a phrase someone will still read. Past that the list stops being a
 * reference and becomes a wall the actual request is hiding behind — and the agent can read the
 * full selection with `get_selection` whenever it needs the rest.
 */
export const MAX_NAMED_ITEMS = 8;

/** Backticked so the path survives markdown rendering in the transcript with its dots intact. */
const code = (s: string) => '`' + s + '`';

/** "a, b and c" — the Oxford-free list separator, so the sentence reads as English. */
function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The phrase to drop into a message for the current Studio selection, or '' when there is nothing
 * selected to refer to.
 *
 * Empty string rather than a placeholder: a composer that inserts "nothing is selected" into the
 * user's prompt has put words in their mouth about a fact they can see for themselves.
 */
export function selectionReference(selection: StudioEventSelection | null | undefined): string {
  if (!selection) return '';
  const items = selection.items ?? [];
  if (selection.count <= 0 || items.length === 0) return '';

  const named = items.slice(0, MAX_NAMED_ITEMS).map((i) => code(i.path));
  // `count` is the plugin's own figure and is never less than the number of items it sent (the
  // worker raises it if a payload disagrees with itself), so this subtraction cannot go negative.
  const unnamed = selection.count - named.length;

  if (unnamed <= 0) {
    return named.length === 1 ? named[0]! : `${joinList(named)} (${selection.count} selected)`;
  }
  return `${joinList(named)} and ${unnamed} more of the ${selection.count} selected`;
}

/** What the chip says. The count is the selection's own, so a truncated list still reads honestly. */
export function selectionChipLabel(selection: StudioEventSelection | null | undefined): string | null {
  if (!selection || selection.count <= 0 || (selection.items?.length ?? 0) === 0) return null;
  const one = selection.items![0]!;
  return selection.count === 1 ? one.path.split('.').pop() || one.path : `${selection.count} selected`;
}

export interface Insertion {
  text: string;
  /** Where the caret belongs afterwards: the end of what was inserted, never the end of the box. */
  caret: number;
}

/**
 * Put `insert` into `text` at the caret, replacing any selected range.
 *
 * Appending to the end instead — the obvious shortcut — puts the reference after the sentence it
 * was meant to be the subject of, and someone who has written "make " and then clicked the chip
 * gets "make  `Workspace.Door`" only by accident of the caret already being at the end.
 *
 * Spacing is repaired on both sides, so the phrase never fuses onto a neighbouring word. A range
 * selection is REPLACED, which is what every text field does with typed input.
 */
export function insertAtCursor(text: string, insert: string, start: number, end: number): Insertion {
  if (!insert) return { text, caret: start };
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  const before = text.slice(0, from);
  const after = text.slice(to);
  const lead = before === '' || /\s$/.test(before) ? '' : ' ';
  const trail = after === '' || /^\s/.test(after) ? '' : ' ';
  const body = `${lead}${insert}${trail}`;
  return { text: `${before}${body}${after}`, caret: before.length + lead.length + insert.length };
}
