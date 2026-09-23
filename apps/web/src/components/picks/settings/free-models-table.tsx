// The free models, as a small table.
//
// Pick: AICSS "data-table" (MIT — Copyright (c) 2026 AICSS, github.com/kvnkld/aicss; the original is
// vendored byte-for-byte in ../../aicss/data-table with its LICENSE). The vendored component is a
// fixed three-column model/context/price demo, so its LOOK is adapted here (./free-models-table.css:
// the header strip, the lifted body with a hairline border, hairline rows and column rules) around the
// two facts this list actually has — the model's name and who makes it. The upstream brand badges are
// left out: the account screens are monochrome, and a coloured logo per row would be the only hue.
// Adapted rather than imported so the vendored AICSS stays confined to the surfaces it was vendored for.
import './free-models-table.css';

export interface FreeModelRow {
  id: string;
  label: string;
  vendor: string;
}

export function FreeModelsTable({ rows }: { rows: readonly FreeModelRow[] }) {
  return (
    <div className="pk-freetbl" role="table" aria-label="Free models">
      <div className="pk-freetbl__head" role="row">
        <div className="pk-freetbl__cell" role="columnheader">Model</div>
        <div className="pk-freetbl__cell" role="columnheader">Made by</div>
      </div>
      <div className="pk-freetbl__body" role="rowgroup">
        {rows.map((m) => (
          <div key={m.id} className="pk-freetbl__row" role="row">
            <div className="pk-freetbl__cell" role="cell">
              <span className="pk-freetbl__text">{m.label}</span>
            </div>
            <div className="pk-freetbl__cell" role="cell">
              <span className="pk-freetbl__text">{m.vendor}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
