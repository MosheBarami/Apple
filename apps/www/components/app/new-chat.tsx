"use client";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon, SparklesIcon, BookOpenIcon } from "lucide-react";

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
      <TopBar projectId={null} title="Create" />
      <main className="flex-1 overflow-y-auto" id="workspace-main">
        <div className="app-create-layout">
          <div className="min-w-0">
            <div className="creation-banner">
              <Image
                src="/art/creation-world.webp"
                width={1600}
                height={900}
                alt=""
                className="banner-art"
                sizes="(max-width: 640px) 85vw, 600px"
                priority
              />
              <div className="creation-banner-copy">
                <p className="studio-eyebrow">
                  <span />
                  YOUR CREATIVE WORKSPACE
                </p>
                <h2>
                  What will you
                  <br />
                  <span className="gradient-text">bring to life?</span>
                </h2>
                <p>
                  Your next Roblox idea starts here. Describe what you want to
                  create or change. Let’s work on it together.
                </p>
              </div>
            </div>
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
                  className={`relative ${mode === m ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {mode === m ? (
                    <motion.span
                      className="selection-glass"
                      layoutId="start-mode"
                      transition={{ duration: reduce ? 0 : 0.2 }}
                    />
                  ) : null}
                  {m === "create"
                    ? "Create something new"
                    : "Improve my project"}
                </button>
              ))}
            </div>
            <Composer
              busy={busy}
              large
              onChange={updateDraft}
              onSend={start}
              value={draft}
            />
            {error ? (
              <p className="mt-3 text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[10px] text-muted-foreground">
                  A little inspiration to get you started
                </p>
                <Link href="/app/library" className="text-[9px] text-signal">
                  Explore prompts ↗
                </Link>
              </div>
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
            <p className="mt-6 text-[9px] leading-5 text-muted-foreground">
              Enter to send · Shift+Enter for a new line. Connect Studio when
              you’re ready to work in your place.
            </p>
          </div>
          <aside className="creation-aside" aria-label="Getting started">
            <div className="readiness-panel luminous-panel">
              <h3>Get Studio ready.</h3>
              <p>
                A few steps to get your workspace ready. Each project has its
                own connection.
              </p>
              <ol>
                {[
                  {
                    title: "Open your place",
                    text: "Choose the project in Roblox Studio.",
                  },
                  {
                    title: "Pair the plugin",
                    text: "Use the six-character code from your chat.",
                  },
                  {
                    title: "Choose edit access",
                    text: "Enable changes when you are ready.",
                  },
                ].map((step, i) => (
                  <li key={step.title}>
                    <span>{i + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      {step.text}
                    </div>
                  </li>
                ))}
              </ol>
              <Link href="/docs#pair">
                <BookOpenIcon className="size-3" />
                Open the setup guide
                <ArrowUpRightIcon className="size-3" />
              </Link>
            </div>
            <div className="inspiration-card">
              <SparklesIcon />
              <p>Start with one focused change.</p>
              <small>
                Choose an existing project, explain what you want to improve,
                and keep the context in one chat.
              </small>
              <Link href="/app/projects">Pick up a project ↗</Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
