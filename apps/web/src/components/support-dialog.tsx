/**
 * ASK FOR HELP FROM WHERE THE PROBLEM IS.
 *
 * `public.feedback` has had a `page` column since the first migration — a field that only makes
 * sense for an in-app widget — and there was no widget. The whole support surface was an address
 * on the marketing site, which means the person best placed to describe a failure had to leave the
 * screen showing it, find the site, and retype from memory what they had been doing. This is that
 * widget, and `page` is finally a fact rather than a column.
 *
 * WHAT THIS DIALOG REFUSES TO DO:
 *
 *   IT DOES NOT SEND THE URL. It sends `supportPageOf(location)` — the path. This app returns from
 *   a magic link to `/app#access_token=…`, so `location.href` is, some of the time, a working
 *   session credential. A support table is read by somebody else by definition.
 *
 *   IT DOES NOT SHOW A RECEIPT IT DOES NOT HAVE. The success state renders the id and status the
 *   worker returned. A failed write leaves the draft in the box, because the one thing worse than
 *   an error is "Thanks, we'll be in touch" over a request that was never stored.
 *
 *   IT DOES NOT QUIETLY EDIT ANYBODY. When the worker strips a credential out of the text it says
 *   `redacted`, and this says so too — the report read back will not match what was typed, and
 *   "your key was in there" is worth knowing.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from './modal';
import { SUPPORT_EMAIL } from '@golem/shared';
import { fetchStudioDiagnostics, fetchSupportRequests, submitSupportRequest, type SupportReceipt } from '../lib/api';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_DEFAULT,
  checkDraft,
  describeRequest,
  diagnosticsAttachment,
  supportPageOf,
  withAttachment,
} from './support-model';
import './support-dialog.css';

export interface SupportDialogProps {
  onClose: () => void;
  /**
   * Where the report is being filed from.
   *
   * REQUIRED, AND A PATHNAME RATHER THAN A LOCATION. Not optional with a `window` fallback: an
   * optional one would mean this file still contained a line that reaches the browser's real
   * location object, and that object carries the fragment. The caller passes react-router's
   * pathname, which never has one. The rule this encodes is that no line in this feature can read
   * the whole URL, because there is no line here that could.
   */
  location: { pathname: string };
  /**
   * The project whose connection details may be offered — null when the person is not on one.
   *
   * Read off the route by the caller (`projectIdFromPath`) rather than asked for: somebody filing
   * a report is describing where they are, and making them pick a project from a list is asking
   * them to restate a fact the app already knows.
   */
  projectId?: string | null;
}

