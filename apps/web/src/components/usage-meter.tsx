// The rail's usage meter. All of the judgement lives in usage-meter-model.ts; this draws it.
//
// Two bands, not one. The allowance band is the renewable part and empties over the day; the
// credits band sits beside it and does not. Drawing them as a single bar would be the one thing
// QuotaState's own comment warns against — it hides which kind of zero you are looking at, and the
// two zeroes have different next actions.
import { meterView, type MeterView } from './usage-meter-model';

const TONE_LABEL: Record<MeterView['tone'], string> = {
  good: 'Usage',
  warn: 'Usage — running low',
  bad: 'Usage — nothing left',
  unknown: 'Usage — unavailable',
};

export function UsageMeter({ quota, now = Date.now() }: { quota: unknown; now?: number }) {
  const v = meterView(quota, now);
  const pct = Math.round(v.allowanceFraction * 100);

  return (
    <div className={`gx-usage is-${v.tone}`}>
      <div className="gx-usage__top">
        <span className="gx-usage__head">{v.headline}</span>
        {v.planName && <span className="gx-usage__plan">{v.planName}</span>}
      </div>

      {/* The bar is decorative: every number in it is already in the text above and below, so a
          screen reader is given the summary once rather than a percentage it cannot act on. */}
      <div
        className="gx-usage__bar"
        role="img"
        aria-label={`${TONE_LABEL[v.tone]}. ${v.headline}. ${v.detail}`}
      >
        {v.tone === 'unknown' ? (
          <span className="gx-usage__fill is-unknown" />
        ) : (
          <>
            <span className="gx-usage__fill" style={{ width: `${pct}%` }} />
            {v.credits > 0 && <span className="gx-usage__credits" aria-hidden="true" />}
          </>
        )}
      </div>

      <p className="gx-usage__detail">{v.detail}</p>

      <div className="gx-usage__foot">
        {v.buildsHint && <span className="gx-usage__builds">{v.buildsHint}</span>}
        {v.resetsIn && <span className="gx-usage__reset">{v.resetsIn}</span>}
      </div>

      {v.nextAction && <p className="gx-usage__next">{v.nextAction}</p>}
    </div>
  );
}
