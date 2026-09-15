// /admin — plain functional operator panels: stats, model tester, RAG tester.
// Rendered only for is_admin profiles; admin key kept in sessionStorage.
import { useState, type FormEvent } from 'react';
import { Failure } from '../components/failure';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  adminKillSwitch,
  adminModelTest,
  adminRagTest,
  adminRegisterDiscordCommands,
  adminSpend,
  adminSpendLimits,
  adminStats,
  fetchMe,
  type ModelTestResponse,
  type RagHit,
} from '../lib/api';
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

  const toggleKill = async (killed: boolean) => {
    setBusy(true);
    try {
      await adminKillSwitch(adminKey, killed, killed ? 'Paused from the admin console.' : undefined);
      await spend.refetch();
    } finally {
      setBusy(false);
    }
  };

  const tighten = async (factor: number) => {
    if (!spend.data) return;
    setBusy(true);
    try {
      await adminSpendLimits(adminKey, {
        billableNeuronsPerDay: Math.round(spend.data.limits.billableNeuronsPerDay * factor),
        billableNeuronsPerMonth: Math.round(spend.data.limits.billableNeuronsPerMonth * factor),
      });
      await spend.refetch();
    } finally {
      setBusy(false);
    }
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
                {d.state.dayNeurons.toLocaleString()} neurons ({dayUsedPct}% of today&rsquo;s ceiling)
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${dayUsedPct}%` }} />
                </div>
              </dd>
            </div>
            <div>
              <dt>Free allowance left today</dt>
              <dd>{d.state.freeRemainingToday.toLocaleString()} neurons</dd>
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
              onClick={() => void toggleKill(!d.state.killed)}
              disabled={busy}
            >
              {d.state.killed ? 'Resume AI generation' : 'Stop all AI generation'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void tighten(0.5)} disabled={busy}>
              Halve the caps
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void tighten(2)} disabled={busy}>
              Double the caps
            </button>
          </div>

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
                  <td>{row.neurons.toLocaleString()}</td>
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
                  <td>{row.neurons.toLocaleString()}</td>
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

  if (me.isError || me.data?.profile?.is_admin !== true) {
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
      <StatsPanel adminKey={adminKey} />
      <ModelTester adminKey={adminKey} />
      <RagTester adminKey={adminKey} />
      <DiscordCommands adminKey={adminKey} />
    </div>
  );
}
