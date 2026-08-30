// The persistent context rail: what Golem knows and what it can undo.
//
// Studio state, Sparks, checkpoints (with restore and compare), the live Studio
// log tail, and the project memory Golem keeps about your game. These are the
// facts that stay true between turns, so they stay on screen between turns.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { CheckpointMeta, QuotaState, StudioEventLog, StudioEventState } from '@golem/shared';
import { formatBytes, relativeTime } from '../lib/format';
import { checkpointComparisonToDocument } from '../lib/generative-ui';
import { GenerativeUI } from '../lib/generative-ui/render';
import { Modal } from './modal';
import { Forge } from './loading';

interface ContextRailProps {
  studioConnected: boolean;
  studioState: StudioEventState | null;
  onConnectStudio: () => void;
  quota: QuotaState | null;
  checkpoints: CheckpointMeta[];
  checkpointsState: 'loading' | 'ready' | 'error';
  onReloadCheckpoints: () => void;
  onCreateCheckpoint: (label: string) => void;
  onRestoreCheckpoint: (id: string) => void;
  restoring: boolean;
  logs: StudioEventLog[];
  memorySummary: string | null;
  wsOpen: boolean;
}

const KIND_LABEL: Record<CheckpointMeta['kind'], string> = {
  auto: 'auto',
  manual: 'manual',
  pre_agent: 'pre-run',
};

function SparksRing({ quota }: { quota: QuotaState }) {
  const r = 21;
  const c = 2 * Math.PI * r;
  const frac = quota.sparksDaily > 0 ? Math.max(0, Math.min(1, quota.sparksRemaining / quota.sparksDaily)) : 0;
  return (
    <div className="sparks-rail">
      <div className="sparks-rail-ring">
        <svg
          width="54"
          height="54"
          viewBox="0 0 54 54"
          role="img"
          aria-label={`${quota.sparksRemaining} of ${quota.sparksDaily} Sparks remaining today`}
        >
          <circle cx="27" cy="27" r={r} className="dial-track" />
          <circle
            cx="27"
            cy="27"
            r={r}
            className="dial-arc"
            strokeDasharray={`${c * frac} ${c}`}
            transform="rotate(-90 27 27)"
          />
        </svg>
        <span className="sparks-rail-value" aria-hidden="true">
          {quota.sparksRemaining}
        </span>
      </div>
      <div className="sparks-rail-body">
        <strong>
          {quota.sparksRemaining} of {quota.sparksDaily} left
        </strong>
        {quota.sparksUsedToday} spent today · {quota.plan} plan
      </div>
    </div>
  );
}

