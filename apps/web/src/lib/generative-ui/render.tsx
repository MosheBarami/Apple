/**
 * Apple generative UI — renderer.
 *
 * Maps a *validated* document to real React components. Three rules hold
 * everywhere in this file, and the test suite enforces them:
 *
 *   1. No HTML injection API is used. Every AI-authored string is passed as a
 *      React child, so React escapes it. There is no path to markup.
 *   2. No AI-authored object is ever spread into a component's props. Each field
 *      is read explicitly by name.
 *   3. Colour, size and status are chosen from closed enums and resolved to a
 *      CSS class here. A raw colour or CSS value never reaches the DOM.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { downloadProjectAudio, downloadProjectImage, fetchAudioObjectUrl, fetchImageObjectUrl, parseAudioPath, parseImagePath } from '../api';
import { explainFailure } from '../error-taxonomy';
import type {
  AssetPickerBlock,
  Block,
  BuildPlanBlock,
  CalloutBlock,
  CheckpointComparisonBlock,
  CodeDiffBlock,
  ErrorDiagnosisBlock,
  HeadingBlock,
  ImageRef,
  KeyValue,
  KeyValuesBlock,
  ListBlock,
  MetricBlock,
  ProgressBlock,
  PropertyInspectorBlock,
  RenderReviewBlock,
  SceneComparisonBlock,
  Severity,
  TableBlock,
  TestReportBlock,
  TextBlock,
  Tone,
  UIDocument,
  UsageSummaryBlock,
  VisualCritiqueBlock,
} from './schema';
import { validateDocument, type ValidateOptions } from './validate';
import { StatusIcon, type StatusName } from '../../components/status-icon';
import './render.css';

// ---------------------------------------------------------------------------
// Token → class resolution. The ONLY place a token becomes a visual decision.
// ---------------------------------------------------------------------------

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'gu-t-neutral',
  accent: 'gu-t-accent',
  info: 'gu-t-info',
  good: 'gu-t-good',
  warn: 'gu-t-warn',
  bad: 'gu-t-bad',
};

const SEVERITY_TONE: Record<Severity, Tone> = {
  blocking: 'bad',
  major: 'warn',
  minor: 'neutral',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  blocking: 'Blocking',
  major: 'Major',
  minor: 'Minor',
};

function tone(t: Tone | undefined, fallback: Tone = 'neutral'): string {
  return TONE_CLASS[t ?? fallback];
}

const VIEW_LABEL: Record<string, string> = {
  hero: 'Hero',
  front: 'Front',
  side: 'Side',
  top: 'Top-down',
  eye: 'Eye level',
};

/** Thumbnails are narrow; the long name lives in the readout and the tooltip. */
const VIEW_SHORT: Record<string, string> = {
  hero: 'Hero',
  front: 'Front',
  side: 'Side',
  top: 'Top',
  eye: 'Eye',
};

const VIEW_HINT: Record<string, string> = {
  hero: 'Establishing three-quarter shot',
  front: 'Straight-on elevation',
  side: 'Profile elevation',
  top: 'Reads layout and negative space',
  eye: 'What a player standing there sees',
};

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function Pct({ value }: { value: number }) {
  return <>{`${Math.round(value * 100)}%`}</>;
}

function Millis({ value }: { value: number }) {
  if (value < 1000) return <>{`${Math.round(value)}ms`}</>;
  if (value < 60_000) return <>{`${(value / 1000).toFixed(1)}s`}</>;
  return <>{`${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`}</>;
}

function Bytes({ value }: { value: number }) {
  if (value < 1024) return <>{`${value} B`}</>;
  if (value < 1024 * 1024) return <>{`${(value / 1024).toFixed(1)} KB`}</>;
  return <>{`${(value / (1024 * 1024)).toFixed(1)} MB`}</>;
}

/**
 * A validated image source — either an inline data URL or our own image route — with an honest
 * failure. Width and height are numbers, never CSS strings.
 *
 * AN IMAGE THAT DOES NOT LOAD MUST SAY SO. Generated images are kept in KV for an hour, while the
 * panel that displays one lives in the conversation for as long as the conversation does. So a
 * user scrolling back to yesterday's work is the NORMAL case for this branch, not an edge case:
 * without it they get the browser's broken-image glyph, which says nothing, looks like a bug in the
 * product, and gives them no way to tell "this expired" from "this never worked".
 *
 * The alt text is shown rather than discarded — it describes what the picture was, which is the
 * only thing still true about it.
 */
type ImageLoadState = 'loading' | 'ready' | 'failed';

