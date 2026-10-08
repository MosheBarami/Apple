"use client";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CreationOrbit } from "@/components/creative/creation-orbit";
import { MotionSurface } from "@/components/creative/motion-surface";
import { createProject, firstMessageKey } from "@/lib/api";
import { Composer } from "./composer";
import { useProjects } from "./projects-provider";
import { StarterGrid } from "./starters";
import { TopBar } from "./top-bar";
export const NEW_DRAFT_KEY = "studpilot:new-draft";
export function NewChat() {
  const router = useRouter();
  const { refresh } = useProjects();
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"create" | "edit">("create");
  const pending = useRef<string | null>(null);
  useEffect(() => {
    try {
      setDraft(sessionStorage.getItem(NEW_DRAFT_KEY) ?? "");
    } catch { /* Draft persistence is optional when browser storage is unavailable. */ }
  }, []);
  const updateDraft = (text: string) => {
    setDraft(text);
    try {
      sessionStorage.setItem(NEW_DRAFT_KEY, text);
    } catch { /* Draft persistence is optional when browser storage is unavailable. */ }
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
      <TopBar projectId={null} title="Create" />
      <main className="flex-1 overflow-y-auto" id="workspace-main">
        <div className="mx-auto flex min-h-full w-full max-w-[850px] flex-col justify-center px-5 py-12 sm:px-8">
          <div className="creation-intro relative mb-6">
            <CreationOrbit className="intro-orbit" compact />
            <div className="relative">
              <p className="studio-eyebrow mb-3">YOUR CREATIVE WORKSPACE</p>
              <h2 className="text-balance text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-[42px]">
                A little spark.
                <br />
                <span className="creative-title">A whole new possibility.</span>
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
                Start something new or give your existing game its next chapter.
                You bring the idea. We’ll work on it together.
              </p>
            </div>
          </div>
          <div
            aria-label="Starting point"
            className="creation-tabs mb-5 flex gap-1 self-start"
            role="group"
          >
            {(["create", "edit"] as const).map((m) => (
              <button
                aria-pressed={mode === m}
                className={`relative rounded-full px-4 py-2.5 text-xs transition-colors ${mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                key={m}
                onClick={() => setMode(m)}
                type="button"
              >
                {m === "create" ? "Create something new" : "Improve my project"}
                {mode === m ? (
                  <motion.span
                    className="absolute inset-0 -z-10 rounded-full bg-card shadow-sm"
                    layoutId="start-mode"
                    transition={{ duration: reduce ? 0 : 0.22 }}
                  />
                ) : null}
              </button>
            ))}
          </div>
          <MotionSurface className="composer-stage">
            <Composer
              busy={busy}
              large
              onChange={updateDraft}
              onSend={start}
              value={draft}
            />
          </MotionSurface>
          {error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-8">
            <p className="mb-3 text-xs text-muted-foreground">
              A starting point, if you need one
            </p>
            <StarterGrid
              disabled={busy}
              mode={mode}
              onPick={(text) => {
                updateDraft(text);
                document
                  .querySelector<HTMLTextAreaElement>("textarea")
                  ?.focus();
              }}
            />
          </div>
          <p className="mt-7 text-xs leading-5 text-muted-foreground">
            Connect your project in Studio when you’re ready to work in your
            place.
          </p>
        </div>
      </main>
    </div>
  );
}