export function ContextRail({
  studioConnected,
  studioState,
  onConnectStudio,
  quota,
  checkpoints,
  checkpointsState,
  onReloadCheckpoints,
  onCreateCheckpoint,
  onRestoreCheckpoint,
  restoring,
  logs,
  memorySummary,
  wsOpen,
}: ContextRailProps) {
  const [label, setLabel] = useState('');
  const [confirming, setConfirming] = useState<CheckpointMeta | null>(null);
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const canCheckpoint = wsOpen && studioConnected;

  const comparison = useMemo(() => {
    if (!compareWith) return null;
    const right = checkpoints[0];
    const left = checkpoints.find((c) => c.id === compareWith);
    if (!left || !right || left.id === right.id) return null;
    const result = checkpointComparisonToDocument(left, right);
    return result.ok ? result.doc : null;
  }, [compareWith, checkpoints]);

  const submitCheckpoint = (e: FormEvent) => {
    e.preventDefault();
    if (!canCheckpoint) return;
    onCreateCheckpoint(label.trim() || 'manual checkpoint');
    setLabel('');
  };

  return (
    <aside className="ws-lane rail" aria-label="Project context">
      <section className="rail-section">
        <div className="rail-head">
          <h2>Studio</h2>
          {!studioConnected && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onConnectStudio}>
              Connect
            </button>
          )}
        </div>
        <div className="studio-state">
          <span className={`pill ${studioConnected ? 'pill-live' : 'pill-off'}`}>
            <span className="pill-dot" aria-hidden="true" />
            {studioConnected ? 'Linked to Studio' : 'Not connected'}
          </span>
          {studioConnected && studioState ? (
            <dl className="studio-facts">
              <dt>Place</dt>
              <dd title={studioState.placeName}>{studioState.placeName || '—'}</dd>
              <dt>Place ID</dt>
              <dd>{studioState.placeId || '—'}</dd>
              <dt>Mode</dt>
              <dd>{studioState.isRunMode ? 'Running' : 'Editing'}</dd>
              <dt>Selected</dt>
              <dd>
                {studioState.selectionCount} instance{studioState.selectionCount === 1 ? '' : 's'}
              </dd>
              <dt>Plugin</dt>
              <dd>v{studioState.pluginVersion}</dd>
            </dl>
          ) : (
            <p className="rail-note">
              {studioConnected
                ? 'Waiting for the plugin to report its place…'
                : 'Golem needs the Studio plugin open to build. Connect it to start.'}
            </p>
          )}
        </div>
      </section>

      {quota && (
        <section className="rail-section">
          <div className="rail-head">
            <h2>Sparks</h2>
          </div>
          <SparksRing quota={quota} />
        </section>
      )}

      <section className="rail-section">
        <div className="rail-head">
          <h2>Checkpoints</h2>
          {checkpointsState === 'error' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onReloadCheckpoints}>
              Retry
            </button>
          )}
        </div>
        <form className="checkpoint-form" onSubmit={submitCheckpoint}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label this moment…"
            maxLength={60}
            name="checkpointLabel"
            id="checkpoint-label"
            aria-label="Checkpoint label"
            disabled={!canCheckpoint}
          />
          <button
            type="submit"
            className="btn btn-sm"
            disabled={!canCheckpoint}
            title={canCheckpoint ? 'Snapshot the place now' : 'Connect Studio to create checkpoints'}
          >
            Save
          </button>
        </form>
        {!studioConnected && <p className="rail-note">Connect Studio to create or restore checkpoints.</p>}
        {checkpointsState === 'loading' && <p className="rail-note">Loading checkpoints…</p>}
        {checkpointsState === 'error' && <p className="rail-note form-error">Couldn&rsquo;t load checkpoints.</p>}
        {checkpointsState === 'ready' && checkpoints.length === 0 && (
          <p className="rail-note">No checkpoints yet. Golem also snapshots before every big run.</p>
        )}
        <ul className="checkpoint-list">
          {checkpoints.map((cp, i) => (
            <li key={cp.id} className={`checkpoint-item${compareWith === cp.id ? ' is-selected' : ''}`}>
              <div className="checkpoint-main">
                <span className="checkpoint-label" title={cp.label}>
                  {cp.label}
                </span>
                <span
                  className="checkpoint-meta"
                  title={`${relativeTime(cp.createdAt)} · ${cp.scriptCount} scripts · ${cp.instanceCount} instances · ${formatBytes(
                    cp.sizeBytes,
                  )}`}
                >
                  <span className={`pill pill-quiet pill-${cp.kind}`}>{KIND_LABEL[cp.kind]}</span>
                  {relativeTime(cp.createdAt)} · {cp.scriptCount} scripts
                </span>
              </div>
              <div className="checkpoint-actions">
                {i > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-pressed={compareWith === cp.id}
                    onClick={() => setCompareWith((v) => (v === cp.id ? null : cp.id))}
                    title="Compare with the newest checkpoint"
                  >
                    Diff
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirming(cp)}
                  disabled={!canCheckpoint}
                >
                  Restore
                </button>
              </div>
            </li>
          ))}
        </ul>
        {comparison && (
          <div className="artifact" style={{ marginTop: '0.6rem' }}>
            <div className="artifact-body">
              <GenerativeUI doc={comparison} />
            </div>
          </div>
        )}
      </section>

      <section className="rail-section rail-grow">
        <div className="rail-head">
          <h2>Studio log</h2>
          <span className="mono">{logs.length}</span>
        </div>
        <div className="log-tail" ref={logRef} role="log" aria-label="Studio output log" aria-live="off">
          {logs.length === 0 ? (
            <p className="rail-note">{studioConnected ? 'Quiet so far…' : 'Logs appear when Studio is connected.'}</p>
          ) : (
            logs.map((l, i) => (
              <div key={i} className={`log-line log-${l.level}`}>
                {l.message}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rail-section">
        <div className="rail-head">
          <h2>Project memory</h2>
        </div>
        <p className="memory-card">
          {memorySummary || (
            <span className="muted">
              Golem keeps a running summary of your game here as it learns the project.
            </span>
          )}
        </p>
      </section>

      {confirming && (
        <Modal title="Restore checkpoint" onClose={() => setConfirming(null)} locked={restoring}>
          {restoring ? (
            <Forge kind="restoring" />
          ) : (
            <>
              <p>
                Restore <strong>{confirming.label}</strong> from {relativeTime(confirming.createdAt)}? Your place in
                Studio will be rewound to that snapshot ({confirming.scriptCount} scripts, {confirming.instanceCount}{' '}
                instances).
              </p>
              <p className="muted">Save a checkpoint of the current state first if you might want to come back.</p>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onRestoreCheckpoint(confirming.id);
                    setConfirming(null);
                  }}
                >
                  Restore
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </aside>
  );
}
