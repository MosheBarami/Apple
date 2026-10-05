// The per-piece settings panel: each piece's parameters as controls a person edits directly: a number, a colour, a switch, a few words.
//
// BUILT AGAINST A STUB (lib/pieces-stub.ts), WIRED IN M5. Today no piece is real, so a production build shows the empty state only
// ("Pieces appear here after a build"); development and tests show specimen pieces, every one marked SPECIMEN. A change here is held in
// this panel's own state: it is not saved, it changes nothing in Studio, and the panel says so while it is showing specimens. In M5 a
// change edits one block's parameters and re-runs only that block (planning/proof/M2/DECISIONS.md section 12.5).
import { useId, useState } from 'react';
import { PIECE_KIND_LABEL, acceptValue, usePieces, normaliseColour, normaliseNumber, type ColourParam, type NumberParam, type Piece, type PieceParam, type TextParam, type ToggleParam } from '../../lib/pieces';
import './pieces-panel.css';

export const PIECES_EMPTY = 'Pieces appear here after a build';
export const SPECIMEN_NOTE = 'These are sample pieces with sample values. Changes stay in this panel: they are not saved and change nothing in Studio.';

/* ------------------------------------------------------------------------------------------------------ controls --- */

/**
 * A number. What is typed is kept as typed while it is being typed ("3." is on the way to "3.5"); a value the parameter can hold is
 * committed at once, one it cannot (out of range, not a number) marks the field and commits nothing, and leaving the field puts
 * the last good value back, snapped to the step.
 */
export function NumberControl({ id, param, value, onChange }: { id: string; param: NumberParam; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [bad, setBad] = useState(false);
  return (
    <span className="pieces__number">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={param.min}
        max={param.max}
        step={param.step}
        value={draft}
        aria-invalid={bad ? 'true' : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = normaliseNumber(param, e.target.value);
          setBad(next === null);
          if (next !== null) onChange(next);
        }}
        onBlur={() => {
          setDraft(String(value));
          setBad(false);
        }}
      />
      {/* Always drawn, empty when there is no unit: the number and its unit are two grid columns (pieces-panel.css). */}
      <span className="pieces__unit">{param.unit}</span>
    </span>
  );
}

/** A colour: the browser's own picker beside a hex field. The field commits a colour it can read and marks one it cannot. */
export function ColourControl({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [bad, setBad] = useState(false);
  return (
    <span className="pieces__colour">
      <input
        type="color"
        className="pieces__swatch"
        value={value}
        aria-label={`${label}, colour picker`}
        onChange={(e) => {
          const next = normaliseColour(e.target.value);
          if (!next) return;
          setDraft(next);
          setBad(false);
          onChange(next);
        }}
      />
      <input
        id={id}
        type="text"
        className="pieces__hex"
        value={draft}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={bad ? 'true' : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = normaliseColour(e.target.value);
          setBad(next === null);
          if (next) onChange(next);
        }}
        onBlur={() => {
          setDraft(value);
          setBad(false);
        }}
      />
    </span>
  );
}

/** A switch: a real button, announced as a switch, on Space and Enter like any button. */
export function ToggleControl({ id, label, value, onChange }: { id: string; label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" id={id} role="switch" aria-checked={value} aria-label={label} className="pieces__switch" onClick={() => onChange(!value)}>
      <span className="pieces__switch-word">{value ? 'On' : 'Off'}</span>
      <span className="pieces__switch-track" aria-hidden="true" />
    </button>
  );
}

export function TextControl({ id, param, value, onChange }: { id: string; param: TextParam; value: string; onChange: (value: string) => void }) {
  return <input id={id} type="text" className="pieces__text" value={value} maxLength={param.maxLength} onChange={(e) => onChange(e.target.value.slice(0, param.maxLength))} />;
}

/* ------------------------------------------------------------------------------------------------------- the panel --- */

export function PiecesPanel({ pieces }: { pieces: readonly Piece[] }) {
  const base = useId();
  // What the person has set, by piece and parameter. Held here, in this panel, and nowhere else.
  const [edits, setEdits] = useState<Record<string, number | string | boolean>>({});
  const key = (piece: Piece, param: PieceParam) => `${piece.id}/${param.id}`;
  const valueOf = (piece: Piece, param: PieceParam) => edits[key(piece, param)] ?? param.value;
  const set = (piece: Piece, param: PieceParam, raw: unknown) => setEdits((all) => ({ ...all, [key(piece, param)]: acceptValue({ ...param, value: valueOf(piece, param) } as PieceParam, raw) }));

  if (pieces.length === 0) return <p className="pieces__empty">{PIECES_EMPTY}</p>;

  return (
    <div className="pieces">
      {pieces.some((piece) => piece.specimen) && (
        <p className="pieces__specimen">
          <strong className="pieces__stamp">SPECIMEN</strong> {SPECIMEN_NOTE}
        </p>
      )}
      {pieces.map((piece, index) => {
        const heading = `${base}-${index}`;
        return (
          <section key={piece.id} className="pieces__piece" aria-labelledby={heading}>
            <header className="pieces__head">
              <h3 id={heading} className="pieces__name">{piece.name}</h3>
              <span className="pieces__kind">{PIECE_KIND_LABEL[piece.kind]}</span>
              {piece.specimen && <span className="pieces__stamp">SPECIMEN</span>}
            </header>
            <div className="pieces__params">
              {piece.params.map((param, at) => {
                const id = `${heading}-${at}`;
                const value = valueOf(piece, param);
                return (
                  <div key={param.id} className="pieces__row">
                    <label className="pieces__label" htmlFor={id}>{param.label}</label>
                    {param.kind === 'number' && <NumberControl id={id} param={param} value={value as number} onChange={(next) => set(piece, param, next)} />}
                    {param.kind === 'colour' && <ColourControl id={id} label={param.label} value={value as string} onChange={(next) => set(piece, param, next)} />}
                    {param.kind === 'toggle' && <ToggleControl id={id} label={param.label} value={value as boolean} onChange={(next) => set(piece, param, next)} />}
                    {param.kind === 'text' && <TextControl id={id} param={param} value={value as string} onChange={(next) => set(piece, param, next)} />}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export type { ColourParam, ToggleParam };

/** What the drawer mounts: the panel, once the pieces have been asked for. Nothing is said about "none" until the answer is in. */
export function PiecesDrawer() {
  const { pieces, loaded } = usePieces();
  if (!loaded) return <div className="skeleton skeleton-line" aria-busy="true" />;
  return <PiecesPanel pieces={pieces} />;
}
