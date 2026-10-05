// The history of a project: its checkpoints, grouped by the request that made them.
//
// WHAT IT IS MADE FROM, and nothing else. A checkpoint carries a time and a kind and no request id (the API returns id, label, kind,
// createdAt, counts, coverage, authorId and description: apps/worker/src/do/session.ts, GET /checkpoints). A request carries the time the
// worker recorded it. So the grouping is by TIME, and it says so: a checkpoint StudPilot took (kind `auto` or `pre_agent`) is filed under
// the latest request the person had sent when it was taken, which is the run that request started. Nothing is guessed beyond that.
//
// A CHECKPOINT THE PERSON SAVED BY HAND (`manual`) WAS NOT MADE BY A REQUEST, so it is never filed under one. It sits in its own group,
// "Saved by you", however it falls between two requests.
//
// A checkpoint older than every request this page has loaded (the conversation is read in a window) is filed under "Earlier work", not
// under the first request shown, which it did not come from.
//
// The one weakness, and it is the clock's: a request sent from this tab is stamped with this device's clock until the conversation is
// reloaded, and a checkpoint with the server's. A device whose clock is minutes out can file one under its neighbour. Reloading
// restamps every request from the server.
//
// Only types are imported, so `node --test` loads this module directly.
import type { CheckpointMeta } from '@studpilot/shared';

/** What a request needs to be shown: its id, its words, and when the worker recorded it. */
export interface RequestMark {
  id: string;
  text: string;
  at: number;
}

export type HistoryGroup =
  | { kind: 'request'; request: RequestMark; checkpoints: CheckpointMeta[] }
  | { kind: 'earlier'; checkpoints: CheckpointMeta[] }
  | { kind: 'saved'; checkpoints: CheckpointMeta[] };

/** The longest a request is shown before it is cut: a group heading is a line, not the message. */
export const REQUEST_SHOWN = 120;

/** The words of a request for a heading: its first line, spaces collapsed, cut at a word and marked when cut. */
export function requestHeading(content: string): string {
  const line = (content.split(/\r?\n/).find((l) => l.trim() !== '') ?? '').replace(/\s+/g, ' ').trim();
  if (line.length <= REQUEST_SHOWN) return line;
  const cut = line.slice(0, REQUEST_SHOWN);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > REQUEST_SHOWN / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

/** The person's requests, oldest first, from the conversation as the page holds it. Only what the person wrote. */
export function requestsFromMessages(
  messages: readonly { id: string; role: string; content: string; createdAt: number }[],
): RequestMark[] {
  return messages
    .filter((m) => m.role === 'user' && Number.isFinite(m.createdAt))
    .map((m) => ({ id: m.id, text: requestHeading(m.content), at: m.createdAt }))
    .sort((a, b) => a.at - b.at);
}

/**
 * Group checkpoints by request, newest first. A request that made no checkpoint is not listed: this is a history of what was saved.
 * Within a group the newest checkpoint is first, as everywhere else in the product.
 */
export function groupCheckpointsByRequest(
  checkpoints: readonly CheckpointMeta[],
  requests: readonly RequestMark[],
): HistoryGroup[] {
  const ordered = [...requests].sort((a, b) => a.at - b.at);
  const byRequest = new Map<string, CheckpointMeta[]>();
  const earlier: CheckpointMeta[] = [];
  const saved: CheckpointMeta[] = [];
  for (const checkpoint of checkpoints) {
    if (checkpoint.kind === 'manual') {
      saved.push(checkpoint);
      continue;
    }
    let owner: RequestMark | null = null;
    for (const request of ordered) {
      if (request.at <= checkpoint.createdAt) owner = request;
      else break;
    }
    if (!owner) earlier.push(checkpoint);
    else byRequest.set(owner.id, [...(byRequest.get(owner.id) ?? []), checkpoint]);
  }
  const newestFirst = (list: CheckpointMeta[]) => [...list].sort((a, b) => b.createdAt - a.createdAt);
  const groups: HistoryGroup[] = [];
  for (const request of [...ordered].reverse()) {
    const made = byRequest.get(request.id);
    if (made?.length) groups.push({ kind: 'request', request, checkpoints: newestFirst(made) });
  }
  if (earlier.length) groups.push({ kind: 'earlier', checkpoints: newestFirst(earlier) });
  if (saved.length) groups.push({ kind: 'saved', checkpoints: newestFirst(saved) });
  return groups;
}
