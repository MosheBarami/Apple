// Splitting a reply into prose and fenced code, so code can be a real component.
//
// WHY A SPLIT AND NOT A MARKED RENDERER OVERRIDE. Everything in the assistant's reply goes through
// marked → DOMPurify and lands as `dangerouslySetInnerHTML`, which is exactly right for prose from
// an untrusted source and exactly wrong for anything that needs a control on it: sanitised HTML
// cannot carry a React handler, so a copy button rendered that way would have to be re-attached to
// the DOM by hand on every streaming delta. Pulling the fences out first means a code block is an
// ordinary component with an ordinary onClick, and the prose keeps the sanitiser it always had.
//
// THE STREAMING CASE IS THE HARD ONE. A reply arrives a delta at a time, so for most of a run the
// LAST fence is unterminated — the closing ``` has not been written yet. Treating that as prose
// makes a block of code flash as unformatted text and then reflow when the fence closes; refusing
// to terminate would drop the tail entirely. An unclosed fence is therefore a code segment that
// runs to the end of what has arrived, flagged `closed: false` so the renderer can decline to
// offer a copy button for a snippet that is still being written.

export interface TextSegment {
  kind: 'text';
  value: string;
}

export interface CodeSegment {
  kind: 'code';
  /** The infostring exactly as written, untrimmed of its meaning — '' when the fence named none. */
  lang: string;
  /** The block's contents, without the fence lines and without their trailing newline. */
  value: string;
  /** False while a streamed fence has not been closed yet. */
  closed: boolean;
}

export type Segment = TextSegment | CodeSegment;

/** ```lang / ~~~lang, with up to three leading spaces, exactly as CommonMark allows. */
const OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\n]*)$/;

/**
 * Split markdown into alternating prose and fenced-code segments.
 *
 * Empty text segments are dropped — a reply that is nothing but a code block should not render an
 * empty prose div above and below it — but a code segment with an empty body is KEPT, because an
 * empty fence is something the model actually emitted and hiding it would misreport the reply.
 */
export function splitFences(source: string): Segment[] {
  const out: Segment[] = [];
  const lines = source.split('\n');
  let text: string[] = [];

  const flushText = () => {
    const value = text.join('\n');
    if (value !== '') out.push({ kind: 'text', value });
    text = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const open = OPEN.exec(lines[i]!);
    if (!open) {
      text.push(lines[i]!);
      continue;
    }
    const marker = open[1]!;
    const lang = (open[2] ?? '').trim();
    // A closing fence must use the SAME character and be at least as long — that is what lets a
    // block containing ``` be written with ````.
    const fenceChar = marker[0]!;
    const close = new RegExp(`^ {0,3}${fenceChar === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`);

    let j = i + 1;
    const body: string[] = [];
    let closed = false;
    while (j < lines.length) {
      if (close.test(lines[j]!)) {
        closed = true;
        break;
      }
      body.push(lines[j]!);
      j += 1;
    }

    flushText();
    out.push({ kind: 'code', lang, value: body.join('\n'), closed });
    // `j` is the closing fence when there was one, and one past the end when there was not.
    i = j;
  }

  flushText();
  return out;
}
