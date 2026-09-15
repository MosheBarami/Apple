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
 *   IT DOES NOT CALL A PERMISSION USED WHEN IT IS NOT. Five of the six scopes it offers have no
 *   consumer anywhere in the product, and each one is labelled "not used yet" where it is ticked.
 *   A tickbox granting real authority over a real Roblox account, for a feature that does not
 *   exist, is a permission taken for nothing.
 *
 * Everything decided here is decided in `lib/roblox-key.ts`. This file is markup, a query, and
 * four actions — connect, disconnect, test, and the explanation of whichever one failed.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROBLOX_SCOPES, type RobloxScope } from '@golem/shared';
import { checkRobloxKey, deleteRobloxKey, fetchRobloxKey, putRobloxKey, type RobloxKeyHealth } from '../lib/api';
import {
  SCOPE_EXPLANATIONS,
  describeHealth,
  describeStored,
  explainKeyFailure,
  irreversibleScopes,
  problemsWith,
  stateOf,
} from '../lib/roblox-key';
import { Failure } from './failure';
import { useToast } from './toast';

export function RobloxKeyPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const stored = useQuery({ queryKey: ['roblox-key'], queryFn: fetchRobloxKey });

  /**
   * The last answer from the connection check, or null while nobody has asked.
   *
   * HELD HERE AND NOT FETCHED WITH THE PANEL. Checking costs a real call against the customer's
   * Open Cloud key, so it happens when a person presses a button — and the answer is stamped with
   * the moment it was true rather than rendered as a live status, which is a claim nobody can keep.
   */
  const [health, setHealth] = useState<RobloxKeyHealth | null>(null);

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
      // A new key makes the last verdict a statement about a key that is no longer there.
      setHealth(null);
      void qc.invalidateQueries({ queryKey: ['roblox-key'] });
      toast('Roblox account connected.');
    },
    // NO onError TOAST. The failure is rendered inline below through `explainKeyFailure`: the
    // worker tells three different credential refusals apart on purpose and `toast(e.message)`
    // threw that away — including the one whose obvious next step (paste it again) is the wrong
    // one, because the fault is on our side and a re-paste fails identically.
  });

  const disconnect = useMutation({
    mutationFn: deleteRobloxKey,
    onSuccess: (r) => {
      setHealth(null);
      void qc.invalidateQueries({ queryKey: ['roblox-key'] });
      toast(r.removed ? 'Roblox key removed.' : 'There was no key to remove.');
    },
  });

  /**
   * Ask Roblox whether the stored key still works.
   *
   * A FAILED CHECK IS NOT A FAILED KEY, and the two are one keystroke apart here: if the request
   * to our own worker falls over, the verdict is `unknown` with the reason, never `rejected`. The
   * panel would otherwise tell somebody to go and make a new Open Cloud key because our own
   * deployment was having a bad minute.
   */
  const check = useMutation({
    mutationFn: checkRobloxKey,
    onSuccess: (h) => setHealth(h),
    onError: (e: Error) =>
      setHealth({ status: 'unknown', reason: `Apple could not run the check (${e.message}). The key was not changed.` }),
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
  // FIVE STATES. A failed lookup is not "no account connected" — that is a claim about somebody's
  // account made from a network error, and it would send them to paste a key they already have.
  // The fifth, 'rejected', is the one a stored key reaches on its own: Roblox expires and revokes
  // keys without telling us, and until the check existed that key read as "Connected".
  const state = stateOf({ isPending: stored.isPending, isError: stored.isError, credential, health });
  const healthLine = describeHealth(health);
  // Whichever action last failed. Both are refusals about the same credential, and neither has a
  // Try-again of its own, so they share one explanation rather than two boxes that could disagree.
  const failed = connect.error ?? disconnect.error ?? null;

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

      {failed && <Failure error={failed} explain={explainKeyFailure} />}

      {credential && (
        <div className="rk__connected">
          <ul className="rk__granted">
            {credential.scopes.map((s) => {
              const e = SCOPE_EXPLANATIONS.find((x) => x.scope === s);
              return (
                <li key={s}>
                  {e ? e.title : s}
                  {/* A permission this product has no consumer for. Said where the grant is
                      listed, because that is where somebody decides whether to keep it. */}
                  {e && !e.implemented && <span className="rk__unused"> — not used yet</span>}
                </li>
              );
            })}
          </ul>

          {/* IS IT STILL ALIVE? The one question the panel could not answer. Pressed, never
              polled: it spends a real call on the customer's key, and a status dot would imply
              continuous knowledge nobody has. */}
          <button
            type="button"
            className="btn"
            onClick={() => check.mutate()}
            disabled={check.isPending}
          >
            {check.isPending ? 'Checking…' : 'Test connection'}
          </button>
          {healthLine && (
            <p className={`rk__health is-${health?.status ?? 'none'}`} aria-live="polite">
              {healthLine}
            </p>
          )}

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
            <label key={e.scope} className={`rk__scope${e.undoable ? '' : ' is-permanent'}${e.implemented ? '' : ' is-unused'}`}>
              <input type="checkbox" checked={scopes.includes(e.scope)} onChange={() => toggle(e.scope)} />
              <span className="rk__scope-main">
                <span className="rk__scope-title">
                  {e.title}
                  {/* LABELLED, NOT HIDDEN. Five of these six had no consumer anywhere in the
                      product — real authority over a real Roblox account, asked for a feature
                      that does not exist. Hiding them would be worse for anyone whose key is
                      already connected with one: the grant would still be live and the panel
                      would have stopped mentioning it. */}
                  {!e.implemented && <span className="rk__unused"> · not used yet</span>}
                </span>
                <span className="rk__scope-does">{e.does}</span>
                {!e.implemented && (
                  <span className="rk__scope-does">
                    Nothing in Apple asks for this today. Ticking it grants the permission anyway, so
                    leave it off unless you have a reason.
                  </span>
                )}
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
