// SAVED INSTRUCTIONS — the drawer where an automation is written, run, paused and accounted for.
//
// The worker has had all of this for as long as it has existed and nobody could reach any of it:
// `normaliseAutomation` refusing fourteen named things, a store with a per-owner cap, a run history
// with spend attributed to the automation rather than to the day — and `grep -rni automation
// apps/web/src` returning nothing. This panel is the half where a person is present.
//
// WHAT IT OFFERS IS WHAT THE SERVER WILL ACTUALLY DO. The absent controls are argued in
// lib/automations.ts: no schedule picker, because nothing dispatches one; no retry count, because
// `retryVerdict` has no caller; no per-run credit ceiling, because nothing compares a run's spend
// against it. An automation created through the API with a schedule still appears here, and it is
// drawn as dormant with the reason on it rather than as a working schedule — a failure to run must
// not render as a plan to run.
//
// THE REFUSALS ARE THE SUBSTANCE. The server refuses an over-long name; it does not shorten one.
// So nothing here trims, the counter says how far over the value is, and the reason the server
// gives lands on the field that caused it.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Failure } from '../failure';
import { EmptyState } from '../empty-state';
import { useToast } from '../toast';
import {
  ApiError,
  createAutomation,
  deleteAutomation,
  fetchAutomationRuns,
  fetchAutomationSpend,
  fetchAutomations,
  runAutomation,
  setAutomationEnabled,
  updateAutomation,
  type AutomationView,
} from '../../lib/api';
import {
  DORMANT_NOTE,
  LIMITS,
  MODE_CHOICES,
  blankDraft,
  creditLabel,
  draftFrom,
  draftToBody,
  durationLabel,
  fireRefusal,
  foldNote,
  outcomeLabel,
  overBy,
  refusalFor,
  willFireOnItsOwn,
  type AutomationDraft,
  type Refusal,
} from '../../lib/automations';

/** The reason a request was refused, and the field it belongs on. Null when nothing was refused. */
type Rejection = Refusal | null;

/**
 * A character counter that reports and never corrects.
 *
 * `maxLength` is deliberately NOT set on the inputs. It silently truncates a pasted value, which is
 * the same defect as trimming in `draftToBody` wearing the browser's clothes: the person sees the
 * shortened text only if they look, and the server never learns what they meant.
 */
function Counter({ value, limit }: { value: string; limit: number }) {
  const over = overBy(value, limit);
  const used = [...value].length;
  return (
    <span className={`au-count${over > 0 ? ' au-count--over' : ''}`}>
      {used}/{limit}
      {over > 0 ? ` · ${over} too many` : ''}
    </span>
  );
}

/** The server's reason, on the field that caused it. */
function FieldError({ on, rejection }: { on: string; rejection: Rejection }) {
  if (!rejection || rejection.field !== on) return null;
  return (
    <p className="au-err" role="alert">
      {rejection.message}
    </p>
  );
}

/* ------------------------------------------------------------------ the history ---- */

