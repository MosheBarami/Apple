"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { CheckIcon, CopyIcon, DatabaseIcon, DownloadIcon, PlusIcon, RefreshCcwIcon, RotateCcwIcon } from "lucide-react";
import { AssistantBody, messageText } from "@/components/assistant-message";
import {
  Conversation, ConversationContent, ConversationDownload, ConversationEmptyState, ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message, MessageAction, MessageActions, MessageBranch, MessageBranchContent, MessageBranchNext, MessageBranchPage,
  MessageBranchPrevious, MessageBranchSelector, MessageContent, MessageToolbar,
} from "@/components/ai-elements/message";
import {
  PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools, type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "repo-chat:v1";
const SUGGESTIONS = [
  "Where is the agent's tool registry and how is a new tool registered?",
  "What is the owner benchmark and what did the baseline show?",
  "Which phase are we in and what is left?",
  "What changed in the last few days?",
  "Why was the Creator Store chosen over the .rbxm download?",
  "How far has the rename to Apple got?",
];

type Branches = Record<string, UIMessage[]>;
type Stored = { messages: UIMessage[]; branches: Branches };
type Info = {
  model: string;
  keyConfigured: boolean;
  skills: { name: string; description: string }[];
  index: { files: number; chunks: number; builtAt: string };
};

/** Saved copy: long tool outputs are trimmed so a long investigation cannot blow the ~5 MB quota. */
function compactForStorage(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) => {
      const part = p as { type: string; output?: unknown };
      if (part.type.startsWith("tool-") && typeof part.output === "string" && part.output.length > 6000) {
        return { ...p, output: part.output.slice(0, 6000) + "\n…[trimmed in the saved copy]" } as typeof p;
      }
      return p;
    }),
  }));
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<Stored>;
      if (Array.isArray(j.messages)) return { messages: j.messages, branches: j.branches && typeof j.branches === "object" ? j.branches : {} };
    }
  } catch {
    /* private mode or corrupt value: start empty */
  }
  return { messages: [], branches: {} };
}

export function Chat() {
  const [initial, setInitial] = useState<Stored | null>(null);
  useEffect(() => setInitial(load()), []);
  if (!initial) return <div className="h-dvh bg-background" />;
  return <ChatInner initial={initial} />;
}

