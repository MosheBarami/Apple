"use client";

import { useFlueAgent } from "@flue/react";
import {
  createFlueClient,
  type FlueConversationMessage,
  type FlueConversationPart,
} from "@flue/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from "@/components/ai-elements/checkpoint";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  firstMessageKey,
  getProject,
  latestStudioCheckpoint,
  restoreCheckpoint,
  type Checkpoint as StudioCheckpoint,
} from "@/lib/api";
import { authHeaders } from "@/lib/supabase";
import { Composer } from "./composer";
import { CREDITS_REFRESH_EVENT } from "./credits-meter";
import { useProjects } from "./projects-provider";
import { StarterGrid } from "./starters";
import { TopBar } from "./top-bar";
import { ProjectWorkbench } from "./project-workbench";

type ToolPart = Extract<FlueConversationPart, { type: "dynamic-tool" }>;

export function ChatView({
  projectId,
  pair,
}: {
  projectId: string;
  pair: boolean;
}) {
  const { projects } = useProjects();
  const [loadedName, setLoadedName] = useState<string | null>(null);
  const title =
    projects?.find((p) => p.id === projectId)?.name ?? loadedName ?? "Chat";

  useEffect(() => {
    let current = true;
    setLoadedName(null);
    getProject(projectId).then(
      (p) => {
        if (current) setLoadedName(p?.name ?? null);
      },
      () => {
        if (current) setLoadedName(null);
      }
    );
    return () => {
      current = false;
    };
  }, [projectId]);

  // The agent route takes the project id as the conversation id; the bearer token is read fresh for every request.
  const client = useMemo(
    () =>
      typeof window === "undefined"
        ? undefined
        : createFlueClient({
            headers: authHeaders,
            url: `${location.origin}/studio/api/agents/studpilot/${projectId}`,
          }),
    [projectId]
  );
  // A stalled persistent SSE connection hid completed submissions in production.
  // Finite update reads reconnect from the durable offset after every batch.
  const agent = useFlueAgent({ client, live: "long-poll" });
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const visible = agent.messages.filter((m) => m.display === "visible");

  // The message typed on the new-chat page.
  const { historyReady, sendMessage } = agent;
  const firstInFlight = useRef(false);
  const [failedFirst, setFailedFirst] = useState<string | null>(null);
  useEffect(() => {
    firstInFlight.current = false;
    setFailedFirst(null);
  }, [projectId]);
  useEffect(() => {
    if (!historyReady || firstInFlight.current) {
      return;
    }
    let first: string | null = null;
    try {
      first = sessionStorage.getItem(firstMessageKey(projectId));
    } catch {
      // Private mode: nothing was stored.
    }
    if (first) {
      firstInFlight.current = true;
      sendMessage(first)
        .then(() => {
          try {
            sessionStorage.removeItem(firstMessageKey(projectId));
          } catch {
            /* Sending succeeded; unavailable storage must not turn it into a failed send. */
          }
        })
        .catch(() => setFailedFirst(first));
    }
  }, [historyReady, projectId, sendMessage]);

  // Credits go down while the agent works; read them again when it finishes.
  const [wasBusy, setWasBusy] = useState(false);
  useEffect(() => {
    if (busy) {
      setWasBusy(true);
    } else if (wasBusy) {
      setWasBusy(false);
      window.dispatchEvent(new Event(CREDITS_REFRESH_EVENT));
    }
  }, [busy, wasBusy]);

  return (
    <ChatScreen
      busy={busy}
      error={agent.error?.message ?? null}
      messages={visible}
      onRecover={
        failedFirst
          ? async () => {
              try {
                await sendMessage(failedFirst);
                try {
                  sessionStorage.removeItem(firstMessageKey(projectId));
                } catch {
                  /* Sending succeeded; unavailable storage must not turn it into a failed send. */
                }
                setFailedFirst(null);
              } catch {
                /* Agent error remains visible; the request stays available for retry. */
              }
            }
          : agent.refresh
      }
      onSend={(text) => agent.sendMessage(text)}
      onStop={
        client
          ? async () => {
              await client.abort({ signal: AbortSignal.timeout(15_000) });
              agent.refresh();
            }
          : undefined
      }
      pair={pair}
      projectId={projectId}
      ready={agent.historyReady}
      title={title}
    />
  );
}

