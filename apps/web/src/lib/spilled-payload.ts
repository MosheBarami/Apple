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
 * The raw text remains in the transcript record, but is not drawn or copied from the customer reply.
 *
 * NARROW ON PURPOSE. It looks for standalone Studio wire objects or repeated wire shapes that
 * dominate the text. A sentence that mentions a Vector3 or a fenced code example stays prose.
 */

/** The wire shapes a spilled `create_instances` or `set_properties` payload is made of. */
const WIRE = /\{\s*"(?:t|className|Anchored|props)"\s*:/g;
const WIRE_START = /^\{\s*"(?:t|className|Anchored|props)"\s*:/;

export interface SpilledPayload {
  /** The prose to render, with the payload removed. Empty when the message was nothing else. */
  prose: string;
  /** The raw text, kept verbatim for the disclosure. Null when nothing was collapsed. */
  collapsed: string | null;
}

/**
 * For repeated shapes: three occurrences, and DENSITY — not a share of the message.
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

function withoutFencedCode(text: string): string {
  // Keep offsets and line breaks intact so every match still points into the original text.
  return text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*(?=\n|$)/gm,
    (fence) => fence.replace(/[^\n]/g, ' '));
}

function isWireLine(line: string): boolean {
  if (!WIRE_START.test(line)) return false;
  try {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    if (typeof object.t === 'string' && Object.hasOwn(object, 'v')) return true;
    if (typeof object.className === 'string' &&
      (Object.hasOwn(object, 'props') || Object.hasOwn(object, 'parent') || Object.hasOwn(object, 'name'))) return true;
    if (object.props && typeof object.props === 'object' && !Array.isArray(object.props)) return true;
    return Object.hasOwn(object, 'Anchored') && typeof object.Anchored === 'object';
  } catch {
    // A model may stop halfway through a single object. Require both its wire prefix and a
    // companion field so an ordinary sentence or unrelated JSON is not treated as payload.
    return /^\{\s*"t"\s*:/.test(line) && /"v"\s*:/.test(line)
      || /^\{\s*"className"\s*:/.test(line) && /"(?:props|parent|name)"\s*:/.test(line)
      || /^\{\s*"props"\s*:/.test(line) && /"t"\s*:/.test(line);
  }
}

function splitAt(text: string, start: number, end: number): SpilledPayload {
  const before = text.slice(0, start);
  let after = text.slice(end);
  if (before.endsWith('\n') && after.startsWith('\n')) after = after.slice(1);
  return {
    prose: (before + after).replace(/\n{3,}/g, '\n\n').trim(),
    collapsed: text.slice(start, end),
  };
}

export function splitSpilledPayload(text: string): SpilledPayload {
  if (!text) return { prose: text, collapsed: null };
  const visible = withoutFencedCode(text);

  // Complete or truncated one-object wire lines have no repeated shape to satisfy the density
  // test below. Remove every such line: stopping at the first would expose the next object.
  const wireLines: Array<{ start: number; end: number }> = [];
  for (const match of visible.matchAll(/[^\n]+/g)) {
    const line = match[0].trim();
    if (isWireLine(line)) wireLines.push({ start: match.index, end: match.index + match[0].length });
  }
  if (wireLines.length > 0) {
    let prose = '';
    let cursor = 0;
    for (const { start, end } of wireLines) {
      prose += text.slice(cursor, start);
      cursor = end + Number(text[end] === '\n');
    }
    prose += text.slice(cursor);
    return {
      prose: prose.replace(/\n{3,}/g, '\n\n').trim(),
      collapsed: wireLines.map(({ start, end }) => text.slice(start, end)).join('\n'),
    };
  }

  const matches = [...visible.matchAll(WIRE)];
  if (matches.length < 3) return { prose: text, collapsed: null };

  // The span from the first wire shape to the end of the line holding the last one. The whole span
  // rather than each object: a truncated payload is not well-formed, and cutting object by object
  // would leave the commas and half-open braces between them behind.
  const start = matches[0]!.index ?? 0;
  const lastAt = matches[matches.length - 1]!.index ?? start;
  const tail = text.indexOf('\n', lastAt);
  const end = tail === -1 ? text.length : tail;
  if ((end - start) / matches.length > MAX_CHARS_PER_SHAPE) return { prose: text, collapsed: null };

  return splitAt(text, start, end);
}