function SafeImage({ image, className, onAvailabilityChange }: {
  image: ImageRef; className?: string;
  onAvailabilityChange?: (src: string, state: ImageLoadState) => void;
}) {
  const internal = parseImagePath(image.src);
  // Anything not one of our own image paths renders directly — there is nothing to authenticate to.
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(internal ? 'loading' : 'ready');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  useEffect(() => {
    onAvailabilityChange?.(image.src, state);
  }, [image.src, state, onAvailabilityChange]);

  useEffect(() => {
    if (!internal) return;
    let cancelled = false;
    let created: string | null = null;
    setState('loading');
    fetchImageObjectUrl(internal.projectId, internal.imageId)
      .then((url) => {
        created = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setObjectUrl(url);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFailure(err);
        setState('failed');
      });
    return () => {
      cancelled = true;
      // The blob is held for the life of the document otherwise, and a conversation scrolls through
      // a lot of these.
      if (created) URL.revokeObjectURL(created);
    };
  }, [image.src]);

  if (state === 'loading') {
    // NOT the expiry message. This is the third state the first version of this did not have: it
    // had "shown" and "gone", so every image was briefly reported as gone while it was loading.
    return (
      <span className={`gu-img-loading${className ? ` ${className}` : ''}`} role="img" aria-label={`Loading: ${image.alt}`} aria-busy="true">
        <span className="gu-img-loading__alt">{image.alt}</span>
      </span>
    );
  }

  if (state === 'failed') {
    // WHY IT FAILED DECIDES WHAT TO SAY. A 404 is missing/expired/deleted. A 401 is a session that timed out,
    // and telling that user their image expired sends them looking for the wrong problem — the
    // image is fine and they need to sign in. explainFailure already draws that line.
    const e = explainFailure(failure);
    return (
      <span className={`gu-img-gone${className ? ` ${className}` : ''}`} role="img" aria-label={`Unavailable: ${image.alt}`}>
        <span className="gu-img-gone__alt">{image.alt}</span>
        <span className="gu-img-gone__why">
          {e.kind === 'missing'
            ? 'This image is unavailable. Older temporary previews may have expired.'
            : `${e.title}. ${e.safety}`}
        </span>
      </span>
    );
  }

  return (
    <img
      className={className}
      src={objectUrl ?? image.src}
      alt={image.alt}
      width={image.width}
      height={image.height}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setState('failed')}
    />
  );
}

function KeyValueRow({ item }: { item: KeyValue }) {
  return (
    <div className="gu-kv-row">
      <dt>{item.key}</dt>
      <dd className={tone(item.tone)}>{item.value}</dd>
    </div>
  );
}

