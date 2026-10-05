// The Studio screenshots strip: the last few frames of the run in a turn, for the person only.
//
// Nothing here is saved or sent: the frames are the page's own memory (use-project-socket.ts keeps the newest eight and
// never persists them), the thumbnails are drawn into canvases, and enlarging one opens it in a dialog in the same tab.
//
// WHAT IT NEVER DOES. It never invents a picture: a frame that does not decode cleanly is not drawn (lib/frame-decode.ts), and says
// so. With no frame yet it says plainly that screenshots appear here while StudPilot builds, rather than showing a placeholder
// that could be mistaken for a result.
import { useEffect, useRef, useState } from 'react';
import type { StudioFrame } from '@studpilot/shared';
import { frameImageSrc, paintFrame } from '../../lib/frame-decode';
import { clockTime } from '../../lib/format';
import { SHOTS_EMPTY, SHOTS_KEPT, shotCaption, shotKindLabel } from '../../lib/studio-shots';
import { Modal } from '../modal';
import './studio-shots.css';

/** One frame as a picture: a PNG is an image, raw RGB is painted into a canvas, and a frame that does not decode is a sentence. */
function ShotPicture({ frame, label, className }: { frame: StudioFrame; label: string; className: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(true);
  const src = frameImageSrc(frame);
  useEffect(() => {
    if (src || !canvas.current) return;
    setDrawn(paintFrame(canvas.current, frame));
  }, [frame, src]);
  if (src) return <img className={className} src={src} alt={label} />;
  if (!drawn) return <span className="shots__bad">This screenshot could not be drawn.</span>;
  return <canvas ref={canvas} className={className} role="img" aria-label={label} />;
}

export function StudioShots({ frames }: { frames: readonly StudioFrame[] }) {
  const [open, setOpen] = useState<StudioFrame | null>(null);
  const caption = (frame: StudioFrame) => shotCaption(frame, (at) => clockTime(at));
  const at = open ? frames.indexOf(open) : -1;

  return (
    <section className="shots" aria-label="Studio screenshots from this run">
      {frames.length === 0 ? (
        <p className="shots__empty">{SHOTS_EMPTY}</p>
      ) : (
        <ul className="shots__strip">
          {frames.map((frame, index) => (
            <li key={`${frame.capturedAt}:${index}`} className="shots__item">
              <button
                type="button"
                className="shots__thumb"
                onClick={() => setOpen(frame)}
                aria-label={`Enlarge screenshot ${index + 1} of ${frames.length}: ${caption(frame)}`}
              >
                <ShotPicture frame={frame} label={caption(frame)} className="shots__picture" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <Modal title={shotKindLabel(open)} wide onClose={() => setOpen(null)}>
          <div className="shots__big">
            {/* Keyed by the frame, so moving to another one starts from a clean picture, not from the last one's failure. */}
            <ShotPicture key={`${open.capturedAt}:${at}`} frame={open} label={caption(open)} className="shots__large" />
          </div>
          <p className="shots__caption">
            {caption(open)}
            {at >= 0 && frames.length > 1 ? ` (${at + 1} of ${frames.length})` : ''}
          </p>
          <p className="shots__kept">{SHOTS_KEPT}</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => at > 0 && setOpen(frames[at - 1]!)} disabled={at <= 0}>
              Earlier
            </button>
            <button type="button" className="btn" onClick={() => at >= 0 && at < frames.length - 1 && setOpen(frames[at + 1]!)} disabled={at < 0 || at >= frames.length - 1}>
              Later
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
