/**
 * CONNECT YOUR OWN ROBLOX ACCOUNT.
 *
 * This is the most consequential control in the product, and the reason it exists is a mistake:
 * Apple uploaded 299 assets into one person's Roblox account because the only write credential it
 * had was a single shared one. Roblox refused to give them back — an Image is "not an archivable
 * asset type" — so that account keeps them permanently.
 *
 * Three things this panel refuses to do, and each refusal is the feature:
 *
 *   IT DOES NOT PRE-TICK `asset:write`. The convenient default is the one that creates things in
 *   somebody's account, and a default is not a decision. Nothing is ticked until a person ticks it.
 *
 *   IT DOES NOT DESCRIBE A SCOPE BY ITS NAME. "asset:write" tells you nothing. "Apple can upload
 *   images into your account, and Roblox does not let anyone delete an uploaded image afterwards"
 *   tells you what you are agreeing to. The words come from lib/roblox-key.ts.
 *
 *   IT DOES NOT SHOW THE KEY BACK. The server will not return it; this component never asks for it
 *   and has nowhere to put it. What it shows is the last four characters, which is what a person
 *   recognises and a thief cannot use.
 *
 * Everything decided here is decided in `lib/roblox-key.ts`. This file is markup, a query, and
 * three actions.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROBLOX_SCOPES, type RobloxScope } from '@golem/shared';
import { deleteRobloxKey, fetchRobloxKey, fetchRobloxWrites, putRobloxKey } from '../lib/api';
import {
  SCOPE_EXPLANATIONS, describeStored, describeWrite, irreversibleScopes, isPermanentWrite,
  problemsWith, stateOf,
} from '../lib/roblox-key';
import { useToast } from './toast';

/**
 * WHAT APPLE HAS DONE TO YOUR ROBLOX ACCOUNT.
 *
 * The worker has recorded every write since the first one. Nothing showed it to anybody, and a log
 * nobody can read is the same as no log — which is most of why the 299 assets in the owner's
 * account were a surprise rather than a notification.
 *
 * FOUR STATES, LIKE THE PANEL ABOVE, and for the same reason. A failed fetch must not render as
 * "nothing has been done to your account": that is a claim about somebody's Roblox account made
 * from a network error, and it is the most reassuring possible way to be wrong.
 */
