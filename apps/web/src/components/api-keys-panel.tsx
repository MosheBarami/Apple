/**
 * YOUR API KEYS — see them, make one, replace one, kill one.
 *
 * The worker has had the whole lifecycle since the public API shipped: POST /api/keys mints, GET
 * lists with expiry and last-used on every row, POST /:id/rotate replaces a key inheriting its
 * scopes and projects exactly, DELETE revokes and the authorizer refuses a revoked key with its
 * own code. `grep '/api/keys' apps/web/src` returned NOTHING. A customer whose key leaked could
 * revoke it only with curl — at the exact moment they are least able to go and read an API doc.
 *
 * FOUR PROPERTIES THIS COMPONENT EXISTS TO KEEP:
 *
 *   THE SECRET IS SHOWN ONCE, AND ONLY EVER FROM THE RESPONSE THAT MINTED IT. It lives in local
 *   state, never in the query cache, and there is no route that reads a key back — the server
 *   stores a hash. Dismissing it is deliberate and the button says what dismissing costs.
 *
 *   A REVOKE IS CONFIRMED, AND THE CONFIRMATION NAMES THE KEY. "Are you sure?" beside three rows
 *   that all read `gk_live_…` is how the wrong credential gets killed during an incident.
 *
 *   A ROTATE IS NOT A REVOKE, AND THE DIFFERENCE IS SAID. The old key keeps working for a grace
 *   period, which is the whole reason to rotate rather than revoke-and-mint; if the server could
 *   not retire the old key it says so and this panel repeats it, because that case is two live
 *   keys and only the owner can fix it.
 *
 *   EVERY DECISION ABOUT WORDS IS IN lib/api-keys.ts. This file is markup, four mutations and a
 *   confirmation.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_SCOPES, API_KEY_MODES, type ApiKeyMode, type ApiScope } from '@golem/shared';
import { createApiKey, fetchApiKeys, revokeApiKey, rotateApiKey } from '../lib/api';
import {
  describeKey,
  expiryLabel,
  grantLabel,
  lastUsedLabel,
  newKeyProblems,
  statusOf,
  type ApiKeyView,
} from '../lib/api-keys';
import { supabase } from '../lib/supabase';
import { Failure } from './failure';
import { useToast } from './toast';
import './api-keys-panel.css';
// The owner's picked account-screen components (./picks/settings).
import { Checkbox } from './picks/settings/checkbox';
import { RadioCards } from './picks/settings/radio-group';
import { Switch } from './picks/settings/switch';
import { ConditionalField } from './picks/settings/conditional-field';
import { NumberInput } from './picks/settings/number-input';
import { HoldButton } from './picks/settings/hold-button';
import { DecryptedText } from './picks/settings/decrypted-text';

/** What each scope lets a key do, in the words of what will happen. */
const SCOPE_WORDS: Record<ApiScope, string> = {
  'chat:write': 'Send messages and start builds',
  'projects:read': 'Read your projects and their settings',
  'messages:read': 'Read the conversation in a project',
  'runs:read': 'Read what a build did',
  'runs:write': 'Start and stop builds',
  'events:read': 'Read the activity stream',
};

