// Watching Apple work, from the browser.
//
// READ THIS BEFORE CHANGING THE COPY.
//
// Roblox gives plugins no viewport readback. There is no screenshot of the
// user's Studio window and no video stream to subscribe to — neither exists at
// any price. What the plugin CAN do is run its own depth-buffered triangle
// rasteriser in Luau and hand back pixels it computed itself.
//
// So these are diagnostic renders of scene geometry: flat Lambert, one fixed
// sun, no shadows, no PointLights, no post-effects, no characters, no
// particles, 288x180. They arrive when the agent renders — every few seconds
// at best, because each one runs synchronously on Studio's main thread and
// briefly freezes the editor, and crosses the wire as ~207KB of uncompressed
// base64.
//
// The component therefore states what it is showing, timestamps every frame
// and never implies continuity between them. Anything that made this look like
// a live feed — a play button, a seek bar, an fps readout, a "LIVE" badge —
// would be dressing periodic stills up as video, which is the one thing the
// brief rules out.
import { useEffect, useRef, useState } from 'react';
import type { StudioFrame } from '@golem/shared';
import { paintFrame } from '../../lib/frame-decode';
import { Icon, PATH } from './primitives';

/**
 * Paint one frame onto a canvas.
 *
 * The decode moved to lib/frame-decode.ts when the worker gained a second
 * packing (run-length, chosen per frame when it is smaller). Both this card and
 * the Playtest card share that decoder, so a frame can never be readable in one
 * and garbage in the other. A frame that does not decode is not drawn.
 */
function useFrameCanvas(frame: StudioFrame | undefined) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !frame) return;
    paintFrame(canvas, frame);
  }, [frame]);

  return ref;
}

export function StudioView({ frames, running }: { frames: StudioFrame[]; running: boolean }) {
  const [expanded, setExpanded] = useState(false);
  // null means "follow the newest". Stepping back pins an index; stepping
  // forward to the end releases the pin. Starting at a number would be wrong,
  // because the first render happens before any frame has arrived.
  const [pinned, setPinned] = useState<number | null>(null);

  const last = frames.length - 1;
  const index = pinned === null ? last : Math.max(0, Math.min(pinned, last));
  const frame = frames[index];

  // Release the pin once it reaches the end, so new frames resume following.
  useEffect(() => {
    if (pinned !== null && pinned >= last) setPinned(null);
  }, [pinned, last]);
  const canvasRef = useFrameCanvas(frame);

  if (!frames.length) return null;

  const age = frame ? Math.round((Date.now() - frame.capturedAt) / 1000) : 0;

  return (
    <figure className={`gx-stage${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="gx-stage__frame"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'Shrink the render' : 'Enlarge the render'}
      >
        <canvas ref={canvasRef} className="gx-stage__canvas" />
        {running && <span className="gx-stage__working">Working…</span>}
      </button>

      <figcaption className="gx-stage__caption">
        <span className="gx-stage__what">
          <Icon d={PATH.camera} size={13} />
          {/* The honest label. Do not shorten this to "Live view". */}
          Diagnostic render from Studio — geometry only, not a viewport
        </span>
        <span className="gx-stage__meta">
          {frame?.subject} · {frame?.view} · {frame?.width}×{frame?.height} ·{' '}
          {age < 5 ? 'just now' : `${age}s ago`}
        </span>

        {frames.length > 1 && (
          <span className="gx-stage__nav">
            <button
              type="button"
              className="gx-icon-btn"
              onClick={() => setPinned(Math.max(0, index - 1))}
              disabled={index <= 0}
              aria-label="Previous render"
            >
              <Icon d="M15 6l-6 6 6 6" size={14} />
            </button>
            <span className="gx-stage__count">
              {index + 1}/{frames.length}
            </span>
            <button
              type="button"
              className="gx-icon-btn"
              onClick={() => setPinned(Math.min(last, index + 1))}
              disabled={index >= last}
              aria-label="Next render"
            >
              <Icon d={PATH.chevronRight} size={14} />
            </button>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
