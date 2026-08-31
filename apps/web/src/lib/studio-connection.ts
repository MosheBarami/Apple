/**
 * The Studio connection, as the browser is actually entitled to describe it.
 *
 * There are exactly four states, and every one of them is backed by a real
 * signal on the wire:
 *
 *   connecting     — the WebSocket to the project's SessionDO is still opening,
 *                    so nothing has told us anything about Studio yet. This is
 *                    "we do not know", not "not connected".
 *   connected      — the worker said so: `hello.studioConnected`, or a
 *                    `studio_status` with `connected: true`.
 *   disconnected   — Studio was attached during this session and no longer is:
 *                    a `studio_status` with `connected: false`, or the socket
 *                    dropped after we had seen it attached.
 *   not-connected  — the socket has an answer and the answer is no, and Studio
 *                    has never been attached in this session.
 *
 * WHAT IS DELIBERATELY ABSENT: any notion of "the plugin is installed". The
 * browser has no signal for that and cannot acquire one — a Roblox plugin
 * cannot be probed from a web page, the Creator Store exposes no per-user
 * install state to third parties, and the plugin only reaches us once it has
 * been paired, at which point the honest word is "connected". Adding an
 * `installed` state here would mean inventing it, so there isn't one.
 */
import type { ConnState } from './use-project-socket';

export type StudioConnection = 'connecting' | 'connected' | 'disconnected' | 'not-connected';

/**
 * @param conn            the WebSocket's own state
 * @param studioConnected the worker's most recent word on Studio
 * @param everConnected   whether `studioConnected` has ever been true this session
 */
export function studioConnection(
  conn: ConnState,
  studioConnected: boolean,
  everConnected: boolean,
): StudioConnection {
  if (studioConnected) return 'connected';
  // Having seen Studio and lost it is a different fact from never having had
  // it, and the UI says different things about the two.
  if (everConnected) return 'disconnected';
  // No socket yet means no answer yet. Claiming "not connected" here would put
  // a three-step setup card in front of a user who is already set up, for as
  // long as the handshake takes.
  if (conn === 'connecting' || conn === 'reconnecting') return 'connecting';
  return 'not-connected';
}
