/**
 * WHEN THE MODEL WRITES A TOOL CALL AS PROSE, AND THE CUSTOMER READS IT.
 *
 * What the owner saw on 2026-09-20, having asked for a lava obby:
 *
 *   {"t": "Vector3", "v": [4, 1, 4]}}}, {"className": "Part", "name": "MovingPlatform3", "parent":
 *   "game.Workspace", "props": {"Anchored": {"t": "bool", "v": false}, "Color": {"t": "Color3", …
 *
 * — several screens of it, then "The model reached its output limit before finishing this step."
 * The worker's sentence is a good one. Everything above it is the wire format, printed at somebody
 * who asked for a game.
 *
 * A tool CALL never reaches this renderer; `item.tools` carries those and they become panels. This
 * is the other case: the model emitted the payload as message TEXT, which happens when it runs out
 * of output tokens mid-structure or decides to narrate the call. Either way the transcript rendered
 * it verbatim, because the renderer's rule was "anything that is not a UI fence is prose".
 *
 * NOTHING IS DELETED. The text is kept and collapsed, because a customer who wants to send it to
 * support must still be able to, and because hiding output the model really produced is how a
 * product starts lying about what happened. What changes is that the transcript stops opening with
 * three thousand characters of `{"t":"Vector3"}`.
 *
 * NARROW ON PURPOSE. It looks for the two shapes THIS product's Studio wire actually uses, and only
 * when they dominate the text. A message that mentions a Vector3 in a sentence, quotes a small
 * snippet, or fences real code is prose and stays prose — a detector that collapses those would
 * hide the explanations this product exists to give.
 */

/** The wire shapes a spilled `create_instances` or `set_properties` payload is made of. */
const WIRE = /\{\s*"(?:t|className|Anchored|props)"\s*:/g;

export interface SpilledPayload {
  /** The prose to render, with the payload removed. Empty when the message was nothing else. */
  prose: string;
  /** The raw text, kept verbatim for the disclosure. Null when nothing was collapsed. */
  collapsed: string | null;
}

/**
 * Three occurrences, and DENSITY — not a share of the message.
 *
 * The first version measured the span from the first wire shape to the last as a fraction of the
 * message, and it collapsed the one thing that must never be collapsed: a paragraph explaining the
 * format to a customer, which names `{"t":"Vector3"}` three times in four sentences. The span
 * swallowed the prose BETWEEN the mentions, so an explanation measured as 90% payload — the same
 * number as the payload itself.
 *
 * Density separates them, and the two examples were measured rather than guessed. The owner's
 * transcript runs about 40 characters per wire shape, because it is nothing but wire shapes. The
 * explanation runs about 163, because it is sentences with three examples in them. The threshold is
 * 70: comfortably above one and comfortably below the other, and on the safe side, since collapsing
 * an explanation costs more than leaving a payload visible.
 */
const MAX_CHARS_PER_SHAPE = 70;

export function splitSpilledPayload(text: string): SpilledPayload {
  if (!text) return { prose: text, collapsed: null };
  const matches = [...text.matchAll(WIRE)];
  if (matches.length < 3) return { prose: text, collapsed: null };

  // The span from the first wire shape to the end of the line holding the last one. The whole span
  // rather than each object: a truncated payload is not well-formed, and cutting object by object
  // would leave the commas and half-open braces between them behind.
  const start = matches[0]!.index ?? 0;
  const lastAt = matches[matches.length - 1]!.index ?? start;
  const tail = text.indexOf('\n', lastAt);
  const end = tail === -1 ? text.length : tail;
  if ((end - start) / matches.length > MAX_CHARS_PER_SHAPE) return { prose: text, collapsed: null };

  const prose = (text.slice(0, start) + text.slice(end)).replace(/\n{3,}/g, '\n\n').trim();
  return { prose, collapsed: text.slice(start, end) };
}
