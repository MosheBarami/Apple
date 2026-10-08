"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { createProject, firstMessageKey } from "@/lib/api";
import { Composer } from "./composer";
import { useProjects } from "./projects-provider";
import { StarterGrid } from "./starters";
import { TopBar } from "./top-bar";
import { ProjectWorkbench } from "./project-workbench";
export const NEW_DRAFT_KEY = "studpilot:new-draft";
export function NewChat() {
  const router = useRouter();
  const { refresh } = useProjects();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"create" | "edit">("create");
  const pending = useRef<string | null>(null);
  useEffect(() => {
    try {
      setDraft(sessionStorage.getItem(NEW_DRAFT_KEY) ?? "");
    } catch {
      /* Draft persistence is optional when browser storage is unavailable. */
    }
  }, []);
  const updateDraft = (text: string) => {
    setDraft(text);
    try {
      sessionStorage.setItem(NEW_DRAFT_KEY, text);
    } catch {
      /* Draft persistence is optional when browser storage is unavailable. */
    }
  };
  const start = async (text: string) => {
    setBusy(true);
    setError(null);
    try {
      const id = pending.current ?? (await createProject(text));
      pending.current = id;
      // Keep the same project on retry if browser storage fails after creation.
      sessionStorage.setItem(firstMessageKey(id), text);
      sessionStorage.removeItem(NEW_DRAFT_KEY);
      refresh();
      router.push(`/app/chat/${id}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not open your project. Please try again."
      );
      setBusy(false);
      throw e;
    }
  };
  return (
    <div className="workspace-canvas flex h-dvh flex-col">
      <TopBar projectId={null} title="New conversation" />
      <div className="agent-page-layout">
        <main className="new-agent-main" id="workspace-main">
          <div className="new-agent-content">
            <h2>What do you want to build?</h2>
            <p>
              Describe your next change. StudPilot works in your Roblox Studio
              project.
            </p>
            <div
              className="creation-tabs"
              role="group"
              aria-label="Starting point"
            >
              {(["create", "edit"] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {m === "create"
                    ? "Create something new"
                    : "Improve my project"}
                </button>
              ))}
            </div>
            <Composer
              busy={busy}
              large
              value={draft}
              onChange={updateDraft}
              onSend={start}
            />
            {error ? (
              <p className="mt-3 text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="new-agent-suggestions">
              <p>Try a starting point</p>
              <StarterGrid
                mode={mode}
                disabled={busy}
                onPick={(text) => {
                  updateDraft(text);
                  document
                    .querySelector<HTMLTextAreaElement>("textarea")
                    ?.focus();
                }}
              />
            </div>
            <p className="agent-keyboard-note">
              Enter to send · Shift+Enter for a new line
            </p>
            <Link href="/app/projects" className="new-agent-project-link">
              Open an existing project →
            </Link>
          </div>
        </main>
        <ProjectWorkbench projectId={null} />
      </div>
    </div>
  );
}
