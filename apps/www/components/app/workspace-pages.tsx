"use client";
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  FolderIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { UiverseBuildLoader } from "@/components/uiverse/elements";
import { PromptArtwork } from "@/components/creative/atmosphere";
import { StyleTile } from "@/components/creative/style-tile";
import { useSession } from "@/lib/supabase";
import { CreditsMeter } from "./credits-meter";
import { NEW_DRAFT_KEY } from "./new-chat";
import { useProjects } from "./projects-provider";
import { AiConnectionsPanel } from "../ai/ai-connections";
import { EDIT_STARTERS, STARTERS } from "./starters";
import { TopBar } from "./top-bar";

function PageFrame({
  title,
  eyebrow,
  heading,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  heading: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="workspace-canvas flex h-dvh flex-col">
      <TopBar projectId={null} title={title} />
      <main className="flex-1 overflow-auto" id="workspace-main">
        <div className="mx-auto max-w-5xl px-5 py-10 sm:px-10 sm:py-14">
          <div className="app-page-heading">
            <div className="app-page-content">
              <p className="studio-eyebrow">
                <span />
                {eyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                {heading}
              </h2>
              <p className="mt-3 max-w-xl text-xs leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          <div className="mt-9">{children}</div>
        </div>
      </main>
    </div>
  );
}
export function ProjectsPage() {
  const { projects, error, refresh } = useProjects();
  const [query, setQuery] = useState("");
  const shown = (projects ?? []).filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <PageFrame
      description="Every conversation has its own project and Studio connection. Open one to continue creating."
      eyebrow="PICK UP WHERE YOU LEFT OFF"
      heading="Your ideas, in progress."
      title="Projects"
    >
      <div className="mb-7 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            aria-label="Find a project"
            className="h-10 pl-9"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a project…"
            value={query}
          />
        </div>
        <Link className="studio-button is-sm" href="/app">
          New creation <ArrowUpRightIcon className="size-4" />
        </Link>
      </div>
      {error ? (
        <div className="rounded-md border border-border p-6">
          <p className="text-sm" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="mt-3 text-sm text-signal underline"
            onClick={refresh}
          >
            Try again
          </button>
        </div>
      ) : null}
      {!projects && !error ? (
        <p
          className="flex items-center gap-3 text-sm text-muted-foreground"
          role="status"
        >
          <UiverseBuildLoader /> Loading your projects…
        </p>
      ) : null}
      {projects && shown.length === 0 && !error ? (
        <div className="py-14 text-center">
          <FolderIcon className="mx-auto mb-5 size-8 text-muted-foreground" />
          <h3 className="font-medium">
            {query ? "No matching projects" : "Your first idea starts here"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {query
              ? "Try another name."
              : "Start a conversation and your project will appear here."}
          </p>
          {query ? (
            <button
              type="button"
              className="mt-5 text-sm text-signal"
              onClick={() => setQuery("")}
            >
              Clear search
            </button>
          ) : (
            <Link className="studio-button mt-5" href="/app">
              Create a project
            </Link>
          )}
        </div>
      ) : null}
      <ul className="project-table">
        {shown.map((p) => (
          <li key={p.id}>
            <Link href={`/app/chat/${p.id}`}>
              <FolderIcon />
              <span>{p.name}</span>
              <small>
                Updated{" "}
                {new Date(p.updated_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </small>
              <ArrowUpRightIcon />
            </Link>
          </li>
        ))}
      </ul>
    </PageFrame>
  );
}
export function LibraryPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState<string | null>(null);
  const examples = [...STARTERS, ...EDIT_STARTERS];
  const usePrompt = (text: string) => {
    try {
      sessionStorage.setItem(NEW_DRAFT_KEY, text);
      router.push("/app");
    } catch {
      setError(
        "Your browser could not save the draft. Copy the example below into a new chat."
      );
    }
  };
  return (
    <PageFrame
      description="Examples you can make your own. Choose a starting point, edit the request, then send it when you’re ready."
      eyebrow="A PLACE TO START"
      heading="Small prompts. New possibilities."
      title="Prompt library"
    >
      <div
        aria-label="Filter prompts"
        className="uiverse-filter-group mb-6"
        data-uiverse="andrew-demchenk0/hot-bird-10"
        role="group"
      >
        {["All", "Create", "Improve"].map((f) => (
          <button
            type="button"
            aria-pressed={filter === f}
            className={`rounded-md border px-4 py-2 text-xs transition-colors ${filter === f ? "border-signal bg-signal/5 text-signal" : "border-border text-muted-foreground hover:bg-muted"}`}
            key={f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      {error ? (
        <p className="mb-5 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2">
        {examples
          .filter(
            (_, i) => filter === "All" || (filter === "Create" ? i < 3 : i >= 3)
          )
          .map((s, i) => (
            <li
              className="prompt-library-card luminous-panel"
              data-uiverse="satyamchaudharydev/itchy-chipmunk-95"
              key={s.title}
            >
              <PromptArtwork kind={i} />
              <div className="flex items-center gap-3">
                <s.icon className="size-5 text-signal" />
                <span className="studio-eyebrow">{s.category}</span>
              </div>
              <h3 className="mt-5 font-medium">{s.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
                {s.text}
              </p>
              <button
                type="button"
                className="mt-6 flex items-center gap-2 text-sm font-medium text-signal"
                onClick={() => usePrompt(s.text)}
              >
                Use this prompt <ArrowUpRightIcon className="size-4" />
              </button>
            </li>
          ))}
      </ul>
    </PageFrame>
  );
}
export function SettingsPage() {
  const session = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <PageFrame
      description="Manage your workspace appearance and see the account you’re creating with."
      eyebrow="MAKE YOURSELF AT HOME"
      heading="Your workspace, your way."
      title="Settings"
    >
      <div className="settings-layout">
        <div className="settings-controls divide-y divide-border luminous-panel">
          <section className="p-6">
            <h3 className="font-medium">Appearance</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a theme that feels comfortable.
            </p>
            <div
              aria-label="Appearance"
              className="mt-5 uiverse-appearance-group"
              data-uiverse="andrew-demchenk0/hot-bird-10"
              role="group"
            >
              {[
                { icon: SunIcon, id: "light", label: "Light" },
                { icon: MoonIcon, id: "dark", label: "Dark" },
                { icon: MonitorIcon, id: "system", label: "System" },
              ].map((t) => (
                <button
                  type="button"
                  aria-pressed={mounted && theme === t.id}
                  className={`flex flex-col items-center gap-3 rounded-md border py-5 text-sm transition-colors ${mounted && theme === t.id ? "border-signal bg-signal/5 text-signal" : "border-border hover:bg-muted"}`}
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                >
                  <t.icon className="size-5" />
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Motion follows your device’s reduced-motion preference.
            </p>
          </section>
          <section className="p-6">
            <h3 className="font-medium">Account</h3>
            <p className="mt-2 break-all text-sm text-muted-foreground">
              {session === undefined
                ? "Loading account…"
                : (session?.user.email ??
                  "No signed-in account in this preview.")}
            </p>
          </section>
          <section className="p-6" aria-label="AI connections"><AiConnectionsPanel /></section>
          <section className="p-6">
            <h3 className="mb-4 font-medium">Credits</h3>
            <CreditsMeter />
            <Link
              className="mt-4 inline-block text-sm text-signal"
              href="/pricing"
            >
              View plans and pricing →
            </Link>
          </section>
          <section className="p-6">
            <h3 className="font-medium">Connecting your project</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open a project and choose Connect Studio to pair it with your
              place. Each project has its own connection.
            </p>
            <Link
              className="mt-4 inline-flex items-center gap-2 text-sm text-signal"
              href="/docs#pair"
            >
              <BookOpenIcon className="size-4" />
              Read the setup guide
            </Link>
          </section>
        </div>
        <aside className="settings-preview" aria-label="Appearance preview">
          <p className="studio-eyebrow">YOUR CREATIVE SPACE</p>
          <h3>Make room for your next idea.</h3>
          <p className="settings-preview-note">
            Your theme follows you across every project. Preview the colors and
            controls below.
          </p>
          <StyleTile />
        </aside>
      </div>
    </PageFrame>
  );
}
