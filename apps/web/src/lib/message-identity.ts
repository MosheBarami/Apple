// Which id the client holds for a message the USER sent. No imports, on purpose — same reason as
// rename-rules.ts: this is the part worth testing directly.
//
// THE PROBLEM. A send is fire-and-forget over the socket and the message has to appear on screen
// immediately, so the client appends it under an id it mints itself. The server inserts its own
// row under its own uuid. For every user message sent in the current session those two ids were
// different and the client only ever knew its own — `msg_start` named the ASSISTANT message and
// nothing else.
//
// Every feature keyed on a user message's id therefore failed on a message sent in this session,
// and worked perfectly after a reload, because history arrives from /messages with real ids:
// Edit, Try again, and Regenerate all resolve the id server-side and all got "That message is no
// longer in the conversation."
//
// The server now names the user row on the `msg_start` it already broadcasts, and this is the
// reconciliation. It is deliberately conservative: it adopts at most one message, only a user
// message, only one that has not been named yet, and never creates a duplicate id — because the
// ids it hands out are React keys AND the anchors an edit truncates from, and a wrong one is
// worse than an unresolved one.

/** Marks an id the client minted rather than one the server did. */
export const LOCAL_ID_PREFIX = 'local-';

let counter = 0;

/** A client-side id for a message that has not been named by the server yet. */
export const localId = (): string => `${LOCAL_ID_PREFIX}${Date.now()}-${counter++}`;

/** Did we mint this, or did the server? */
export const isLocalId = (id: string): boolean => id.startsWith(LOCAL_ID_PREFIX);

/**
 * Give the most recently sent, not-yet-named user message the id the server just reported.
 *
 * Returns the SAME array when there is nothing to do — it runs inside a setState on every
 * `msg_start`, and a fresh array every time would repaint the whole conversation for nothing.
 *
 * Refuses in three cases, each of which would do damage rather than nothing:
 *   * no server id (an older worker sends none): leave every local id alone;
 *   * the server id is already on a message: never two messages with one id;
 *   * the only local ids belong to assistant messages: the server is naming a user row.
 */
export function adoptUserMessageId<T extends { id: string; role: string }>(
  list: T[],
  serverId: string | undefined,
): T[] {
  if (!serverId) return list;
  if (list.some((m) => m.id === serverId)) return list;
  let target = -1;
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]!;
    if (item.role === 'user' && isLocalId(item.id)) {
      target = i;
      break;
    }
  }
  if (target === -1) return list;
  const next = [...list];
  next[target] = { ...next[target]!, id: serverId };
  return next;
}
