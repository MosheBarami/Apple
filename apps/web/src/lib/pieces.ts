// The per-piece settings panel's model: what a piece is, what its controls accept, and where pieces come from.
//
// A PIECE is one built thing (a screen, a system, a zone, a prop) with parameters a person can change directly: a number, a colour, a
// switch, a few words. The panel is built now against a STUB (lib/pieces-stub.ts) and is wired to real block parameters in M5, where a
// change edits one block's parameters and re-runs only that block. Until then no piece is real:
//
//   - PRODUCTION HAS NO PIECES. `loadPieces()` answers an empty list, and the panel says "Pieces appear here after a build". The stub is
//     reached only through a dynamic import behind `import.meta.env.DEV`, which Vite folds to `false` in a production build, so the stub
//     module is not in the bundle at all (tests/pieces-production.test.mjs bundles it both ways, and scripts/check-app-bundle.mjs greps
//     the real build for the stub's marker).
//   - Every stub piece says it is a SPECIMEN (`specimen: true`), and the panel draws that word on the panel and on every card.
//
// The normalisers below decide what a control may hold. They are pure, so they are tested as functions.
import { useEffect, useState } from 'react';

export type PieceKind = 'ui' | 'system' | 'zone' | 'prop';

/** What a person calls each kind. */
export const PIECE_KIND_LABEL: Record<PieceKind, string> = { ui: 'Screen', system: 'System', zone: 'Zone', prop: 'Prop' };

export interface NumberParam { kind: 'number'; id: string; label: string; value: number; min: number; max: number; step: number; unit?: string }
export interface ColourParam { kind: 'colour'; id: string; label: string; value: string }
export interface ToggleParam { kind: 'toggle'; id: string; label: string; value: boolean }
export interface TextParam { kind: 'text'; id: string; label: string; value: string; maxLength: number }
export type PieceParam = NumberParam | ColourParam | ToggleParam | TextParam;

export interface Piece {
  id: string;
  name: string;
  kind: PieceKind;
  params: PieceParam[];
  /** True for sample data. The panel says SPECIMEN on a piece that carries it. Real pieces (M5) never do. */
  specimen?: true;
}

/* ----------------------------------------------------------------------------------------- what a control holds --- */

/**
 * A typed number, as the number it means, or null when it is not one. Outside the control's range is not a number it can hold (it is
 * refused, not clamped, so a typo is not silently turned into a different value), and a number between two steps snaps to the nearest.
 */
export function normaliseNumber(param: Pick<NumberParam, 'min' | 'max' | 'step'>, raw: unknown): number | null {
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < param.min || n > param.max) return null;
  const steps = Math.round((n - param.min) / param.step);
  // Rounded to the step's own precision, so 0.1 steps do not come back as 0.30000000000000004.
  const places = (String(param.step).split('.')[1] ?? '').length;
  const snapped = Number((param.min + steps * param.step).toFixed(places));
  return Math.min(param.max, snapped);
}

/** `#rgb` or `#rrggbb`, in any case, as `#rrggbb` in lower case; anything else is not a colour. */
export function normaliseColour(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim())?.[1]?.toLowerCase();
  if (!hex) return null;
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex}`;
}

/** The value a parameter holds after `raw` is offered to it: the new value when it is acceptable, the old one when it is not. */
export function acceptValue(param: PieceParam, raw: unknown): number | string | boolean {
  switch (param.kind) {
    case 'number':
      return normaliseNumber(param, raw) ?? param.value;
    case 'colour':
      return normaliseColour(raw) ?? param.value;
    case 'toggle':
      return typeof raw === 'boolean' ? raw : param.value;
    case 'text':
      return typeof raw === 'string' ? raw.slice(0, param.maxLength) : param.value;
  }
}

/* --------------------------------------------------------------------------------------------- where pieces come from --- */

/**
 * The pieces to show. A production build has none: the dynamic import below is dead code there (`import.meta.env.DEV` is replaced by
 * `false`) and the stub is not emitted. In development and under test, the specimen pieces.
 */
export async function loadPieces(): Promise<Piece[]> {
  if (import.meta.env.DEV) {
    const { STUB_PIECES } = await import('./pieces-stub');
    return STUB_PIECES;
  }
  return [];
}

/** The pieces, once they have been asked for. `loaded` stays false until the answer is in, so the panel does not claim "none" early. */
export function usePieces(): { pieces: Piece[]; loaded: boolean } {
  const [state, setState] = useState<{ pieces: Piece[]; loaded: boolean }>({ pieces: [], loaded: false });
  useEffect(() => {
    let current = true;
    void loadPieces().then((pieces) => {
      if (current) setState({ pieces, loaded: true });
    });
    return () => {
      current = false;
    };
  }, []);
  return state;
}