export function ApiKeysPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const keys = useQuery({ queryKey: ['api-keys'], queryFn: fetchApiKeys });

  /**
   * The projects a key can be granted.
   *
   * Read from Supabase under RLS, exactly as the dashboard does, so this list can only ever
   * contain projects the caller owns — and the mint route proves it AGAIN server-side before it
   * writes the grant. Two checks for one fact, because the second is the one that is load-bearing.
   */
  const projects = useQuery({
    queryKey: ['api-key-projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id,name').order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ApiKeyMode>('test');
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const [grants, setGrants] = useState<string[]>([]);
  const [days, setDays] = useState('');
  // Whether the key expires at all. Its own state, so emptying the number does not hide the field.
  const [expires, setExpires] = useState(false);
  const [problems, setProblems] = useState<ReturnType<typeof newKeyProblems>>([]);

  /**
   * The plaintext key, for as long as this component is mounted and the person has not dismissed it.
   *
   * NOT IN THE QUERY CACHE, on purpose: a cached secret survives navigation, gets re-rendered on
   * every refetch, and lands in whatever devtools the browser has open. It is state, it is local,
   * and it goes when they say it can go.
   */
  const [revealed, setRevealed] = useState<{ key: string; name: string; note?: string } | null>(null);
  const [confirming, setConfirming] = useState<{ action: 'revoke' | 'rotate'; key: ApiKeyView } | null>(null);

  const daysValue = days.trim() === '' ? null : Number(days.trim());

  const create = useMutation({
    mutationFn: () =>
      createApiKey({
        name: name.trim(),
        mode,
        scopes,
        projectIds: grants,
        ...(daysValue === null ? {} : { expiresInDays: daysValue }),
      }),
    onSuccess: (made) => {
      setRevealed({ key: made.key, name: made.name });
      setShowForm(false);
      setName('');
      setScopes([]);
      setGrants([]);
      setDays('');
      setExpires(false);
      setProblems([]);
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const rotate = useMutation({
    mutationFn: (id: string) => rotateApiKey(id),
    onSuccess: (made) => {
      setRevealed({
        key: made.key,
        name: made.name,
        // The two facts a rotation has and a mint does not: when the old key dies, and the case
        // where it did not die at all.
        note: made.warning
          ? `${made.warning}. The old key is still live — revoke it in the list below.`
          : `The key it replaces stops working at ${made.retiresAtIso.slice(0, 16).replace('T', ' ')} UTC.`,
      });
      setConfirming(null);
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      setConfirming(null);
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
      toast('Key revoked. It stops working immediately.');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = newKeyProblems({ name, mode, scopes, projectIds: grants, expiresInDays: daysValue });
    setProblems(found);
    // Warnings are shown and do not stop the mint — a key with no project is a real thing to want.
    if (found.some((p) => p.severity === 'error')) return;
    create.mutate();
  };

  const problemFor = (field: 'name' | 'scopes' | 'expiresInDays' | 'projectIds') =>
    problems.find((p) => p.field === field) ?? null;

  const rows = keys.data?.keys ?? [];
  const now = Date.now();
  const failed = create.error ?? rotate.error ?? revoke.error ?? null;

  return (
    <div className="ak" data-setting="api-keys">
      <h3 className="settings-sub">API keys</h3>
      <p className="ak__lede">
        For the Apple API and the SDK. A key acts as you, on the projects you grant it — treat one
        like a password.
      </p>

      {/* THE SECRET, ONCE. Rendered above everything because it cannot be recovered by scrolling
          back: the server keeps a hash, and there is no route that returns a key. */}
      {revealed && (
        <div className="ak__reveal" role="alert">
          <p className="ak__reveal-title">This is the only time “{revealed.name}” will be shown.</p>
          {/* Picks: React Bits "Decrypted Text" — the key resolves once, on arrival. */}
          <code className="ak__secret">
            <DecryptedText text={revealed.key} />
          </code>
          <p className="ak__reveal-note">
            Copy it now. Apple stores only a hash of it and cannot show it again — if you lose it,
            rotate the key.
            {revealed.note ? ` ${revealed.note}` : ''}
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void navigator.clipboard?.writeText(revealed.key).then(
                () => toast('Key copied.'),
                () => toast('Your browser would not let Apple copy it — select it and copy by hand.'),
              );
            }}
          >
            Copy
          </button>
          <button type="button" className="btn" onClick={() => setRevealed(null)}>
            I have saved it
          </button>
        </div>
      )}

      {failed && <Failure error={failed} />}

      {keys.isPending && <p className="ak__state">Checking…</p>}
      {keys.isError && (
        <>
          {/* A FAILED LOOKUP IS NOT AN EMPTY LIST. "You have no API keys" from a network error
              would invite somebody to mint a second key they already have. */}
          <p className="ak__state is-failed">
            Apple could not load your keys. This is a connection problem, not an answer about your
            account — nothing has changed.
          </p>
          <button type="button" className="btn" onClick={() => void keys.refetch()}>
            Try again
          </button>
        </>
      )}

      {keys.isSuccess && rows.length === 0 && (
        <p className="ak__state">You have no API keys. You only need one to use the Apple API or the SDK.</p>
      )}

      {rows.length > 0 && (
        <ul className="ak__list">
          {rows.map((k) => {
            const status = statusOf(k, now);
            return (
              <li key={k.id} className={`ak__key is-${status}`}>
                <span className="ak__key-head">
                  <span className="ak__key-name">{k.name}</span>
                  <span className={`ak__mode is-${k.mode}`}>{k.mode}</span>
                  <code className="ak__prefix">{k.prefix}…</code>
                  {status !== 'active' && <span className={`ak__status is-${status}`}>{status}</span>}
                </span>
                <span className="ak__key-what">
                  {k.scopes.map((s) => SCOPE_WORDS[s] ?? s).join(' · ') || 'No permissions'}
                </span>
                <span className="ak__key-detail">{grantLabel(k)}</span>
                <span className="ak__key-detail">
                  {expiryLabel(k, now)} {lastUsedLabel(k, now)}
                </span>
                {/* One sentence for a screen reader, so the four spans above are not read as four
                    unrelated fragments. */}
                <span className="visually-hidden">{describeKey(k, now)}</span>

                {status !== 'revoked' && (
                  <span className="ak__key-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setConfirming({ action: 'rotate', key: k })}
                      disabled={rotate.isPending}
                    >
                      Rotate
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      onClick={() => setConfirming({ action: 'revoke', key: k })}
                      disabled={revoke.isPending}
                    >
                      Revoke
                    </button>
                  </span>
                )}

                {/* THE CONFIRMATION NAMES THE KEY. Three rows all reading `gk_live_…` is how the
                    wrong credential gets killed during an incident. */}
                {confirming?.key.id === k.id && (
                  <span className="ak__confirm" role="alert">
                    {confirming.action === 'revoke' ? (
                      <>
                        <span>
                          Revoke “{k.name}”? It stops working immediately and anything using it starts
                          failing. This cannot be undone.
                        </span>
                        <button type="button" className="btn" onClick={() => setConfirming(null)}>
                          Keep it
                        </button>
                        {/* Picks: hold to confirm — a revoke breaks whatever uses the key, at once. */}
                        <HoldButton
                          label="Hold to revoke"
                          busy={revoke.isPending}
                          busyLabel="Revoking…"
                          onConfirm={() => revoke.mutate(k.id)}
                        />
                      </>
                    ) : (
                      <>
                        <span>
                          Replace “{k.name}” with a new key carrying the same permissions and
                          projects? The old one keeps working for 24 hours so you can swap it over.
                        </span>
                        <button type="button" className="btn" onClick={() => setConfirming(null)}>
                          Go back
                        </button>
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() => rotate.mutate(k.id)}
                          disabled={rotate.isPending}
                        >
                          {rotate.isPending ? 'Rotating…' : 'Rotate it'}
                        </button>
                      </>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!showForm && !keys.isError && (
        <button type="button" className="btn btn--primary" onClick={() => setShowForm(true)}>
          Create a key
        </button>
      )}

      {showForm && (
        <form className="ak__form" onSubmit={submit}>
          <label className="ak__label" htmlFor="ak-name">
            Name
          </label>
          <input
            id="ak-name"
            className="ak__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI publisher"
            aria-invalid={problemFor('name') ? true : undefined}
          />
          {problemFor('name') && <p className="ak__problem">{problemFor('name')?.message}</p>}

          <RadioCards
            legend="Kind"
            legendClassName="ak__label"
            name="ak-mode"
            value={mode}
            onChange={setMode}
            options={API_KEY_MODES.map((m) => ({
              value: m,
              label: m === 'live' ? 'Live' : 'Test',
              hint: m === 'live' ? 'Spends Credits' : 'Free, and cannot spend',
            }))}
          />

          <fieldset className="ak__scopes">
            <legend className="ak__label">What this key may do</legend>
            {API_SCOPES.map((s) => (
              <label key={s} className="ak__scope">
                <Checkbox
                  checked={scopes.includes(s)}
                  onChange={() =>
                    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
                  }
                />
                <span className="ak__scope-title">{SCOPE_WORDS[s]}</span>
                <code className="ak__scope-id">{s}</code>
              </label>
            ))}
            {problemFor('scopes') && <p className="ak__problem">{problemFor('scopes')?.message}</p>}
          </fieldset>

          <fieldset className="ak__grants">
            <legend className="ak__label">Which projects it may touch</legend>
            {projects.isPending && <p className="ak__state">Loading your projects…</p>}
            {projects.isError && (
              <p className="ak__problem">
                Apple could not list your projects, so it cannot offer them here. The key can still be
                created without one, and rotating it later will not add any.
              </p>
            )}
            {(projects.data ?? []).map((p) => (
              <label key={p.id} className="ak__grant">
                <Checkbox
                  checked={grants.includes(p.id)}
                  onChange={() =>
                    setGrants((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))
                  }
                />
                {p.name}
              </label>
            ))}
            {projects.isSuccess && (projects.data ?? []).length === 0 && (
              <p className="ak__state">You have no projects yet, so there is nothing to grant.</p>
            )}
            {/* A warning, not a refusal: the server mints this happily and it is the right key for
                account-level calls. It is also exactly what an unticked form produces. */}
            {problemFor('projectIds') && <p className="ak__warning">{problemFor('projectIds')?.message}</p>}
          </fieldset>

          <label className="ak__expiry">
            <span className="ak__label">Stops working by itself</span>
            <Switch
              checked={expires}
              onChange={(e) => {
                setExpires(e.target.checked);
                setDays(e.target.checked ? '30' : '');
              }}
            />
          </label>
          {/* Picks: Clerk "Conditional Field" + UI Layouts "Motion Number Input" — the day count only
              exists while the key is set to expire. */}
          <ConditionalField open={expires}>
            <label className="ak__label" htmlFor="ak-days">
              After how many days
            </label>
            <NumberInput
              id="ak-days"
              value={days}
              onChange={setDays}
              min={1}
              max={365}
              placeholder="30"
              invalid={Boolean(problemFor('expiresInDays'))}
            />
          </ConditionalField>
          {problemFor('expiresInDays') && <p className="ak__problem">{problemFor('expiresInDays')?.message}</p>}

          <button type="button" className="btn" onClick={() => setShowForm(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create key'}
          </button>
        </form>
      )}
    </div>
  );
}
