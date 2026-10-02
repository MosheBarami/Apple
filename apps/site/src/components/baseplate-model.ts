/**
 * THE BASEPLATE'S MODEL: plain data and plain functions, no DOM, no imports.
 *
 * Kept apart from the drawing (baseplate.ts) so apps/site/tests/ember-landing.test.mjs can import it
 * under Node and exercise every rule: what a click places, where it stops, what a stack says about
 * itself, and what sentence the bridge writes. Node strips the types natively, so there is nothing
 * to build first.
 *
 * HONESTY IS A PROPERTY OF THIS FILE. Every brick in a board came from a visitor's click or key
 * press: there is no starter layout, no random fill, no replay. The sentence the bridge writes is
 * computed from the bricks that are really on the board, and nothing else.
 */

export const COLORS = ['red', 'blue', 'green', 'yellow'] as const;
export type Color = (typeof COLORS)[number];

export const MAX_COLS = 12;
export const MAX_ROWS = 5;
export const MAX_HEIGHT = 3;

/** board[row][col] is the stack at that stud, bottom brick first. */
export type Board = Color[][][];

export function emptyBoard(): Board {
  return Array.from({ length: MAX_ROWS }, () => Array.from({ length: MAX_COLS }, () => [] as Color[]));
}

export type Placement = { ok: true; height: number } | { ok: false; reason: 'full' | 'outside' };

const inside = (row: number, col: number) =>
  Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < MAX_ROWS && col >= 0 && col < MAX_COLS;

/** Put one 1x1 brick on top of the stack at (row, col). A stack is at most MAX_HEIGHT high. */
export function place(board: Board, row: number, col: number, color: Color): Placement {
  if (!inside(row, col) || !COLORS.includes(color)) return { ok: false, reason: 'outside' };
  const stack = board[row][col];
  if (stack.length >= MAX_HEIGHT) return { ok: false, reason: 'full' };
  stack.push(color);
  return { ok: true, height: stack.length };
}

/** Take the top brick off the stack at (row, col). Returns what was removed, or null. */
export function removeTop(board: Board, row: number, col: number): Color | null {
  if (!inside(row, col)) return null;
  return board[row][col].pop() ?? null;
}

export function clearBoard(board: Board): void {
  for (const row of board) for (const stack of row) stack.length = 0;
}

/** The window of the board a screen actually shows. Bricks outside it are kept, just not drawn. */
export type View = { cols: number; rows: number };