function ChatInner({ initial }: { initial: Stored }) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, stop, regenerate, setMessages, error, clearError } = useChat({
    id: "repo-chat",
    messages: initial.messages,
    transport,
  });
  const [branches, setBranches] = useState<Branches>(initial.branches);
  const [viewing, setViewing] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [reindexing, setReindexing] = useState(false);

  const busy = status === "submitted" || status === "streaming";

  const refreshInfo = useCallback(() => {
    fetch("/api/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setInfo(j))
      .catch(() => {});
  }, []);
  useEffect(refreshInfo, [refreshInfo]);

  // persist once a turn has settled
  useEffect(() => {
    if (busy) return;
    try {
      if (messages.length === 0) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: compactForStorage(messages), branches: Object.fromEntries(Object.entries(branches).map(([k, v]) => [k, compactForStorage(v)])) }));
    } catch {
      /* quota or blocked storage: the chat still works, it just will not survive a reload */
    }
  }, [messages, branches, busy]);

  const ask = useCallback((text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    clearError();
    void sendMessage({ text: t });
  }, [busy, sendMessage, clearError]);

  const newChat = () => {
    stop();
    clearError();
    setMessages([]);
    setBranches({});
    setViewing({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const copy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    }).catch(() => {});
  };

  const retry = (assistant: UIMessage, userId: string | undefined) => {
    if (busy) return;
    if (userId) setBranches((b) => ({ ...b, [userId]: [...(b[userId] ?? []), assistant] }));
    clearError();
    void regenerate({ messageId: assistant.id });
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      await fetch("/api/reindex", { method: "POST" });
      refreshInfo();
    } finally {
      setReindexing(false);
    }
  };

  const lastIdx = messages.length - 1;
  const waitingForFirstChunk = status === "submitted" && messages[lastIdx]?.role === "user";

  return (
    <div className="mx-auto flex h-dvh w-full max-w-4xl flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <img src="/favicon.svg" alt="" className="size-7" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight">Repo Chat</h1>
          <p className="truncate text-xs text-muted-foreground">Ask about the Apple (RbxAI) repo and product. Read-only, answers cite file:line.</p>
        </div>
        {info && (
          <Badge variant="outline" className="hidden gap-1.5 font-mono text-[11px] sm:inline-flex" title="Knowledge index: files / heading chunks">
            <DatabaseIcon className="size-3" />
            {info.index.files} docs / {info.index.chunks} chunks
          </Badge>
        )}
        <Button variant="ghost" size="sm" onClick={reindex} disabled={reindexing} title="Rebuild the BM25 knowledge index">
          <RefreshCcwIcon className={reindexing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Reindex</span>
        </Button>
        <Button variant="outline" size="sm" onClick={newChat}>
          <PlusIcon />
          New chat
        </Button>
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
          {messages.length === 0 ? (
            <ConversationEmptyState className="py-16">
              <img src="/favicon.svg" alt="" className="size-12" />
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">What do you want to know about the repo?</h2>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  Answers come from the code, the docs, git and the benchmark files, with file:line citations. Anything unrelated is declined.
                </p>
              </div>
              <div className="mt-2 flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Suggestion key={s} suggestion={s} onClick={ask} className="h-auto whitespace-normal py-1.5 text-left text-xs" />
                ))}
              </div>
              {info && (
                <p className="mt-4 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
                  Skills: {info.skills.map((s) => s.name).join(", ")}
                </p>
              )}
              {info && !info.keyConfigured && <p className="mt-2 text-xs text-destructive">OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and fill it in.</p>}
            </ConversationEmptyState>
          ) : (
            messages.map((m, idx) => {
              if (m.role === "user") {
                const text = messageText(m);
                return (
                  <Message from="user" key={m.id}>
                    <MessageContent>{text}</MessageContent>
                    <MessageActions className="justify-end opacity-0 transition-opacity group-hover:opacity-100">
                      <MessageAction tooltip="Copy" onClick={() => copy(m.id, text)}>
                        {copied === m.id ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                      </MessageAction>
                    </MessageActions>
                  </Message>
                );
              }
              const prevUser = [...messages.slice(0, idx)].reverse().find((x) => x.role === "user");
              const older = (prevUser && branches[prevUser.id]) || [];
              const versions = [...older, m];
              const isLast = idx === lastIdx;
              const streaming = isLast && busy;
              const shown = versions[Math.min(viewing[m.id] ?? versions.length - 1, versions.length - 1)];
              return (
                <Message from="assistant" key={m.id}>
                  <MessageBranch
                    key={`${m.id}-${versions.length}`}
                    defaultBranch={versions.length - 1}
                    onBranchChange={(i) => setViewing((v) => ({ ...v, [m.id]: i }))}
                  >
                    <MessageBranchContent>
                      {versions.map((v, i) => (
                        <div key={`${v.id}-${i}`}>
                          <AssistantBody message={v} streaming={streaming && i === versions.length - 1} />
                        </div>
                      ))}
                    </MessageBranchContent>
                    {!streaming && (
                      <MessageToolbar className="mt-1">
                        <MessageActions>
                          <MessageAction tooltip="Copy answer" onClick={() => copy(m.id, messageText(shown))}>
                            {copied === m.id ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                          </MessageAction>
                          {isLast && (
                            <MessageAction tooltip="Regenerate (keeps the previous answer as a branch)" onClick={() => retry(m, prevUser?.id)}>
                              <RotateCcwIcon className="size-3.5" />
                            </MessageAction>
                          )}
                        </MessageActions>
                        <MessageBranchSelector>
                          <MessageBranchPrevious />
                          <MessageBranchPage />
                          <MessageBranchNext />
                        </MessageBranchSelector>
                      </MessageToolbar>
                    )}
                  </MessageBranch>
                </Message>
              );
            })
          )}
          {waitingForFirstChunk && (
            <Message from="assistant">
              <Shimmer className="text-sm">Thinking…</Shimmer>
            </Message>
          )}
          {error && !busy && (
            <div role="alert" className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span className="min-w-0 flex-1 break-words">{error.message || "Something went wrong."}</span>
              <Button size="sm" variant="outline" onClick={() => { clearError(); void regenerate(); }}>Retry</Button>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
        {messages.length > 0 && (
          <ConversationDownload messages={messages} filename="repo-chat.md" title="Download the conversation as markdown">
            <DownloadIcon className="size-4" />
          </ConversationDownload>
        )}
      </Conversation>

      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-4 pt-2">
        {messages.length > 0 && !busy && (
          <Suggestions>
            {SUGGESTIONS.slice(0, 4).map((s) => (
              <Suggestion key={s} suggestion={s} onClick={ask} className="text-xs" />
            ))}
          </Suggestions>
        )}
        <PromptInput onSubmit={(m: PromptInputMessage) => ask(m.text)}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask about the repo, the product, its history or the benchmark…" />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <Badge variant="secondary" className="font-mono text-[11px]" title="Model (REPO_CHAT_MODEL)">
                {info?.model ?? "model…"}
              </Badge>
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
