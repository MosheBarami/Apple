/**
 * A conversation id is the project id, optionally followed by `~` and a chat name (`<project>~<chat>`), so one project
 * can hold several conversations (a fresh chat, or one per evaluation piece). The project part is what the owner check
 * and every tool use; the chat part only separates histories.
 */
const ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:~([a-z0-9][a-z0-9-]{0,47}))?$/;

export function projectOf(conversationId: string): string | null {
  return ID.exec(conversationId)?.[1] ?? null;
}