export function countBricks(board: Board, view: View = { cols: MAX_COLS, rows: MAX_ROWS }): number {
  let n = 0;
  for (let r = 0; r < Math.min(view.rows, MAX_ROWS); r += 1) {
    for (let c = 0; c < Math.min(view.cols, MAX_COLS); c += 1) n += board[r][c].length;
  }
  return n;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "red", "red and blue", "red, blue and green". */
export function listColors(colors: readonly Color[]): string {
  if (colors.length <= 1) return colors.join('');
  return `${colors.slice(0, -1).join(', ')} and ${colors[colors.length - 1]}`;
}

/* ------------------------------------------------------------------ stamps */

/**
 * STAMPS: three shapes a visitor can press instead of placing every brick by hand. A stamp is the
 * visitor's own action, exactly like a click: it happens when they press its button, it places only
 * bricks the rules above allow, and the board it leaves is described by the same sentence.
 *
 *   row     four studs in a line
 *   square  a two by two block
 *   stairs  three studs in a line, one, two and three bricks high
 */
export const STAMPS = ['row', 'square', 'stairs'] as const;
export type Stamp = (typeof STAMPS)[number];

/** Each stamp's footprint: studs across, studs down, and the bricks it puts on each stud (left to right, then down). */
const SHAPES: Record<Stamp, { cols: number; rows: number; stacks: number[] }> = {
  row: { cols: 4, rows: 1, stacks: [1, 1, 1, 1] },
  square: { cols: 2, rows: 2, stacks: [1, 1, 1, 1] },
  stairs: { cols: 3, rows: 1, stacks: [1, 2, 3] },
};

export const STAMP_LABEL: Record<Stamp, string> = { row: 'Row', square: 'Square', stairs: 'Stairs' };

/**
 * Press a stamp with its top-left stud at (row, col). The footprint is slid back inside the visible
 * window when it would hang over an edge, so a stamp is never cut short by where the visitor last
 * touched. Studs that are already full simply take fewer bricks. Returns the studs that gained at
 * least one brick, with how many, in the order they were laid, which is the order they drop in.
 */
export function stamp(
  board: Board,
  kind: Stamp,
  row: number,
  col: number,
  color: Color,
  view: View = { cols: MAX_COLS, rows: MAX_ROWS },
): { row: number; col: number; added: number }[] {
  const shape = SHAPES[kind];
  const cols = Math.min(view.cols, MAX_COLS);
  const rows = Math.min(view.rows, MAX_ROWS);
  if (!shape || shape.cols > cols || shape.rows > rows) return [];
  const r0 = Math.max(0, Math.min(Math.trunc(row), rows - shape.rows));
  const c0 = Math.max(0, Math.min(Math.trunc(col), cols - shape.cols));
  const laid: { row: number; col: number; added: number }[] = [];
  shape.stacks.forEach((count, i) => {
    const r = r0 + Math.floor(i / shape.cols);
    const c = c0 + (i % shape.cols);
    let added = 0;
    for (let n = 0; n < count; n += 1) if (place(board, r, c, color).ok) added += 1;
    if (added) laid.push({ row: r, col: c, added });
  });
  return laid;
}

export function announceStamp(kind: Stamp, bricks: number): string {
  if (bricks === 0) return `${STAMP_LABEL[kind]}: every stud there is already full`;
  return `${STAMP_LABEL[kind]} stamp placed, ${bricks} ${bricks === 1 ? 'brick' : 'bricks'}`;
}

/** What a screen reader hears when a brick lands, e.g. "Red brick placed at column 3, row 1". */
export function announcePlaced(color: Color, row: number, col: number): string {
  return `${cap(color)} brick placed at column ${col + 1}, row ${row + 1}`;
}

export function announceRemoved(color: Color, row: number, col: number): string {
  return `${cap(color)} brick removed from column ${col + 1}, row ${row + 1}`;
}

/** The label of one stud: where it is and what stands on it. */
export function cellLabel(stack: readonly Color[], row: number, col: number): string {
  const where = `Column ${col + 1}, row ${row + 1}`;
  if (stack.length === 0) return `${where}, empty`;
  return `${where}, ${stack.length} ${stack.length === 1 ? 'brick' : 'bricks'}: ${stack.join(', ')}`;
}

/**
 * One sentence about what is really on the board, for the composer. It is a starting point the
 * visitor edits, never a claim about what Apple will do. Returns '' for an empty board.
 */
export function describeBoard(board: Board, view: View = { cols: MAX_COLS, rows: MAX_ROWS }): string {
  const colors = new Set<Color>();
  const columns = new Set<number>();
  let bricks = 0;
  let cells = 0;
  let tallest = 0;
  for (let r = 0; r < Math.min(view.rows, MAX_ROWS); r += 1) {
    for (let c = 0; c < Math.min(view.cols, MAX_COLS); c += 1) {
      const stack = board[r][c];
      if (!stack.length) continue;
      cells += 1;
      bricks += stack.length;
      tallest = Math.max(tallest, stack.length);
      columns.add(c);
      for (const color of stack) colors.add(color);
    }
  }
  if (bricks === 0) return '';

  const palette = listColors(COLORS.filter((c) => colors.has(c)));
  if (bricks === 1) return `One ${palette} brick on a baseplate.`;
  if (cells === 1) return `A tower, ${tallest} bricks high, in ${palette}.`;
  const wide = columns.size === 1 ? 'one stud wide' : `${columns.size} studs wide`;
  if (tallest === 1) return `A flat layout of ${bricks} bricks, ${wide}, in ${palette}.`;
  return `A build ${wide} and up to ${tallest} bricks high, ${bricks} bricks in ${palette}.`;
}

/* ------------------------------------------------------------------ session persistence */

/** The board as a string for sessionStorage. Nothing here is ever sent anywhere. */
export function serialize(board: Board): string {
  return JSON.stringify(board);
}

/** Parse what serialize wrote. Anything that is not exactly a board is refused, never repaired. */
export function parse(text: string | null | undefined): Board | null {
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length !== MAX_ROWS) return null;
  const board = emptyBoard();
  for (let r = 0; r < MAX_ROWS; r += 1) {
    const row = data[r];
    if (!Array.isArray(row) || row.length !== MAX_COLS) return null;
    for (let c = 0; c < MAX_COLS; c += 1) {
      const stack = row[c];
      if (!Array.isArray(stack) || stack.length > MAX_HEIGHT) return null;
      for (const color of stack) {
        if (!COLORS.includes(color)) return null;
        board[r][c].push(color);
      }
    }
  }
  return board;
}

/* ------------------------------------------------------------------ geometry */

/** How many 44px studs fit a container, so a stud never shrinks below a fingertip. */
export function viewFor(width: number, gap = 4, cell = 44): View {
  const cols = Math.max(5, Math.min(MAX_COLS, Math.floor((width + gap) / (cell + gap))));
  return { cols, rows: cols >= 9 ? MAX_ROWS : 4 };
}