function RobloxWriteTrail() {
  const writes = useQuery({ queryKey: ['roblox-writes'], queryFn: () => fetchRobloxWrites(25) });

  if (writes.isPending) return <p className="rk__note">Checking what has been done…</p>;
  if (writes.isError) {
    return (
      <p className="rk__note">
        Apple could not load the record of what it has done to your account. This is a connection
        problem, not an answer — it does not mean nothing has happened.{' '}
        <button type="button" className="btn" onClick={() => void writes.refetch()}>Try again</button>
      </p>
    );
  }

  const rows = writes.data?.writes ?? [];
  if (!rows.length) {
    return <p className="rk__note">Apple has not written anything to your Roblox account yet.</p>;
  }

  return (
    <div className="rk__trail">
      <h4 className="settings-sub">What Apple has done to your account</h4>
      <ul className="rk__writes">
        {rows.map((w, i) => (
          <li key={`${w.at}-${i}`} className={w.ok ? 'rk__write' : 'rk__write is-failed'}>
            <span className="rk__write-when muted">{w.at.slice(0, 10)}</span>{' '}
            <span className="rk__write-what">{describeWrite(w)}</span>
            {isPermanentWrite(w) && (
              <span className="rk__write-permanent muted"> Roblox does not allow this to be undone.</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RobloxKeyPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const stored = useQuery({ queryKey: ['roblox-key'], queryFn: fetchRobloxKey });

  const [apiKey, setApiKey] = useState('');
  const [creatorId, setCreatorId] = useState('');
  const [creatorType, setCreatorType] = useState<'user' | 'group'>('user');
  const [scopes, setScopes] = useState<RobloxScope[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [problems, setProblems] = useState<ReturnType<typeof problemsWith>>([]);

  const connect = useMutation({
    mutationFn: () => putRobloxKey({ apiKey: apiKey.trim(), robloxCreatorId: creatorId.trim(), creatorType, scopes }),
    onSuccess: () => {
      // The key is cleared from the form the moment it is stored. Leaving it in an input means it
      // survives in the DOM, in a screenshot, and in the browser's own form restore.
      setApiKey('');
      setConfirming(false);
      setProblems([]);
      void qc.invalidateQueries({ queryKey: ['roblox-key'] });
      toast('Roblox account connected.');
    },
    onError: (e: Error) => toast(e.message),
  });

  const disconnect = useMutation({
    mutationFn: deleteRobloxKey,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['roblox-key'] });
      toast(r.removed ? 'Roblox key removed.' : 'There was no key to remove.');
    },
    onError: (e: Error) => toast(e.message),
  });

  const toggle = (s: RobloxScope) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const irreversible = irreversibleScopes(scopes);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = problemsWith({ apiKey, robloxCreatorId: creatorId, scopes });
    setProblems(found);
    if (found.length) return;
    // A SECOND STEP, only for the permissions that cannot be undone. Everything reversible
    // connects in one action; asking twice for those would train people to click through the ask.
    if (irreversible.length && !confirming) {
      setConfirming(true);
      return;
    }
    connect.mutate();
  };

  const problemFor = (field: 'apiKey' | 'robloxCreatorId' | 'scopes') =>
    problems.find((p) => p.field === field)?.message ?? null;

  const credential = stored.data?.credential ?? null;
  // FOUR STATES. A failed lookup is not "no account connected" — that is a claim about somebody's
  // account made from a network error, and it would send them to paste a key they already have.
  const state = stateOf({ isPending: stored.isPending, isError: stored.isError, credential });

  return (
    <div className="rk" data-setting="roblox-key">
      <h3 className="settings-sub">Your Roblox account</h3>

      <p className={`rk__state is-${state}`} aria-live="polite">
        {describeStored(credential, state)}
      </p>
      {stored.isError && (
        <button type="button" className="btn" onClick={() => void stored.refetch()}>
          Try again
        </button>
      )}

      {credential && (
        <div className="rk__connected">
          <ul className="rk__granted">
            {credential.scopes.map((s) => {
              const e = SCOPE_EXPLANATIONS.find((x) => x.scope === s);
              return <li key={s}>{e ? e.title : s}</li>;
            })}
          </ul>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
          >
            {disconnect.isPending ? 'Removing…' : 'Disconnect'}
          </button>
          <p className="rk__note">
            Disconnecting stops Apple using the key. It does not remove anything already created in
            your account — revoke the key on Roblox as well if that is what you want.
          </p>
          <RobloxWriteTrail />
        </div>
      )}

      {state !== 'failed' && state !== 'loading' && (
      <form className="rk__form" onSubmit={submit}>
        <label className="rk__label" htmlFor="rk-key">
          Open Cloud API key
        </label>
        <input
          id="rk-key"
          type="password"
          className="rk__input"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={credential ? 'Paste a new key to replace the current one' : 'Paste your key'}
          aria-invalid={problemFor('apiKey') ? true : undefined}
          aria-describedby={problemFor('apiKey') ? 'rk-key-problem' : undefined}
        />
        {problemFor('apiKey') && (
          <p className="rk__problem" id="rk-key-problem">
            {problemFor('apiKey')}
          </p>
        )}

        <label className="rk__label" htmlFor="rk-id">
          Roblox {creatorType === 'group' ? 'group' : 'user'} id
        </label>
        <input
          id="rk-id"
          type="text"
          inputMode="numeric"
          className="rk__input"
          value={creatorId}
          onChange={(e) => setCreatorId(e.target.value)}
          placeholder="e.g. 11279664020"
          aria-invalid={problemFor('robloxCreatorId') ? true : undefined}
          aria-describedby={problemFor('robloxCreatorId') ? 'rk-id-problem' : undefined}
        />
        {problemFor('robloxCreatorId') && (
          <p className="rk__problem" id="rk-id-problem">
            {problemFor('robloxCreatorId')}
          </p>
        )}

        <fieldset className="rk__type">
          <legend className="rk__label">Acting as</legend>
          {(['user', 'group'] as const).map((t) => (
            <label key={t} className="rk__radio">
              <input
                type="radio"
                name="rk-creator-type"
                value={t}
                checked={creatorType === t}
                onChange={() => setCreatorType(t)}
              />
              {t === 'user' ? 'My account' : 'A group I own'}
            </label>
          ))}
        </fieldset>

        <fieldset className="rk__scopes">
          <legend className="rk__label">What Apple may do</legend>
          {SCOPE_EXPLANATIONS.filter((e) => (ROBLOX_SCOPES as readonly string[]).includes(e.scope)).map((e) => (
            <label key={e.scope} className={`rk__scope${e.undoable ? '' : ' is-permanent'}`}>
              <input type="checkbox" checked={scopes.includes(e.scope)} onChange={() => toggle(e.scope)} />
              <span className="rk__scope-main">
                <span className="rk__scope-title">{e.title}</span>
                <span className="rk__scope-does">{e.does}</span>
                {e.caution && <span className="rk__scope-caution">{e.caution}</span>}
              </span>
            </label>
          ))}
          {problemFor('scopes') && <p className="rk__problem">{problemFor('scopes')}</p>}
        </fieldset>

        {confirming && (
          <div className="rk__confirm" role="alert">
            <p>
              {irreversible.length === 1
                ? 'One of these cannot be undone.'
                : `${irreversible.length} of these cannot be undone.`}{' '}
              Roblox does not allow an uploaded image or decal to be deleted by anyone, including
              you. Connect anyway?
            </p>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Go back
            </button>
            <button type="submit" className="btn btn--primary" disabled={connect.isPending}>
              {connect.isPending ? 'Connecting…' : 'Yes, connect'}
            </button>
          </div>
        )}

        {!confirming && (
          <button type="submit" className="btn btn--primary" disabled={connect.isPending}>
            {connect.isPending ? 'Connecting…' : credential ? 'Replace key' : 'Connect'}
          </button>
        )}
      </form>
      )}

      <p className="rk__note">
        Create a key at create.roblox.com under Open Cloud → API Keys. Apple stores it encrypted and
        never shows it again — not here, not to support, not in an error.
      </p>
    </div>
  );
}
