"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { createProject, firstMessageKey } from "@/lib/api";
import { Composer, STARTERS } from "./composer";
import { useProjects } from "./projects-provider";
import { TopBar } from "./top-bar";

export function NewChat() {
  const router = useRouter();
  const { refresh } = useProjects();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The chat is created by the first message: its name is that message, and the agent is asked on the chat's own page.
  const start = async (text: string) => {
    setBusy(true);
    setError(null);
    try {
      const id = await createProject(text);
      try {
        sessionStorage.setItem(firstMessageKey(id), text);
      } catch {
        // Private mode: the chat opens empty and the message is typed again.
      }
      refresh();
      router.push(`/chat/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <TopBar projectId={null} title="New chat" />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 pb-24">
        <h2 className="text-center font-semibold text-2xl">
          What should StudPilot work on?
        </h2>
        <Composer busy={busy} onSend={start} />
        <Suggestions>
          {STARTERS.map((s) => (
            <Suggestion
              disabled={busy}
              key={s}
              onClick={() => start(s)}
              suggestion={s}
            />
          ))}
        </Suggestions>
        {error ? (
          <p className="text-center text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
