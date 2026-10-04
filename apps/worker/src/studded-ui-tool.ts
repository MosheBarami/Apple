/**
 * build_studded_ui: the agent's way to give ANY game a studded GUI the way the owner's reference video builds it
 * (stud-ui.ts): stud tile, gradient colour, black outline, rounded corners, Fredoka One with an outline. The agent says
 * what the screen holds; this writes real, editable instances into StarterGui. It never invents values: the agent then
 * makes every number real and every button act with a LocalScript (a screen whose "+" or "Shop" does nothing is not done).
 */
import type { AgentCtx } from './tools';
import { STUD_COLOURS, studdedScreen, type StudAnchor, type StudColour, type StudPiece } from './stud-ui';
import { typed } from './compose-run';
import type { InstanceSpecLite } from './compose';
import { actionKey, duplicateAction, edgeButtons, placePieces, reconcilePieces, type Reuse, type TreeNode } from './ui-layout';
import { currencyGlyph, glyphOf } from './ui-icons';

export type { TreeNode };

const ANCHORS: readonly StudAnchor[] = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const colourOf = (v: unknown): StudColour | undefined => (typeof v === 'string' && v in STUD_COLOURS ? (v as StudColour) : undefined);
const text = (v: unknown, max = 40) => String(v ?? '').slice(0, max);

/** A price the player pays in the currency (a bare number, maybe abbreviated): the cards that may carry the currency's icon. */
const BARE_PRICE = /^[\d.,]+\s?[KMBT]?$/i;

/**
 * The spec the model gave, checked and normalised, or why it cannot be built. Pieces are placed by the placement rules
 * (ui-layout.ts placePieces; `exact: true` on a piece keeps the spot it was given; `notes` says what moved and why). A counter
 * with no icon gets the one for its currency (ui-icons.ts), and a panel's priced cards carry that icon on their Buy button.
 * `held` is how many buttons the screen already has on each edge.
 */
