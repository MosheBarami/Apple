"use client";
import { useCallback, useEffect, useState } from 'react';
import type { AiConnectionView, AiModelCatalog, AiProviderId } from '../../../../packages/shared/src/index';
import { addAiConnection, fetchAiConnections, fetchAiProviders, fetchAiModels, refreshAiModels,
  removeAiConnection, replaceAiConnection, testAiConnection, testAiBuildingSupport, ApiError } from '../../lib/ai-api';
import { BrandMark, hasBrandAsset } from './brand-mark';
import './ai.css';

type Provider = Awaited<ReturnType<typeof fetchAiProviders>>['providers'][number];
const errorText = (error: unknown) => error instanceof ApiError && error.body && typeof error.body === 'object'
  && 'message' in error.body && typeof error.body.message === 'string' ? error.body.message
  : error instanceof Error ? error.message : 'Connection could not be updated.';
const stateLabel: Record<AiConnectionView['status'], string> = { unverified: 'Not tested', catalog_loaded: 'Models loaded · inference not tested',
  verified: 'Inference verified', invalid: 'Key or model access rejected', unavailable: 'Provider unavailable' };

export function AiConnectionsPanel() {
  const [providers, setProviders] = useState<Provider[]>([]), [connections, setConnections] = useState<AiConnectionView[]>([]);
  const [provider, setProvider] = useState<AiProviderId>('openai'), [name, setName] = useState(''), [key, setKey] = useState('');
  const [accountId, setAccountId] = useState(''), [editing, setEditing] = useState<AiConnectionView | null>(null);
  const [catalogs, setCatalogs] = useState<Record<string, AiModelCatalog>>({}), [models, setModels] = useState<Record<string, string>>({});
  const [query, setQuery] = useState(''), [busy, setBusy] = useState<string | null>(null), [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    const [list, vendors] = await Promise.all([fetchAiConnections(), fetchAiProviders()]);
    setConnections(list.connections); setProviders(vendors.providers); setLoaded(true);
  }, []);
  useEffect(() => { void reload().catch((error) => { setNotice(errorText(error)); setLoaded(true); }); }, [reload]);
  const selectedProvider = providers.find((entry) => entry.id === provider);
  const action = async (id: string, work: () => Promise<void>) => {
    setBusy(id); setNotice(''); try { await work(); } catch (error) { setNotice(errorText(error)); } finally { setBusy(null); }
  };
  const loadModels = (connection: AiConnectionView, refresh: boolean) => action(connection.id, async () => {
    const result = refresh ? await refreshAiModels(connection.id) : await fetchAiModels(connection.id);
    if (result.catalog) {
      setCatalogs((previous) => ({ ...previous, [connection.id]: result.catalog! }));
    const available = result.catalog.models.filter((model) => model.lifecycle !== 'retired' && model.producer && hasBrandAsset(model.producer));
      setModels((previous) => ({ ...previous, [connection.id]: available.some((model) => model.id === previous[connection.id]) ? previous[connection.id] : available[0]?.id ?? '' }));
    }
    await reload();
  });
  const save = () => action('form', async () => {
    const credentials = { apiKey: key.trim(), ...(provider === 'cloudflare' ? { accountId: accountId.trim() } : {}) };
    try {
      if (editing) {
        await replaceAiConnection(editing.id, { name: name.trim(), credentials });
        setCatalogs((previous) => { const next = { ...previous }; delete next[editing.id]; return next; });
        setModels((previous) => { const next = { ...previous }; delete next[editing.id]; return next; });
      }
      else await addAiConnection({ provider, name: name.trim(), credentials });
      setName(''); setAccountId(''); setEditing(null); await reload(); setNotice('Connection saved. Load models and test one to verify inference.');
    } finally { setKey(''); }
  });
  return <div className="ai-connections" id="ai-connections">
    <div className="ai-section-heading"><h3>AI connections</h3><p>Use your own API accounts. Your provider bills inference directly; StudPilot service limits still apply.</p></div>
    <p className="ai-muted">API keys are encrypted on the server and are never shown again. Coding subscriptions use separate access and cannot be pasted as general API connections.</p>
    <form className="ai-connection-form" onSubmit={(event) => { event.preventDefault(); void save(); }} autoComplete="off">
      <label>Provider<select aria-label="Provider" value={provider} disabled={Boolean(editing) || busy !== null} onChange={(event) => setProvider(event.target.value as AiProviderId)}>
        {providers.filter((entry) => hasBrandAsset(entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></label>
      <div className="ai-provider-identity"><BrandMark brand={provider} /><span>{selectedProvider?.name ?? 'Loading providers…'}</span></div>
      <label>Connection name<input value={name} maxLength={80} placeholder="Personal or team API account" required onChange={(event) => setName(event.target.value)} /></label>
      <label>{editing ? 'Replacement API key' : 'API key'}<input type="password" value={key} autoComplete="new-password" spellCheck={false} required
        onChange={(event) => setKey(event.target.value)} placeholder="Paste your provider API key" /></label>
      {provider === 'cloudflare' && <label>Cloudflare account ID<input value={accountId} pattern="[a-f0-9]{32}" required onChange={(event) => setAccountId(event.target.value)} /></label>}
      <div className="ai-actions"><button type="submit" disabled={!loaded || !selectedProvider || !key.trim() || !name.trim() || busy !== null}>{busy === 'form' ? 'Saving…' : editing ? 'Replace key' : 'Save connection'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setKey(''); setName(''); }}>Cancel replacement</button>}</div>
    </form>
    <label className="ai-search">Find a connection<input type="search" value={query} placeholder="Provider or connection name" onChange={(event) => setQuery(event.target.value)} /></label>
    <div role="status" aria-live="polite" className="ai-notice">{notice}</div>
    {!loaded ? <p className="ai-muted">Loading connections…</p> : connections.length === 0 && <p className="ai-empty">No AI connections yet. Add an API key above to choose a provider and model in your workspace.</p>}
    <div className="ai-connection-list">{connections.filter((connection) => `${connection.name} ${connection.provider}`.toLowerCase().includes(query.toLowerCase())).map((connection) => {
      const catalog = catalogs[connection.id];
      return <article className="ai-connection" key={connection.id}>
        <div className="ai-connection-heading"><BrandMark brand={connection.provider} /><div><h4>{connection.name}</h4><p>{providers.find((entry) => entry.id === connection.provider)?.name ?? connection.provider} · key ending {connection.hint}</p></div>
          <span className={`ai-status ai-status--${connection.status}`}>{stateLabel[connection.status]}</span></div>
        <div className="ai-actions">
          <button type="button" disabled={busy !== null} onClick={() => void loadModels(connection, !connection.catalogVersion)}>{busy === connection.id ? 'Working…' : catalog ? 'Reload saved models' : 'Load models'}</button>
          <button type="button" disabled={busy !== null} onClick={() => void loadModels(connection, true)}>Refresh models</button>
          <button type="button" disabled={busy !== null} onClick={() => { setEditing(connection); setProvider(connection.provider); setName(connection.name); setKey(''); }}>Replace key</button>
          <button type="button" className="ai-remove" disabled={busy !== null} onClick={() => void action(connection.id, async () => {
            await removeAiConnection(connection.id);
            setCatalogs((previous) => { const next = { ...previous }; delete next[connection.id]; return next; });
            setModels((previous) => { const next = { ...previous }; delete next[connection.id]; return next; });
            if (editing?.id === connection.id) { setEditing(null); setKey(''); setName(''); }
            await reload(); setNotice('Connection removed. Future requests cannot use that key.');
          })}>Remove</button>
        </div>
        {catalog && <div className="ai-model-test"><label>Test a model<select aria-label={`Test model for ${connection.name}`} value={models[connection.id] ?? ''} onChange={(event) => setModels((previous) => ({ ...previous, [connection.id]: event.target.value }))}>
          {catalog.models.filter((model) => model.lifecycle !== 'retired' && model.producer && hasBrandAsset(model.producer)).map((model) => <option key={model.id} value={model.id}>{model.name}{model.hostedBy ? ` · ${model.hostedBy}` : ''}</option>)}
        </select></label><button type="button" disabled={!models[connection.id] || busy !== null} onClick={() => void action(connection.id, async () => {
          await testAiConnection(connection.id, models[connection.id]!); await reload(); setNotice('This model completed a real inference test. Building quality has not been benchmarked yet.');
        })}>Test inference</button><button type="button" disabled={!models[connection.id] || busy !== null} onClick={() => void action(connection.id, async () => {
          const result = await testAiBuildingSupport(connection.id, models[connection.id]!);
          const refreshed = await fetchAiModels(connection.id);
          if (refreshed.catalog) setCatalogs((previous) => ({ ...previous, [connection.id]: refreshed.catalog! }));
          await reload(); setNotice(result.message);
        })}>Verify tool support</button>{catalog.models.find((model) => model.id === models[connection.id])?.producer && <div className="ai-provider-identity"><BrandMark brand={catalog.models.find((model) => model.id === models[connection.id])!.producer!} /><span>{catalog.models.find((model) => model.id === models[connection.id])!.name}</span></div>}<p className="ai-muted">These checks may use provider credits. A model list or a chat reply alone does not prove building tool support.</p></div>}
      </article>;
    })}</div>
  </div>;
}
