// The typed evidence cards that hang off an activity step.
//
// READ `evidence-model.ts` BEFORE CHANGING ANYTHING HERE. Every value drawn
// below comes from a document the generative-UI validator already accepted, and
// every card has four states the wire can actually justify: loading, ready,
// empty, error. This file is a renderer — it has no fallback copy, invents no
// thumbnail and never draws a card for a step that produced nothing.
//
// These are deliberately COMPACT. The full artifact is already rendered as a
// panel below the prose by `Turn` via <GenerativeUI>; duplicating it at full
// size inside the Thinking card would make one result look like two. What the
// card adds is adjacency: the evidence sits on the step that produced it.
import type {
  AssetEvidence,
  DiffEvidence,
  Evidence,
  RenderEvidence,
  TestEvidence,
} from './evidence-model';
import { EMPTY_COPY, FAULT_COPY, LOADING_COPY } from './evidence-model';

/* ---------------------------------------------------------------- shells --- */

function Frame({
  kind,
  title,
  children,
  state,
}: {
  kind: Evidence['kind'];
  title: string;
  state: Evidence['state'];
  children: React.ReactNode;
}) {
  return (
    <div className={`gx-ev gx-ev--${kind} is-${state}`}>
      <span className="gx-ev__title">{title}</span>
      {children}
    </div>
  );
}

/**
 * The three non-ready states, shared by every card so they cannot drift apart.
 * The skeleton is shaped by the tool NAME, which we know at `tool_start` — that
 * is why a loading card can be the right shape before any result exists.
 */
function Placeholder({ evidence, title }: { evidence: Evidence; title: string }) {
  if (evidence.state === 'loading') {
    return (
      <Frame kind={evidence.kind} title={title} state="loading">
        <span className="gx-ev__wait">
          <span className="gx-ev__bar" aria-hidden="true" />
          {LOADING_COPY[evidence.kind]}
        </span>
      </Frame>
    );
  }
  if (evidence.state === 'error') {
    return (
      <Frame kind={evidence.kind} title={title} state="error">
        <span className="gx-ev__msg">{FAULT_COPY[evidence.fault ?? 'tool_failed']}</span>
        {evidence.note && <span className="gx-ev__note">{evidence.note}</span>}
      </Frame>
    );
  }
  return (
    <Frame kind={evidence.kind} title={title} state="empty">
      <span className="gx-ev__msg">{EMPTY_COPY[evidence.kind]}</span>
    </Frame>
  );
}

/* ----------------------------------------------------------------- cards --- */

function RenderCard({ evidence }: { evidence: RenderEvidence }) {
  const title = evidence.subject ? `Render · ${evidence.subject}` : 'Render';
  if (evidence.state !== 'ready') return <Placeholder evidence={evidence} title={title} />;

  const shown = evidence.views.filter((v) => v.src);
  return (
    <Frame kind="render" title={title} state="ready">
      <div className="gx-ev__shots">
        {shown.map((view) => (
          <figure key={view.name} className="gx-ev__shot">
            <img
              src={view.src}
              alt={view.alt ?? `${view.name} view of ${evidence.subject}`}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            {/* Coverage is a measured fraction of the frame covered by geometry,
                not a progress figure. It is the one percentage this card is
                allowed, and the title says which it is. */}
            <figcaption title={view.coverage !== undefined ? 'Fraction of the frame covered by geometry' : undefined}>
              {view.name}
              {view.coverage !== undefined && <span> · {Math.round(view.coverage * 100)}%</span>}
            </figcaption>
          </figure>
        ))}
      </div>
      {/* The honest caption, same wording as StudioView. Do not shorten it. */}
      <span className="gx-ev__note">Diagnostic render — geometry only, not a viewport</span>
    </Frame>
  );
}

function DiffCard({ evidence }: { evidence: DiffEvidence }) {
  const title = evidence.path ? `Diff · ${evidence.path}` : 'Diff';
  if (evidence.state !== 'ready') return <Placeholder evidence={evidence} title={title} />;

  return (
    <Frame kind="diff" title={title} state="ready">
      <span className="gx-ev__counts">
        <span className="gx-ev__add">+{evidence.added}</span>
        <span className="gx-ev__del">−{evidence.removed}</span>
        {evidence.language && <span className="gx-ev__lang">{evidence.language}</span>}
      </span>
      <pre className="gx-ev__code">
        {evidence.sample.map((line, i) => (
          <code key={`${line.n ?? i}:${i}`} className={`gx-ev__line is-${line.kind}`}>
            {line.kind === 'add' ? '+' : '−'} {line.text}
          </code>
        ))}
      </pre>
    </Frame>
  );
}

function TestCard({ evidence }: { evidence: TestEvidence }) {
  if (evidence.state !== 'ready') return <Placeholder evidence={evidence} title={evidence.title} />;

  const total = evidence.passed + evidence.failed + (evidence.skipped ?? 0);
  return (
    <Frame kind="test" title={evidence.title} state="ready">
      <span className={`gx-ev__verdict${evidence.failed === 0 ? ' is-pass' : ' is-fail'}`}>
        {evidence.passed} passed · {evidence.failed} failed
        {evidence.skipped ? ` · ${evidence.skipped} skipped` : ''}
      </span>
      {/* A ratio of counts the run actually reported — not an estimate of how
          far along anything is. Hidden when nothing was counted. */}
      {total > 0 && (
        <span className="gx-ev__meter" aria-hidden="true">
          <span className="gx-ev__meter-fill" style={{ width: `${(evidence.passed / total) * 100}%` }} />
        </span>
      )}
      {evidence.failing.length > 0 && (
        <ul className="gx-ev__cases">
          {evidence.failing.map((c) => (
            <li key={c.name}>
              {c.name}
              {c.message && <span className="gx-ev__note">{c.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function AssetCard({ evidence }: { evidence: AssetEvidence }) {
  if (evidence.state !== 'ready') return <Placeholder evidence={evidence} title={evidence.title} />;

  return (
    <Frame kind="assets" title={evidence.title} state="ready">
      <ul className="gx-ev__assets">
        {evidence.items.map((item) => (
          <li key={item.id}>
            {item.src ? (
              <img src={item.src} alt={item.alt ?? item.name} loading="lazy" decoding="async" draggable={false} />
            ) : (
              // No thumbnail is a fact about the library entry, not a reason to
              // draw a fake one.
              <span className="gx-ev__nothumb" aria-hidden="true" />
            )}
            <span className="gx-ev__asset-name">{item.name}</span>
            <span className="gx-ev__note">
              {item.assetKind}
              {item.creator ? ` · ${item.creator}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  switch (evidence.kind) {
    case 'render':
      return <RenderCard evidence={evidence} />;
    case 'diff':
      return <DiffCard evidence={evidence} />;
    case 'test':
      return <TestCard evidence={evidence} />;
    case 'assets':
      return <AssetCard evidence={evidence} />;
  }
}