export function readStudSpec(a: Record<string, unknown>, opts: { held?: { left: number; right: number } } = {}): { name: string; pieces: StudPiece[]; notes: string[] } | { error: string } {
  const name = String(a.screen ?? 'GameHUD');
  if (!NAME.test(name)) return { error: 'screen must be a plain name (letters, digits, _).' };
  const raw = Array.isArray(a.pieces) ? a.pieces : [];
  if (raw.length === 0) return { error: 'pieces is empty: list what the screen holds.' };
  if (raw.length > 24) return { error: 'At most 24 pieces in one screen.' };
  const pieces: StudPiece[] = [];
  const exact = new Set<string>();
  const seen = new Set<string>();
  for (const [i, r] of raw.entries()) {
    const p = (r ?? {}) as Record<string, unknown>;
    const pname = String(p.name ?? '');
    if (!NAME.test(pname)) return { error: `pieces[${i}].name must be a plain name.` };
    if (seen.has(pname)) return { error: `Two pieces are named ${pname}.` };
    seen.add(pname);
    if (p.exact === true) exact.add(pname);
    const kind = p.kind;
    if (kind === 'panel') {
      const cards = (Array.isArray(p.cards) ? p.cards : []).slice(0, 12).map((c, k) => {
        const cc = (c ?? {}) as Record<string, unknown>;
        return { name: NAME.test(String(cc.name ?? '')) ? String(cc.name) : `Card${k + 1}`, label: text(cc.label ?? cc.name, 24), ...(cc.price !== undefined ? { price: text(cc.price, 12) } : {}), ...(colourOf(cc.colour) ? { colour: colourOf(cc.colour) } : {}),
          ...(typeof cc.icon === 'string' ? { icon: glyphOf(text(cc.icon, 12)) } : {}), ...(typeof cc.blurb === 'string' ? { blurb: text(cc.blurb, 28) } : {}), ...(cc.level !== undefined ? { level: text(cc.level, 8) } : {}) };
      });
      pieces.push({ kind, name: pname, title: text(p.title ?? p.text ?? pname, 24), header: colourOf(p.header ?? p.colour), body: colourOf(p.body), cards });
      continue;
    }
    const at = p.at as StudAnchor;
    if (!ANCHORS.includes(at)) return { error: `pieces[${i}].at must be one of ${ANCHORS.join(', ')}.` };
    if (kind === 'counter') {
      // The icon follows the currency named: an icon key or a glyph the agent typed is honoured, else it comes from the caption,
      // the name and the text, and a currency nothing recognises gets the neutral star, not the dollar coin.
      const icon = typeof p.icon === 'string' && p.icon.trim() ? glyphOf(text(p.icon.trim(), 12)) : currencyGlyph(p.caption, pname, /[a-z]/i.test(String(p.text ?? '')) ? p.text : '');
      pieces.push({ kind, name: pname, text: text(p.text ?? '0', 16), icon, colour: colourOf(p.colour), plus: p.plus !== false, at, ...(typeof p.caption === 'string' ? { caption: text(p.caption, 20) } : {}) });
    } else if (kind === 'button') {
      // A rebirth (or prestige) button costs something: it gets the cost line, the progress bar and the lock, and a premium colour.
      const rebirth = actionKey(pname) === 'rebirth' || actionKey(p.text) === 'rebirth';
      const progress = p.progress === true || (rebirth && p.progress !== false);
      pieces.push({ kind, name: pname, text: text(p.text ?? pname, 24), colour: colourOf(p.colour) ?? (rebirth ? 'purple' : undefined), at, ...(typeof p.icon === 'string' ? { icon: glyphOf(text(p.icon, 12)) } : {}), ...(p.badge === true ? { badge: true } : {}), ...(progress ? { progress: true } : {}) });
    } else if (kind === 'bar') pieces.push({ kind, name: pname, text: text(p.text ?? pname, 24), colour: colourOf(p.colour), at });
    else return { error: `pieces[${i}].kind must be counter, button, bar or panel.` };
  }
  const twice = duplicateAction(pieces);
  if (twice) return { error: twice };
  // What the player earns is what its cards cost: the first counter's icon goes on their Buy buttons (a price that is a bare number).
  const money = pieces.find((p) => p.kind === 'counter');
  const priced = money && money.kind === 'counter' ? pieces.map((p) => p.kind !== 'panel' ? p : { ...p, cards: (p.cards ?? []).map((c) => c.price && BARE_PRICE.test(c.price) && !c.priceIcon ? { ...c, priceIcon: money.icon ?? '$' } : c) }) : pieces;
  const placed = placePieces(priced, { exact, held: opts.held });
  if ('error' in placed) return placed;
  return { name, pieces: placed.pieces, notes: placed.notes };
}

/**
 * How to put a studded screen into a place that may already hold one of the same name, without taking anything
 * away (owner, 2026-10-01: "add an upgrades button" redrew the whole screen six times, restyled the first counter and
 * finally wiped it). Pure (tests/stud-ui.test.mjs). Only the pieces named in the new spec are written: a piece of the
 * same name is replaced, a new one is added after what is there, and every other piece stays exactly as it was.
 * `replace` (the user asked for a new design) rebuilds the whole screen.
 */
export function screenWrites(screen: InstanceSpecLite, existing: TreeNode | null, replace = false): { deletes: string[]; creates: { item: InstanceSpecLite; parent: string }[] } {
  const root = `game.StarterGui.${screen.name}`;
  if (!existing || replace) return { deletes: existing ? [root] : [], creates: [{ item: screen, parent: 'game.StarterGui' }] };
  const deletes: string[] = [];
  const creates: { item: InstanceSpecLite; parent: string }[] = [];
  const have = new Map((existing.children ?? []).map((c) => [c.name, c]));
  for (const child of screen.children ?? []) {
    const there = have.get(child.name);
    if (!child.name.startsWith('Region_') || !there) {
      if (there) deletes.push(`${root}.${child.name}`);
      creates.push({ item: child, parent: root });
      continue;
    }
    // A region already on screen: add or replace this spec's pieces in it, after the ones it holds.
    const held = new Set((there.children ?? []).map((c) => c.name));
    let order = (there.children ?? []).length + 1;
    for (const piece of child.children ?? []) {
      if (piece.className === 'UIListLayout') continue;
      if (held.has(piece.name)) deletes.push(`${root}.${child.name}.${piece.name}`);
      else piece.props = { ...(piece.props ?? {}), LayoutOrder: 100 + order++ };
      creates.push({ item: piece, parent: `${root}.${child.name}` });
    }
  }
  return { deletes, creates };
}

