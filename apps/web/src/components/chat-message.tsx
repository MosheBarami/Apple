// One chat message: user bubble or golem answer with markdown + tool timeline.
import { useState } from 'react';
import { MODE_INFO } from '@golem/shared';
import { Markdown } from '../lib/markdown';
import { formatDuration } from '../lib/format';
import type { ChatItem, ToolEvent } from '../lib/use-project-socket';
import { RunePulse } from './glyphs';

function ToolChip({ tool }: { tool: ToolEvent }) {
  const [open, setOpen] = useState(false);
  const status = !tool.done ? 'running' : tool.ok ? 'ok' : 'fail';
  return (
    <div className={`tool-chip tool-${status}`}>
      <button
        type="button"
        className="tool-chip-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tool-chip-status" aria-hidden="true">
          {status === 'running' ? <span className="tool-spinner" /> : status === 'ok' ? '✓' : '✗'}
        </span>
        <span className="tool-chip-name">{tool.tool}</span>
        {tool.durationMs !== undefined && <span className="tool-chip-time">{formatDuration(tool.durationMs)}</span>}
        <span className="tool-chip-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="tool-chip-detail">
          <span className={`tool-detail-status tool-detail-${status}`}>
            {status === 'running' ? 'running…' : status === 'ok' ? 'succeeded' : 'failed'}
          </span>
          <p>{tool.summary || 'No summary reported.'}</p>
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ item }: { item: ChatItem }) {
  if (item.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="msg-bubble msg-bubble-user">
          <p className="msg-user-text">{item.content}</p>
          {item.mode && (
            <span className={`msg-mode-tag mode-text-${item.mode}`}>{MODE_INFO[item.mode].name}</span>
          )}
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
      <div className="msg-avatar" aria-hidden="true">
        <RunePulse size={18} />
      </div>
      <div className="msg-bubble msg-bubble-golem">
        {item.tools.length > 0 && (
          <div className="tool-timeline" aria-label="Tool activity">
            {item.tools.map((t) => (
              <ToolChip key={t.toolId} tool={t} />
            ))}
          </div>
        )}
        {item.content ? (
          <Markdown source={item.content} />
        ) : item.streaming ? (
          <p className="msg-thinking">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </p>
        ) : null}
        {item.streaming && item.content && <span className="stream-caret" aria-hidden="true" />}
        {item.stopReason === 'stopped' && <p className="msg-note">Stopped by you.</p>}
        {item.stopReason === 'quota' && <p className="msg-note msg-note-warn">Ran out of Sparks mid-task.</p>}
        {item.stopReason === 'error' && (
          <p className="msg-note msg-note-error">{item.error || 'Something went wrong — try again.'}</p>
        )}
      </div>
    </div>
  );
}
