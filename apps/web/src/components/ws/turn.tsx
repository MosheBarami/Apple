// One turn in the conversation.
//
// The user's turn sits on a restrained surface so it is findable when scrolling
// back. The assistant's turn does not: it flows directly on the canvas, because
// wrapping every reply in a bordered card turns a conversation into a wall of
// boxes. Cards are reserved for content whose structure genuinely benefits —
// a render, a diff, a critique — and those come from the typed component
// registry, never from free-form model output.
import { useMemo } from 'react';
import { Markdown } from '../../lib/markdown';
import { extractUIFence, parseDocument } from '../../lib/generative-ui';
import { GenerativeUI } from '../../lib/generative-ui/render';
import { panelFromTool } from '../../lib/panels';
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
    text: 'That used the last of today&rsquo;s Sparks. They reset tomorrow.',
  },
  error: { tone: 'bad', text: 'Something went wrong partway through.' },
};

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

  if (item.role === 'user') {
    return <div className="gx-user gx-msg-in">{item.content}</div>;
  }

  const outcome = item.stopReason && item.stopReason !== 'done' ? OUTCOME[item.stopReason] : undefined;

  return (
    <div className="gx-assistant gx-msg-in">
      <Thinking tools={item.tools} status={isLast ? status : null} streaming={item.streaming} />

      {item.content && <Markdown source={parsed.rest} />}

      {fenceDoc && <GenerativeUI doc={fenceDoc} />}

      {panels.map((panel) => (
        <GenerativeUI key={panel.id} doc={panel.doc} />
      ))}

      {outcome && (
        <p style={{ color: outcome.tone === 'bad' ? 'var(--gx-bad)' : 'var(--gx-ink-3)', fontSize: '0.87rem' }}>
          {item.error ? item.error : outcome.text}
        </p>
      )}
    </div>
  );
}
