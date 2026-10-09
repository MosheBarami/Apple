"use client";

// A project's page: the one chat with the agent. ProjectChat connects to the project's agent (wire contract in
// planning/REBUILD-2026-10-08.md); ChatScreen only renders, so the dev harness can feed it a fake stream.
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { ArrowDownIcon, RotateCcwIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getProject } from "@/lib/api";
import { writeOutcome } from "@/lib/app-api";
import { supabase } from "@/lib/supabase";
import { AssistantTurn, UserTurn } from "./chat/turn";
import { Composer } from "./composer";
import { refreshCredits } from "./credits";
import { useProjects } from "./projects-provider";
import { StudioLight } from "./studio-light";

export function ProjectChat({ projectId, pair }: { projectId: string; pair: boolean }) {
  const { projects } = useProjects();
  const [loadedName, setLoadedName] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    getProject(projectId).then(
      (p) => current && setLoadedName(p?.name ?? null),
      () => undefined
    );
    return () => {
      current = false;
    };
  }, [projectId]);
  const title = projects?.find((p) => p.id === projectId)?.name ?? loadedName ?? "Project";

  const agent = useAgent({
    agent: "studpilot-agent",
    basePath: `studio/agent/${projectId}`,
    name: projectId,
    query: async () => {
      const { data } = await supabase().auth.getSession();
      return { token: data.session?.access_token ?? "" };
    },
  });
  const chat = useAgentChat({ agent });
  const busy =
    chat.status === "submitted" ||
    chat.status === "streaming" ||
    chat.isServerStreaming ||
    chat.isRecovering;

  return (
    <ChatScreen
      busy={busy}
      error={chat.error ? `StudPilot stopped before finishing this request${chat.error.message && chat.error.message !== "An error occurred." ? `: ${chat.error.message}` : "."}` : null}
      header={<StudioLight openOnMount={pair} projectId={projectId} />}
      messages={chat.messages}
      onRetry={() => void chat.regenerate()}
      onSend={(text) => chat.sendMessage({ text })}
      onStop={() => void chat.stop()}
      projectId={projectId}
      recovering={chat.isRecovering}
      title={title}
    />
  );
}

type Timing = { start: number; end?: number };

function metaTiming(m: UIMessage): Timing | undefined {
  const meta = m.metadata as { startedAt?: unknown; finishedAt?: unknown } | undefined;
  return typeof meta?.startedAt === "number"
    ? { end: typeof meta.finishedAt === "number" ? meta.finishedAt : undefined, start: meta.startedAt }
    : undefined;
}

function pickTiming(server?: Timing, local?: Timing): Timing | undefined {
  if (server?.end) {
    return server;
  }
  return local ?? server;
}

export function ChatScreen({
  title,
  projectId,
  messages,
  busy,
  recovering = false,
  error,
  header,
  onSend,
  onStop,
  onRetry,
}: {
  title: string;
  projectId: string;
  messages: UIMessage[];
  busy: boolean;
  recovering?: boolean;
  error: string | null;
  header?: ReactNode;
  onSend: (text: string) => void | Promise<void>;
  onStop?: () => void;
  onRetry?: () => void;
}) {
  const [draft, setDraft] = useDraft(projectId);
  const last = messages.at(-1);
  const liveId = busy && last?.role === "assistant" ? last.id : null;

  // How long each turn took, as this page saw it (the server may also send startedAt/finishedAt metadata).
  const [timings, setTimings] = useState<Record<string, Timing>>({});
  const stopped = useRef(false);
  const lastLive = useRef<string | null>(null);
  useEffect(() => {
    if (liveId) {
      lastLive.current = liveId;
      setTimings((t) => (t[liveId] ? t : { ...t, [liveId]: { start: Date.now() } }));
    }
  }, [liveId]);
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) {
      const id = lastLive.current;
      if (id) {
        setTimings((t) => (t[id] && !t[id].end ? { ...t, [id]: { ...t[id], end: Date.now() } } : t));
      }
      writeOutcome(projectId, error ? "failed" : stopped.current ? "stopped" : "finished");
      stopped.current = false;
      refreshCredits();
    }
    wasBusy.current = busy;
  }, [busy, error, projectId]);

  const liveCredits = useMemo(() => {
    if (!busy || last?.role !== "assistant") {
      return null;
    }
    const part = last.parts.findLast((p) => p.type === "data-credits") as
      | { data?: { remaining?: unknown } }
      | undefined;
    return typeof part?.data?.remaining === "number" ? part.data.remaining : null;
  }, [busy, last]);

  return (
    <div className="flex h-dvh min-w-0 flex-col bg-background" id="workspace-main">
      <header className="flex h-14 shrink-0 items-center gap-2 border-border border-b px-3 sm:px-4">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        <h1 className="min-w-0 flex-1 truncate font-medium text-[15px]">{title}</h1>
        {header}
      </header>
      <Conversation className="min-h-0" data-testid="conversation">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-8 px-4 pt-8 pb-10 sm:px-6">
          {messages.length === 0 && !busy ? (
            <div className="mx-auto mt-[18vh] max-w-md text-center">
              <h2 className="font-semibold text-xl tracking-tight">What should we work on?</h2>
              <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                Describe a screen, a system or a change to {title}. StudPilot reads the place, builds it in Studio and
                checks the result before it reports back.
              </p>
            </div>
          ) : null}
          {messages.map((m) =>
            m.role === "user" ? (
              <UserTurn key={m.id} message={m} />
            ) : m.role === "assistant" ? (
              <AssistantTurn
                key={m.id}
                live={m.id === liveId}
                message={m}
                timing={pickTiming(metaTiming(m), timings[m.id])}
              />
            ) : null
          )}
          {busy && last?.role === "user" ? (
            <p className="text-[13px] text-muted-foreground" role="status">
              {recovering ? "Reconnecting to the running request…" : "Starting…"}
            </p>
          ) : null}
          {error && !busy ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm" role="alert">
              <p className="min-w-0 flex-1 text-destructive">{error}</p>
              {onRetry ? (
                <Button onClick={onRetry} size="sm" variant="outline">
                  <RotateCcwIcon /> Try again
                </Button>
              ) : null}
            </div>
          ) : null}
        </ConversationContent>
        <JumpToLatest />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
        <Composer
          busy={busy}
          liveCredits={liveCredits}
          onChange={setDraft}
          onSend={onSend}
          onStop={
            onStop
              ? () => {
                  stopped.current = true;
                  onStop();
                }
              : undefined
          }
          value={draft}
        />
      </div>
    </div>
  );
}

function JumpToLatest() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) {
    return null;
  }
  return (
    <Button
      className="absolute bottom-4 left-1/2 h-8 -translate-x-1/2 gap-1.5 rounded-full bg-background px-3 text-xs shadow-sm animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
      data-testid="jump-to-latest"
      onClick={() => void scrollToBottom()}
      type="button"
      variant="outline"
    >
      <ArrowDownIcon className="size-3.5" /> Jump to latest
    </Button>
  );
}

/** The unsent message survives a reload of the same project (per tab). */
function useDraft(projectId: string): [string, (text: string) => void] {
  const key = `studpilot:draft:${projectId}`;
  const [text, setText] = useState("");
  useEffect(() => {
    try {
      setText(sessionStorage.getItem(key) ?? "");
    } catch {
      setText("");
    }
  }, [key]);
  const update = (next: string) => {
    setText(next);
    try {
      sessionStorage.setItem(key, next);
    } catch {
      /* Storage blocked: the draft lives only in this page. */
    }
  };
  return [text, update];
}
