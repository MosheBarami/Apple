"use client";
import { useEffect, useState, useRef, useId } from 'react';
import Link from 'next/link';
import { INFERENCE_ROUTES, type AiConnectionView, type AiModelRecord, type InferenceSelection } from '../../../../packages/shared/src/index';
import { fetchAiConnections, fetchAiModels, fetchAiProviders, fetchOpenCodeModels, refreshAiModels, ApiError } from '../../lib/ai-api';
import { BrandMark, hasBrandAsset } from './brand-mark';
import './ai.css';

export function InferencePicker({ value, onChange, onReady, running }: {
  value: InferenceSelection | null; onChange: (selection: InferenceSelection | null) => Promise<void>;
  onReady: (ready: boolean) => void; running: boolean;
}) {
  const [route, setRoute] = useState<InferenceSelection['route']>(value?.route ?? 'studpilot');
  const [connections, setConnections] = useState<AiConnectionView[]>([]), [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [connectionId, setConnectionId] = useState(value?.route === 'byok' ? value.connectionId : '');
  const [models, setModels] = useState<AiModelRecord[]>([]), [search, setSearch] = useState('');
  const [freeModels, setFreeModels] = useState<{ id: string; name: string; available: boolean }[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false), detailsId = useId();
  const optionsButton = useRef<HTMLButtonElement>(null);
  const connection = connections.find((entry) => entry.id === connectionId);
  const selectedModel = value?.route === 'byok' ? models.find((model) => model.id === value.modelId) : null;
  useEffect(() => {
    const ready = Boolean(value && !busy && !error && (value.route === 'studpilot'
      || (value.route === 'byok' && selectedModel?.capabilities.tools === true
        && selectedModel.verification?.tools?.passed !== false
        && (!selectedModel.availability || selectedModel.availability.kind === 'available')
        && connection && !['invalid', 'unavailable'].includes(connection.status))
      || (value.route === 'opencode-free' && freeModels.some((model) => model.available && (!value.modelId || value.modelId === model.id)))));
    onReady(ready);
  }, [value, busy, error, models, connections, freeModels, onReady]);
  const displayError = (error: unknown) => error instanceof ApiError && error.body && typeof error.body === 'object'
    && 'message' in error.body && typeof error.body.message === 'string' ? error.body.message
    : error instanceof Error ? error.message : 'The inference route could not be loaded.';
  useEffect(() => { if (value) setRoute(value.route); }, [value?.route]);
  useEffect(() => { if (value?.route === 'byok') setConnectionId(value.connectionId); }, [value?.route, value?.route === 'byok' ? value.connectionId : null]);
  useEffect(() => {
    let live = true;
    if (route === 'byok') void Promise.all([fetchAiConnections(), fetchAiProviders()]).then(([list, vendors]) => {
      if (live) { setConnections(list.connections); setProviders(vendors.providers); }
    }).catch((error) => { if (live) setError(displayError(error)); });
    if (route === 'opencode-free') void fetchOpenCodeModels().then((catalog) => {
      if (!Array.isArray(catalog.models)) throw new Error('The OpenCode model list is unavailable. Try refreshing.');
      if (live) { setFreeModels(catalog.models); if (!catalog.models.some((model) => model.available)) {
        setError('OpenCode Free has no verified service model available yet. Your choice will not fall back to a paid route.');
      } }
    }).catch((error) => { if (live) setError(displayError(error)); });
    return () => { live = false; };
  }, [route, running]);
  useEffect(() => {
    let live = true;
    if (!connectionId || route !== 'byok') return;
    setBusy(true); setError('');
    void fetchAiModels(connectionId).then(async (result) => result.catalog ?? (await refreshAiModels(connectionId)).catalog)
      .then((catalog) => { if (live) setModels(catalog.models); })
      .catch((error) => { if (live) setError(displayError(error)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [connectionId, route, connection?.revision, running]);
  const choose = async (next: InferenceSelection | null) => {
    setError(''); setBusy(true);
    try { await onChange(next); } catch (error) { setError(displayError(error)); } finally { setBusy(false); }
  };
  const eligibleModels = models.filter((model) => model.lifecycle !== 'retired' && model.capabilities.text !== false
    && model.capabilities.tools === true && model.verification?.tools?.passed !== false
    && Boolean(model.producer && hasBrandAsset(model.producer)));
  const visibleModels = eligibleModels.filter((model) => `${model.name} ${model.id} ${model.producer}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="ai-route-picker">
    <div className="ai-route-main">
      {route === 'opencode-free' ? <BrandMark brand="opencode" /> : route === 'byok' && connection ? <BrandMark brand={connection.provider} /> : null}
      <select aria-label="AI route" value={route} disabled={busy} onChange={(event) => {
        const next = event.target.value as InferenceSelection['route']; setRoute(next); setModels([]); setError(''); setDetailsOpen(next === 'byok');
        void choose(next === 'studpilot' ? { route: 'studpilot' } : next === 'opencode-free' ? { route: 'opencode-free' } : null);
      }}>{INFERENCE_ROUTES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>
      {route === 'byok' && <button ref={optionsButton} type="button" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen(!detailsOpen)}>{selectedModel ? 'Model options' : 'Choose a model'}</button>}
      {route === 'byok' && <Link href="/app/settings#ai-connections">Connections</Link>}
    </div>
    {running && <p className="ai-muted">Changes apply to your next build. The current run keeps its selected route.</p>}
    {route === 'byok' && !detailsOpen && selectedModel && <div className="ai-provider-identity"><BrandMark brand={selectedModel.producer ?? ''} /><span>{selectedModel.name} · {connection?.name} · via {selectedModel.hostedBy ?? connection?.provider}</span></div>}
    {route === 'byok' && detailsOpen && <div className="ai-route-details" id={detailsId}>
      <label>Provider and connection<select aria-label="Provider and connection" value={connectionId} disabled={busy} onChange={(event) => {
        setConnectionId(event.target.value); setModels([]); void choose(null);
      }}><option value="">Choose a private connection</option>
        {providers.map((provider) => <optgroup key={provider.id} label={provider.name}>
          {connections.filter((connection) => connection.provider === provider.id).map((connection) => <option key={connection.id} value={connection.id}
            disabled={connection.status === 'invalid' || connection.status === 'unavailable'}>{connection.name} · {connection.status === 'verified' ? 'Tested' : 'Not inference tested'}</option>)}
        </optgroup>)}
      </select></label>
      <label>Find a model<input type="search" value={search} placeholder="Model or publisher" onChange={(event) => setSearch(event.target.value)} /></label>
      <label>Model<select aria-label="Model" value={value?.route === 'byok' ? value.modelId : ''} disabled={!connection || busy} onChange={(event) => {
        if (connection) void choose({ route: 'byok', provider: connection.provider, connectionId: connection.id, modelId: event.target.value });
      }}><option value="">Choose a model for building</option>{visibleModels.map((model) => <option key={model.id} value={model.id}
        disabled={Boolean(model.availability && model.availability.kind !== 'available')}>{model.name}{model.hostedBy ? ` · ${model.hostedBy}` : ''}{model.availability && model.availability.kind !== 'available' ? ' · unavailable' : ''}</option>)}</select></label>
      {selectedModel && <div className="ai-provider-identity"><BrandMark brand={selectedModel.producer ?? ''} /><span>{selectedModel.producer} · via {selectedModel.hostedBy ?? connection?.provider}{selectedModel.contextWindow === null ? ' · context limit unknown' : ''}</span></div>}
      {connectionId && !busy && !eligibleModels.length && <p className="ai-muted">No models with declared tool support and verified publisher branding are available in this catalog yet. Load models or verify tool support in Connections.</p>}
      <p className="ai-muted">Your provider bills inference. Model access and building quality are separate checks. No measured recommendations are available yet.</p>
      {value?.route === 'byok' && <fieldset className="ai-auto-routing"><legend>Automatic routing</legend>
        <label><input type="checkbox" checked={Boolean(value.autoRouting)} onChange={(event) => void choose(event.target.checked
          ? { ...value, autoRouting: { enabled: true, allowedConnectionIds: [value.connectionId] } }
          : { route: 'byok', provider: value.provider, connectionId: value.connectionId, modelId: value.modelId })} />Allow routing between connections I select</label>
        {value.autoRouting && connections.filter((connection) => !['invalid', 'unavailable'].includes(connection.status)).map((connection) =>
          <label key={connection.id}><input type="checkbox" checked={value.autoRouting!.allowedConnectionIds.includes(connection.id)} onChange={(event) => {
            const ids = event.target.checked ? [...value.autoRouting!.allowedConnectionIds, connection.id]
              : value.autoRouting!.allowedConnectionIds.filter((id) => id !== connection.id);
            if (ids.length) void choose({ ...value, autoRouting: { enabled: true, allowedConnectionIds: ids } });
          }} />{connection.name}</label>)}
      </fieldset>}
      <div className="ai-actions"><button type="button" disabled={!selectedModel || busy} onClick={() => { setDetailsOpen(false); optionsButton.current?.focus(); }}>Use this model</button></div>
      {!connections.length && <p className="ai-muted">Add an API connection in <Link href="/app/settings#ai-connections">Settings</Link> to use your own key.</p>}
    </div>}
    {route === 'opencode-free' && <div className="ai-route-details">
      <label>Routing<select aria-label="Routing" value={value?.route === 'opencode-free' ? value.modelId ?? '' : ''} onChange={(event) => void choose({ route: 'opencode-free',
        ...(event.target.value ? { modelId: event.target.value } : {}), ...(value?.route === 'opencode-free' && value.allowTraining ? { allowTraining: true } : {}) })}>
        <option value="">Automatic · verified free models only</option>{freeModels.map((model) => <option key={model.id} value={model.id} disabled={!model.available}>{model.name}</option>)}
      </select></label><p className="ai-muted">Free model access has provider terms and quotas. Runner infrastructure also has a cost. This route is unavailable until service use and runtime are verified.</p>
    </div>}
    {(error || busy) && <p role="status" aria-live="polite" className="ai-notice">{busy ? 'Loading your inference choice…' : error}</p>}
  </div>;
}
