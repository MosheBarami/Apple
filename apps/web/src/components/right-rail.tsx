// Workspace right rail: checkpoints, Studio log tail, project memory summary.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CheckpointMeta, StudioEventLog } from '@golem/shared';
import { formatBytes, relativeTime } from '../lib/format';
import { Modal } from './modal';

interface RightRailProps {
  checkpoints: CheckpointMeta[];
  checkpointsState: 'loading' | 'ready' | 'error';
  onReloadCheckpoints: () => void;
  onCreateCheckpoint: (label: string) => void;
  onRestoreCheckpoint: (id: string) => void;
  logs: StudioEventLog[];
  memorySummary: string | null;
  studioConnected: boolean;
  wsOpen: boolean;
}

const KIND_LABEL: Record<CheckpointMeta['kind'], string> = {
  auto: 'auto',
  manual: 'manual',
  pre_agent: 'pre-run',
};

export function RightRail({
  checkpoints,
  checkpointsState,
  onReloadCheckpoints,
  onCreateCheckpoint,
  onRestoreCheckpoint,
  logs,
  memorySummary,
  studioConnected,
  wsOpen,
}: RightRailProps) {
  const [label, setLabel] = useState('');
  const [confirming, setConfirming] = useState<CheckpointMeta | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Pin the log tail to the bottom as entries stream in.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const canCheckpoint = wsOpen && studioConnected;

  const submitCheckpoint = (e: FormEvent) => {
    e.preventDefault();
    if (!canCheckpoint) return;
    onCreateCheckpoint(label.trim() || 'manual checkpoint');
    setLabel('');
  };

  return (
    <aside className="rail" aria-label="Project tools">
      <section className="rail-section">
        <div className="rail-head">
          <h3>Checkpoints</h3>
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
        {!studioConnected && <p className="rail-note muted">Connect Studio to create or restore checkpoints.</p>}
        {checkpointsState === 'loading' && <p className="rail-note muted">Loading checkpoints…</p>}
        {checkpointsState === 'error' && (
          <p className="rail-note form-error">Couldn't load checkpoints.</p>
        )}
        {checkpointsState === 'ready' && checkpoints.length === 0 && (
          <p className="rail-note muted">No checkpoints yet. Golem also snapshots before every big run.</p>
        )}
        <ul className="checkpoint-list">
          {checkpoints.map((cp) => (
            <li key={cp.id} className="checkpoint-item">
              <div className="checkpoint-main">
                <span className="checkpoint-label">{cp.label}</span>
                <span className="checkpoint-meta muted">
                  <span className={`pill pill-quiet pill-${cp.kind}`}>{KIND_LABEL[cp.kind]}</span> {relativeTime(cp.createdAt)} ·{' '}
                  {cp.scriptCount} scripts · {formatBytes(cp.sizeBytes)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirming(cp)}
                disabled={!canCheckpoint}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rail-section rail-grow">
        <div className="rail-head">
          <h3>Studio log</h3>
        </div>
        <div className="log-tail" ref={logRef} role="log" aria-label="Studio output log" aria-live="off">
          {logs.length === 0 ? (
            <p className="rail-note muted">{studioConnected ? 'Quiet so far…' : 'Logs appear when Studio is connected.'}</p>
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
          <h3>Project memory</h3>
        </div>
        <p className="memory-card">
          {memorySummary || <span className="muted">Golem keeps a running summary of your game here as it learns the project.</span>}
        </p>
      </section>

      {confirming && (
        <Modal title="Restore checkpoint" onClose={() => setConfirming(null)}>
          <p>
            Restore <strong>{confirming.label}</strong> from {relativeTime(confirming.createdAt)}? Your place in Studio
            will be rewound to that snapshot ({confirming.scriptCount} scripts, {confirming.instanceCount} instances).
          </p>
          <p className="muted">Tip: save a checkpoint of the current state first if you might want to come back.</p>
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
        </Modal>
      )}
    </aside>
  );
}
