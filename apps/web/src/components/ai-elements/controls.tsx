// AI Elements `controls`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) is React Flow's zoom in / zoom out /
// fit view buttons in a small bar. Export name follows upstream; the code is written here, on the
// Canvas's own context. Each button is named, and the zoom buttons stop at the canvas's limits.
//
// Where it is used: the roadmap's Map view (components/roadmap/dependency-map.tsx).
import { useCanvas } from './canvas';
import { FitIcon, MinusIcon, PlusIcon } from '../picks/tech/icons';
import '../picks/tech/tech-ui.css';
import './controls.css';

export const Controls = () => {
  const c = useCanvas();
  return (
    <div className="ai-controls" role="toolbar" aria-label="Zoom" data-canvas-still="">
      <button type="button" className="tq-btn tq-btn--icon tq-btn--bare" aria-label="Zoom in" title="Zoom in" disabled={c.scale >= c.max - 0.001} onClick={c.zoomIn}>
        <PlusIcon />
      </button>
      <button type="button" className="tq-btn tq-btn--icon tq-btn--bare" aria-label="Zoom out" title="Zoom out" disabled={c.scale <= c.min + 0.001} onClick={c.zoomOut}>
        <MinusIcon />
      </button>
      <button type="button" className="tq-btn tq-btn--icon tq-btn--bare" aria-label="Fit it all in view" title="Fit it all in view" onClick={c.fit}>
        <FitIcon />
      </button>
    </div>
  );
};