/** The chat's page: top bar, transcript and composer. It holds no agent state, so the design review page can feed it sample messages. */
export function ChatScreen({
  title,
  projectId,
  pair,
  messages: visible,
  busy,
  ready,
  error,
  onSend,
  onRecover,
  onStop,
}: {
  title: string;
  projectId: string;
  pair: boolean;
  messages: FlueConversationMessage[];
  busy: boolean;
  ready: boolean;
  error: string | null;
  onSend: (text: string) => unknown | Promise<unknown>;
  onRecover?: () => void;
  onStop?: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState({ projectId, text: "" });
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  useEffect(() => {
    let text = "";
    try {
      text = sessionStorage.getItem(`studpilot:draft:${projectId}`) ?? "";
    } catch {}
    setDraft({ projectId, text });
    setStopError(null);
    setStopping(false);
  }, [projectId]);
  const updateDraft = (text: string) => {
    setDraft({ projectId, text });
    try {
      sessionStorage.setItem(`studpilot:draft:${projectId}`, text);
    } catch {}
  };
  const tools = visible.flatMap((message) =>
    message.parts.filter((part) => part.type === "dynamic-tool")
  );
  const returned = tools.filter(
    (part) => part.type === "dynamic-tool" && part.state === "output-available"
  ).length;
  const failed = tools.filter(
    (part) => part.type === "dynamic-tool" && part.state === "output-error"
  ).length;
  const last = visible.at(-1);
  const waiting =
    busy &&
    !(
      last?.role === "assistant" &&
      last.parts.some((p) => p.type === "text" && p.state === "streaming")
    );

  return (
    <div className="workspace-canvas flex h-dvh flex-col" id="workspace-main">
      <TopBar
        active={busy}
        openStudioOnMount={pair}
        projectId={projectId}
        title={title}
      />
      <div className="agent-page-layout">
        <div className="agent-chat-main">
          <div className="chat-context-strip" aria-label="Conversation status">
            <span className={busy ? "is-working" : ""}>
              {!ready
                ? "Loading history"
                : busy
                  ? "Work in progress"
                  : "Your project workspace"}
            </span>
            <span>
              {tools.length
                ? `${returned} tool responses${failed ? ` · ${failed} need attention` : ""}`
                : "Changes and checks appear in the conversation"}
            </span>
          </div>
          <Conversation>
            <ConversationContent className="mx-auto min-h-full w-full max-w-3xl pt-8 sm:px-8">
              {!ready && !error ? (
                <p className="text-sm text-muted-foreground" role="status">
                  Loading your conversation…
                </p>
              ) : null}
              {ready && visible.length === 0 && !busy ? (
                <div className="my-auto space-y-5 py-8">
                  <h2 className="text-center font-semibold text-xl tracking-tight">
                    What should StudPilot build?
                  </h2>
                  <StarterGrid
                    onPick={(text) => {
                      updateDraft(text);
                      document
                        .querySelector<HTMLTextAreaElement>("textarea")
                        ?.focus();
                    }}
                  />
                </div>
              ) : null}
              {visible.map((m, i) => (
                <Turn
                  key={m.id}
                  live={busy && i === visible.length - 1}
                  message={m}
                />
              ))}
              {waiting ? (
                <div
                  className="luminous-panel flex items-center gap-3 px-4 py-3"
                  role="status"
                >
                  <span className="size-2 animate-pulse rounded-full bg-signal" />
                  <Shimmer>StudPilot is working</Shimmer>
                </div>
              ) : null}
              {error ? (
                <div className="luminous-panel rounded-md border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-destructive text-sm" role="alert">
                    {error}
                  </p>
                  {onRecover ? (
                    <button
                      className="mt-3 text-sm font-medium underline underline-offset-4"
                      disabled={busy}
                      onClick={onRecover}
                      type="button"
                    >
                      Try again
                    </button>
                  ) : null}
                </div>
              ) : null}
              <UndoCheckpoint busy={busy} projectId={projectId} />
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <div className="mx-auto w-full max-w-3xl px-4 pb-4">
            <Composer
              busy={busy}
              disabled={!ready}
              onSend={onSend}
              value={draft.projectId === projectId ? draft.text : ""}
              onChange={updateDraft}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                StudPilot works in your place. Look at what it built in Studio.
              </p>
              {busy && onStop ? (
                <button
                  type="button"
                  className="min-h-9 shrink-0 rounded-md border border-border px-3 text-xs hover:bg-muted"
                  disabled={stopping}
                  onClick={async () => {
                    setStopping(true);
                    setStopError(null);
                    try {
                      await onStop();
                    } catch {
                      setStopError(
                        "Could not stop the run. Try again. Your draft is still here."
                      );
                    } finally {
                      setStopping(false);
                    }
                  }}
                >
                  {stopping ? "Stopping…" : "Stop working"}
                </button>
              ) : null}
            </div>
            {stopError ? (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {stopError}
              </p>
            ) : null}
          </div>
        </div>
        <ProjectWorkbench
          projectId={projectId}
          title={title}
          messages={visible}
          busy={busy}
        />
      </div>
    </div>
  );
}

export function Turn({
  message,
  live,
}: {
  message: FlueConversationMessage;
  live: boolean;
}) {
  return (
    <Message className="message-fade-in" from={message.role}>
      <MessageContent>
        <div className="chat-speaker">
          {message.role === "user" ? "You" : "StudPilot"}
          {live && message.role === "assistant" ? <span>Working</span> : null}
        </div>
        {message.parts.map((part, i) => (
          <Part
            key={`${message.id}-${i}`}
            live={live}
            part={part}
            user={message.role === "user"}
          />
        ))}
      </MessageContent>
    </Message>
  );
}

/** A delegation reads as the teammate it went to, anything else by its tool name. */
function toolLabel(part: ToolPart): string {
  const agent = (part.input as { agent?: unknown } | undefined)?.agent;
  return part.toolName === "task" && typeof agent === "string"
    ? agent
    : ({
        checkpoint: "Saving a checkpoint",
        create_instances: "Creating objects",
        execute_luau: "Running project code",
        inspect_place: "Inspecting your place",
        search_library: "Finding assets",
      }[part.toolName] ?? part.toolName.replaceAll("_", " "));
}

function Part({
  part,
  user,
  live,
}: {
  part: FlueConversationPart;
  user: boolean;
  live: boolean;
}) {
  if (part.type === "text") {
    if (!part.text) {
      return null;
    }
    return user ? (
      <div className="whitespace-pre-wrap">{part.text}</div>
    ) : (
      <MessageResponse isAnimating={live && part.state === "streaming"}>
        {part.text}
      </MessageResponse>
    );
  }
  if (part.type === "reasoning") {
    if (!part.text.trim()) {
      return null;
    }
    return (
      <Reasoning
        defaultOpen={false}
        isStreaming={live && part.state === "streaming"}
      >
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }
  if (part.type === "dynamic-tool") {
    return part.toolName === "task" ? (
      <TaskStep part={part} />
    ) : (
      <Tool defaultOpen={false}>
        <ToolHeader
          state={part.state}
          title={toolLabel(part)}
          toolName={part.toolName}
          type="dynamic-tool"
        />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput errorText={part.errorText} output={part.output} />
        </ToolContent>
      </Tool>
    );
  }
  return null;
}

function TaskStep({ part }: { part: ToolPart }) {
  const input = part.input as
    | { prompt?: unknown; description?: unknown }
    | undefined;
  const brief = [input?.prompt, input?.description].find(
    (v): v is string => typeof v === "string"
  );
  const result = typeof part.output === "string" ? part.output.trim() : null;
  const noReport = part.state === "output-available" &&
    (part.output == null || result === "" || result === "(task completed with no text)");
  const status = noReport ? "No result" : {
    "input-available": "Working",
    "output-available": "Done",
    "output-error": "Failed",
  }[part.state];
  return (
    <Task defaultOpen={part.state === "input-available"}>
      <TaskTrigger title={`${toolLabel(part)}: ${status}`} />
      <TaskContent>
        {brief ? <TaskItem>{brief}</TaskItem> : null}
        {noReport ? <TaskItem>No completion report was returned.</TaskItem> : result ? <TaskItem>{result}</TaskItem> : null}
        {part.errorText ? <TaskItem>{part.errorText}</TaskItem> : null}
      </TaskContent>
    </Task>
  );
}

/** Puts the place back to the checkpoint the agent took before its first change. */
function UndoCheckpoint({
  projectId,
  busy,
}: {
  projectId: string;
  busy: boolean;
}) {
  const [checkpoint, setCheckpoint] = useState<StudioCheckpoint | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // A new checkpoint can only appear when the agent has just finished.
  useEffect(() => {
    if (!busy) {
      latestStudioCheckpoint(projectId).then(setCheckpoint, () =>
        setCheckpoint(null)
      );
    }
  }, [projectId, busy]);

  if (!checkpoint) {
    return null;
  }
  const undo = async () => {
    const when = new Date(checkpoint.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (
      !confirm(
        `Put the place back to how it was at ${when}, before StudPilot's changes? Changes made since then are undone.`
      )
    ) {
      return;
    }
    setNote("Undoing...");
    try {
      await restoreCheckpoint(projectId, checkpoint.id);
      setNote("Undone");
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  return (
    <Checkpoint>
      <CheckpointIcon />
      <CheckpointTrigger
        disabled={busy || note === "Undoing..."}
        onClick={undo}
        tooltip="Put the place back to before StudPilot changed it"
      >
        Undo changes
      </CheckpointTrigger>
      {note ? <span className="text-xs">{note}</span> : null}
    </Checkpoint>
  );
}