export function SupportDialog({ onClose, location, projectId }: SupportDialogProps) {
  const [kind, setKind] = useState<string>(SUPPORT_CATEGORY_DEFAULT);
  const [text, setText] = useState('');
  /*
   * OFF. Not "off unless the category is bug", not "on for Studio problems" — off, until somebody
   * ticks it. The repo's own asset-source dialog says it best: a default is not a decision, and
   * this one sends the state of a person's editor to another human being.
   */
  const [attach, setAttach] = useState(false);
  const [receipt, setReceipt] = useState<SupportReceipt | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const qc = useQueryClient();

  // Fetched only when there is a project to fetch it for. The preview has to show the REAL bundle
  // — a preview of a placeholder is a preview of nothing — so the request happens before the tick,
  // and the tick decides only whether it is sent.
  const diagnostics = useQuery({
    queryKey: ['support-diagnostics', projectId],
    queryFn: () => fetchStudioDiagnostics(projectId as string),
    enabled: Boolean(projectId),
    // Owner-only route: a collaborator is answered 404, and that is a reason to offer nothing
    // rather than to retry.
    retry: false,
  });

  const bundle = diagnosticsAttachment(diagnostics.data ?? null);
  const attachment = attach ? bundle : null;
  const page = supportPageOf(location);
  const draft = checkDraft(text, attachment);

  const send = useMutation({
    mutationFn: () => submitSupportRequest({ kind, content: withAttachment(text, attachment), page }),
    onSuccess: (r) => {
      setReceipt(r);
      setFailed(null);
      // The list under the form is the answer to "did that go anywhere", so it is refetched rather
      // than optimistically patched — the row the server stored is the row worth showing.
      void qc.invalidateQueries({ queryKey: ['support-requests'] });
    },
    // The draft is deliberately NOT cleared here. A report that failed to send and vanished from
    // the box is a report the person has to write twice.
    onError: (e: unknown) => setFailed(e instanceof Error ? e.message : 'That did not send.'),
  });

  const mine = useQuery({
    queryKey: ['support-requests'],
    queryFn: fetchSupportRequests,
  });

  if (receipt) {
    return (
      <Modal title="Sent" onClose={onClose}>
        <p className="sup__done">
          Thanks — that is with us. You can quote <code className="sup__id">{receipt.id.slice(0, 8)}</code> if you
          follow up by email.
        </p>
        {receipt.redacted && (
          <p className="sup__note" role="status">
            Something in your message looked like a password or an access key, so it was removed before
            the report was stored. Everything else went through as written.
          </p>
        )}
        <p className="muted">
          There is no promised reply time yet — this is a beta and the owner has not committed to one.
          You can also write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setReceipt(null);
              setText('');
            }}
          >
            Send another
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Get help" onClose={onClose} locked={send.isPending} wide>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.canSend && !send.isPending) send.mutate();
        }}
      >
        <fieldset className="sup__kinds">
          <legend className="field-label">What is this about?</legend>
          {SUPPORT_CATEGORIES.map((c) => (
            <label key={c.id} className={`sup__kind${kind === c.id ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="support-kind"
                value={c.id}
                checked={kind === c.id}
                onChange={() => setKind(c.id)}
              />
              <span className="sup__kindtext">
                <span className="sup__kindlabel">{c.label}</span>
                <span className="sup__kindhint">{c.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span className="field-label">What happened?</span>
          <textarea
            className="sup__text"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What were you doing, what you expected, and what happened instead."
            autoFocus
          />
        </label>

        {/*
          CONSENT, WHICH MEANS SEEING THE ACTUAL STRING.
          "We may include diagnostic information to help us help you" names no field and is
          satisfied by sending anything at all. What is rendered in the <pre> below is the exact
          value passed to `withAttachment` — the same variable, not a description of it — so there
          is no version of this that shows one thing and sends another.
        */}
        {bundle && (
          <div className="sup__attach">
            <label className="sup__attachrow">
              <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
              <span>
                <span className="sup__attachlabel">Attach my connection details</span>
                <span className="sup__attachhint">
                  What Studio has reported about this project: pairing, plugin version, the open place
                  and the last few operations. Nothing is sent unless you tick this.
                </span>
              </span>
            </label>
            <details className="sup__attachpeek">
              <summary>Show exactly what would be attached</summary>
              <pre className="sup__attachtext">{bundle}</pre>
            </details>
          </div>
        )}

        <p className="field-hint sup__meta">
          {page ? (
            <>
              Filed from <code>{page}</code>. Only the path is sent — never anything after a{' '}
              <code>?</code> or <code>#</code>.
            </>
          ) : (
            'The page you are on could not be read, so none is attached.'
          )}
          <span className={draft.remaining < 0 ? 'sup__count is-over' : 'sup__count'}>{draft.remaining}</span>
        </p>

        {draft.error && (
          <p className="form-error" role="alert">
            {draft.error}
          </p>
        )}
        {failed && (
          <p className="form-error" role="alert">
            {failed} Your message is still here — try again, or write to{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={send.isPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!draft.canSend || send.isPending}>
            {send.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>

      {/*
        THE LIST IS THE STATUS FEATURE. `status` has been on the column since 0001_init.sql and was
        excluded even from the user's own data export, so the answer to "did anyone read it" existed
        and was visible to nobody. It is rendered here and nowhere else, because here is where a
        person who is wondering already is.
      */}
      {mine.data && mine.data.requests.length > 0 && (
        <section className="sup__mine" aria-labelledby="sup-mine-title">
          <h3 className="sup__minetitle" id="sup-mine-title">
            What you have sent before
          </h3>
          <ul className="sup__list">
            {mine.data.requests.map((r) => {
              const d = describeRequest(r);
              return (
                <li key={d.id} className="sup__row">
                  <span className="sup__rowkind">{d.kindLabel}</span>
                  <span className="sup__rowtext">{d.content.length > 90 ? `${d.content.slice(0, 90)}…` : d.content}</span>
                  <span className={r.status === 'closed' ? 'sup__status is-closed' : 'sup__status'}>{d.statusLabel}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Modal>
  );
}
