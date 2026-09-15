/**
 * WHERE MAY APPLE GET ASSETS FROM? Asked once, before the first build, and then remembered.
 *
 * Three refusals shape it, and each one is the feature:
 *
 *   IT CANNOT BE DISMISSED INTO A YES. There is no X and no click-outside. Escape and "Not yet"
 *   both leave the policy untouched, which means the build does not start — because a dialog whose
 *   easiest exit grants permission is a dialog that grants permission.
 *
 *   IT SAYS WHAT EACH CHOICE COSTS. "Creator Store" is a label. "Nothing to buy, and nothing
 *   uploaded — but the work is other creators' and stays credited to them" is the thing somebody
 *   needs in order to choose. The words come from lib/asset-sources.ts.
 *
 *   IT DOES NOT PRE-TICK "from scratch". That is the choice that spends credits on every asset,
 *   and a default is not a decision.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { type AssetSourceChoice, type AssetSourcePolicy } from '@golem/shared';
import { SOURCE_EXPLANATIONS, cleanSelection, initialSelection } from '../lib/asset-sources';

export interface AssetSourceDialogProps {
  /** The policy as stored. null means nobody has ever answered. */
  policy: AssetSourcePolicy | null;
  /** Persist the answer. Resolves when it is stored; the build waits for that. */
  onSave: (policy: AssetSourcePolicy) => Promise<unknown>;
  /** The answer is in and the build may start. */
  onDone: () => void;
  /** Closed without answering. The build does NOT start. */
  onCancel: () => void;
}

export function AssetSourceDialog({ policy, onSave, onDone, onCancel }: AssetSourceDialogProps) {
  const [chosen, setChosen] = useState<AssetSourceChoice[]>(() => initialSelection(policy));
  const [remember, setRemember] = useState(true);

  const save = useMutation({
    mutationFn: () => onSave({ mode: remember ? 'remember' : 'ask', allow: cleanSelection(chosen) }),
    onSuccess: () => onDone(),
  });

  const toggle = (c: AssetSourceChoice) =>
    setChosen((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  return (
    <div
      className="asrc__scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asrc-title"
      // NO click-through-to-dismiss. The scrim is not a cancel button here, because the cheapest
      // gesture must not be the one that decides what Apple may use.
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div className="asrc">
        <h2 className="asrc__title" id="asrc-title">Where should Apple get assets from?</h2>
        <p className="asrc__lede">
          Pick as many as you like. Apple asks once and then gets on with it — you can change this
          in Settings whenever you want.
        </p>

        <div className="asrc__choices">
          {SOURCE_EXPLANATIONS.map((e) => {
            const on = chosen.includes(e.choice);
            return (
              <label key={e.choice} className={`asrc__choice${on ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(e.choice)}
                  aria-describedby={`asrc-${e.choice}-does`}
                />
                <span className="asrc__body">
                  <span className="asrc__name">{e.title}</span>
                  <span className="asrc__does" id={`asrc-${e.choice}-does`}>{e.does}</span>
                  <span className="asrc__meta">
                    <span className="asrc__cost">{e.costs}</span>
                    <span className="asrc__reach">{e.reach}</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <label className="asrc__remember">
          <input type="checkbox" checked={remember} onChange={() => setRemember((v) => !v)} />
          Remember this and stop asking
        </label>

        {chosen.length === 0 && (
          <p className="asrc__warn" role="alert">
            With none of these, Apple can only place plain parts. Pick at least one, or come back
            when you have decided.
          </p>
        )}

        <div className="asrc__actions">
          <button type="button" className="btn" onClick={onCancel}>
            Not yet
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={chosen.length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Start building'}
          </button>
        </div>

        {save.isError && (
          <p className="asrc__warn" role="alert">
            {/* The answer was not stored, so the build must not start as if it had been. */}
            That did not save — {(save.error as Error).message}. Nothing has changed yet.
          </p>
        )}
      </div>
    </div>
  );
}
