// What Apple believes about this project — and how to correct it.
//
// Memory is written by a model, from the conversation, with nobody reading it first, and then it
// steers every later run. That makes it the one part of the product that can be confidently wrong
// about the user's own project and keep acting on it: a fact like "the doors use a custom
// DoorService" outlives the code it described and quietly shapes everything after.
//
// So this shows all of it, not just the summary, and every part of it can be changed. The
// important honesty is at the bottom: deleting a fact does not stop Apple noticing it again.
// Someone who deletes something and watches it come back needs to have been told that is how it
// works, rather than concluding the delete button is broken.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import './memory-panel.css';
import { Failure } from '../failure';
import { ApiError, decideSuggestion, fetchMemory, saveMemory } from '../../lib/api';
import { decisionBody, isAlreadyAnswered, pendingFrom, type SuggestionDecision } from '../../lib/memory-approvals';
import { useToast } from '../toast';
import { useUnsavedGuard } from '../../lib/unsaved';

const FACT_MAX = 300;
const SUMMARY_MAX = 3000;

export function MemoryPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const state = useQuery({
    queryKey: ['memory', projectId],
    queryFn: () => fetchMemory(projectId),
    enabled: projectId.length > 0,
  });

  const [summary, setSummary] = useState('');
  const [facts, setFacts] = useState<string[]>([]);
  const [adding, setAdding] = useState('');
  // Edits are local until saved, so the panel does not fight the user's typing on every refetch.
  const [dirty, setDirty] = useState(false);

  // The panel's edit lives here and nowhere else, so closing the tab on it is the one loss with
  // no recovery — see lib/unsaved.ts for what this does and does not cover.
  useUnsavedGuard(dirty);

  // Adopt the server's copy only while there is nothing unsaved to lose.
  useEffect(() => {
    if (dirty || !state.data) return;
    setSummary(state.data.memory.summary ?? '');
    setFacts(state.data.memory.facts);
  }, [state.data, dirty]);

  const save = useMutation({
    mutationFn: () => saveMemory(projectId, { summary: summary.trim() || null, facts }),
    onSuccess: (res) => {
      setDirty(false);
      setSummary(res.memory.summary ?? '');
      setFacts(res.memory.facts);
      // The dashboard card renders memory_summary, so it is stale the moment this succeeds.
      void qc.invalidateQueries({ queryKey: ['memory', projectId] });
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      toast('Memory updated — Apple uses this from the next run', 'success');
    },
    onError: (e: Error) => toast(e instanceof ApiError ? e.message : 'Could not save memory', 'error'),
  });

  //[[ ANSWERING WHAT APPLE ASKED TO REMEMBER.
  //
  //   Under the `review` memory setting nothing the model learns reaches memory until a person
  //   says so. The queue and both decisions have existed in the worker the whole time; this is the
  //   door out of it.
  //
  //   THE 404 IS THE INTERESTING CASE. The worker answers 404 rather than 200 when the proposal is
  //   already gone — two tabs, one proposal, and a 200 would tell the second person "discarded"
  //   about a decision they never made. So it is reported as what it is and the panel refetches;
  //   only a real failure becomes an error. ]]
  const decide = useMutation({
    mutationFn: ({ decision, fact }: { decision: SuggestionDecision; fact: string | null }) =>
      decideSuggestion(projectId, decisionBody(decision, fact)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['memory', projectId] });
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e: Error) => {
      if (isAlreadyAnswered(e)) {
        toast('Someone already answered that one', 'info');
        void qc.invalidateQueries({ queryKey: ['memory', projectId] });
        return;
      }
      toast(e instanceof ApiError ? e.message : 'Could not record that', 'error');
    },
  });

  if (state.isPending) {
    return (
      <p className="gx-empty" aria-busy="true">
        Reading what Apple remembers…
      </p>
    );
  }

  if (state.isError) {
    return (
      <div className="mem">
        <p className="gx-empty" role="alert">
          <Failure error={state.error} compact />
        </p>
        <button type="button" className="btn" onClick={() => void state.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const empty = !summary.trim() && facts.length === 0;
  const pending = pendingFrom(state.data.memory);

  return (
    <div className="mem">
      {/* ------------------------------------------------- waiting on an answer -- */}
      {/*
        Rendered ABOVE the summary and the facts, because it is the only part of this panel that is
        waiting on the person reading it. Everything below is a correction they may or may not want
        to make; this is a question already asked.
      */}
      {(pending.summary !== null || pending.facts.length > 0) && (
        <div className="mem__pending">
          <span className="field-label">Apple asked to remember</span>
          <p className="mem__note">
            Your memory setting is “review”, so nothing here is in use yet. Keep it and Apple works
            from it on the next run; discard it and nothing changes.
          </p>
          <ul className="mem__list">
            {pending.summary !== null && (
              <li className="mem__item mem__item--pending">
                <span className="mem__fact prefs__instruction">{pending.summary}</span>
                <span className="prefs__from">as the summary</span>
                <button
                  type="button"
                  className="mem__addbtn"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ decision: 'accept', fact: null })}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className="mem__drop"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ decision: 'discard', fact: null })}
                >
                  Discard
                </button>
              </li>
            )}
            {pending.facts.map((fact) => (
              <li key={fact} className="mem__item mem__item--pending">
                <span className="mem__fact prefs__instruction">{fact}</span>
                <button
                  type="button"
                  className="mem__addbtn"
                  aria-label={`Keep: ${fact}`}
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ decision: 'accept', fact })}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className="mem__drop"
                  aria-label={`Discard: ${fact}`}
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ decision: 'discard', fact })}
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {empty && !dirty ? (
        <p className="gx-empty">
          Nothing yet. As you build, Apple keeps a short note about how your project is put together
          and uses it on later turns. You can also write one yourself.
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">In short</span>
        <textarea
          className="mem__summary"
          value={summary}
          maxLength={SUMMARY_MAX}
          rows={5}
          placeholder="A one-paragraph description of how this project is put together."
          onChange={(e) => {
            setSummary(e.target.value);
            setDirty(true);
          }}
        />
      </label>

      <div className="mem__facts">
        <span className="field-label">Facts it keeps</span>
        {facts.length === 0 && <p className="mem__none">None yet.</p>}
        <ul className="mem__list">
          {facts.map((fact, i) => (
            // Index as key: these are free-text strings the model rewrites wholesale, so two can
            // legitimately be identical mid-edit and there is no stable id to use instead.
            <li key={i} className="mem__item">
              <input
                className="mem__fact"
                value={fact}
                maxLength={FACT_MAX}
                aria-label={`Fact ${i + 1}`}
                onChange={(e) => {
                  setFacts(facts.map((f, j) => (j === i ? e.target.value : f)));
                  setDirty(true);
                }}
              />
              <button
                type="button"
                className="mem__drop"
                aria-label={`Forget: ${fact}`}
                onClick={() => {
                  setFacts(facts.filter((_, j) => j !== i));
                  setDirty(true);
                }}
              >
                Forget
              </button>
            </li>
          ))}
        </ul>

        <form
          className="mem__add"
          onSubmit={(e) => {
            e.preventDefault();
            const text = adding.trim();
            if (!text) return;
            setFacts([...facts, text]);
            setAdding('');
            setDirty(true);
          }}
        >
          <input
            className="mem__fact"
            value={adding}
            maxLength={FACT_MAX}
            placeholder="Tell Apple something it should remember…"
            aria-label="New fact"
            onChange={(e) => setAdding(e.target.value)}
          />
          <button type="submit" className="mem__addbtn" disabled={!adding.trim()}>
            Add
          </button>
        </form>
      </div>

      <div className="mem__foot">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {dirty && (
          <button
            type="button"
            className="btn"
            disabled={save.isPending}
            onClick={() => {
              setDirty(false);
              setSummary(state.data.memory.summary ?? '');
              setFacts(state.data.memory.facts);
            }}
          >
            Discard changes
          </button>
        )}
      </div>

      {/* The part someone will otherwise learn by being surprised. */}
      <p className="mem__note">
        Apple keeps noticing things as you build, so something you forget here can come back if the
        conversation says it again. Changes apply from the next run — they do not alter anything
        already built.
      </p>

      {state.data.editedAt && (
        <p className="mem__note mem__note--quiet">
          Last edited by you on {new Date(state.data.editedAt).toLocaleString()}.
        </p>
      )}
    </div>
  );
}
