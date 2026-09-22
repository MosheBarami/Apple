// The handful of AI SDK (`ai` package) types the vendored AI Elements files name.
//
// Upstream imports every one of these with `import type` — the components never call into the SDK
// at runtime — so the package itself is not needed, only the shapes. They are written from the
// AI SDK v6 part types the pinned commit was built against (`ai` 6.0.105 in its lockfile) and are
// narrowed to the fields the components read. This app's own transcript is `ChatItem`
// (lib/use-project-socket.ts); nothing here is a second transcript model.

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';

export interface TextUIPart {
  type: 'text';
  text: string;
  state?: 'streaming' | 'done';
}

export interface ReasoningUIPart {
  type: 'reasoning';
  text: string;
  state?: 'streaming' | 'done';
}

export interface FileUIPart {
  type: 'file';
  mediaType: string;
  filename?: string;
  url: string;
}

export interface SourceUrlUIPart {
  type: 'source-url';
  sourceId: string;
  url: string;
  title?: string;
}

export interface SourceDocumentUIPart {
  type: 'source-document';
  sourceId: string;
  mediaType: string;
  title: string;
  filename?: string;
}

/** Every state a tool call part can be in, in the order a call moves through them. */
export type ToolUIPartState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

interface ToolPartFields {
  toolCallId: string;
  state: ToolUIPartState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
}

export type ToolUIPart = ToolPartFields & { type: `tool-${string}` };

export type DynamicToolUIPart = ToolPartFields & { type: 'dynamic-tool'; toolName: string };

export type UIMessagePart =
  | TextUIPart
  | ReasoningUIPart
  | FileUIPart
  | SourceUrlUIPart
  | SourceDocumentUIPart
  | ToolUIPart
  | DynamicToolUIPart;

export interface UIMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  parts: UIMessagePart[];
}
