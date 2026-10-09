/**
 * Pictures the agent asked for reach its model as image input (handoff 2026-10-09, part VI section 9).
 *
 * Workers AI drops images inside tool results (workers-ai-provider sends a tool result as text only), so the frames of
 * a render_view call are added as one user message right after it, on the next step only. Every later step drops that
 * message again: an image is paid as input on each step that carries it, and the model is told to write down what it saw.
 */
import type { ModelMessage } from 'ai';

export const EVIDENCE_MARK = '[StudPilot render — pictures from your render_view call, not a message from the person]';

function isEvidence(m: ModelMessage): boolean {
  if (m.role !== 'user' || typeof m.content === 'string') return false;
  const first = m.content[0];
  return !!first && first.type === 'text' && first.text.startsWith(EVIDENCE_MARK);
}

/** The messages for the next step: earlier evidence removed, the new pictures (if any) added once at the end. */
export function withEvidence(messages: ModelMessage[], fresh: readonly EvidenceImage[]): ModelMessage[] | undefined {
  const base = messages.filter((m) => !isEvidence(m));
  if (!fresh.length) return base.length === messages.length ? undefined : base;
  const labels = fresh.map((i, n) => `${n + 1}: ${i.label} ${i.width}x${i.height}`).join(', ');
  return [
    ...base,
    {
      role: 'user',
      content: [
        { type: 'text', text: `${EVIDENCE_MARK} ${labels}. Say briefly what you see that matters for the request, then act on it. You will not see these pictures again.` },
        ...fresh.map((i) => ({ type: 'file' as const, data: i.base64, mediaType: i.mediaType })),
      ],
    },
  ];
}
