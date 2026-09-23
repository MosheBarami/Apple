// The top of the account menu: who is signed in, and how many Credits they have.
//
// Pick: Motion "Clerk: User Button" (MIT; Motion itself is not installed, so the behaviour is
// rebuilt natively). Upstream the avatar opens a card that springs in — a little smaller, blurred,
// and settling — with a header (avatar, name, email), a Credits line, and the menu's rows dropping
// in one after another. The spring entrance and the row stagger are ./user-button.css, applied to
// the existing account popover (`.gx-user-card__wrap .gx-pop`); this component is the header.
//
// THE CREDITS LINE READS THE SAME MODEL AS THE RAIL AND THE USAGE PAGE (usage-meter-model's
// meterView over the shared ['me'] query), so the three can never disagree. While the figure is not
// known it says so rather than printing a zero.
import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '../../../lib/api';
import { formatNumber } from '../../../lib/format';
import { meterView } from '../../usage-meter-model';
import { RollingNumber } from './rolling-number';
import './user-button.css';

export function AccountMenuHeader({ name, email }: { name: string | null; email: string }) {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const view = meterView(me.data?.quota, Date.now(), { pending: me.isPending, failed: me.isError });
  const known = view.tone !== 'unknown' && !me.isPending && !me.isError;
  const primary = name ?? email ?? 'Account';
  const secondary = name ? email : null;
  const initial = (primary[0] ?? '?').toUpperCase();
  const left = view.allowanceRemaining + view.credits;

  return (
    <div className="pk-ubtn" role="presentation">
      <div className="pk-ubtn__head">
        <span className="pk-ubtn__avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="pk-ubtn__names">
          <span className="pk-ubtn__name">{primary}</span>
          {secondary && <span className="pk-ubtn__email">{secondary}</span>}
        </span>
      </div>
      <div className="pk-ubtn__credits">
        <span>Credits</span>
        {known ? (
          <b aria-label={`${formatNumber(left)} Credits left`}>
            <RollingNumber value={formatNumber(left)} />
          </b>
        ) : (
          <b className="pk-ubtn__unknown">{me.isPending ? 'Checking…' : 'Not known right now'}</b>
        )}
      </div>
    </div>
  );
}
