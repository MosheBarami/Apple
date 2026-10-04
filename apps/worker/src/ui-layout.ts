/**
 * One layout per screen (phase T, game 1, flaws 13, 14, 18, 19, 25). Two tools that draw the same screen never looked at each
 * other: build_studded_ui put UPGRADES top-centre and REBIRTH bottom-centre, then add_upgrades added a green "Upgrades" button on
 * the left, so the screen said "Upgrades" three times and REBIRTH sat on the hotbar. This file is the shared, pure half:
 *
 *   placePieces        where a piece may sit (research 06-ui-ux: the centre stays clear; bottom-centre is the Roblox tool
 *                      hotbar; the bottom corners are the thumbstick and the jump button; the top-left belongs to the Roblox menu;
 *                      primary actions go on the right edge). A piece in a bad spot is MOVED with a note that says why, unless
 *                      the piece carries exact:true (the user asked for that spot).
 *   duplicateAction    two buttons in one spec that do the same thing (same action word in the name or the label).
 *   reconcilePieces    what is already on the screen: a piece that does what a piece there already does is not drawn again.
 *
 * No imports of the tool layer: tests/ui-layout.test.mjs runs it as it is.
 */
import type { StudAnchor, StudPiece } from './stud-ui';

/** What get_tree says is in the place: a name, a class and the children (the plugin's tree node). */
export interface TreeNode { name: string; class?: string; children?: TreeNode[] }

// ------------------------------------------------------------------------------------------------ what a piece does

const FILLER = new Set(['button', 'btn', 'open', 'toggle', 'menu', 'panel', 'gui', 'ui', 'frame', 'hud', 'show', 'the', 'my', 'main', 'counter', 'count', 'display', 'label', 'total']);
const SAME_WORD: Record<string, string> = { store: 'shop', market: 'shop', prestige: 'rebirth', option: 'setting', config: 'setting' };

/**
 * The action a name or a label stands for, as one lower-case word string ("UpgradesButton", "Upgrades" and "⬆ UPGRADE" are all
 * "upgrade"; "Store" is "shop"). Empty when nothing is left, and an empty key matches nothing.
 */
export function actionKey(...parts: unknown[]): string {
  const words = parts.map((p) => String(p ?? '')).join(' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const out: string[] = [];
  for (let w of words) {
    if (FILLER.has(w)) continue;
    if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
    else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) w = w.slice(0, -1);
    out.push(SAME_WORD[w] ?? w);
  }
  return out.join(' ');
}

const keysOf = (p: StudPiece): string[] => {
  const keys = p.kind === 'button' ? [actionKey(p.name), actionKey(p.text)]
    : p.kind === 'panel' ? [actionKey(p.name), actionKey(p.title)]
    : p.kind === 'counter' ? [actionKey(p.name), actionKey(p.caption)]
    : [actionKey(p.name)];
  return keys.filter(Boolean);
};

