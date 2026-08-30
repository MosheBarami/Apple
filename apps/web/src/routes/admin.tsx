// /admin — plain functional operator panels: stats, model tester, RAG tester.
// Rendered only for is_admin profiles; admin key kept in sessionStorage.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  adminModelTest,
  adminRagTest,
  adminStats,
  fetchMe,
  type ModelTestResponse,
  type RagHit,
} from '../lib/api';

const ADMIN_KEY_STORAGE = 'golem-admin-key';

function readAdminKey(): string {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function StatsPanel({ adminKey }: { adminKey: string }) {
  const stats = useQuery({
    queryKey: ['admin-stats', adminKey],
    queryFn: () => adminStats(adminKey),
    enabled: adminKey.length > 0,
    retry: false,
  });

  return (
    <section className="card admin-panel">
      <div className="rail-head">
        <h3>Operational counters (14d)</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void stats.refetch()} disabled={!adminKey}>
          Refresh
        </button>
      </div>
      {!adminKey && <p className="muted">Enter the admin key above.</p>}
      {stats.isFetching && <p className="muted">Loading…</p>}
      {stats.isError && <p className="form-error">{(stats.error as Error).message}</p>}
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
    if (!model.trim() || !prompt.trim() || run.isPending || !adminKey) return;
    setResult(null);
    run.mutate();
  };

  return (
    <section className="card admin-panel">
      <h3>Model tester</h3>
      <form onSubmit={submit}>
        <div className="admin-form-row">
          <label className="field settings-grow">
            <span className="field-label">Model key</span>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. coder-large" />
          </label>
          <label className="switch-row admin-tools-check">
            <input type="checkbox" checked={tools} onChange={(e) => setTools(e.target.checked)} />
            <span>Offer echo tool</span>
          </label>
        </div>
        <label className="field">
          <span className="field-label">Prompt</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Say hi in Luau" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={run.isPending || !adminKey || !model.trim() || !prompt.trim()}>
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
    if (!query.trim() || run.isPending || !adminKey) return;
    run.mutate();
  };

  return (
    <section className="card admin-panel">
      <h3>RAG tester</h3>
      <form onSubmit={submit} className="settings-inline">
        <label className="field settings-grow">
          <span className="field-label">Query</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="How do I use ProximityPrompt?" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={run.isPending || !adminKey || !query.trim()}>
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
          <p className="muted">This area is for Golem operators.</p>
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
            placeholder="X-Admin-Key"
            autoComplete="off"
          />
        </label>
      </section>

      <StatsPanel adminKey={adminKey} />
      <ModelTester adminKey={adminKey} />
      <RagTester adminKey={adminKey} />
    </div>
  );
}
