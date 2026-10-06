"use client";

import { useFlueAgent } from "@flue/react";
import {
  createFlueClient,
  type FlueConversationMessage,
  type FlueConversationPart,
} from "@flue/sdk";
import { useEffect, useMemo, useState } from "react";
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
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
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
  type Checkpoint as StudioCheckpoint,
  firstMessageKey,
  getProject,
  latestStudioCheckpoint,
  restoreCheckpoint,
} from "@/lib/api";
import { authHeaders } from "@/lib/supabase";
import { Composer, STARTERS } from "./composer";
import { CREDITS_REFRESH_EVENT } from "./credits-meter";
import { useProjects } from "./projects-provider";
import { TopBar } from "./top-bar";

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
    getProject(projectId).then((p) => setLoadedName(p?.name ?? null));
  }, [projectId]);

  // The agent route takes the project id as the conversation id; the bearer token is read fresh for every request.
  const client = useMemo(
    () =>
      typeof window === "undefined"
        ? undefined
        : createFlueClient({
            url: `${location.origin}/studio/api/agents/studpilot/${projectId}`,
            headers: authHeaders,
          }),
    [projectId]
  );
  const agent = useFlueAgent({ client });
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const visible = agent.messages.filter((m) => m.display === "visible");

  // The message typed on the new-chat page.
  const { historyReady, sendMessage } = agent;
  useEffect(() => {
    if (!historyReady) {
      return;
    }
    let first: string | null = null;
    try {
      first = sessionStorage.getItem(firstMessageKey(projectId));
      sessionStorage.removeItem(firstMessageKey(projectId));
    } catch {
      // Private mode: nothing was stored.
    }
    if (first) {
      sendMessage(first);
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

  const last = visible.at(-1);
  const waiting =
    busy &&
    !(
      last?.role === "assistant" &&
      last.parts.some((p) => p.type === "text" && p.state === "streaming")
    );

  return (
    <div className="flex h-dvh flex-col">
      <TopBar openStudioOnMount={pair} projectId={projectId} title={title} />
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {agent.historyReady && visible.length === 0 && !busy ? (
            <Suggestions>
              {STARTERS.map((s) => (
                <Suggestion
                  key={s}
                  onClick={() => agent.sendMessage(s)}
                  suggestion={s}
                />
              ))}
            </Suggestions>
          ) : null}
          {visible.map((m, i) => (
            <Turn
              key={m.id}
              live={busy && i === visible.length - 1}
              message={m}
            />
          ))}
          {waiting ? <Shimmer>Working...</Shimmer> : null}
          {agent.error ? (
            <p className="text-destructive text-sm" role="alert">
              {agent.error.message}
            </p>
          ) : null}
          <UndoCheckpoint busy={busy} projectId={projectId} />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <Composer busy={busy} onSend={(text) => agent.sendMessage(text)} />
      </div>
    </div>
  );
}

function Turn({
  message,
  live,
}: {
  message: FlueConversationMessage;
  live: boolean;
}) {
  return (
    <Message from={message.role}>
      <MessageContent>
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
    : part.toolName;
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
  const status = {
    "input-available": "Working",
    "output-available": "Done",
    "output-error": "Failed",
  }[part.state];
  return (
    <Task defaultOpen={part.state === "input-available"}>
      <TaskTrigger title={`${toolLabel(part)}: ${status}`} />
      <TaskContent>
        {brief ? <TaskItem>{brief}</TaskItem> : null}
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
