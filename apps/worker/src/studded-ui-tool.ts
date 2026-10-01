/**
 * build_studded_ui: the agent's way to give ANY game a studded GUI the way the owner's reference video builds it
 * (stud-ui.ts): stud tile, gradient colour, black outline, rounded corners, Fredoka One with an outline. The agent says
 * what the screen holds; this writes real, editable instances into StarterGui. It never invents values: the agent then
 * makes every number real and every button act with a LocalScript (a screen whose "+" or "Shop" does nothing is not done).
 */
import type { AgentCtx } from './tools';
import { STUD_COLOURS, studdedScreen, type StudAnchor, type StudColour, type StudPiece } from './stud-ui';
import { typed } from './compose-run';

const ANCHORS: readonly StudAnchor[] = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const colourOf = (v: unknown): StudColour | undefined => (typeof v === 'string' && v in STUD_COLOURS ? (v as StudColour) : undefined);
const text = (v: unknown, max = 40) => String(v ?? '').slice(0, max);

/** The spec the model gave, checked and normalised, or why it cannot be built. */
export function readStudSpec(a: Record<string, unknown>): { name: string; pieces: StudPiece[] } | { error: string } {
  const name = String(a.screen ?? 'GameHUD');
  if (!NAME.test(name)) return { error: 'screen must be a plain name (letters, digits, _).' };
  const raw = Array.isArray(a.pieces) ? a.pieces : [];
  if (raw.length === 0) return { error: 'pieces is empty: list what the screen holds.' };
  if (raw.length > 24) return { error: 'At most 24 pieces in one screen.' };
  const pieces: StudPiece[] = [];
  const seen = new Set<string>();
  for (const [i, r] of raw.entries()) {
    const p = (r ?? {}) as Record<string, unknown>;
    const pname = String(p.name ?? '');
    if (!NAME.test(pname)) return { error: `pieces[${i}].name must be a plain name.` };
    if (seen.has(pname)) return { error: `Two pieces are named ${pname}.` };
    seen.add(pname);
    const kind = p.kind;
    if (kind === 'panel') {
      const cards = (Array.isArray(p.cards) ? p.cards : []).slice(0, 12).map((c, k) => {
        const cc = (c ?? {}) as Record<string, unknown>;
        return { name: NAME.test(String(cc.name ?? '')) ? String(cc.name) : `Card${k + 1}`, label: text(cc.label ?? cc.name, 24), ...(cc.price !== undefined ? { price: text(cc.price, 12) } : {}), ...(colourOf(cc.colour) ? { colour: colourOf(cc.colour) } : {}) };
      });
      pieces.push({ kind, name: pname, title: text(p.title ?? p.text ?? pname, 24), header: colourOf(p.header ?? p.colour), body: colourOf(p.body), cards });
      continue;
    }
    const at = p.at as StudAnchor;
    if (!ANCHORS.includes(at)) return { error: `pieces[${i}].at must be one of ${ANCHORS.join(', ')}.` };
    if (kind === 'counter') pieces.push({ kind, name: pname, text: text(p.text ?? '0', 16), icon: text(p.icon ?? '$', 2), colour: colourOf(p.colour), plus: p.plus !== false, at });
    else if (kind === 'button' || kind === 'bar') pieces.push({ kind, name: pname, text: text(p.text ?? pname, 24), colour: colourOf(p.colour), at });
    else return { error: `pieces[${i}].kind must be counter, button, bar or panel.` };
  }
  return { name, pieces };
}

export async function buildStuddedUi(ctx: AgentCtx, a: Record<string, unknown>) {
  const spec = readStudSpec(a);
  if ('error' in spec) return { error: spec.error };
  const screen = studdedScreen(spec);
  await ctx.execStudioOp({ op: 'delete_instances', paths: [`game.StarterGui.${spec.name}`] }, 20_000).catch(() => undefined);
  const out = await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed(screen), parent: 'game.StarterGui' }] }, 60_000);
  if (!out.ok) return { error: `The screen was not made: ${String(out.error ?? '').slice(0, 300)}` };
  const where = spec.pieces.map((p) => p.kind === 'panel' ? `${spec.name}.${p.name} (hidden; Close is its red X)` : `${spec.name}.Region_${p.at.replace('-', '_')}.${p.name}`);
  return {
    changed: true,
    screen: spec.name,
    pieces: where,
    note: 'Now make it real: a LocalScript in StarterPlayerScripts finds these under player.PlayerGui, sets every counter\'s Value text from the game\'s state, opens and closes each panel, and gives every button and card Buy an action. Nothing may stay a placeholder.',
  };
}
