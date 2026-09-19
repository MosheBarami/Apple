import type { MessageDto } from '@golem/shared';
import type { ChatItem } from './use-project-socket';

export type ProjectRequestChannel = 'history' | 'checkpoints';

export interface ProjectRequestTicket {
  projectId: string;
  generation: number;
  channel: ProjectRequestChannel;
  request: number;
}

/**
 * A small generation fence for reads whose answer may arrive after navigation.
 *
 * Project identity and request order are both part of the ticket. Switching A -> B invalidates
 * every A ticket immediately, and starting a second history load invalidates the first even within
 * the same project. That keeps a slow success and a slow failure from overwriting the newer answer.
 */
export function createProjectRequestFence(initialProjectId: string) {
  let projectId = initialProjectId;
  let generation = 0;
  const requests: Record<ProjectRequestChannel, number> = { history: 0, checkpoints: 0 };

  const select = (nextProjectId: string): void => {
    if (nextProjectId === projectId) return;
    projectId = nextProjectId;
    generation += 1;
    requests.history = 0;
    requests.checkpoints = 0;
  };

  const begin = (channel: ProjectRequestChannel): ProjectRequestTicket => {
    requests[channel] += 1;
    return { projectId, generation, channel, request: requests[channel] };
  };

  const accepts = (ticket: ProjectRequestTicket): boolean =>
    ticket.projectId === projectId
    && ticket.generation === generation
    && ticket.request === requests[ticket.channel];

  const isSelected = (candidate: string): boolean => candidate === projectId;

  return { select, begin, accepts, isSelected };
}

/** Map the durable transcript contract into the same shape the WebSocket reducer renders. */
export function chatItemFromMessageDto(message: MessageDto): ChatItem {
  return {
    id: message.id,
    role: message.role,
    mode: message.mode,
    productModel: message.productModel,
    content: message.content,
    tools: (message.toolTrace ?? []).map((trace, index) => ({
      toolId: `${message.id}-t${index}`,
      tool: trace.tool,
      summary: trace.summary,
      ok: trace.ok,
      // A reloaded transcript did not observe the live start clock.
      startedAt: 0,
      startObserved: false,
      durationMs: trace.durationMs,
      done: true,
      detail: trace.detail,
    })),
    streaming: false,
    createdAt: new Date(message.createdAt).getTime(),
    revisions: message.revisions,
    ...(message.stopReason !== undefined ? { stopReason: message.stopReason } : {}),
    ...(message.error !== undefined ? { error: message.error } : {}),
    ...(message.creditsSpent !== undefined ? { creditsSpent: message.creditsSpent } : {}),
    ...(message.context !== undefined ? { context: message.context } : {}),
    ...(message.deniedTools !== undefined ? { deniedTools: message.deniedTools } : {}),
  };
}

/**
 * History now persists the bounded terminal metadata, but it still cannot carry prompt-derived
 * intent and it can be stale while the current turn is streaming.
 *
 * When the same terminal assistant message is present in both, the persisted row remains
 * authoritative for content, timestamps, durable tool trace and terminal scalars. Live-only intent
 * is copied back, and any already-observed value is retained if an older worker row omitted it.
 */
export function mergeHistoryWithLive(history: ChatItem[], live: ChatItem[]): ChatItem[] {
  const liveById = new Map(live.map((item) => [item.id, item]));
  const historyIds = new Set(history.map((item) => item.id));

  const merged = history.map((persisted) => {
    const observed = liveById.get(persisted.id);
    if (!observed) return persisted;
    // While a turn is streaming the durable row is necessarily behind the wire: SessionDO persists
    // the completed assistant content at finish. A history request that began just before the first
    // delta may therefore return an empty/older copy after several deltas are already visible. Keep
    // the live row whole until msg_end; only a terminal row can safely take durable content/tools.
    if (observed.streaming) return observed;
    return {
      ...persisted,
      streaming: observed.streaming,
      ...(observed.stopReason !== undefined ? { stopReason: observed.stopReason } : {}),
      ...(observed.error !== undefined ? { error: observed.error } : {}),
      ...(observed.creditsSpent !== undefined ? { creditsSpent: observed.creditsSpent } : {}),
      ...(observed.intent !== undefined ? { intent: observed.intent } : {}),
      ...(observed.deniedTools !== undefined ? { deniedTools: observed.deniedTools } : {}),
      ...(observed.context !== undefined ? { context: observed.context } : {}),
    } satisfies ChatItem;
  });

  return [...merged, ...live.filter((item) => !historyIds.has(item.id))];
}
