// /admin — plain functional operator panels: stats, model tester, RAG tester.
// Rendered only for is_admin profiles; admin key kept in sessionStorage.
import { useState, type FormEvent } from 'react';
import { Failure } from '../components/failure';
import { ConfirmDialog } from '../components/confirm-dialog';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  adminAccount,
  adminAnalytics,
  adminKillSwitch,
  adminModelTest,
  adminRagTest,
  adminRegisterDiscordCommands,
  adminSpend,
  adminSpendLimits,
  adminStats,
  fetchMe,
  type AdminAccount,
  type Metric,
  type ModelTestResponse,
  type RagHit,
} from '../lib/api';
import { adminSpendCeremony, type AdminSpendAction } from '../lib/admin-actions';
import { formatNumber } from '../lib/format';
import { MOCK_MODE } from '../lib/mock';

const ADMIN_KEY_STORAGE = 'apple-admin-key';

function readAdminKey(): string {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}


const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 2)}`;

/** AI spend against the hard caps, plus the emergency stop. */
function SpendPanel({ adminKey }: { adminKey: string }) {
  const spend = useQuery({
    queryKey: ['admin-spend', adminKey],
    queryFn: () => adminSpend(adminKey),
    enabled: (MOCK_MODE || adminKey.length > 0),
    retry: false,
    refetchInterval: 30_000,
  });
  const [busy, setBusy] = useState(false);
  /*
   * THE ACTION WAITING ON A CONFIRMATION, and the reason this page has one at all.
   *
   * lib/confirm-model.ts has graded ceremony from consequence since it landed and NO administrative
   * action used it. Two of the four controls below are worth stopping for — see lib/admin-actions.ts
   * for which and why — and the other two deliberately are not, because a dialog in front of a
   * reversible, free action is how an operator learns to click through the expensive one.
   */
  const [pending, setPending] = useState<AdminSpendAction | null>(null);

  const perform = async (action: AdminSpendAction) => {
    setBusy(true);
    try {
      if (action === 'kill' || action === 'resume') {
        const killed = action === 'kill';
        await adminKillSwitch(adminKey, killed, killed ? 'Paused from the admin console.' : undefined);
      } else if (spend.data) {
        const factor = action === 'raise' ? 2 : 0.5;
        await adminSpendLimits(adminKey, {
          billableNeuronsPerDay: Math.round(spend.data.limits.billableNeuronsPerDay * factor),
          billableNeuronsPerMonth: Math.round(spend.data.limits.billableNeuronsPerMonth * factor),
        });
      }
      await spend.refetch();
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  /** Route a click through the ceremony the action earned, rather than straight at the mutation. */
  const ask = (action: AdminSpendAction) => {
    if (adminSpendCeremony(action) === 'dialog') setPending(action);
    else void perform(action);
  };

  const d = spend.data;
  const dayUsedPct = d ? Math.min(100, Math.round((1 - d.state.dayRemainingFraction) * 100)) : 0;
  const monthPct = d ? Math.min(100, Math.round((d.state.monthBillableNeurons / Math.max(1, d.limits.billableNeuronsPerMonth)) * 100)) : 0;

  return (
    <section className="card admin-panel">
      <div className="rail-head">
        <h2>AI spend <span className="muted model-tag">glm-5.3-flash</span></h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void spend.refetch()} disabled={!MOCK_MODE && !adminKey}>
          Refresh
        </button>
      </div>
      {!MOCK_MODE && !adminKey && <p className="muted">Enter the admin key above.</p>}
      {spend.isError && <p className="error-text">Could not load spend — check the admin key.</p>}
      {d && (
        <>
          {d.state.killed && (
            <p className="error-text" role="status">
              AI generation is PAUSED{d.state.killedReason ? ` — ${d.state.killedReason}` : ''}.
            </p>
          )}
          <dl className="spend-grid">
            <div>
              <dt>This month (billable)</dt>
              <dd>
                <strong>{usd(d.state.estimatedMonthUsd)}</strong> of {usd(d.maxMonthlyUsd)} cap
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${monthPct}%` }} />
                </div>
              </dd>
            </div>
            <div>
              <dt>Today</dt>
              <dd>
                {formatNumber(d.state.dayNeurons)} neurons ({dayUsedPct}% of today&rsquo;s ceiling)
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${dayUsedPct}%` }} />
                </div>
              </dd>
            </div>
            <div>
              <dt>Free allowance left today</dt>
              <dd>{formatNumber(d.state.freeRemainingToday)} neurons</dd>
            </div>
            <div>
              <dt>Worst case this month</dt>
              <dd>
                {usd(d.maxMonthlyUsd)} AI + $5.00 platform = <strong>{usd(d.maxMonthlyUsd + 5)}</strong>
              </dd>
            </div>
          </dl>

          <div className="admin-actions">
            <button
              type="button"
              className={d.state.killed ? 'btn btn-primary btn-sm' : 'btn btn-danger btn-sm'}
              onClick={() => ask(d.state.killed ? 'resume' : 'kill')}
              disabled={busy}
            >
              {d.state.killed ? 'Resume AI generation' : 'Stop all AI generation'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => ask('tighten')} disabled={busy}>
              Halve the caps
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => ask('raise')} disabled={busy}>
              Double the caps
            </button>
          </div>

          {pending === 'kill' && (
            <ConfirmDialog
              title="Stop all AI generation?"
              ceremony="dialog"
              confirmLabel="Stop everything"
              busyLabel="Stopping…"
              busy={busy}
              onConfirm={() => void perform('kill')}
              onClose={() => setPending(null)}
            >
              {/* "and nothing is refunded automatically" WAS TRUE WHEN IT WAS WRITTEN AND IS NOT NOW.
                  Pausing raises a BudgetError with reason 'killed', which do/session.ts turns into
                  finishRun(agent, 'quota'); 'quota' is in REFUNDABLE_REASONS in
                  apps/worker/src/run-refund.ts, so a paused run that had not yet changed anything
                  has every Credit it used put back automatically and the reply says how many. The
                  half that survived is the other branch — a run that had already built something
                  delivered, so it is charged. Stating only the first half told the owner his own
                  kill switch was more expensive to his customers than it is. */}
              Every build running right now stops where it is. Resuming later does not resume them — anyone mid-build
              loses the steps they were on. A run that had already built something is charged for it; a run that had
              not yet changed anything has its Credits put back automatically.
            </ConfirmDialog>
          )}

          {pending === 'raise' && (
            <ConfirmDialog
              title="Double the spend caps?"
              ceremony="dialog"
              tone="primary"
              confirmLabel="Double the caps"
              busyLabel="Raising…"
              busy={busy}
              onConfirm={() => void perform('raise')}
              details={
                <dl className="spend-grid">
                  <div>
                    <dt>Worst case now</dt>
                    <dd>{usd(d.maxMonthlyUsd + 5)}</dd>
                  </div>
                  <div>
                    <dt>Worst case after</dt>
                    <dd>
                      <strong>{usd(d.maxMonthlyUsd * 2 + 5)}</strong>
                    </dd>
                  </div>
                </dl>
              }
              onClose={() => setPending(null)}
            >
              This raises the ceiling on what this business can spend on AI in a month before the budget guard starts
              refusing work. It is reversible — but the consequence arrives as an invoice, not as a screen.
            </ConfirmDialog>
          )}

          <h4 className="admin-subhead">Last 30 days</h4>
          <table className="admin-table">
            <thead>
              <tr><th>Day</th><th>Calls</th><th>Neurons</th><th>Billable</th></tr>
            </thead>
            <tbody>
              {d.days.slice(0, 10).map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td>{row.calls}</td>
                  <td>{formatNumber(row.neurons)}</td>
                  <td>{row.billableUsd > 0 ? usd(row.billableUsd) : '—'}</td>
                </tr>
              ))}
              {d.days.length === 0 && <tr><td colSpan={4} className="muted">No usage recorded yet.</td></tr>}
            </tbody>
          </table>

          <h4 className="admin-subhead">Where it went</h4>
          <table className="admin-table">
            <thead>
              <tr><th>Purpose</th><th>Model</th><th>Calls</th><th>Neurons</th></tr>
            </thead>
            <tbody>
              {d.breakdown.slice(0, 12).map((row, i) => (
                <tr key={`${row.day}-${row.kind}-${row.model}-${i}`}>
                  <td>{row.kind}</td>
                  <td className="mono-cell">{row.model.split('/').pop()}</td>
                  <td>{row.calls}</td>
                  <td>{formatNumber(row.neurons)}</td>
                </tr>
              ))}
              {d.breakdown.length === 0 && <tr><td colSpan={4} className="muted">Nothing yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

/** A metric the worker could not compute prints WHY, never a zero. See lib/api.ts. */
function metric(m: Metric | undefined, fmt: (n: number) => string): string {
  if (!m) return '—';
  if (!m.known) return `unknown (${m.why})`;
  return m.complete ? fmt(m.value) : `at least ${fmt(m.value)}`;
}

const when = (ms: number) => new Date(ms).toLocaleString();
const onDate = (unixSeconds: number | null) =>
  typeof unixSeconds === 'number' && Number.isFinite(unixSeconds) ? new Date(unixSeconds * 1000).toLocaleDateString() : '—';

/**
 * ONE ACCOUNT, LOOKED UP BY ID.
 *
 * Everything here already existed behind the worker and none of it had a door: the plan, the Stripe
 * subscription, every individual credit charge, and this account's own slice of the event log. The
 * person who runs this business does not use curl, so until this panel existed the answer to "what
 * is going on with this customer" was a wrangler session he was never going to open.
 *
 * TWO THINGS IT REFUSES TO IMPLY. The profile row — display name, admin flag, signup date — is not
 * readable from the worker, and the panel says so rather than leaving a gap that reads like a whole
 * record. And the two windows behind these figures are finite: the ledger keeps 35 days and the
 * event log is capped, so an empty table is stated as "nothing in the window", never as "nothing".
 */
function AccountPanel({ adminKey }: { adminKey: string }) {
  const [typedId, setTypedId] = useState('');
  const [lookingUp, setLookingUp] = useState('');
  const [days, setDays] = useState(7);

  const account = useQuery<AdminAccount>({
    queryKey: ['admin-account', adminKey, lookingUp, days],
    queryFn: () => adminAccount(adminKey, lookingUp, days),
    enabled: lookingUp.length > 0 && (MOCK_MODE || adminKey.length > 0),
    retry: false,
  });

  /*
   * WHO TO LOOK UP, for an operator who does not already have an id in front of him.
   *
   * The worker has ranked accounts by spend since analytics landed and nothing ever asked for it,
   * so a lookup that only takes a pasted id is only usable when a customer has already written in.
   * This is the other direction: the heaviest accounts this window, one click from the full record.
   */
  const top = useQuery({
    queryKey: ['admin-top-actors', adminKey, days],
    queryFn: () => adminAnalytics(adminKey, { days, by: 'actorId' }),
    enabled: !MOCK_MODE && adminKey.length > 0,
    retry: false,
  });
  const ranked = top.data?.requested?.known === true ? top.data.requested : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = typedId.trim();
    if (!id) return;
    setLookingUp(id);
  };

  const a = account.data;
  const sub = a?.billing.subscription ?? null;

  return (
    <section className="card admin-panel">
      <h2>Account lookup</h2>
      <p className="muted">
        Plan, subscription, every Credit charge and this account&rsquo;s own usage. Paste the user id from a support
        email or from the usage breakdown below.
      </p>
      <form onSubmit={submit} className="settings-inline">
        <label className="field settings-grow">
          <span className="field-label">User id</span>
          <input
            value={typedId}
            onChange={(e) => setTypedId(e.target.value)}
            name="accountUserId"
            id="admin-account-id"
            placeholder="00000000-0000-0000-0000-000000000000"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span className="field-label">Window</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} name="accountDays" id="admin-account-days">
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={account.isFetching || (!MOCK_MODE && !adminKey) || !typedId.trim()}>
          {account.isFetching ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      {!MOCK_MODE && !adminKey && <p className="muted">Enter the admin key above.</p>}
      {account.isError && <Failure error={account.error} onRetry={() => void account.refetch()} compact />}

      {ranked && (
        <>
          <h4 className="admin-subhead">Heaviest accounts — last {days} day{days === 1 ? '' : 's'}</h4>
          <table className="admin-table">
            <thead>
              <tr><th>Account</th><th className="num">Calls</th><th className="num">Cost</th><th /></tr>
            </thead>
            <tbody>
              {ranked.rows.slice(0, 8).map((row) => (
                <tr key={row.key}>
                  <td className="mono-cell">{row.key}</td>
                  <td className="num">{row.calls}</td>
                  <td className="num">{metric(row.usd, usd)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setTypedId(row.key);
                        setLookingUp(row.key);
                      }}
                    >
                      Look up
                    </button>
                  </td>
                </tr>
              ))}
              {ranked.rows.length === 0 && <tr><td colSpan={4} className="muted">No attributable AI calls in this window.</td></tr>}
            </tbody>
          </table>
          {/*
            COUNTED, NOT BUCKETED. A call with no actor — an anonymous or system path — is reported
            as a number rather than given a key in the table above, because a key that looks like a
            user id gets read as one and sends an operator after an account that does not exist.
          */}
          {ranked.unattributed > 0 && (
            <p className="muted">
              {ranked.unattributed} call{ranked.unattributed === 1 ? '' : 's'} in this window carried no account and
              are not in the table.
            </p>
          )}
        </>
      )}

      {a && (
        <>
          {/*
            NOT A COSMETIC DISCLAIMER. profiles is own-row-only under RLS and the worker holds the
            anon key, so this record is genuinely missing its name, its admin flag and its signup
            date. Showing the rest without saying that invites the reader to treat it as complete.
          */}
          {!a.profile.known && <p className="muted">Profile not readable from here — {a.profile.why}.</p>}

          <dl className="spend-grid">
            <div>
              <dt>Plan</dt>
              <dd><strong>{a.billing.plan}</strong></dd>
            </div>
            <div>
              <dt>Allowance left today</dt>
              <dd>{typeof a.quota.allowanceRemaining === 'number' ? formatNumber(a.quota.allowanceRemaining) : '—'} Credits</dd>
            </div>
            <div>
              <dt>Purchased balance</dt>
              <dd>{typeof a.quota.credits === 'number' ? formatNumber(a.quota.credits) : '—'} Credits</dd>
            </div>
            <div>
              <dt>Stripe customer</dt>
              <dd className="mono-cell">{a.billing.customerId ?? 'none'}</dd>
            </div>
          </dl>

          <h4 className="admin-subhead">Subscription</h4>
          {sub === null ? (
            <p className="muted">No subscription has ever been recorded for this account.</p>
          ) : (
            <dl className="spend-grid">
              <div>
                <dt>Status</dt>
                <dd>{sub.status ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>{sub.cancelAtPeriodEnd ? 'Access ends' : 'Renews'}</dt>
                <dd>{onDate(sub.currentPeriodEnd)}</dd>
              </div>
              <div>
                <dt>Cancelling at period end</dt>
                <dd>{sub.cancelAtPeriodEnd ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Subscription id</dt>
                <dd className="mono-cell">{sub.subscriptionId ?? '—'}</dd>
              </div>
            </dl>
          )}

          <h4 className="admin-subhead">Billing changes</h4>
          <table className="admin-table">
            <thead>
              <tr><th>When</th><th>Change</th><th>Status</th><th>Stripe event</th></tr>
            </thead>
            <tbody>
              {a.billing.events.map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td>{when(e.at)}</td>
                  <td>{e.kind === 'credits' ? 'Credits granted' : `${e.fromPlan ?? '—'} → ${e.toPlan ?? '—'}`}</td>
                  <td>{e.status ?? '—'}</td>
                  <td className="mono-cell">{e.eventId ?? '—'}</td>
                </tr>
              ))}
              {a.billing.events.length === 0 && <tr><td colSpan={4} className="muted">No billing change has ever been recorded.</td></tr>}
            </tbody>
          </table>

          <h4 className="admin-subhead">Credit charges</h4>
          <table className="admin-table">
            <thead>
              <tr><th>When</th><th>What for</th><th className="num">Credits</th></tr>
            </thead>
            <tbody>
              {a.credits.entries.map((e) => (
                <tr key={e.id}>
                  <td>{when(e.at)}</td>
                  <td>{e.kind}</td>
                  <td className="num">{e.credits}</td>
                </tr>
              ))}
              {a.credits.entries.length === 0 && (
                <tr><td colSpan={3} className="muted">No charge in the last {a.credits.retentionDays ?? '—'} days.</td></tr>
              )}
            </tbody>
          </table>
          {/*
            THE WINDOW TRAVELS WITH THE TABLE. Rows are deleted past the retention horizon, so an
            empty list means "nothing recently", not "never" — and those send an operator to two
            completely different places.
          */}
          <p className="muted">
            {a.credits.total} charge{a.credits.total === 1 ? '' : 's'} kept, covering the last{' '}
            {a.credits.retentionDays ?? '—'} days; older rows are deleted.
            {a.credits.truncated ? ' This list is capped and does not show all of them.' : ''}
          </p>

          <h4 className="admin-subhead">Usage — last {a.usage.days} day{a.usage.days === 1 ? '' : 's'}</h4>
          {a.usage.modelCalls === null ? (
            <p className="muted">No AI calls by this account in the window.</p>
          ) : (
            <dl className="spend-grid">
              <div>
                <dt>Calls</dt>
                <dd>{a.usage.modelCalls.calls}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{metric(a.usage.modelCalls.usd, usd)}</dd>
              </div>
              <div>
                <dt>Neurons</dt>
                <dd>{metric(a.usage.modelCalls.neurons, formatNumber)}</dd>
              </div>
              <div>
                <dt>Succeeded</dt>
                <dd>{metric(a.usage.modelCalls.success, (n) => `${Math.round(n * 100)}%`)}</dd>
              </div>
            </dl>
          )}
          {/*
            The event log keeps a bounded number of rows. When the start of the window was evicted
            before anyone asked, every figure above is a floor — and saying so is the difference
            between a measurement and a guess wearing one's clothes.
          */}
          {a.usage.window.truncated && (
            <p className="muted">
              The event log was cut inside this window, so the figures above are floors rather than totals.
            </p>
          )}

          <h4 className="admin-subhead">Runs</h4>
          <table className="admin-table">
            <thead>
              <tr><th>When</th><th>Outcome</th><th className="num">Steps</th><th className="num">Applied</th><th className="num">Failed</th></tr>
            </thead>
            <tbody>
              {a.usage.builds.map((b, i) => (
                <tr key={`${b.at}-${i}`}>
                  <td>{when(b.at)}</td>
                  <td>{b.outcome}</td>
                  <td className="num">{b.steps ?? '—'}</td>
                  <td className="num">{b.opsApplied ?? '—'}</td>
                  <td className="num">{b.opsFailed ?? '—'}</td>
                </tr>
              ))}
              {a.usage.builds.length === 0 && <tr><td colSpan={5} className="muted">No run by this account in the window.</td></tr>}
            </tbody>
          </table>

          <h4 className="admin-subhead">Errors</h4>
          <table className="admin-table">
            <thead>
              <tr><th>When</th><th>Where</th><th>Kind</th><th>Message</th></tr>
            </thead>
            <tbody>
              {a.usage.errors.map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td>{when(e.at)}</td>
                  <td className="mono-cell">{e.scope}</td>
                  <td>{e.errorKind}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
              {a.usage.errors.length === 0 && <tr><td colSpan={4} className="muted">No error recorded against this account in the window.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function StatsPanel({ adminKey }: { adminKey: string }) {
  const stats = useQuery({
    queryKey: ['admin-stats', adminKey],
    queryFn: () => adminStats(adminKey),
    enabled: (MOCK_MODE || adminKey.length > 0),
    retry: false,
  });

  return (
    <section className="card admin-panel">
      <div className="rail-head">
        <h2>Operational counters (14d)</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void stats.refetch()} disabled={!MOCK_MODE && !adminKey}>
          Refresh
        </button>
      </div>
      {!MOCK_MODE && !adminKey && <p className="muted">Enter the admin key above.</p>}
      {stats.isFetching && <p className="muted">Loading…</p>}
      {stats.isError && <Failure error={stats.error} onRetry={() => void stats.refetch()} compact />}
      {stats.isSuccess && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Key</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {stats.data.counters.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No counters yet.
                  </td>
                </tr>
              )}
              {stats.data.counters.map((row, i) => (
                <tr key={`${row.day}-${row.key}-${i}`}>
                  <td className="mono">{row.day}</td>
                  <td className="mono">{row.key}</td>
                  <td className="num">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ModelTester({ adminKey }: { adminKey: string }) {
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tools, setTools] = useState(false);
  const [result, setResult] = useState<ModelTestResponse | null>(null);

  const run = useMutation({
    mutationFn: () => adminModelTest(adminKey, { model: model.trim(), prompt, tools }),
    onSuccess: setResult,
    onError: (e: Error) => setResult({ ok: false, ms: 0, error: e.message }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!model.trim() || !prompt.trim() || run.isPending || (!MOCK_MODE && !adminKey)) return;
    setResult(null);
    run.mutate();
  };

  return (
    <section className="card admin-panel">
      <h2>Model tester</h2>
      <form onSubmit={submit}>
        <div className="admin-form-row">
          <label className="field settings-grow">
            <span className="field-label">Model key</span>
            <input value={model} onChange={(e) => setModel(e.target.value)} name="modelKey" id="admin-model" placeholder="e.g. coder-large" />
          </label>
          <label className="switch-row admin-tools-check">
            <input type="checkbox" name="offerEchoTool" id="admin-tools" checked={tools} onChange={(e) => setTools(e.target.checked)} />
            <span>Offer echo tool</span>
          </label>
        </div>
        <label className="field">
          <span className="field-label">Prompt</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} name="modelPrompt" id="admin-prompt" placeholder="Say hi in Luau" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={run.isPending || (!MOCK_MODE && !adminKey) || !model.trim() || !prompt.trim()}>
          {run.isPending ? 'Running…' : 'Run'}
        </button>
      </form>
      {result && (
        <div className={`admin-result${result.ok ? '' : ' admin-result-err'}`}>
          <p className="mono muted">
            {result.ok ? 'ok' : 'error'} · {result.ms}ms
            {result.provider && ` · ${result.provider}/${result.model}`}
            {result.usage && ` · ${result.usage.inputTokens}→${result.usage.outputTokens} tok`}
            {result.finishReason && ` · ${result.finishReason}`}
          </p>
          {result.error && <pre className="admin-pre">{result.error}</pre>}
          {result.text && <pre className="admin-pre">{result.text}</pre>}
          {result.toolCalls && result.toolCalls.length > 0 && (
            <pre className="admin-pre">{JSON.stringify(result.toolCalls, null, 2)}</pre>
          )}
        </div>
      )}
    </section>
  );
}

function RagTester({ adminKey }: { adminKey: string }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RagHit[] | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const run = useMutation({
    mutationFn: () => adminRagTest(adminKey, query.trim()),
    onSuccess: (res) => {
      setHits(res.hits);
      setErrorMsg('');
    },
    onError: (e: Error) => {
      setHits(null);
      setErrorMsg(e.message);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim() || run.isPending || (!MOCK_MODE && !adminKey)) return;
    run.mutate();
  };

  return (
    <section className="card admin-panel">
      <h2>RAG tester</h2>
      <form onSubmit={submit} className="settings-inline">
        <label className="field settings-grow">
          <span className="field-label">Query</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} name="ragQuery" id="admin-rag" placeholder="How do I use ProximityPrompt?" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={run.isPending || (!MOCK_MODE && !adminKey) || !query.trim()}>
          {run.isPending ? 'Searching…' : 'Search'}
        </button>
      </form>
      {errorMsg && <p className="form-error">{errorMsg}</p>}
      {hits && hits.length === 0 && <p className="muted">No hits.</p>}
      {hits &&
        hits.map((h, i) => (
          <div key={i} className="rag-hit">
            <p>
              <a href={h.url} target="_blank" rel="noopener noreferrer">
                {h.title}
              </a>{' '}
              <span className="mono muted">score {h.score.toFixed(3)}</span>
            </p>
            <p className="muted rag-preview">{h.preview}</p>
          </div>
        ))}
    </section>
  );
}

/**
 * Publishing the slash commands is the one step that needs the bot token, and it is a button
 * rather than a shell command because the person who has to press it does not use a terminal.
 * Idempotent: the list is replaced wholesale, so pressing it twice changes nothing.
 */
function DiscordCommands({ adminKey }: { adminKey: string }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const run = useMutation({
    mutationFn: () => adminRegisterDiscordCommands(adminKey),
    onSuccess: (res) => {
      setNames(res.registered);
      setErrorMsg('');
    },
    onError: (e: Error) => {
      setNames(null);
      setErrorMsg(e.message);
    },
  });

  return (
    <section className="card admin-panel">
      <h2>Discord commands</h2>
      <p className="muted">
        Publishes the slash commands to Discord. Press it after creating the Discord app, and again after any change to
        the command list. Nothing happens to anyone&rsquo;s account.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => run.mutate()}
        disabled={run.isPending || (!MOCK_MODE && !adminKey)}
      >
        {run.isPending ? 'Publishing…' : 'Publish commands'}
      </button>
      {errorMsg && <p className="form-error">{errorMsg}</p>}
      {names && <p className="muted">Discord now offers: {names.map((n) => `/${n}`).join(', ')}</p>}
    </section>
  );
}

export function AdminPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const [adminKey, setAdminKey] = useState(readAdminKey);

  if (me.isPending) {
    return (
      <div className="page">
        <p className="muted" aria-busy="true">
          Checking access…
        </p>
      </div>
    );
  }

  //[[ A CHECK THAT DID NOT COME BACK IS NOT A VERDICT ABOUT THE PERSON.
  //
  //   This branch used to be folded into the one below as `me.isError || …is_admin !== true`, so a
  //   network blip, an expired session or a 500 from /api/me all told the reader "this area is for
  //   Apple operators" — a claim about who they are, made by a page that never found out. Hiding
  //   the panel is still right; offering one that will 403 is worse. Saying why, and offering to
  //   ask again, is the part that was missing. ]]
  if (me.isError) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Admin</h1>
            <p className="page-sub">We could not check whether this account is an operator.</p>
          </div>
        </div>
        <Failure error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }

  if (me.data?.profile?.is_admin !== true) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>Nothing here</h2>
          <p className="muted">This area is for Apple operators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-sub">Operator tools. Plain and functional, as intended.</p>
        </div>
      </div>

      <section className="card admin-panel">
        <label className="field">
          <span className="field-label">Admin key (kept in this tab's sessionStorage)</span>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => {
              setAdminKey(e.target.value);
              try {
                sessionStorage.setItem(ADMIN_KEY_STORAGE, e.target.value);
              } catch {
                /* private mode */
              }
            }}
            name="adminKey"
            id="admin-key"
            placeholder="X-Admin-Key"
            autoComplete="off"
          />
        </label>
      </section>

      <SpendPanel adminKey={adminKey} />
      <AccountPanel adminKey={adminKey} />
      <StatsPanel adminKey={adminKey} />
      <ModelTester adminKey={adminKey} />
      <RagTester adminKey={adminKey} />
      <DiscordCommands adminKey={adminKey} />
    </div>
  );
}
