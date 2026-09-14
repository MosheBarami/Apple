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
  pending: 'Usage — loading',
};

/**
 * `pending` is passed in rather than inferred from an absent quota, because absence is ambiguous:
 * it is what a request in flight looks like AND what a failed one looks like, and the two need
 * different words. The caller is the only one that knows which.
 */
export function UsageMeter({ quota, pending = false, now = Date.now() }: {
  quota: unknown;
  pending?: boolean;
  now?: number;
}) {
  const v = meterView(quota, now, { pending });
  const pct = Math.round(v.allowanceFraction * 100);
  const bare = v.tone === 'unknown' || v.tone === 'pending';

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
        {bare ? (
          // No width, in either case: a bar drawn at some length is a claim about a number nobody
          // has. The class differs so a load reads as a load and a failure reads as a failure.
          <span className={v.tone === 'pending' ? 'gx-usage__fill is-pending' : 'gx-usage__fill is-unknown'} />
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