/** A refusal when two buttons (or two panels) of one spec do the same thing; null when there are none. */
export function duplicateAction(pieces: readonly StudPiece[]): string | null {
  for (const kind of ['button', 'panel'] as const) {
    const seen = new Map<string, string>();
    for (const p of pieces) {
      if (p.kind !== kind) continue;
      for (const key of keysOf(p)) {
        const other = seen.get(key);
        if (other !== undefined && other !== p.name) return `${kind === 'button' ? 'Buttons' : 'Panels'} "${other}" and "${p.name}" do the same thing ("${key}"). Keep one.`;
        seen.set(key, p.name);
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ where a piece may sit

/** Buttons on one edge before the column runs into the thumbstick (left) or the jump button (right) on a phone. */
export const EDGE_BUTTONS = 3;

const WHY: Partial<Record<StudAnchor, string>> = {
  bottom: 'bottom-centre is where the Roblox tool hotbar sits',
  'bottom-left': 'the bottom-left corner is the movement thumbstick',
  'bottom-right': 'the bottom-right corner is the jump button',
  top: 'primary actions go on the right edge, and the top-centre belongs to the banner',
  'top-left': 'the top-left belongs to the Roblox menu',
  'top-right': 'the top-right belongs to the Roblox player list',
};
const BOTTOM = new Set<StudAnchor>(['bottom', 'bottom-left', 'bottom-right']);

export interface Placed { pieces: StudPiece[]; notes: string[] }

/**
 * Applies the placement rules to a spec. `exact` names the pieces to leave where they were put; `held` counts the buttons the
 * screen already has on each edge. Buttons live on the left or right edge (three each, the right first), counters on the
 * top row or an edge, bars anywhere above the bottom row. Returns the pieces (the same objects when nothing moved) and a note
 * per move, or an error when there are more buttons than two edges hold.
 */
export function placePieces(pieces: readonly StudPiece[], opts: { exact?: ReadonlySet<string>; held?: { left?: number; right?: number } } = {}): Placed | { error: string } {
  const exact = opts.exact ?? new Set<string>();
  const used = { left: opts.held?.left ?? 0, right: opts.held?.right ?? 0 };
  const notes: string[] = [];
  const moved = new Map<string, StudPiece>();
  const move = (p: StudPiece & { at: StudAnchor }, to: StudAnchor) => {
    const from = p.at;
    moved.set(p.name, { ...p, at: to } as StudPiece);
    notes.push(`${p.kind} "${p.name}" moved ${from} -> ${to}: ${WHY[from] ?? 'that spot is reserved'}. Pass exact:true on the piece to keep ${from}.`);
  };
  // Buttons already on a good edge (or pinned) take their place first, so the ones that move fill what is left.
  const wandering: (StudPiece & { kind: 'button' })[] = [];
  for (const p of pieces) {
    if (p.kind !== 'button') continue;
    if (p.at === 'left' || p.at === 'right') used[p.at] += 1;
    else if (exact.has(p.name)) continue;
    else wandering.push(p);
  }
  for (const p of wandering) {
    const to: StudAnchor | null = used.right < EDGE_BUTTONS ? 'right' : used.left < EDGE_BUTTONS ? 'left' : null;
    if (!to) return { error: `Too many buttons for the two edges (${EDGE_BUTTONS} each, phone screens are short): "${p.name}" has no place. Put the rest in a panel with a card per item, or pass exact:true on the ones the user placed.` };
    used[to] += 1;
    move(p, to);
  }
  for (const p of pieces) {
    if (p.kind === 'panel' || p.kind === 'button' || exact.has(p.name) || !BOTTOM.has(p.at)) continue;
    move(p, p.kind === 'bar' ? 'top' : 'top-left');
  }
  return { pieces: pieces.map((p) => moved.get(p.name) ?? p), notes };
}

// ------------------------------------------------------------------------------------------------ what is already there

type Kind = 'button' | 'panel' | 'label';
interface Entry { name: string; parent: string; path: string; kind: Kind }
const BUTTON = new Set(['ImageButton', 'TextButton']);
const LAYOUT = new Set(['UIListLayout', 'UIGridLayout', 'UICorner', 'UIStroke', 'UIGradient', 'UIScale', 'UIPadding', 'UIAspectRatioConstraint', 'UISizeConstraint']);

/** The pieces on a screen, from the tree two levels down: region and menu children, panels, loose labels. */
export function pieceEntries(screen: TreeNode): Entry[] {
  const root = `game.StarterGui.${screen.name}`;
  const out: Entry[] = [];
  for (const c of screen.children ?? []) {
    if (LAYOUT.has(c.class ?? '')) continue;
    const kids = (c.children ?? []).filter((k) => !LAYOUT.has(k.class ?? ''));
    const path = `${root}.${c.name}`;
    if (c.name.toLowerCase().endsWith('panel') || kids.some((k) => k.name === 'Header' || k.name === 'Body')) { out.push({ name: c.name, parent: '', path, kind: 'panel' }); continue; }
    if (c.class === 'Frame' && kids.length) {
      for (const k of kids) out.push({ name: k.name, parent: c.name, path: `${path}.${k.name}`, kind: BUTTON.has(k.class ?? '') ? 'button' : 'label' });
      continue;
    }
    out.push({ name: c.name, parent: '', path, kind: BUTTON.has(c.class ?? '') ? 'button' : 'label' });
  }
  return out;
}

/** The buttons a screen holds on its left and right edges (for the capacity rule). */
export function edgeButtons(screen: TreeNode | null): { left: number; right: number } {
  const held = { left: 0, right: 0 };
  for (const e of screen ? pieceEntries(screen) : []) {
    if (e.kind !== 'button') continue;
    if (e.parent === 'Region_left') held.left += 1;
    else if (e.parent === 'Region_right') held.right += 1;
  }
  return held;
}

export interface Reuse { wanted: string; have: string; kind: 'button' | 'panel' | 'counter' | 'bar' }
export interface Reconciled { pieces: StudPiece[]; deletes: string[]; reused: Reuse[] }

const regionOf = (p: StudPiece) => (p.kind === 'panel' ? '' : `Region_${p.at.replace('-', '_')}`);

/**
 * Looks at what the screen already holds before anything is drawn. A piece that does what a piece there does (the same action
 * word in its name or label, as actionKey reads it) is not drawn a second time:
 *
 *   'new-wins'      (build_studded_ui, where the agent spelled the pieces out) a piece of the SAME name replaces the old one
 *                   even when that one sits in another region (the old one is deleted: it moved); a piece of ANOTHER name
 *                   that does the same thing is dropped and reported as reused.
 *   'existing-wins' (add_upgrades, where the pieces are defaults) a button or counter already there is kept as it is and
 *                   reported; a panel already there keeps its NAME but is written again with these cards.
 *
 * Pure (tests/ui-layout.test.mjs). `existing` null means an empty place: nothing is changed.
 */
export function reconcilePieces(pieces: readonly StudPiece[], existing: TreeNode | null, mode: 'new-wins' | 'existing-wins'): Reconciled {
  if (!existing) return { pieces: [...pieces], deletes: [], reused: [] };
  const entries = pieceEntries(existing);
  const out: StudPiece[] = [];
  const deletes: string[] = [];
  const reused: Reuse[] = [];
  for (const p of pieces) {
    const kind: Kind = p.kind === 'button' ? 'button' : p.kind === 'panel' ? 'panel' : 'label';
    const keys = keysOf(p);
    const hit = entries.find((e) => e.kind === kind && e.name === p.name) ?? entries.find((e) => e.kind === kind && keys.includes(actionKey(e.name)));
    if (!hit) { out.push(p); continue; }
    if (mode === 'existing-wins') {
      if (p.kind === 'panel') { out.push({ ...p, name: hit.name }); reused.push({ wanted: p.name, have: hit.name, kind: 'panel' }); }
      else reused.push({ wanted: p.name, have: hit.name, kind: p.kind });
      continue;
    }
    if (hit.name === p.name) {
      if (hit.parent !== regionOf(p)) deletes.push(hit.path);
      out.push(p);
      continue;
    }
    reused.push({ wanted: p.name, have: hit.name, kind: p.kind });
  }
  return { pieces: out, deletes, reused };
}

/** The name a piece ended up under on the screen: the one it was reused as, or its own. */
export const nameUsed = (reused: readonly Reuse[], wanted: string): string => reused.find((r) => r.wanted === wanted)?.have ?? wanted;
