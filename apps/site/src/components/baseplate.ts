/**
 * THE BASEPLATE: the landing's building toy, drawn in DOM only. No canvas, no WebGL, no library.
 *
 * The rules of the board live in baseplate-model.ts. This file draws the studs, wires the pointer
 * and the keyboard, and tells a screen reader what happened.
 *
 *   pointer   press an empty stud to drop a brick; drag along a row to lay a row of bricks; a
 *             vertical swipe is left to the page (touch-action: pan-y), so scrolling never builds.
 *   keyboard  roving tabindex over a role="grid". Arrow keys move, Home/End jump along a row,
 *             Space or Enter places, Delete or Backspace removes the top brick, 1-4 pick a colour,
 *             Escape hands focus back to the page.
 *   AT        every stud has a real aria-label, and a polite live region says what each action did.
 *
 * STAMPS (Row, Square, Stairs) are buttons that place a shape of bricks on the stud the visitor last
 * touched; they are the visitor's own action and the model still decides what is allowed.
 *
 * HOW A PLACEMENT FEELS. The brick drops 6px and settles with --ease-snap (baseplate.css), the logo's
 * right-hand stud clicks on the same beat (Web Animations, skipped under reduced motion), and a
 * touch screen gets an 8ms vibration where the browser has one. Nothing is audible: there is no
 * sound at all, so there is nothing to opt out of.
 *
 * Hover feedback is a CSS :hover/:focus highlight on the stud. Nothing follows the pointer (the
 * site bans pointer-following overlays and hidden cursors: cursor-never-blinds.test.mjs).
 */
import {
  COLORS,
  MAX_HEIGHT,
  announcePlaced,
  announceRemoved,
  cellLabel,
  clearBoard,
  countBricks,
  describeBoard,
  emptyBoard,
  parse,
  place,
  removeTop,
  serialize,
  stamp,
  announceStamp,
  viewFor,
  type Board,
  type Color,
  type Stamp,
} from './baseplate-model';

const STORE = 'apple.baseplate.v1';

