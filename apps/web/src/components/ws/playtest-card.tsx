// The inline Playtest viewport.
//
// READ THIS BEFORE CHANGING THE COPY.
//
// Current Studio builds can expose StudioCaptureService. When Roblox grants screenshot
// permission, the plugin uses it to capture the active 3D viewport as a bounded PNG. Older Studio
// builds or sessions without that permission fall back to Apple's own depth-buffered geometry
// renderer. The frame's `source` says which path produced it; the UI must never blur that line.
//
// Neither path is video. frame-bus.ts allows a capture request no more often than every 1.5s, so
// this surface is a sequence of periodic snapshots. The software fallback also omits characters,
// particles, shadows, local lights, post-effects and textures; it is useful evidence, not a claim
// to reproduce the viewport.
//
// THE LINE THAT MUST NOT BE CROSSED: this is periodic stills of computed
// geometry. Calling it "live video", adding a LIVE badge that stays lit when
// frames have stopped, interpolating between frames, or holding a stale frame
// under a current-tense label would all be dressing it up as something it is
// not. Staleness is computed in lib/playtest-view.ts from the worker's own
// timestamps and is rendered here without softening.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlaytestRun, StudioFrame } from '@golem/shared';
import { frameImageSrc, paintFrame } from '../../lib/frame-decode';
import { framesForRun, playtestView, PLAYTEST_TICK_MS } from '../../lib/playtest-view';
import { Icon, PATH } from './primitives';
import { WebPreview, WebPreviewBody, WebPreviewNavigation, WebPreviewNavigationButton, WebPreviewUrl } from '../ai-elements/web-preview';
import { Sandbox, SandboxContent, SandboxHeader, SandboxTabContent, SandboxTabs, SandboxTabsBar, SandboxTabsList, SandboxTabsTrigger } from '../ai-elements/sandbox';
import { Test, TestResults, TestResultsDuration, TestResultsHeader, TestResultsProgress, TestResultsSummary, TestErrorMessage, TestResultsContent } from '../ai-elements/test-results';
import { BackIcon, ExpandIcon, ForwardIcon } from '../picks/tech/icons';
import { playtestChecks, playtestSummary } from '../picks/tech/playtest-checks';
import './playtest-card.css';

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
  // THE PICTURES THIS PLAYTEST SENT, oldest first. Back and forward step through them; `picked` is
  // null while the card follows the newest, so a new picture arriving is shown without a click.
  const mine = useMemo(() => framesForRun(frames, run), [frames, run]);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [run?.id]);
  const at = picked !== null && picked < mine.length - 1 ? picked : mine.length - 1;
  const earlier = at >= 0 && at < mine.length - 1;
  const frame = earlier ? mine[at] : view.frame;
  const canvasRef = useFrameCanvas(frame);
  const imageSrc = frame ? frameImageSrc(frame) : null;
  const direct = frame?.source === 'studio_viewport' && frame?.encoding === 'png';
  const checks = useMemo(() => playtestChecks(run), [run]);

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

      <WebPreview className="gx-playtest__preview">
        <WebPreviewNavigation>
          <WebPreviewNavigationButton tooltip="Earlier picture" disabled={at <= 0} onClick={() => setPicked(Math.max(0, at - 1))}>
            <BackIcon />
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton
            tooltip="Later picture"
            disabled={!earlier}
            onClick={() => setPicked(at + 1 >= mine.length - 1 ? null : at + 1)}
          >
            <ForwardIcon />
          </WebPreviewNavigationButton>
          <WebPreviewUrl
            label="What the camera shows"
            value={frame ? `${frame.subject} · ${frame.view}` : 'No picture yet'}
            hint={mine.length > 1 ? `${at + 1} of ${mine.length}` : undefined}
          />
          <WebPreviewNavigationButton
            tooltip={expanded ? 'Make smaller' : 'Make bigger'}
            pressed={expanded}
            disabled={!frame}
            onClick={() => setExpanded((v) => !v)}
          >
            <ExpandIcon />
          </WebPreviewNavigationButton>
        </WebPreviewNavigation>
        <WebPreviewBody>
      <div className="gx-playtest__stage">
        {frame ? (
          <button
            type="button"
            className="gx-playtest__frame"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse playtest frame' : 'Expand playtest frame'}
          >
            {imageSrc ? (
              <img
                key={`${frame.playtestRunId ?? 'frame'}:${frame.seq ?? frame.capturedAt}`}
                src={imageSrc}
                className="gx-playtest__canvas gx-playtest__image"
                alt="Studio viewport playtest frame"
              />
            ) : (
              <canvas
                key={`${frame.playtestRunId ?? 'frame'}:${frame.seq ?? frame.capturedAt}`}
                ref={canvasRef}
                className="gx-playtest__canvas"
              />
            )}
            {/* An overlay, not a replacement. The pixels underneath are real and
                stay visible; what changes is that the card stops claiming they
                are current. */}
            {/* An earlier picture says so, and by how much, so it is never read as the newest. */}
            {earlier && view.frame && (
              <span className="gx-playtest__veil gx-playtest__veil--earlier">
                Earlier picture · {Math.max(0, Math.round((view.frame.capturedAt - frame.capturedAt) / 1000))}s before the newest
              </span>
            )}
            {!earlier && view.freshness === 'stale' && (
              <span className="gx-playtest__veil gx-playtest__veil--stale">
                {Math.round((view.frameAgeMs ?? 0) / 1000)}s old
              </span>
            )}
            {!earlier && view.freshness === 'dead' && (
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
        </WebPreviewBody>
      </WebPreview>

      <footer className="gx-playtest__foot">
        {frame && <span className="gx-playtest__what">
          {direct
            ? 'Studio viewport capture · up to every 1.5s'
            : 'Software render from Studio · geometry fallback'}
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

      {/* WHAT THE FINISHED PLAYTEST MEASURED, and nothing it did not: see picks/tech/playtest-checks.ts. */}
      {terminal && run && checks.length > 0 && (
        <PlaytestResults run={run} checks={checks} />
      )}
    </section>
  );
}

function PlaytestResults({ run, checks }: { run: PlaytestRun; checks: ReturnType<typeof playtestChecks> }) {
  const summary = playtestSummary(run, checks);
  const data = { ...summary, duration: summary.durationMs ?? undefined };
  return (
    <Sandbox className="gx-playtest__results" defaultOpen={summary.failed > 0}>
      <SandboxHeader title="Playtest results" state={run.phase === 'failed' ? 'error' : 'done'} />
      <SandboxContent>
        <SandboxTabs defaultValue="checks">
          <SandboxTabsBar>
            <SandboxTabsList label="Playtest results">
              <SandboxTabsTrigger value="checks">Checks</SandboxTabsTrigger>
              <SandboxTabsTrigger value="details">Details</SandboxTabsTrigger>
            </SandboxTabsList>
          </SandboxTabsBar>
          <SandboxTabContent value="checks">
            <TestResults>
              <TestResultsHeader>
                <TestResultsSummary summary={data} />
                {data.duration !== undefined && <TestResultsDuration ms={data.duration} />}
              </TestResultsHeader>
              <TestResultsProgress summary={data} />
              <TestResultsContent>
                {checks.map((c) => (
                  <Test key={c.id} name={c.name} status={c.status}>
                    <TestErrorMessage>{c.note}</TestErrorMessage>
                  </Test>
                ))}
              </TestResultsContent>
            </TestResults>
          </SandboxTabContent>
          <SandboxTabContent value="details">
            <dl className="gx-playtest__facts">
              <dt>Asked for</dt><dd>{run.requestedSeconds}s</dd>
              {summary.durationMs !== null && <><dt>Ran for</dt><dd>{clock(summary.durationMs)}</dd></>}
              <dt>Pictures</dt><dd>{run.framesDelivered} arrived, {run.framesDropped} lost</dd>
              <dt>Errors</dt><dd>{run.consoleErrors}</dd>
              <dt>Warnings</dt><dd>{run.consoleWarnings}</dd>
              <dt>Run</dt><dd className="tq-mono">{run.id}</dd>
            </dl>
          </SandboxTabContent>
        </SandboxTabs>
      </SandboxContent>
    </Sandbox>
  );
}
