// A side-by-side comparison table.
//
// Adapted from AICSS `comparison-table` (MIT, https://github.com/kvnkld/aicss, vendored unchanged
// at components/aicss/comparison-table): the same shape — a quiet header row of column names over
// a raised body of hairline-divided rows, with the label column first. Two changes, both for this
// product: cells hold short text rather than only a yes/no tick (the vendored module can only say
// true or false), and the colours are this app's tokens with no green for "yes".
//
// It is a real <table>, so a screen reader announces the column for each cell. On a phone the
// table scrolls sideways inside its own box rather than pushing the page wider.
//
// Where it is used: "Compare them" under the suggested next milestones on the roadmap
// (components/roadmap/suggestions.tsx).
import './compare-table.css';

export interface CompareRow {
  label: string;
  /** One cell per column; an empty string draws a dash. */
  values: string[];
}

export function CompareTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: CompareRow[] }) {
  return (
    <div className="tq-compare" role="region" aria-label={caption} tabIndex={0}>
      <table className="tq-compare__table">
        <caption className="tq-sr">{caption}</caption>
        <thead>
          <tr>
            <td className="tq-compare__corner" />
            {columns.map((c) => (
              <th key={c} scope="col">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {r.values.map((v, i) => (
                <td key={i}>{v === '' ? <span className="tq-compare__none" aria-label="None">—</span> : v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
