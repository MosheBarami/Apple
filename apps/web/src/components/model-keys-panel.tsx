/**
 * SETTINGS › MODELS & KEYS — the customer's own model keys, and the models that are free today.
 *
 * Owner decisions D-BYOK-1 (bring your own key; a run on it spends no Apple Credits), D-BYOK-2 (the
 * key is sealed with a worker secret) and D-FREE-1 (the free list is read live from OpenRouter).
 * The routes are the worker's: GET/PUT/DELETE /api/me/model-keys[/:provider] and GET /api/models.
 *
 * What this panel refuses to do, and each refusal is the feature:
 *
 *   IT NEVER SHOWS A KEY BACK. The server returns the last four characters and nothing else; the
 *   field is cleared the moment a save is answered, whether it was taken or refused.
 *
 *   IT DOES NOT CALL AN UNCHECKED KEY GOOD. OpenRouter being unreachable when the key was saved is
 *   said as that, not as "valid".
 *
 *   IT DOES NOT TURN A FAILED READ INTO "NO KEY". A list that could not be loaded is a connection
 *   problem, and says so, rather than inviting somebody to paste a key they already saved.
 *
 * Every sentence is in lib/model-keys.ts.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ByokProvider, ModelKeySummary } from '@golem/shared';
import { ApiError, deleteModelKey, fetchModelCatalogue, fetchModelKeys, putModelKey } from '../lib/api';
import { fullStamp, relativeTime } from '../lib/format';
import {
  KEY_PROMISE,
  PROVIDERS,
  PROVIDER_KEYS_URL,
  PROVIDER_LABEL,
  describeCheck,
  describeSaveFailure,
  freeKeyNote,
  freeListNote,
  freeModels,
  keyEnding,
} from '../lib/model-keys';
import { useToast } from './toast';
import './model-keys-panel.css';

function ProviderKey({ provider, saved }: { provider: ByokProvider; saved: ModelKeySummary | undefined }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [result, setResult] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const name = PROVIDER_LABEL[provider];
  const inputId = `mk-${provider}`;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['model-keys'] });
    void qc.invalidateQueries({ queryKey: ['model-catalogue'] });
  };

  const save = useMutation({
    mutationFn: () => putModelKey(provider, apiKey.trim()),
    onSuccess: (r) => {
      setApiKey('');
      setResult({ tone: 'ok', text: describeCheck(r.check) });
      refresh();
    },
    onError: (e) => {
      setApiKey('');
      const text = e instanceof ApiError ? describeSaveFailure(e.status, e.body, e.message) : 'The key could not be saved. Nothing was stored.';
      setResult({ tone: 'bad', text });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteModelKey(provider),
    onSuccess: (r) => {
      setResult(null);
      toast(r.removed ? `${name} key removed.` : `There was no ${name} key to remove.`);
      refresh();
    },
    onError: (e) => setResult({ tone: 'bad', text: e instanceof Error ? e.message : 'The key could not be removed.' }),
  });

  return (
    <div className="mk__provider">
      <h4 className="mk__provider-name">{name}</h4>
      {saved ? (
        <div className="mk__saved">
          <p className="mk__saved-line">
            Key {keyEnding(saved.last4)} · added <time dateTime={saved.addedAt} title={fullStamp(saved.addedAt)}>{relativeTime(saved.addedAt)}</time>
          </p>
          <button type="button" className="btn btn--danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      ) : (
        <p className="mk__none">No {name} key saved.</p>
      )}

      <form
        className="mk__form"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          if (!apiKey.trim() || save.isPending) return;
          setResult(null);
          save.mutate();
        }}
      >
        <label className="mk__label" htmlFor={inputId}>
          {saved ? `Replace your ${name} key` : `Your ${name} key`}
        </label>
        <div className="mk__row">
          <input
            id={inputId}
            name={`${provider}ApiKey`}
            type="password"
            className="mk__input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            placeholder="Paste your key"
          />
          <button type="submit" className="btn btn-strong" disabled={!apiKey.trim() || save.isPending}>
            {save.isPending ? 'Checking…' : 'Save key'}
          </button>
        </div>
        <p className="mk__hint">
          Get one at{' '}
          <a href={PROVIDER_KEYS_URL[provider]} target="_blank" rel="noopener noreferrer">
            openrouter.ai
          </a>
          .
        </p>
      </form>
      {result && (
        <p className={`mk__result is-${result.tone}`} role="status">
          {result.text}
        </p>
      )}
    </div>
  );
}

/** Your keys: one row per provider the worker accepts a key for. */
export function ModelKeysPanel() {
  const keys = useQuery({ queryKey: ['model-keys'], queryFn: fetchModelKeys, retry: false });
  return (
    <div className="mk" data-setting="model-keys">
      <h3 className="settings-sub">Your model keys</h3>
      <p className="mk__promise">{KEY_PROMISE.join(' ')}</p>
      {keys.isPending && <p className="mk__note">Checking which keys you have saved…</p>}
      {keys.isError && (
        <p className="mk__note">
          Apple could not load your saved keys. This is a connection problem, not an answer — it does not mean you have none.{' '}
          <button type="button" className="btn" onClick={() => void keys.refetch()}>Try again</button>
        </p>
      )}
      {keys.isSuccess && PROVIDERS.map((provider) => (
        <ProviderKey key={provider} provider={provider} saved={keys.data.keys.find((k) => k.provider === provider)} />
      ))}
    </div>
  );
}

/** The models OpenRouter prices at zero today, with when that was read. */
export function FreeModelsList() {
  const catalogue = useQuery({ queryKey: ['model-catalogue'], queryFn: fetchModelCatalogue, staleTime: 5 * 60_000, retry: false });
  const keys = useQuery({ queryKey: ['model-keys'], queryFn: fetchModelKeys, retry: false });
  const hasKey = (keys.data?.keys ?? []).some((k) => k.provider === 'openrouter');
  const free = freeModels(catalogue.data);
  return (
    <div className="mk" data-setting="free-models">
      <h3 className="settings-sub">Free models</h3>
      {catalogue.isPending && <p className="mk__note">Reading the free models…</p>}
      {catalogue.isError && (
        <p className="mk__note">
          Apple could not read the list of free models.{' '}
          {/* A 503 is the server saying why in words; anything else is not an answer about the list. */}
          {catalogue.error instanceof ApiError && catalogue.error.status === 503 ? catalogue.error.message : 'This is not an answer about which models are free. Try again in a moment.'}{' '}
          <button type="button" className="btn" onClick={() => void catalogue.refetch()}>Try again</button>
        </p>
      )}
      {catalogue.isSuccess && (
        <>
          <p className="mk__note">{freeKeyNote(catalogue.data, hasKey)}</p>
          {free.length ? (
            <ul className="mk__free">
              {free.map((m) => (
                <li key={m.id} className="mk__free-row">
                  <span className="mk__free-name">{m.label}</span>
                  <span className="mk__free-vendor">{m.vendor}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mk__note">OpenRouter lists no free models that can build right now.</p>
          )}
          <p className="mk__note mk__note--when">{freeListNote(catalogue.data, relativeTime)}</p>
        </>
      )}
    </div>
  );
}