export function mountBaseplate(root: HTMLElement): void {
  const grid = root.querySelector<HTMLElement>('[data-grid]');
  const live = root.querySelector<HTMLElement>('[data-live]');
  const bridge = root.querySelector<HTMLButtonElement>('[data-bridge]');
  const clear = root.querySelector<HTMLButtonElement>('[data-clear]');
  const swatches = [...root.querySelectorAll<HTMLButtonElement>('[data-tool]')];
  const stamps = [...root.querySelectorAll<HTMLButtonElement>('[data-stamp]')];
  const carry = document.querySelector<HTMLElement>('[data-carry]');
  if (!grid || !live || !bridge || !clear || !swatches.length) return;
  const box = grid;

  let board: Board = emptyBoard();
  try {
    board = parse(sessionStorage.getItem(STORE)) ?? board;
  } catch {
    /* storage can be blocked: the toy still works for this page view */
  }

  let tool: Color | 'erase' = 'red';
  /** The last real colour chosen: a stamp lays this even while the eraser is selected. */
  let color: Color = 'red';
  let view = viewFor(box.clientWidth || 600);
  let focusAt = { row: 0, col: 0 };
  /** Where a stamp lands: the stud the visitor last touched. Before they touch one, the middle-left. */
  let anchor = { row: 2, col: 1 };
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** The logo's right-hand stud clicks down on the same beat as a brick. A picture of nothing: it only reacts. */
  const snapLogo = () => {
    if (reduceMotion()) return;
    for (const stud of document.querySelectorAll<SVGElement>('#site-nav .stud--snap')) {
      stud.animate?.(
        [{ transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }],
        { duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
  };
  const buzz = () => {
    if (window.matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(8);
  };

  const say = (text: string) => {
    live.textContent = '';
    // A second write of the same words must still be announced.
    window.setTimeout(() => { live.textContent = text; }, 20);
  };

  const save = () => {
    try { sessionStorage.setItem(STORE, serialize(board)); } catch { /* ignore */ }
  };

  const cellAt = (row: number, col: number) =>
    grid.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);

  /** Draw one stud's bricks and label. Only the studs that changed are touched. */
  function paint(row: number, col: number, fresh = false, delay = 0, freshCount = 1): void {
    const el = cellAt(row, col);
    if (!el) return;
    const stack = board[row][col];
    el.setAttribute('aria-label', cellLabel(stack, row, col));
    el.dataset.height = String(stack.length);
    const old = el.querySelectorAll('.brick');
    old.forEach((b) => b.remove());
    stack.forEach((color, level) => {
      const brick = document.createElement('span');
      brick.className = `brick brick--${color}`;
      brick.style.setProperty('--level', String(level));
      if (fresh && level >= stack.length - Math.max(1, freshCount)) {
        brick.classList.add('is-new');
        if (delay) brick.style.animationDelay = `${delay + (level - (stack.length - Math.max(1, freshCount))) * 60}ms`;
      }
      el.appendChild(brick);
    });
  }

  function paintAll(): void {
    for (let r = 0; r < view.rows; r += 1) for (let c = 0; c < view.cols; c += 1) paint(r, c);
    refreshBridge();
  }

  function refreshBridge(): void {
    bridge!.hidden = countBricks(board, view) === 0;
    refreshCarry();
  }

  /** The closing band's offer: a small read-only copy of the plate and the sentence, only once there is something on it. */
  function refreshCarry(): void {
    if (!carry) return;
    const sentence = describeBoard(board, view);
    carry.hidden = !sentence;
    if (!sentence) return;
    const mini = carry.querySelector<HTMLElement>('[data-carry-plate]');
    const text = carry.querySelector<HTMLElement>('[data-carry-text]');
    if (text) text.textContent = sentence;
    if (!mini) return;
    mini.style.setProperty('--cols', String(view.cols));
    mini.textContent = '';
    for (let r = 0; r < view.rows; r += 1) {
      for (let c = 0; c < view.cols; c += 1) {
        const top = board[r][c][board[r][c].length - 1];
        const dot = document.createElement('span');
        if (top) {
          dot.className = `mini mini--${top}`;
          dot.dataset.height = String(board[r][c].length);
        } else dot.className = 'mini';
        mini.appendChild(dot);
      }
    }
  }

  /** Build the grid for the current view. A change of width re-runs this, bricks are kept. */
  function build(): void {
    grid!.textContent = '';
    grid!.style.setProperty('--cols', String(view.cols));
    grid!.setAttribute('aria-label', `Baseplate, ${view.cols} columns by ${view.rows} rows`);
    grid!.setAttribute('aria-rowcount', String(view.rows));
    grid!.setAttribute('aria-colcount', String(view.cols));
    focusAt = { row: Math.min(focusAt.row, view.rows - 1), col: Math.min(focusAt.col, view.cols - 1) };
    for (let r = 0; r < view.rows; r += 1) {
      const rowEl = document.createElement('div');
      rowEl.setAttribute('role', 'row');
      rowEl.className = 'toy-row';
      for (let c = 0; c < view.cols; c += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.style.setProperty('--row', String(r));
        cell.style.setProperty('--col', String(c));
        cell.tabIndex = r === focusAt.row && c === focusAt.col ? 0 : -1;
        rowEl.appendChild(cell);
      }
      grid!.appendChild(rowEl);
    }
    paintAll();
    markCue();
    grid!.setAttribute('data-ready', '');
    grid!.classList.remove('skeleton');
  }

  /** The one Ember ring on the stud to start with, only while nothing has been placed. It goes at the first brick or key press. */
  function markCue(): void {
    for (const old of grid!.querySelectorAll('.is-cue')) old.classList.remove('is-cue');
    if (countBricks(board, view) > 0) return;
    cellAt(Math.min(anchor.row, view.rows - 1), Math.min(anchor.col, view.cols - 1))?.classList.add('is-cue');
  }

  function setTool(next: Color | 'erase', announce = true): void {
    tool = next;
    if (next !== 'erase') color = next;
    root.dataset.color = color;
    for (const s of swatches) s.setAttribute('aria-pressed', String(s.dataset.tool === next));
    root.dataset.erasing = String(next === 'erase');
    if (announce) say(next === 'erase' ? 'Eraser selected' : `${next[0].toUpperCase()}${next.slice(1)} selected`);
  }

  /** Apply the current tool to one stud. Returns true if the board changed. */
  function apply(row: number, col: number): boolean {
    if (tool === 'erase') {
      const gone = removeTop(board, row, col);
      if (!gone) { say('Nothing to remove here'); return false; }
      paint(row, col);
      say(announceRemoved(gone, row, col));
    } else {
      const res = place(board, row, col, tool);
      if (!res.ok) {
        say(res.reason === 'full' ? `This stud is already ${MAX_HEIGHT} bricks high` : 'Outside the baseplate');
        return false;
      }
      paint(row, col, true);
      say(announcePlaced(tool, row, col));
      snapLogo();
      buzz();
    }
    anchor = { row, col };
    save();
    refreshBridge();
    markCue();
    return true;
  }

  function focusCell(row: number, col: number): void {
    const next = cellAt(row, col);
    if (!next) return;
    cellAt(focusAt.row, focusAt.col)?.setAttribute('tabindex', '-1');
    focusAt = { row, col };
    anchor = { row, col };
    next.setAttribute('tabindex', '0');
    next.focus();
  }

  /* ------------------------------------------------------------------ pointer */

  let stroke: { row: number; col: number; last: number; dragged: boolean; seen: Set<string>; id: number } | null = null;
  const keyOf = (r: number, c: number) => `${r}:${c}`;
  const cellFromEvent = (x: number, y: number) =>
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.cell') ?? null;

  grid.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
    if (!cell) return;
    stroke = {
      row: Number(cell.dataset.row),
      col: Number(cell.dataset.col),
      last: Number(cell.dataset.col),
      dragged: false,
      seen: new Set(),
      id: e.pointerId,
    };
  });

  grid.addEventListener('pointermove', (e: PointerEvent) => {
    if (!stroke || e.pointerId !== stroke.id) return;
    // A mouse released somewhere the grid never heard about: no button is held, so the stroke is over.
    if (e.pointerType === 'mouse' && e.buttons === 0) { stroke = null; return; }
    const cell = cellFromEvent(e.clientX, e.clientY);
    if (!cell || Number(cell.dataset.row) !== stroke.row) return;
    const col = Number(cell.dataset.col);
    if (col === stroke.col && !stroke.dragged) return;
    if (!stroke.dragged) {
      stroke.dragged = true;
      stroke.seen.add(keyOf(stroke.row, stroke.col));
      apply(stroke.row, stroke.col);
    }
    // Every stud between the last sampled one and this one: a fast swipe skips pointermove events.
    const step = col > stroke.last ? 1 : -1;
    for (let c = stroke.last + step; step > 0 ? c <= col : c >= col; c += step) {
      if (!stroke.seen.has(keyOf(stroke.row, c))) {
        stroke.seen.add(keyOf(stroke.row, c));
        apply(stroke.row, c);
      }
    }
    stroke.last = col;
  });

  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (!stroke || e.pointerId !== stroke.id) return;
    const s = stroke;
    stroke = null;
    if (cancelled || s.dragged) return;
    const up = cellFromEvent(e.clientX, e.clientY);
    // A press that ends on the stud it started on is a click on that stud.
    if (up && Number(up.dataset.row) === s.row && Number(up.dataset.col) === s.col) {
      focusCell(s.row, s.col);
      apply(s.row, s.col);
    }
  };
  // On the window, not the grid: a drag released past the grid's edge must still end (ultrareview, PR #12).
  window.addEventListener('pointerup', (e: PointerEvent) => finish(e, false));
  window.addEventListener('pointercancel', (e: PointerEvent) => finish(e, true));

  /* ------------------------------------------------------------------ keyboard */

  // Space and Enter reach the stud as a click with no pointer behind it (detail 0). A mouse click is
  // already handled by the pointer path above, so it is ignored here and a brick is never placed twice.
  grid.addEventListener('click', (e: MouseEvent) => {
    if (e.detail !== 0) return;
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
    if (cell) apply(Number(cell.dataset.row), Number(cell.dataset.col));
  });

  grid.addEventListener('keydown', (e: KeyboardEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
    if (!cell) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const rtl = getComputedStyle(grid).direction === 'rtl';
    const horizontal = (step: number) => (rtl ? -step : step);
    let next: [number, number] | null = null;
    switch (e.key) {
      case 'ArrowRight': next = [row, col + horizontal(1)]; break;
      case 'ArrowLeft': next = [row, col + horizontal(-1)]; break;
      case 'ArrowDown': next = [row + 1, col]; break;
      case 'ArrowUp': next = [row - 1, col]; break;
      case 'Home': next = [row, 0]; break;
      case 'End': next = [row, view.cols - 1]; break;
      case 'Delete':
      case 'Backspace': {
        e.preventDefault();
        const gone = removeTop(board, row, col);
        if (gone) { paint(row, col); save(); refreshBridge(); markCue(); say(announceRemoved(gone, row, col)); }
        else say('Nothing to remove here');
        return;
      }
      case 'Escape':
        e.preventDefault();
        document.getElementById('hero-start')?.focus();
        return;
      default: {
        const n = Number(e.key);
        if (n >= 1 && n <= COLORS.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setTool(COLORS[n - 1]);
        }
        return;
      }
    }
    e.preventDefault();
    const [nr, nc] = next;
    if (nr >= 0 && nr < view.rows && nc >= 0 && nc < view.cols) focusCell(nr, nc);
  });

  /* ------------------------------------------------------------------ tray, clear, bridge */

  for (const s of swatches) {
    s.addEventListener('click', () => setTool((s.dataset.tool as Color | 'erase') ?? 'red'));
  }

  for (const s of stamps) {
    s.addEventListener('click', () => {
      const kind = s.dataset.stamp as Stamp;
      const laid = stamp(board, kind, anchor.row, anchor.col, color, view);
      laid.forEach((l, i) => paint(l.row, l.col, true, i * 28, l.added));
      const total = laid.reduce((n, l) => n + l.added, 0);
      if (total) {
        snapLogo();
        buzz();
        save();
        refreshBridge();
        markCue();
      }
      say(announceStamp(kind, total));
    });
  }

  clear.addEventListener('click', () => {
    clearBoard(board);
    save();
    paintAll();
    markCue();
    say('Baseplate cleared');
  });

  // The closing band's button is the same bridge, pressed from further down the page.
  carry?.querySelector('[data-carry-link]')?.addEventListener('click', () => bridge.click());

  bridge.addEventListener('click', () => {
    const field = document.getElementById('hero-start') as HTMLTextAreaElement | null;
    const sentence = describeBoard(board, view);
    if (!field || !sentence) return;
    // It fills the box and stops. It never submits: the visitor edits it and presses Build.
    field.value = sentence;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    say('A sentence about your bricks is in the box above. Edit it, then press Build.');
  });

  /* ------------------------------------------------------------------ size */

  build();
  setTool('red', false);

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => {
      const next = viewFor(box.clientWidth || 600);
      if (next.cols === view.cols && next.rows === view.rows) return;
      view = next;
      build();
    });
    ro.observe(box);
  }
}
