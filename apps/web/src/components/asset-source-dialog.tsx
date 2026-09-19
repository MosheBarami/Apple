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
import {
  SOURCE_EXPLANATIONS,
  availableChoices,
  cleanSelection,
  initialSelection,
  unavailableReason,
} from '../lib/asset-sources';
import './asset-source-dialog.css';

export interface AssetSourceDialogProps {
  /** The policy as stored. null means nobody has ever answered. */
  policy: AssetSourcePolicy | null;
  /**
   * What the account and organisation layers already allow, or null when neither has an opinion.
   *
   * A source missing from the ceiling cannot be turned on for one project — the layers narrow
   * downwards — so it is offered as unavailable rather than as a tick that would be swallowed.
   */
  ceiling?: AssetSourcePolicy | null;
  /** Persist the answer. Resolves when it is stored; the build waits for that. */
  onSave: (policy: AssetSourcePolicy) => Promise<unknown>;
  /** The answer is in and the build may start. */
  onDone: () => void;
  /** Closed without answering. The build does NOT start. */
  onCancel: () => void;
}

export function AssetSourceDialog({ policy, ceiling = null, onSave, onDone, onCancel }: AssetSourceDialogProps) {
  const [chosen, setChosen] = useState<AssetSourceChoice[]>(() => initialSelection(policy, ceiling));
  const [remember, setRemember] = useState(true);

  const open = availableChoices(ceiling);
  // Belt and braces with the disabled checkbox: a selection is filtered through the ceiling on the
  // way out too, so a choice that became unavailable while the dialog sat open cannot be saved
  // into a policy that would resolve to nothing.
  const sending = cleanSelection(chosen).filter((c) => open.includes(c));

  const save = useMutation({
    mutationFn: () => onSave({ mode: remember ? 'remember' : 'ask', allow: sending }),
    onSuccess: () => onDone(),
  });

  const toggle = (c: AssetSourceChoice) => {
    if (!open.includes(c)) return;
    setChosen((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  };

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
          Pick as many as you like. This is remembered for this project — Apple asks once and then
          gets on with it, and you can change it from the command palette whenever you want.
        </p>

        <div className="asrc__choices">
          {SOURCE_EXPLANATIONS.map((e) => {
            const blocked = unavailableReason(ceiling, e.choice);
            const on = !blocked && chosen.includes(e.choice);
            return (
              <label
                key={e.choice}
                className={`asrc__choice${on ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={Boolean(blocked)}
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
                  {/* A greyed box with no sentence beside it reads as a bug rather than a rule.
                      It keeps `asrc__meta` ON PURPOSE: that class already supplies the small,
                      own-line treatment this needs, and without it a span carrying only a new
                      class would render at full size and make the disabled row the loudest thing
                      in the dialog. `asrc__blocked` is what asset-source-dialog.css hangs the
                      hairline and the colour off. */}
                  {blocked && <span className="asrc__meta asrc__blocked">{blocked}</span>}
                </span>
              </label>
            );
          })}
        </div>

        <label className="asrc__remember">
          <input type="checkbox" checked={remember} onChange={() => setRemember((v) => !v)} />
          Remember this and stop asking
        </label>

        {open.length === 0 ? (
          <p className="asrc__warn" role="alert">
            {/* There is nothing to tick, so "pick at least one" would be advice that cannot be
                taken. The only move left is at the account or organisation layer, and saying so is
                the difference between a rule and a dead dialog. */}
            Every source is switched off for your account or organisation, so there is nothing to
            choose here. Someone has to turn one back on in Settings before Apple can build with
            anything but plain parts.
          </p>
        ) : sending.length === 0 && (
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
            disabled={sending.length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Start building'}
          </button>
        </div>

        {save.isError && (
          <p className="asrc__warn" role="alert">
            {/* Says what is TRUE of both causes — a write that failed and a write that was
                narrowed away by a higher layer. In neither case may the build start, and in
                neither case has what Apple is allowed to use actually changed. */}
            Apple's sources are unchanged — {(save.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