function ScoreDial({ score, passed }: { score: number | null | undefined; passed?: boolean }) {
  const known = typeof score === 'number';
  const frac = known ? Math.max(0, Math.min(1, score / 10)) : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  const state = !known ? 'unknown' : passed ? 'pass' : score >= 5 ? 'mid' : 'low';
  return (
    <div className={`gu-dial gu-dial--${state}`}>
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="gu-dial-track" />
        {/* No arc at all when the score is unknown — a round-capped zero-length
            dash draws a dot, which reads as "scored nearly zero". */}
        {known && (
          <circle
            cx="32"
            cy="32"
            r={r}
            className="gu-dial-arc"
            strokeDasharray={`${c * frac} ${c}`}
            transform="rotate(-90 32 32)"
          />
        )}
      </svg>
      <span className="gu-dial-value numeral">{known ? score.toFixed(1) : '—'}</span>
      <span className="gu-dial-scale">/10</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitive blocks
// ---------------------------------------------------------------------------

function HeadingView({ block }: { block: HeadingBlock }) {
  const level = block.level ?? 3;
  if (level === 2) return <h2 className="gu-heading gu-heading--2">{block.text}</h2>;
  if (level === 4) return <h4 className="gu-heading gu-heading--4">{block.text}</h4>;
  return <h3 className="gu-heading gu-heading--3">{block.text}</h3>;
}

function TextView({ block }: { block: TextBlock }) {
  return <p className={`gu-text ${tone(block.tone)}`}>{block.text}</p>;
}

function ListView({ block }: { block: ListBlock }) {
  const items = block.items.map((item, i) => <li key={i}>{item}</li>);
  return block.ordered ? <ol className="gu-list">{items}</ol> : <ul className="gu-list">{items}</ul>;
}

function TableView({ block }: { block: TableBlock }) {
  return (
    <figure className="gu-table-figure">
      <div className="gu-scroll-x">
        <table className="gu-table">
          <thead>
            <tr>
              {block.columns.map((col, i) => (
                <th key={i} scope="col">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.caption && <figcaption className="gu-caption">{block.caption}</figcaption>}
    </figure>
  );
}

function CalloutView({ block }: { block: CalloutBlock }) {
  return (
    <aside className={`gu-callout ${tone(block.tone)}`}>
      {block.title && <p className="gu-callout-title">{block.title}</p>}
      <p className="gu-callout-text">{block.text}</p>
      {block.link && (
        <a className="gu-link" href={block.link.href} target="_blank" rel="noopener noreferrer">
          {block.link.label}
          <span aria-hidden="true"> ↗</span>
        </a>
      )}
    </aside>
  );
}

function MetricView({ block }: { block: MetricBlock }) {
  return (
    <div className={`gu-metric ${tone(block.tone)}`}>
      <span className="gu-metric-label">{block.label}</span>
      <span className="gu-metric-value numeral">
        {block.value}
        {block.unit && <span className="gu-metric-unit">{block.unit}</span>}
      </span>
      {block.delta && <span className="gu-metric-delta">{block.delta}</span>}
      {block.hint && <span className="gu-metric-hint">{block.hint}</span>}
    </div>
  );
}

function KeyValuesView({ block }: { block: KeyValuesBlock }) {
  return (
    <section className="gu-kv">
      {block.title && <h3 className="gu-panel-title">{block.title}</h3>}
      <dl className="gu-kv-list">
        {block.items.map((item, i) => (
          <KeyValueRow key={i} item={item} />
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// code_diff
// ---------------------------------------------------------------------------

const DIFF_SIGIL: Record<string, string> = { add: '+', del: '−', ctx: ' ' };

function CodeDiffView({ block }: { block: CodeDiffBlock }) {
  const counts = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const hunk of block.hunks) {
      for (const line of hunk.lines) {
        if (line.kind === 'add') added++;
        else if (line.kind === 'del') removed++;
      }
    }
    return { added, removed };
  }, [block.hunks]);

  return (
    <section className="gu-panel gu-diff">
      <header className="gu-panel-head">
        <span className="gu-path" title={block.path}>
          {block.path}
        </span>
        <span className="gu-diff-counts">
          <span className="gu-diff-added">+{counts.added}</span>
          <span className="gu-diff-removed">−{counts.removed}</span>
          {block.language && <span className="gu-chip">{block.language}</span>}
        </span>
      </header>
      {block.summary && <p className="gu-panel-sub">{block.summary}</p>}
      <div className="gu-scroll-x">
        <div className="gu-diff-body">
          {block.hunks.map((hunk, hi) => (
            <div key={hi} className="gu-diff-hunk">
              {hunk.header && <div className="gu-diff-hunk-head">{hunk.header}</div>}
              {hunk.lines.map((line, li) => (
                <div key={li} className={`gu-diff-line gu-diff-line--${line.kind}`}>
                  <span className="gu-diff-gutter">{line.n ?? ''}</span>
                  <span className="gu-diff-sigil" aria-hidden="true">
                    {DIFF_SIGIL[line.kind]}
                  </span>
                  <code>{line.text}</code>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// scene_comparison — before/after wipe
// ---------------------------------------------------------------------------

function SceneComparisonView({ block }: { block: SceneComparisonBlock }) {
  const [split, setSplit] = useState(50);
  const [mode, setMode] = useState<'wipe' | 'side'>('wipe');
  const sliderId = useId();
  const bothImages = Boolean(block.before.image && block.after.image);

  return (
    <section className="gu-panel gu-compare">
      <header className="gu-panel-head">
        <div className="gu-render-id">
          <h3 className="gu-panel-title">Before and after</h3>
          {block.title && (
            <span className="gu-path" title={block.title}>
              {block.title}
            </span>
          )}
        </div>
        {bothImages && (
          <div className="segmented gu-seg" role="tablist" aria-label="Comparison mode">
            <button type="button" role="tab" aria-selected={mode === 'wipe'} onClick={() => setMode('wipe')}>
              Wipe
            </button>
            <button type="button" role="tab" aria-selected={mode === 'side'} onClick={() => setMode('side')}>
              Side by side
            </button>
          </div>
        )}
      </header>

      {bothImages && mode === 'wipe' ? (
        <div className="gu-wipe">
          <div className="gu-wipe-stage">
            {block.before.image && <SafeImage image={block.before.image} className="gu-wipe-img" />}
            <div className="gu-wipe-top" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              {block.after.image && <SafeImage image={block.after.image} className="gu-wipe-img" />}
            </div>
            <div className="gu-wipe-seam" style={{ left: `${split}%` }} aria-hidden="true" />
            <span className="gu-wipe-tag gu-wipe-tag--l">{block.before.label}</span>
            <span className="gu-wipe-tag gu-wipe-tag--r">{block.after.label}</span>
          </div>
          <label className="gu-wipe-control" htmlFor={sliderId}>
            <span className="visually-hidden">Comparison position</span>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
            />
          </label>
        </div>
      ) : (
        <div className="gu-compare-grid">
          {[block.before, block.after].map((scene, i) => (
            <figure key={i} className="gu-compare-cell">
              {scene.image ? (
                <SafeImage image={scene.image} className="gu-compare-img" />
              ) : (
                <div className="gu-noimg">No render</div>
              )}
              <figcaption>
                <span className="gu-chip">{i === 0 ? 'Before' : 'After'}</span> {scene.label}
              </figcaption>
              {scene.stats && scene.stats.length > 0 && (
                <dl className="gu-kv-list gu-kv-list--tight">
                  {scene.stats.map((s, j) => (
                    <KeyValueRow key={j} item={s} />
                  ))}
                </dl>
              )}
            </figure>
          ))}
        </div>
      )}
      {block.note && <p className="gu-panel-sub">{block.note}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// render_review — the multi-view render viewer
// ---------------------------------------------------------------------------

function RenderReviewView({ block }: { block: RenderReviewBlock }) {
  const [active, setActive] = useState(0);
  const view = block.views[Math.min(active, block.views.length - 1)];
  const hasScore = block.score !== undefined;

  return (
    <section className="gu-panel gu-render">
      <header className="gu-panel-head">
        <div className="gu-render-id">
          <h3 className="gu-panel-title">Render</h3>
          <span className="gu-path" title={block.subject}>
            {block.subject}
          </span>
        </div>
        {hasScore && (
          <div className="gu-render-verdict">
            <ScoreDial score={block.score} passed={block.passed} />
            <span className={`gu-verdict ${block.unavailable ? 'gu-t-neutral' : block.passed ? 'gu-t-good' : 'gu-t-warn'}`}>
              {block.unavailable ? 'Not judged' : block.passed ? 'Passed' : 'Needs work'}
            </span>
          </div>
        )}
      </header>

      {block.summary && <p className="gu-panel-sub">{block.summary}</p>}

      <div className="gu-render-stage">
        {view?.image ? (
          <SafeImage image={view.image} className="gu-render-large" />
        ) : (
          <div className="gu-noimg gu-render-large">Image not retained</div>
        )}
        {view && (
          <div className="gu-render-readout">
            <span className="gu-chip gu-chip--accent">{VIEW_LABEL[view.name] ?? view.name}</span>
            <span className="gu-render-hint">{VIEW_HINT[view.name]}</span>
          </div>
        )}
      </div>

      {block.views.length > 1 && (
        <div className="gu-render-thumbs" role="tablist" aria-label="Camera views">
          {block.views.map((v, i) => (
            <button
              key={v.name}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`gu-thumb${i === active ? ' is-active' : ''}`}
              onClick={() => setActive(i)}
              title={`${VIEW_LABEL[v.name] ?? v.name} — ${VIEW_HINT[v.name] ?? ''}`}
            >
              {v.image ? <SafeImage image={v.image} className="gu-thumb-img" /> : <span className="gu-thumb-blank" />}
              <span className="gu-thumb-name">{VIEW_SHORT[v.name] ?? v.name}</span>
            </button>
          ))}
        </div>
      )}

      {view && (
        <dl className="gu-render-metrics">
          {view.coverage !== undefined && (
            <div className="gu-kv-row">
              <dt>Subject coverage</dt>
              <dd className={view.coverage < 0.04 ? 'gu-t-bad' : ''}>
                <Pct value={view.coverage} />
              </dd>
            </div>
          )}
          {view.partsVisible !== undefined && (
            <div className="gu-kv-row">
              <dt>Parts visible</dt>
              <dd>{view.partsVisible}</dd>
            </div>
          )}
          {view.partsOffCamera !== undefined && (
            <div className="gu-kv-row">
              <dt>Off camera</dt>
              <dd className={view.partsOffCamera > 0 ? 'gu-t-warn' : ''}>{view.partsOffCamera}</dd>
            </div>
          )}
          {view.distinctColours !== undefined && (
            <div className="gu-kv-row">
              <dt>Distinct colours</dt>
              <dd>{view.distinctColours}</dd>
            </div>
          )}
        </dl>
      )}

      {block.lighting && block.lighting.length > 0 && (
        <details className="gu-details">
          <summary>
            Lighting configuration
            <span className="gu-panel-sub gu-inline-note">judged from settings, not from pixels</span>
          </summary>
          <dl className="gu-kv-list gu-kv-list--tight">
            {block.lighting.map((item, i) => (
              <KeyValueRow key={i} item={item} />
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// visual_critique
// ---------------------------------------------------------------------------

function VisualCritiqueView({ block }: { block: VisualCritiqueBlock }) {
  const blocking = block.defects.filter((d) => d.severity === 'blocking').length;
  const major = block.defects.filter((d) => d.severity === 'major').length;

  return (
    <section className="gu-panel gu-critique">
      <header className="gu-panel-head">
        <div className="gu-render-verdict">
          <ScoreDial score={block.score} passed={block.passed} />
          <div>
            <h3 className="gu-panel-title">Visual quality gate</h3>
            <span
              className={`gu-verdict ${block.unavailable ? 'gu-t-neutral' : block.passed ? 'gu-t-good' : 'gu-t-warn'}`}
            >
              {block.unavailable ? 'Verdict unavailable' : block.passed ? 'Passed' : 'Did not pass'}
            </span>
          </div>
        </div>
        <div className="gu-critique-counts">
          {blocking > 0 && <span className="gu-chip gu-t-bad">{blocking} blocking</span>}
          {major > 0 && <span className="gu-chip gu-t-warn">{major} major</span>}
          <span className="gu-chip">{block.defects.length} total</span>
        </div>
      </header>

      <p className="gu-panel-sub">{block.summary}</p>

      {block.unavailable && (
        <aside className="gu-callout gu-t-neutral">
          <p className="gu-callout-text">
            The critique could not be read back. That is a tooling fault, not a verdict on the scene — the score is
            deliberately left blank rather than scored zero.
          </p>
        </aside>
      )}

      {block.hardFails && block.hardFails.length > 0 && (
        <div className="gu-hardfails">
          <h4 className="gu-subhead">Hard fails · measured, not opinion</h4>
          <ul className="gu-list gu-list--fail">
            {block.hardFails.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {block.defects.length > 0 && (
        <ol className="gu-defects">
          {block.defects.map((d, i) => (
            <li key={i} className={`gu-defect gu-defect--${d.severity}`}>
              <div className="gu-defect-head">
                <span className={`gu-sev ${tone(SEVERITY_TONE[d.severity])}`}>{SEVERITY_LABEL[d.severity]}</span>
                <span className="gu-chip">{d.dimension}</span>
                <span className="gu-chip gu-chip--quiet">seen in {VIEW_LABEL[d.view] ?? d.view}</span>
              </div>
              <p className="gu-defect-observed">{d.observed}</p>
              <p className="gu-defect-fix">
                <span className="gu-defect-fix-label">Fix</span>
                {d.fix}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// property_inspector
// ---------------------------------------------------------------------------

function PropertyInspectorView({ block }: { block: PropertyInspectorBlock }) {
  return (
    <section className="gu-panel gu-props">
      <header className="gu-panel-head">
        <span className="gu-path" title={block.path}>
          {block.path}
        </span>
        {block.className && <span className="gu-chip gu-chip--accent">{block.className}</span>}
      </header>
      {block.groups.map((group, gi) => (
        <div key={gi} className="gu-prop-group">
          <h4 className="gu-subhead">{group.name}</h4>
          <dl className="gu-prop-rows">
            {group.rows.map((row, ri) => (
              <div key={ri} className={`gu-prop-row${row.changed ? ' is-changed' : ''}`}>
                <dt>{row.name}</dt>
                <dd>
                  {row.changed && row.previous !== undefined && (
                    <span className="gu-prop-prev">
                      <s>{row.previous}</s>
                      <span aria-hidden="true"> → </span>
                    </span>
                  )}
                  <span className="gu-prop-value">{row.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// test_report
// ---------------------------------------------------------------------------

/** Test-case marks. Were `✓ ✗ –` as literal characters, which render in whatever the
 *  font decides and are read aloud as "check mark" beside the text they duplicate. */
const CASE_STATUS: Record<string, StatusName> = { pass: 'success', fail: 'error', skip: 'skipped' };

function TestReportView({ block }: { block: TestReportBlock }) {
  const total = block.passed + block.failed + (block.skipped ?? 0);
  const passPct = total > 0 ? block.passed / total : 0;
  const failPct = total > 0 ? block.failed / total : 0;
  return (
    <section className="gu-panel gu-tests">
      <header className="gu-panel-head">
        <h3 className="gu-panel-title">{block.title ?? 'Test run'}</h3>
        <span className="gu-tests-counts">
          <span className="gu-t-good">{block.passed} passed</span>
          {block.failed > 0 && <span className="gu-t-bad">{block.failed} failed</span>}
          {block.skipped ? <span className="gu-t-neutral">{block.skipped} skipped</span> : null}
          {block.durationMs !== undefined && (
            <span className="gu-chip">
              <Millis value={block.durationMs} />
            </span>
          )}
        </span>
      </header>
      <div
        className="gu-tests-bar"
        role="img"
        aria-label={`${block.passed} of ${total} tests passed`}
      >
        <span className="gu-tests-seg gu-tests-seg--pass" style={{ width: `${passPct * 100}%` }} />
        <span className="gu-tests-seg gu-tests-seg--fail" style={{ width: `${failPct * 100}%` }} />
      </div>
      <ul className="gu-case-list">
        {block.cases.map((c, i) => (
          <li key={i} className={`gu-case gu-case--${c.status}`}>
            <span className="gu-case-mark">
              <StatusIcon status={CASE_STATUS[c.status] ?? 'skipped'} size={12} />
            </span>
            <span className="gu-case-name">{c.name}</span>
            {c.durationMs !== undefined && (
              <span className="gu-case-time">
                <Millis value={c.durationMs} />
              </span>
            )}
            {c.message && <p className="gu-case-msg">{c.message}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// asset_picker
// ---------------------------------------------------------------------------

/**
 * A GENERATED SOUND, PLAYED RATHER THAN LINKED TO.
 *
 * `generate_sound` hands back an asset whose link is `/api/projects/<id>/audio/<id>` labelled
 * "Listen", and this panel drew it as `<a href target="_blank">`. Every /api/* path requires a
 * Bearer JWT, an anchor sends no headers, so the click opened a tab containing an unauthorized
 * error — for a sound that existed, was seconds old, and played perfectly if you had a token.
 *
 * That is SafeImage's defect one media type later, and it gets SafeImage's answer: fetch the bytes
 * with the token, give the element an object URL, revoke it on unmount. Three states rather than
 * two for the same reason — "still loading" reported as "gone" is the failure that hid the image
 * bug for a release.
 *
 * The DOWNLOAD is a button, not an anchor, for the identical reason: `?download=1` on the same
 * authenticated route. The worker names the file from the id and the type it actually served.
 */
function SafeAudio({ projectId, audioId, label }: { projectId: string; audioId: string; label: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setState('loading');
    fetchAudioObjectUrl(projectId, audioId)
      .then((url) => {
        created = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setObjectUrl(url);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFailure(err);
        setState('failed');
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [projectId, audioId]);

  if (state === 'loading') {
    return (
      <span className="gu-audio-loading" aria-busy="true">
        Loading sound…
      </span>
    );
  }

  if (state === 'failed') {
    // A 404 really is expiry — generated sound is kept for an hour. A 401 is a session that timed
    // out, and telling that user their sound expired sends them to the wrong problem.
    const e = explainFailure(failure);
    return (
      <span className="gu-audio-gone">
        {e.kind === 'missing' ? 'No longer available — generated sound is kept for an hour.' : `${e.title}. ${e.safety}`}
      </span>
    );
  }

  return (
    <div className="gu-audio">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a generated sound effect has no
          transcript to caption; the asset's own name is the label, announced below. */}
      <audio className="gu-audio__player" controls src={objectUrl ?? undefined} aria-label={label} preload="metadata" />
      <button
        type="button"
        className="gu-audio__save"
        onClick={() => {
          setSaveError(null);
          void downloadProjectAudio(projectId, audioId).catch(() => setSaveError('Could not save that sound.'));
        }}
      >
        Download
      </button>
      {saveError && <span className="gu-audio-gone">{saveError}</span>}
    </div>
  );
}

function SaveImage({ projectId, imageId, availability }: { projectId: string; imageId: string; availability: ImageLoadState }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  if (availability === 'failed' || unavailable) return <span className="gu-image-save__note" role="status">Download unavailable.</span>;
  return <div className="gu-image-save">
    <button type="button" disabled={saving || availability !== 'ready'} onClick={() => {
      if (availability !== 'ready') return;
      setSaving(true);
      setError(null);
      void downloadProjectImage(projectId, imageId).catch((failure: unknown) => {
        const reason = explainFailure(failure);
        if (reason.kind === 'missing') setUnavailable(true);
        setError(reason.kind === 'missing' ? 'This image is no longer available.' : reason.title);
      }).finally(() => setSaving(false));
    }}>{saving ? 'Saving…' : 'Save image'}</button>
    <span className="gu-image-save__note">{availability === 'loading' ? 'Loading image…' : 'Download a copy to keep outside this project.'}</span>
    {error && <span role="alert">{error}</span>}
  </div>;
}

function AssetPickerView({ block }: { block: AssetPickerBlock }) {
  const [imageStates, setImageStates] = useState<Record<string, ImageLoadState>>({});
  const recordImageState = useCallback((src: string, state: ImageLoadState) => {
    setImageStates(previous => previous[src] === state ? previous : { ...previous, [src]: state });
  }, []);
  const single = block.assets.length === 1 ? block.assets[0] : undefined;
  const generated = single?.kind === 'image' && single.thumbnail ? parseImagePath(single.thumbnail.src) : null;
  if (single?.thumbnail && generated) {
    return <figure className="gu-generated-image" aria-label="Generated image">
      <SafeImage key={single.thumbnail.src} image={single.thumbnail} className="gu-generated-image__pixels" onAvailabilityChange={recordImageState} />
      <figcaption><SaveImage key={generated.imageId} projectId={generated.projectId} imageId={generated.imageId} availability={imageStates[single.thumbnail.src] ?? 'loading'} /></figcaption>
    </figure>;
  }
  return (
    <section className="gu-panel gu-assets">
      <header className="gu-panel-head">
        <h3 className="gu-panel-title">{block.title ?? 'Assets'}</h3>
        <span className="gu-chip">{block.assets.length} found</span>
      </header>
      <ul className="gu-asset-grid">
        {block.assets.map((asset) => (
          <li key={asset.id} className="gu-asset">
            <div className="gu-asset-thumb">
              {asset.thumbnail ? (
                <SafeImage key={asset.thumbnail.src} image={asset.thumbnail} className="gu-asset-img" onAvailabilityChange={recordImageState} />
              ) : (
                <span className="gu-asset-kind">{asset.kind}</span>
              )}
            </div>
            <div className="gu-asset-body">
              <span className="gu-asset-name" title={asset.name}>
                {asset.name}
              </span>
              <span className="gu-asset-meta">
                <span className="gu-chip gu-chip--quiet">{asset.kind}</span>
                <span className="gu-mono">#{asset.id}</span>
              </span>
              {asset.creator && <span className="gu-asset-creator">by {asset.creator}</span>}
              {asset.note && <span className="gu-asset-note">{asset.note}</span>}
              {(() => {
                const image = asset.kind === 'image' && asset.thumbnail ? parseImagePath(asset.thumbnail.src) : null;
                return image ? <SaveImage key={image.imageId} projectId={image.projectId} imageId={image.imageId} availability={imageStates[asset.thumbnail!.src] ?? 'loading'} /> : null;
              })()}
              {/* One of ours gets a player; anything else stays the link it was, because an asset
                  link may legitimately point at a catalogue page this app cannot fetch. */}
              {(() => {
                const ours = asset.kind === 'sound' && asset.link ? parseAudioPath(asset.link.href) : null;
                if (ours) return <SafeAudio projectId={ours.projectId} audioId={ours.audioId} label={asset.name} />;
                return (
                  asset.link && (
                    <a className="gu-link" href={asset.link.href} target="_blank" rel="noopener noreferrer">
                      {asset.link.label}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  )
                );
              })()}
            </div>
          </li>
        ))}
      </ul>
      {block.actionLabel && <p className="gu-panel-sub">{block.actionLabel}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// build_plan
// ---------------------------------------------------------------------------

/** Build-plan step marks. `done` and `blocked` were a Unicode tick and an exclamation
 *  mark; the rest fall through to the step NUMBER, which is the useful thing to show
 *  for a step that has not run. */
const STEP_STATUS: Record<string, StatusName | undefined> = {
  done: 'success',
  blocked: 'warning',
};

function BuildPlanView({ block }: { block: BuildPlanBlock }) {
  const done = block.steps.filter((s) => s.status === 'done').length;
  return (
    <section className="gu-panel gu-plan">
      <header className="gu-panel-head">
        <h3 className="gu-panel-title">{block.title ?? 'Build plan'}</h3>
        <span className="gu-chip">
          {done}/{block.steps.length} done
        </span>
      </header>
      <ol className="gu-steps">
        {block.steps.map((step, i) => (
          <li key={i} className={`gu-step gu-step--${step.status}`}>
            <span className="gu-step-node" aria-hidden="true">
              {STEP_STATUS[step.status]
                ? <StatusIcon status={STEP_STATUS[step.status]!} size={12} />
                : i + 1}
            </span>
            <div className="gu-step-body">
              <span className="gu-step-title">{step.title}</span>
              {step.detail && <span className="gu-step-detail">{step.detail}</span>}
              <span className="gu-step-meta">
                {step.tool && <span className="gu-mono">{step.tool}</span>}
                {step.durationMs !== undefined && (
                  <span className="gu-step-time">
                    <Millis value={step.durationMs} />
                  </span>
                )}
                <span className="visually-hidden">{step.status}</span>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// error_diagnosis
// ---------------------------------------------------------------------------

function ErrorDiagnosisView({ block }: { block: ErrorDiagnosisBlock }) {
  return (
    <section className={`gu-panel gu-error gu-error--${block.severity}`}>
      <header className="gu-panel-head">
        <div>
          <span className={`gu-sev ${tone(SEVERITY_TONE[block.severity])}`}>{SEVERITY_LABEL[block.severity]}</span>
          <h3 className="gu-panel-title">{block.title}</h3>
        </div>
        {block.location && (
          <span className="gu-path" title={block.location}>
            {block.location}
          </span>
        )}
      </header>
      <pre className="gu-error-msg">
        <code>{block.message}</code>
      </pre>
      {block.cause && (
        <p className="gu-panel-sub">
          <span className="gu-inline-label">Why</span>
          {block.cause}
        </p>
      )}
      {block.excerpt && block.excerpt.length > 0 && (
        <div className="gu-scroll-x">
          <div className="gu-excerpt">
            {block.excerpt.map((line, i) => (
              <div key={i} className={`gu-excerpt-line${line.marked ? ' is-marked' : ''}`}>
                <span className="gu-diff-gutter">{line.n ?? ''}</span>
                <code>{line.text}</code>
              </div>
            ))}
          </div>
        </div>
      )}
      {block.fixes && block.fixes.length > 0 && (
        <div className="gu-fixes">
          <h4 className="gu-subhead">Suggested fixes</h4>
          <ol className="gu-fix-list">
            {block.fixes.map((fix, i) => (
              <li key={i}>
                <span className="gu-fix-title">{fix.title}</span>
                {fix.detail && <span className="gu-fix-detail">{fix.detail}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// checkpoint_comparison
// ---------------------------------------------------------------------------

const CHANGE_MARK: Record<string, string> = { added: '+', removed: '−', changed: '~' };

function CheckpointComparisonView({ block }: { block: CheckpointComparisonBlock }) {
  const sides = [block.left, block.right];
  return (
    <section className="gu-panel gu-cp">
      <header className="gu-panel-head">
        <h3 className="gu-panel-title">Checkpoint comparison</h3>
        {block.changes && <span className="gu-chip">{block.changes.length} changes</span>}
      </header>
      <div className="gu-cp-grid">
        {sides.map((side, i) => (
          <div key={i} className="gu-cp-side">
            <span className="gu-chip gu-chip--quiet">{i === 0 ? 'From' : 'To'}</span>
            <span className="gu-cp-label">{side.label}</span>
            {side.when && <span className="gu-cp-when">{side.when}</span>}
            <dl className="gu-kv-list gu-kv-list--tight">
              {side.scriptCount !== undefined && (
                <div className="gu-kv-row">
                  <dt>Scripts</dt>
                  <dd>{side.scriptCount}</dd>
                </div>
              )}
              {side.instanceCount !== undefined && (
                <div className="gu-kv-row">
                  <dt>Instances</dt>
                  <dd>{side.instanceCount}</dd>
                </div>
              )}
              {side.sizeBytes !== undefined && (
                <div className="gu-kv-row">
                  <dt>Size</dt>
                  <dd>
                    <Bytes value={side.sizeBytes} />
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
      {block.changes && block.changes.length > 0 && (
        <ul className="gu-change-list">
          {block.changes.map((change, i) => (
            <li key={i} className={`gu-change gu-change--${change.kind}`}>
              <span className="gu-change-mark" aria-hidden="true">
                {CHANGE_MARK[change.kind]}
              </span>
              <span className="gu-change-path">{change.path}</span>
              {change.note && <span className="gu-change-note">{change.note}</span>}
              <span className="visually-hidden">{change.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// progress
// ---------------------------------------------------------------------------

function ProgressView({ block }: { block: ProgressBlock }) {
  const max = block.max ?? 100;
  const pct = max > 0 ? Math.max(0, Math.min(1, block.value / max)) : 0;
  return (
    <div className={`gu-progress ${tone(block.tone, 'accent')}`}>
      <div className="gu-progress-head">
        <span className="gu-progress-label">{block.label}</span>
        <span className="gu-progress-value numeral">
          {block.indeterminate ? '…' : `${block.value}${block.unit ?? ''}`}
          {!block.indeterminate && block.max !== undefined && (
            <span className="gu-progress-max"> / {block.max}{block.unit ?? ''}</span>
          )}
        </span>
      </div>
      <div
        className={`gu-meter${block.indeterminate ? ' is-indeterminate' : ''}`}
        role="progressbar"
        aria-label={block.label}
        aria-valuenow={block.indeterminate ? undefined : block.value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <span className="gu-meter-fill" style={block.indeterminate ? undefined : { width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// usage_summary
// ---------------------------------------------------------------------------

function UsageSummaryView({ block }: { block: UsageSummaryBlock }) {
  const frac = block.dailyLimit > 0 ? Math.max(0, Math.min(1, block.remaining / block.dailyLimit)) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const series = block.series ?? [];
  const peak = Math.max(1, ...series.map((s) => s.value));

  return (
    <section className="gu-panel gu-usage">
      <header className="gu-panel-head">
        <h3 className="gu-panel-title">{block.title ?? 'Credits'}</h3>
        {block.plan && <span className="gu-chip gu-chip--accent">{block.plan} plan</span>}
      </header>
      <div className="gu-usage-body">
        <div className="gu-usage-ring">
          <svg viewBox="0 0 84 84" width="84" height="84" role="img" aria-label={`${block.remaining} of ${block.dailyLimit} Credits remaining`}>
            <circle cx="42" cy="42" r={r} className="gu-dial-track" />
            <circle
              cx="42"
              cy="42"
              r={r}
              className="gu-dial-arc"
              strokeDasharray={`${c * frac} ${c}`}
              transform="rotate(-90 42 42)"
            />
          </svg>
          <span className="gu-usage-remaining numeral">{block.remaining}</span>
        </div>
        <dl className="gu-kv-list gu-kv-list--tight gu-usage-facts">
          <div className="gu-kv-row">
            <dt>Daily allowance</dt>
            <dd>{block.dailyLimit}</dd>
          </div>
          <div className="gu-kv-row">
            <dt>Spent today</dt>
            <dd>{block.usedToday}</dd>
          </div>
          {block.resetsIn && (
            <div className="gu-kv-row">
              <dt>Resets in</dt>
              <dd>{block.resetsIn}</dd>
            </div>
          )}
        </dl>
      </div>
      {series.length > 0 && (
        <div className="gu-credit-row" role="img" aria-label="Credits spent per day">
          {series.map((point) => (
            <span
              key={point.day}
              className={`gu-credit-bar${point.value > 0 ? ' is-active' : ''}`}
              style={{ height: `${Math.max(6, (point.value / peak) * 100)}%` }}
              title={`${point.day}: ${point.value}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading':
      return <HeadingView block={block} />;
    case 'text':
      return <TextView block={block} />;
    case 'list':
      return <ListView block={block} />;
    case 'table':
      return <TableView block={block} />;
    case 'callout':
      return <CalloutView block={block} />;
    case 'metric':
      return <MetricView block={block} />;
    case 'key_values':
      return <KeyValuesView block={block} />;
    case 'code_diff':
      return <CodeDiffView block={block} />;
    case 'scene_comparison':
      return <SceneComparisonView block={block} />;
    case 'render_review':
      return <RenderReviewView block={block} />;
    case 'visual_critique':
      return <VisualCritiqueView block={block} />;
    case 'property_inspector':
      return <PropertyInspectorView block={block} />;
    case 'test_report':
      return <TestReportView block={block} />;
    case 'asset_picker':
      return <AssetPickerView block={block} />;
    case 'build_plan':
      return <BuildPlanView block={block} />;
    case 'error_diagnosis':
      return <ErrorDiagnosisView block={block} />;
    case 'checkpoint_comparison':
      return <CheckpointComparisonView block={block} />;
    case 'progress':
      return <ProgressView block={block} />;
    case 'usage_summary':
      return <UsageSummaryView block={block} />;
    default:
      return null;
  }
}

/** Render an already-validated document. */
export function GenerativeUI({ doc, className }: { doc: UIDocument; className?: string }) {
  return (
    <div className={className ? `gu-doc ${className}` : 'gu-doc'}>
      {doc.title && <p className="gu-doc-title">{doc.title}</p>}
      {doc.blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

/** The safe fallback shown whenever a document does not validate. */
export function GenerativeUIFallback({ errors }: { errors: string[] }) {
  return (
    <div className="gu-doc gu-fallback" role="note">
      <p className="gu-fallback-title">This panel could not be displayed</p>
      <p className="gu-fallback-sub">
        Apple sent an interface that does not match the approved component set, so nothing was rendered. The
        conversation above is unaffected.
      </p>
      {errors.length > 0 && (
        <details className="gu-details">
          <summary>Why ({errors.length})</summary>
          <ul className="gu-list">
            {errors.slice(0, 8).map((e, i) => (
              <li key={i} className="gu-mono">
                {e}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Validate-then-render. This is the component the product uses: untrusted input
 * in, either an approved panel or a safe fallback out — never anything else.
 */
export function GenerativeUIPanel({
  input,
  options,
  className,
}: {
  input: unknown;
  options?: ValidateOptions;
  className?: string;
}) {
  const result = useMemo(() => validateDocument(input, options), [input, options]);
  if (!result.ok) return <GenerativeUIFallback errors={result.errors} />;
  return <GenerativeUI doc={result.doc} className={className} />;
}