function RunHistory({ automationId }: { automationId: string }) {
  const runs = useQuery({
    queryKey: ['automation-runs', automationId],
    queryFn: () => fetchAutomationRuns(automationId, 25),
    retry: false,
  });
  const spend = useQuery({
    queryKey: ['automation-spend', automationId],
    queryFn: () => fetchAutomationSpend(automationId, 30),
    retry: false,
  });

  if (runs.isPending) return <p className="gx-empty" aria-busy="true">Reading what this has done…</p>;
  if (runs.isError) return <Failure error={runs.error} compact />;

  const rows = runs.data.runs;
  return (
    <div className="au-history">
      {spend.data && (
        <p className="mem__note">
          {spend.data.runs} {spend.data.runs === 1 ? 'run' : 'runs'} in the last 30 days · {spend.data.credits} Credits recorded
          {/* A fire whose cost was never recorded is counted separately, never added as a zero —
              the same distinction automationSpend makes, for the same reason. */}
          {spend.data.unreadable > 0 ? ` · ${spend.data.unreadable} with no cost recorded` : ''}
          {spend.data.failures > 0 ? ` · ${spend.data.failures} did not finish` : ''}
        </p>
      )}
      {rows.length === 0 && <p className="mem__none">It has not run yet.</p>}
      <ul className="au-runs">
        {rows.map((r) => {
          const o = outcomeLabel(r.outcome);
          const took = durationLabel(r);
          const fold = foldNote(r.fold);
          return (
            <li key={r.id} className="au-run">
              <span className={`au-run__mark au-run__mark--${o.tone}`} aria-hidden="true" />
              <span className="au-run__body">
                <span className="au-run__head">
                  <span className="au-run__what">{o.label}</span>
                  <span className="au-run__when">{new Date(r.startedAt).toLocaleString()}</span>
                </span>
                <span className="au-run__meta">
                  {r.trigger === 'manual' ? 'You ran it' : `Started by ${r.trigger}`}
                  {took ? ` · took ${took}` : ''} · {creditLabel(r.credits)}
                  {r.attempt > 0 ? ` · attempt ${r.attempt + 1}` : ''}
                </span>
                {r.error && <span className="au-run__err">{r.error}</span>}
                {/* Twice a year a wall time either does not exist or happens twice. The choice
                    zoned-time.ts makes about both is invisible unless the row says which it was,
                    and "why did this run at 03:30" is the question it produces. */}
                {fold && <span className="au-run__meta">{fold}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------- the editor ---- */

function Editor({
  draft,
  setDraft,
  rejection,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  draft: AutomationDraft;
  setDraft: (d: AutomationDraft) => void;
  rejection: Rejection;
  busy: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: (() => void) | null;
}) {
  return (
    <form
      className="au-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span className="field-label">
          Name <Counter value={draft.name} limit={LIMITS.name} />
        </span>
        <input
          className="mem__fact"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Nightly lighting polish"
          aria-invalid={rejection?.field === 'name' || undefined}
        />
      </label>
      <FieldError on="name" rejection={rejection} />

      <label className="field">
        <span className="field-label">
          What it does <Counter value={draft.prompt} limit={LIMITS.prompt} />
        </span>
        <textarea
          className="mem__fact"
          rows={4}
          value={draft.prompt}
          onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          placeholder="Tidy the lighting in the main map and take a checkpoint first."
          aria-invalid={rejection?.field === 'prompt' || undefined}
        />
      </label>
      <FieldError on="prompt" rejection={rejection} />

      <label className="field">
        <span className="field-label">
          Note to yourself <span className="field-hint">optional</span>{' '}
          <Counter value={draft.description} limit={LIMITS.description} />
        </span>
        <input
          className="mem__fact"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Why this exists"
          aria-invalid={rejection?.field === 'description' || undefined}
        />
      </label>
      <FieldError on="description" rejection={rejection} />

      <label className="field">
        <span className="field-label">Mode</span>
        <select
          className="mem__fact"
          value={draft.mode}
          onChange={(e) => setDraft({ ...draft, mode: e.target.value as AutomationDraft['mode'] })}
        >
          {MODE_CHOICES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <p className="mem__note mem__note--quiet">{MODE_CHOICES.find((m) => m.id === draft.mode)?.blurb}</p>
      <FieldError on="mode" rejection={rejection} />

      <label className="field">
        <span className="field-label">Most runs in a day</span>
        <input
          className="mem__fact"
          type="number"
          min={1}
          max={LIMITS.runsPerDay}
          value={draft.maxRunsPerDay}
          onChange={(e) => setDraft({ ...draft, maxRunsPerDay: Number(e.target.value) })}
          aria-invalid={rejection?.field === 'maxRunsPerDay' || undefined}
        />
      </label>
      <FieldError on="maxRunsPerDay" rejection={rejection} />
      <p className="mem__note mem__note--quiet">
        Counted on your own clock, not the server's, so the allowance resets at your midnight.
      </p>

      {/* A refusal nothing can be pinned on still has to be said, or the form appears to do
          nothing when the server has given a reason. */}
      {rejection && rejection.field === null && (
        <p className="au-err" role="alert">
          {rejection.message}
        </p>
      )}

      <div className="mem__foot">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/* --------------------------------------------------------------------- the panel ---- */

export function AutomationsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<AutomationDraft>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [rejection, setRejection] = useState<Rejection>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['automations', projectId],
    queryFn: () => fetchAutomations(projectId),
    enabled: projectId !== '',
    retry: false,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['automations', projectId] });

  /** Every refusal arrives the same way: the worker's `error` string, placed on its own field. */
  const takeRejection = (err: unknown) => {
    setRejection(err instanceof ApiError ? refusalFor(err.message) : null);
    if (!(err instanceof ApiError)) toast('Could not reach Apple. Check your connection.', 'error');
  };

  const closeEditor = () => {
    setComposing(false);
    setEditingId(null);
    setRejection(null);
    setDraft(blankDraft());
  };

  const save = useMutation({
    mutationFn: () => (editingId ? updateAutomation(editingId, draftToBody(draft)) : createAutomation(projectId, draftToBody(draft))),
    onSuccess: () => {
      closeEditor();
      refresh();
    },
    onError: takeRejection,
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => setAutomationEnabled(v.id, v.enabled),
    // The worker answers with the state its own write produced. Re-reading the list rather than
    // patching it locally is what stops a toggle that changed nothing from rendering as one that did.
    onSuccess: refresh,
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Could not change it.', 'error'),
  });

  const fire = useMutation({
    mutationFn: (id: string) => runAutomation(id),
    onSuccess: (_res, id) => {
      toast('Started. The outcome lands in its history.', 'success');
      setOpenHistory(id);
      void qc.invalidateQueries({ queryKey: ['automation-runs', id] });
    },
    onError: (err) => {
      if (!(err instanceof ApiError)) return toast('Could not reach Apple.', 'error');
      // `requeue` travels on the 409 body because "it was dropped" and "it will be retried" are
      // different facts, and the automation's own overlap policy decides which one is true.
      toast(fireRefusal(err.message, false), 'error');
    },
  });

  const drop = useMutation({
    mutationFn: (id: string) => deleteAutomation(id),
    onSuccess: refresh,
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Could not delete it.', 'error'),
  });

  if (list.isPending) {
    return (
      <div className="au" aria-busy="true">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>
    );
  }
  if (list.isError) {
    return (
      <EmptyState
        state="connectionFailed"
        detail={<Failure error={list.error} compact />}
        action={
          <button type="button" className="btn" onClick={() => void list.refetch()}>
            Try again
          </button>
        }
      />
    );
  }

  const rows = list.data.automations;

  return (
    <div className="au">
      <p className="mem__note">
        An instruction you save once and run whenever you want, with a record of what each run cost.
      </p>

      {rows.length === 0 && !composing && <p className="mem__none">You have not saved any yet.</p>}

      <ul className="au-list">
        {rows.map((a: AutomationView) => {
          const editing = editingId === a.id;
          const dormant = !willFireOnItsOwn(a);
          return (
            <li key={a.id} className="au-item">
              <div className="au-item__head">
                <span className="au-item__text">
                  <span className="au-item__name">{a.name}</span>
                  {/* The schedule sentence is the check a person makes: the commonest automation
                      bug is the one set for the right time in the wrong zone, and the zone is in
                      the words. It comes from the server so the client cannot describe a schedule
                      differently from the code that would fire it. */}
                  <span className="au-item__meta">{a.describes}</span>
                  {a.description && <span className="au-item__meta">{a.description}</span>}
                  {!a.enabled && <span className="au-badge au-badge--off">Paused</span>}
                  {/* NOT SILENCE. An automation this build cannot start on its own says so, rather
                      than sitting in the list looking like a schedule that is running. */}
                  {dormant && <span className="au-item__note">{DORMANT_NOTE}</span>}
                  {/* The daylight-saving disclosure, written by zoned-time.ts and rendered only
                      where it can apply. A choice the user cannot see is indistinguishable to them
                      from a bug. */}
                  {a.dstNote && <span className="au-item__note">{a.dstNote}</span>}
                </span>
              </div>

              <div className="au-item__acts">
                <button
                  type="button"
                  className="btn"
                  disabled={fire.isPending || !a.enabled}
                  onClick={() => fire.mutate(a.id)}
                  title={a.enabled ? undefined : 'Resume it first'}
                >
                  Run now
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ id: a.id, enabled: !a.enabled })}
                >
                  {a.enabled ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-expanded={openHistory === a.id}
                  onClick={() => setOpenHistory(openHistory === a.id ? null : a.id)}
                >
                  History
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setComposing(false);
                    setRejection(null);
                    setEditingId(editing ? null : a.id);
                    if (!editing) setDraft(draftFrom(a));
                  }}
                >
                  {editing ? 'Close' : 'Edit'}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={drop.isPending}
                  onClick={() => {
                    // The history is kept on purpose — a spender who can erase the record by
                    // deleting the automation is a spender with no record — so the question says so.
                    if (!window.confirm(`Delete "${a.name}"? Its record of what it spent is kept.`)) return;
                    drop.mutate(a.id);
                  }}
                >
                  Delete
                </button>
              </div>

              {openHistory === a.id && <RunHistory automationId={a.id} />}

              {editing && (
                <Editor
                  draft={draft}
                  setDraft={setDraft}
                  rejection={rejection}
                  busy={save.isPending}
                  submitLabel="Save changes"
                  onSubmit={() => save.mutate()}
                  onCancel={closeEditor}
                />
              )}
            </li>
          );
        })}
      </ul>

      {composing ? (
        <Editor
          draft={draft}
          setDraft={setDraft}
          rejection={rejection}
          busy={save.isPending}
          submitLabel="Save automation"
          onSubmit={() => save.mutate()}
          onCancel={closeEditor}
        />
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditingId(null);
            setRejection(null);
            setDraft(blankDraft());
            setComposing(true);
          }}
        >
          New automation
        </button>
      )}
    </div>
  );
}
