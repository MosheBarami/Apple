// One turn in the conversation lane.
//
// An assistant turn is: the timeline of what it did, then what it says. Any
// ```golem-ui fence in the answer is lifted out, validated, and rendered as a
// real panel instead of printed as code — the fence text never reaches the
// markdown renderer.
import { useMemo } from 'react';
import { MODE_INFO } from '@golem/shared';
import { Markdown } from '../lib/markdown';
import { extractUIFence, parseDocument } from '../lib/generative-ui';
import { GenerativeUI, GenerativeUIFallback } from '../lib/generative-ui/render';
import type { ChatItem, ToolEvent } from '../lib/use-project-socket';
import { ToolTimeline } from './tool-timeline';
import { RunePulse } from './glyphs';

interface ChatMessageProps {
  item: ChatItem;
  agentPhase?: string | null;
  onOpenTool?: (tool: ToolEvent) => void;
}

export function ChatMessage({ item, agentPhase = null, onOpenTool }: ChatMessageProps) {
  const parsed = useMemo(() => {
    if (item.role !== 'assistant' || !item.content) return { json: null as string | null, rest: item.content };
    return extractUIFence(item.content);
  }, [item.role, item.content]);

  const panel = useMemo(() => (parsed.json ? parseDocument(parsed.json) : null), [parsed.json]);

  if (item.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="msg-bubble-user">
          <p className="msg-user-text">{item.content}</p>
          {item.mode && <span className="msg-mode-tag">{MODE_INFO[item.mode].name}</span>}
        </div>
      </div>
    );
  }

  if (item.role === 'system') {
    return (
      <div className="msg msg-system">
        <span className="msg-system-text">{item.content}</span>
      </div>
    );
  }

  return (
    <div className="msg msg-golem">
      <span className="msg-avatar" aria-hidden="true">
        <RunePulse size={15} />
      </span>
      <div className="msg-bubble-golem">
        {item.tools.length > 0 && (
          <ToolTimeline
            tools={item.tools}
            agentPhase={agentPhase}
            running={item.streaming}
            onOpen={onOpenTool}
            defaultOpen={item.streaming}
          />
        )}

        {parsed.rest ? (
          <Markdown source={parsed.rest} />
        ) : item.streaming && !panel ? (
          <p className="msg-thinking" aria-label="Golem is composing an answer">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </p>
        ) : null}

        {panel && (panel.ok ? <GenerativeUI doc={panel.doc} /> : <GenerativeUIFallback errors={panel.errors} />)}

        {item.streaming && parsed.rest && <span className="stream-caret" aria-hidden="true" />}
        {item.stopReason === 'stopped' && <p className="msg-note">Stopped by you.</p>}
        {item.stopReason === 'quota' && <p className="msg-note msg-note-warn">Ran out of Sparks mid-task.</p>}
        {item.stopReason === 'incomplete' && (
          <p className="msg-note msg-note-warn">Nothing was changed — this run did not complete the request.</p>
        )}
        {item.stopReason === 'error' && (
          <p className="msg-note msg-note-error">{item.error || 'Something went wrong — try again.'}</p>
        )}
      </div>
    </div>
  );
}
