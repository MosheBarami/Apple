// One turn in the conversation.
//
// The user's turn sits right-aligned on a restrained surface so it is findable
// when scrolling back, with its timestamp beneath. The assistant's turn does
// not get a card: a 22px hexagon mark in a rounded square on the left, prose
// flowing on the canvas beside it, timestamp beneath. Wrapping every reply in a
// bordered box turns a conversation into a wall of boxes. Cards are reserved
// for content whose structure genuinely benefits — a render, a diff, a critique
// — and those come from the typed component registry, never from free-form
// model output.
import { useMemo } from 'react';
import { Markdown } from '../../lib/markdown';
import { extractUIFence, parseDocument } from '../../lib/generative-ui';
import { GenerativeUI } from '../../lib/generative-ui/render';
import { panelFromTool } from '../../lib/panels';
import { gatesFromDocs, plannedStepsFromDocs, type ValidatedDoc } from '../../lib/gates';
import { clockTime, isoStamp } from '../../lib/format';
import { GolemGlyph } from '../glyphs';
import type { AgentStatus, ChatItem } from '../../lib/use-project-socket';
import { Thinking } from './thinking';

/** Copy for a run that ended without doing the work, or failed. */
const OUTCOME: Record<string, { tone: 'note' | 'bad'; text: string }> = {
  incomplete: {
    tone: 'note',
    text: 'That run finished without changing anything. Try telling me more specifically what to build.',
  },
  stopped: { tone: 'note', text: 'Stopped.' },
  quota: {
    tone: 'note',
    text: 'That used the last of today’s Sparks. They reset tomorrow.',
  },
  error: { tone: 'bad', text: 'Something went wrong partway through.' },
};

function Stamp({ at, align }: { at: number; align: 'start' | 'end' }) {
  const label = clockTime(at);
  if (!label) return null;
  return (
    <time className={`gx-stamp gx-stamp--${align}`} dateTime={isoStamp(at)} title={new Date(at).toLocaleString()}>
      {label}
    </time>
  );
}

export function Turn({
  item,
  status,
  isLast,
}: {
  item: ChatItem;
  status: AgentStatus | null;
  isLast: boolean;
}) {
  const parsed = useMemo(() => {
    if (item.role !== 'assistant' || !item.content) return { json: null as string | null, rest: item.content };
    return extractUIFence(item.content);
  }, [item.role, item.content]);

  const fenceDoc = useMemo(() => {
    if (!parsed.json) return null;
    const result = parseDocument(parsed.json);
    return result.ok ? result.doc : null;
  }, [parsed.json]);

  // Structured tool results that the validator accepts become real components,
  // inline, in the order they happened. Anything that does not validate is
  // simply not rendered — nothing is drawn from an unvalidated shape.
  const panels = useMemo(
    () =>
      item.tools
        .map((tool) => panelFromTool(item.id, tool, item.createdAt))
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [item.tools, item.id, item.createdAt],
  );

  // The Thinking card's Validation stage and its pending bullets both read from
  // the same validated documents — never from the raw tool payload.
  const validated = useMemo<ValidatedDoc[]>(() => panels.map((p) => ({ id: p.id, doc: p.doc })), [panels]);
  const gates = useMemo(() => gatesFromDocs(validated), [validated]);
  const plannedSteps = useMemo(() => plannedStepsFromDocs(validated), [validated]);

  if (item.role === 'user') {
    return (
      <div className="gx-turn gx-turn--user gx-msg-in">
        <div className="gx-user">{item.content}</div>
        <Stamp at={item.createdAt} align="end" />
      </div>
    );
  }

  const outcome = item.stopReason && item.stopReason !== 'done' ? OUTCOME[item.stopReason] : undefined;

  return (
    <div className="gx-turn gx-turn--agent gx-msg-in">
      <span className="gx-mark" aria-hidden="true">
        <GolemGlyph size={22} />
      </span>

      <div className="gx-turn__body">
        <Thinking
          tools={item.tools}
          status={isLast ? status : null}
          streaming={item.streaming}
          intent={item.intent}
          gates={gates}
          plannedSteps={plannedSteps}
        />

        {item.content && (
          <div className="gx-prose">
            <Markdown source={parsed.rest} />
          </div>
        )}

        {fenceDoc && <GenerativeUI doc={fenceDoc} />}

        {panels.map((panel) => (
          <GenerativeUI key={panel.id} doc={panel.doc} />
        ))}

        {outcome && (
          <p className={`gx-outcome${outcome.tone === 'bad' ? ' is-bad' : ''}`}>
            {item.error ? item.error : outcome.text}
          </p>
        )}

        <Stamp at={item.createdAt} align="start" />
      </div>
    </div>
  );
}
