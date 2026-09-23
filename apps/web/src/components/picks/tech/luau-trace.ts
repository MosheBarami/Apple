/**
 * A LUAU ERROR, READ INTO ITS PARTS — for the AI Elements `stack-trace` pick.
 *
 * Upstream parses JavaScript traces (`at fn (file:line:col)`). What reaches this app is Roblox's:
 *
 *   ServerScriptService.CoinService:14: attempt to index nil with 'Value'
 *   Stack Begin
 *   Script 'ServerScriptService.CoinService', Line 14 - function onTouched
 *   Script 'ServerScriptService.CoinService', Line 30
 *   Stack End
 *
 * Nothing is invented: a line that matches no frame shape stays in `rest` and is shown as it came.
 * A message with no frames at all is still a StackTrace with an empty frame list — the headline is
 * the useful half.
 */

export interface TraceFrame {
  /** The script, as Roblox names it: `ServerScriptService.CoinService`. */
  source: string;
  line: number;
  fn: string | null;
}

export interface LuauTrace {
  /** The error's kind in a word, when the message has one Roblox uses. */
  type: string;
  message: string;
  frames: TraceFrame[];
  /** Lines that were neither the headline nor a frame, kept in order. */
  rest: string[];
}

const FRAME = /^Script '([^']+)',\s*Line (\d+)(?:\s*-\s*(?:function\s+)?(.+))?$/;
const HEAD = /^([\w.[\]" -]+?):(\d+):\s*(.+)$/;

function kindOf(message: string): string {
  if (/attempt to index nil/i.test(message)) return 'Missing value';
  if (/attempt to (call|perform arithmetic|compare|concatenate)/i.test(message)) return 'Wrong type';
  if (/is not a valid member/i.test(message)) return 'Not found';
  if (/timeout|timed out|exhausted/i.test(message)) return 'Timed out';
  if (/syntax|expected/i.test(message)) return 'Syntax error';
  return 'Error';
}

export function parseLuauTrace(text: string): LuauTrace {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const frames: TraceFrame[] = [];
  const rest: string[] = [];
  let message = '';
  for (const line of lines) {
    if (/^Stack (Begin|End)$/i.test(line)) continue;
    const frame = FRAME.exec(line);
    if (frame) {
      frames.push({ source: frame[1] ?? '', line: Number(frame[2]), fn: frame[3]?.trim() || null });
      continue;
    }
    if (!message) {
      const head = HEAD.exec(line);
      if (head) {
        message = head[3] ?? line;
        // The headline names a place too; it is the innermost frame when no Stack block follows.
        frames.push({ source: head[1] ?? '', line: Number(head[2]), fn: null });
        continue;
      }
      message = line;
      continue;
    }
    rest.push(line);
  }
  // A headline frame repeated by the Stack block is one frame, not two.
  const unique = frames.filter((f, i) => frames.findIndex((g) => g.source === f.source && g.line === f.line) === i);
  return { type: kindOf(message), message: message || text.trim(), frames: unique, rest };
}
