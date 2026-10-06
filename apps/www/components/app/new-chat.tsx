"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/site/logo";
import { createProject, firstMessageKey } from "@/lib/api";
import { Composer } from "./composer";
import { useProjects } from "./projects-provider";
import { StarterGrid } from "./starters";
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
      router.push(`/app/chat/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <TopBar projectId={null} title="New chat" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-7 px-4 py-10">
          <div className="fade-up space-y-3 text-center">
            <LogoMark className="mx-auto size-10" />
            <h2 className="font-semibold text-[1.75rem] leading-tight tracking-tight">
              What should StudPilot build?
            </h2>
            <p className="mx-auto max-w-md text-muted-foreground text-sm">
              Describe a screen, a system, a prop or an area. StudPilot builds
              it in your Studio place.
            </p>
          </div>
          <div className="fade-up" style={{ animationDelay: "60ms" }}>
            <Composer autoFocus busy={busy} large onSend={start} />
          </div>
          <StarterGrid disabled={busy} onPick={start} />
          {error ? (
            <p className="text-center text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