/** The screen as it is in Studio now, or null when there is none. */
export async function readScreen(ctx: AgentCtx, name: string): Promise<TreeNode | null> {
  const got = await ctx.execStudioOp({ op: 'get_tree', root: `game.StarterGui.${name}`, maxDepth: 2, maxNodes: 300 }, 20_000).catch(() => null);
  if (!got || !got.ok) return null;
  return ((got.data as { root?: TreeNode } | undefined)?.root) ?? null;
}

/**
 * Writes a studded screen the merge way (screenWrites). `existing` is the screen as already read (a tool that has looked at it
 * passes it, so it is read once), `deletes` are pieces to take away first (one that moved to another region). Null when done,
 * else why not.
 */
export async function writeScreen(ctx: AgentCtx, screen: InstanceSpecLite, replace = false, opts: { existing?: TreeNode | null; deletes?: string[] } = {}): Promise<string | null> {
  const existing = opts.existing === undefined ? await readScreen(ctx, screen.name) : opts.existing;
  const plan = screenWrites(screen, existing, replace);
  const deletes = [...(opts.deletes ?? []), ...plan.deletes];
  if (deletes.length) await ctx.execStudioOp({ op: 'delete_instances', paths: deletes }, 20_000).catch(() => undefined);
  for (const c of plan.creates) {
    const out = await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed(c.item), parent: c.parent }] }, 60_000);
    if (!out.ok) return String(out.error ?? '').slice(0, 300);
  }
  return null;
}

/** What was left out because the screen already had it, as one clause for the agent ("" when nothing was). */
export function reusedNote(reused: readonly Reuse[]): string {
  if (!reused.length) return '';
  return `reused, not drawn again: ${reused.map((r) => r.wanted === r.have ? `"${r.wanted}" (already there)` : `"${r.wanted}" is "${r.have}", which is already there`).join('; ')}`;
}

export async function buildStuddedUi(ctx: AgentCtx, a: Record<string, unknown>) {
  const replace = a.replace === true;
  const existing = replace ? null : await readScreen(ctx, String(a.screen ?? 'GameHUD'));
  const spec = readStudSpec(a, { held: edgeButtons(existing) });
  if ('error' in spec) return { error: spec.error };
  // One layout per screen: a piece that does what one already there does is not drawn again (ui-layout.ts reconcilePieces).
  const plan = reconcilePieces(spec.pieces, existing, 'new-wins');
  const reused = reusedNote(plan.reused);
  if (plan.pieces.length === 0) return { changed: false, screen: spec.name, reused: plan.reused.map((r) => `${r.wanted} -> ${r.have}`), note: `Nothing was added (${reused}). Use the pieces that are there (player.PlayerGui.${spec.name}); pass replace:true only when the user asked for a new design.` };
  const failed = await writeScreen(ctx, studdedScreen({ name: spec.name, pieces: plan.pieces }), replace, { existing, deletes: plan.deletes });
  if (failed) return { error: `The screen was not made: ${failed}` };
  const where = plan.pieces.map((p) => p.kind === 'panel' ? `${spec.name}.${p.name} (hidden, over a dimmed backdrop; Close is its red X)` : `${spec.name}.Region_${p.at.replace('-', '_')}.${p.name}`);
  return {
    changed: true,
    screen: spec.name,
    pieces: where,
    ...(spec.notes.length ? { placement: spec.notes } : {}),
    ...(plan.reused.length ? { reused: plan.reused.map((r) => `${r.wanted} -> ${r.have}`) } : {}),
    note: 'Added to the screen; every piece already on it is unchanged (pass replace:true only when the user asked for a new design).' + (reused ? ` Note: ${reused}.` : '') + ' Now make it real: a LocalScript in StarterPlayerScripts finds these under player.PlayerGui, sets every counter\'s Value text from the game\'s state, opens and closes each panel, and gives every button and card Buy an action. A button with progress:true (a rebirth gets it) has Cost (text), Progress.Fill (width = share met) and Lock (visible while it cannot be afforded) to set; a card\'s Buy has Dim (visible while the price cannot be paid). Nothing may stay a placeholder. For upgrades use add_upgrades instead: it is all done in one call.',
  };
}
