// The inline Playtest viewport.
//
// READ THIS BEFORE CHANGING THE COPY.
//
// Roblox gives Studio plugins no viewport readback. ThumbnailGenerator is not a
// valid service for plugins, and CaptureService's callback never fires in edit
// mode — both verified against real Studio, see apps/plugin/src/Render.luau.
// There is no screenshot of the user's Studio window and no video stream to
// subscribe to, at any price.
//
// So this card shows what the plugin CAN produce: its own depth-buffered
// triangle rasteriser, run on demand against the live DataModel, at 160x100,
// roughly every 1.5 seconds. During Run mode that DataModel is the one the
// server scripts are executing against — the same edit DataModel, which is the
// hazard playtest.ts exists to contain and also the reason these frames show
// real simulation state rather than a frozen scene.
//
// WHAT THESE FRAMES DO NOT CONTAIN, and why the card must never imply
// otherwise: no characters (Run mode is server-only, nobody spawns), no
// particles, no shadows, no PointLights, no post-effects, no textures. Flat
// Lambert with one fixed sun.
//
// THE LINE THAT MUST NOT BE CROSSED: this is periodic stills of computed
// geometry. Calling it "live video", adding a LIVE badge that stays lit when
// frames have stopped, interpolating between frames, or holding a stale frame
// under a current-tense label would all be dressing it up as something it is
// not. Staleness is computed in lib/playtest-view.ts from the worker's own
// timestamps and is rendered here without softening.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlaytestRun, StudioFrame } from '@golem/shared';
import { paintFrame } from '../../lib/frame-decode';
import { playtestView, PLAYTEST_TICK_MS } from '../../lib/playtest-view';
import { Icon, PATH } from './primitives';

function useFrameCanvas(frame: StudioFrame | undefined) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !frame) return;
    // A frame that does not decode is simply not painted; the previous one
    // stays up and the age readout keeps advancing, so a run of undecodable
    // frames reads as a stalled stream rather than as a fresh black picture.
    paintFrame(canvas, frame);
  }, [frame]);
  return ref;
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export interface PlaytestCardProps {
  run: PlaytestRun | null;
  frames: readonly StudioFrame[];
  /** Opens Studio. Absent when there is nothing sensible to open. */
  onOpenStudio?: () => void;
  /** True when the worker says the Studio bridge is attached. */
  studioConnected: boolean;
}

export function PlaytestCard({ run, frames, onOpenStudio, studioConnected }: PlaytestCardProps) {
  const [expanded, setExpanded] = useState(false);
  // Staleness has to advance on a clock. Deriving it only when a message
  // arrives would freeze the age readout at the moment the stream died, which
  // is precisely when it needs to keep counting.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setNow(Date.now()), PLAYTEST_TICK_MS);
    return () => clearInterval(t);
  }, [run]);

  const view = useMemo(() => playtestView(run, frames, now), [run, frames, now]);
  const canvasRef = useFrameCanvas(view.frame);

  if (!view.visible) return null;

  const terminal = run?.phase === 'finished' || run?.phase === 'failed';
  const degraded = !terminal && (view.freshness === 'stale' || view.freshness === 'dead' || !studioConnected);

  return (
    <section
      className={`gx-playtest${expanded ? ' is-expanded' : ''}${view.dimmed ? ' is-dimmed' : ''}`}
      aria-label="Playtest"
    >
      <header className="gx-playtest__head">
        <span className="gx-playtest__title">
          <Icon d={PATH.camera} size={13} />
          Playtest
        </span>
        {/* The state chip. Its class is derived from freshness, so it cannot be
            lit green while the frames have stopped arriving. */}
        <span className={`gx-playtest__chip gx-playtest__chip--${view.freshness}`}>{view.label}</span>
        {/* Elapsed is the worker's measurement, not a browser timer started when
            the card mounted — a card that mounted late would otherwise under-report
            a playtest that was already running. */}
        <span className="gx-playtest__elapsed" aria-label="Elapsed">
          {clock(view.elapsedMs)}
          {view.live && run ? ` / ${run.requestedSeconds}s` : ''}
        </span>
      </header>

      <div className="gx-playtest__stage">
        {view.frame ? (
          <button
            type="button"
            className="gx-playtest__frame"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse playtest frame' : 'Expand playtest frame'}
          >
            <canvas ref={canvasRef} className="gx-playtest__canvas" />
            {/* An overlay, not a replacement. The pixels underneath are real and
                stay visible; what changes is that the card stops claiming they
                are current. */}
            {view.freshness === 'stale' && (
              <span className="gx-playtest__veil gx-playtest__veil--stale">
                {Math.round((view.frameAgeMs ?? 0) / 1000)}s old
              </span>
            )}
            {view.freshness === 'dead' && (
              <span className="gx-playtest__veil gx-playtest__veil--dead">
                Last frame · {Math.round((view.frameAgeMs ?? 0) / 1000)}s ago
              </span>
            )}
          </button>
        ) : (
          <div className="gx-playtest__empty">
            {run?.phase === 'failed' ? (
              <p>{view.error ?? 'The playtest did not run.'}</p>
            ) : terminal ? (
              <p>No frame is available for this completed playtest. Inspect the result in Studio.</p>
            ) : (
              <p>Waiting for the first frame from Studio…</p>
            )}
          </div>
        )}
      </div>

      <footer className="gx-playtest__foot">
        {/* The honest label. Do not shorten this to "Live view" or "Gameplay". */}
        {view.frame && <span className="gx-playtest__what">
          Rasterised geometry from Studio — not a viewport capture. No characters, particles or lighting effects.
        </span>}

        {view.consoleErrors > 0 && (
          <p className="gx-playtest__degraded" role="status">
            Check the Output panel in Roblox Studio for error details before publishing.
          </p>
        )}

        <span className="gx-playtest__stats">
          {!terminal && <span className="gx-playtest__action">{view.action}</span>}
          <span
            className={`gx-playtest__count${view.consoleErrors > 0 ? ' is-error' : ''}`}
            title="Errors in the Studio console during this playtest"
          >
            {view.consoleErrors} error{view.consoleErrors === 1 ? '' : 's'}
          </span>
          {view.consoleWarnings > 0 && (
            <span className="gx-playtest__count is-warn" title="Warnings in the Studio console">
              {view.consoleWarnings} warning{view.consoleWarnings === 1 ? '' : 's'}
            </span>
          )}
          {/* Dropped frames are shown rather than hidden: a stuttering stream
              should read as a stuttering stream, not as a slow one. */}
          {view.framesDropped > 0 && (
            <span className="gx-playtest__count" title="Frames requested that did not arrive">
              {view.framesDelivered}/{view.framesDelivered + view.framesDropped} frames
            </span>
          )}
        </span>

        {/* The degraded banner. Present only on a real signal — a stale or dead
            stream, or the bridge having gone away — never as decoration. */}
        {degraded && (
          <p className="gx-playtest__degraded" role="status">
            {!studioConnected
              ? 'Studio disconnected. The picture above is the last frame that arrived before the bridge dropped.'
              : view.freshness === 'dead'
                ? 'Frames have stopped arriving. Studio may be busy, or the place may have stopped responding.'
                : 'Frames are arriving slower than requested — a large scene takes longer to rasterise.'}
          </p>
        )}

        {onOpenStudio && (
          <button type="button" className="gx-btn gx-btn--outline gx-playtest__open" onClick={onOpenStudio}>
            Open in Studio
          </button>
        )}
      </footer>
    </section>
  );
}
