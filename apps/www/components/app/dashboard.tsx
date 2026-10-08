"use client";

// /app: the projects home. Each Roblox game is its own project.
import { formatDistanceToNowStrict } from "date-fns";
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { createProject } from "@/lib/api";
import {
  type AppProject,
  type LastOutcome,
  deleteProject,
  readOutcomes,
  renameProject,
} from "@/lib/app-api";
import { cn } from "@/lib/utils";
import { useProjects } from "./projects-provider";

const SEARCH_FROM = 6;

export function Dashboard() {
  const { projects, error, refresh } = useProjects();
  const [query, setQuery] = useState("");
  const [outcomes, setOutcomes] = useState<ReturnType<typeof readOutcomes>>({});
  useEffect(() => setOutcomes(readOutcomes()), []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.place_name?.toLowerCase().includes(q)
    );
  }, [projects, query]);

  const empty = projects !== null && projects.length === 0 && !error;

  return (
    <div className="flex min-h-dvh flex-col bg-background" id="workspace-main">
      <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4 md:hidden">
        <SidebarTrigger className="text-muted-foreground" />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-16 sm:px-6 md:pt-16">
        {empty ? (
          <EmptyState />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-semibold text-2xl tracking-tight">Projects</h1>
                <p className="mt-1 text-muted-foreground text-sm">One project for each game you build with StudPilot.</p>
              </div>
            </div>
            <div className="mt-6">
              <CreateProject />
            </div>
            {projects && projects.length >= SEARCH_FROM ? (
              <div className="relative mt-6">
                <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search projects"
                  className="h-9 pl-9"
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects"
                  type="search"
                  value={query}
                />
              </div>
            ) : null}
            <section aria-label="Your projects" className="mt-4">
              {error ? (
                <div className="rounded-lg border border-border p-4 text-sm" role="alert">
                  <p>{error}</p>
                  <Button className="mt-3" onClick={refresh} size="sm" variant="outline">
                    Try again
                  </Button>
                </div>
              ) : projects === null ? (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {[0, 1, 2].map((i) => (
                    <div className="flex items-center gap-3 px-4 py-4" key={i}>
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="ml-auto h-3 w-16" />
                    </div>
                  ))}
                </div>
              ) : shown.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground text-sm">No project matches “{query}”.</p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card" data-testid="project-list">
                  {shown.map((p) => (
                    <ProjectRow key={p.id} outcome={outcomes[p.id]?.outcome} project={p} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-[12vh] max-w-md">
      <h1 className="font-semibold text-2xl tracking-tight">Start your first project</h1>
      <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
        A project is one Roblox game. Name it, connect Studio, then tell StudPilot what to build.
      </p>
      <div className="mt-6">
        <CreateProject autoFocus />
      </div>
    </div>
  );
}

function CreateProject({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useProjects();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const focusNew = params.get("new") === "1";
  useEffect(() => {
    if (autoFocus || focusNew) {
      input.current?.focus();
    }
  }, [autoFocus, focusNew]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const id = await createProject(name.trim() || "Untitled project");
      refresh();
      router.push(`/app/projects/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The project could not be created.");
      setBusy(false);
    }
  };

  return (
    <form className="flex gap-2" data-testid="create-project" onSubmit={submit}>
      <label className="sr-only" htmlFor="new-project-name">
        Project name
      </label>
      <Input
        className="h-10 flex-1"
        id="new-project-name"
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        placeholder="New project name"
        ref={input}
        value={name}
      />
      <Button className="h-10 px-4" disabled={busy} type="submit">
        <PlusIcon /> {busy ? "Creating…" : "Create"}
      </Button>
    </form>
  );
}

const OUTCOME_TEXT: Record<LastOutcome, string> = {
  failed: "Last request failed",
  finished: "Last request finished",
  stopped: "Last request stopped",
};

function ProjectRow({ project, outcome }: { project: AppProject; outcome?: LastOutcome }) {
  const { refresh } = useProjects();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const when = project.last_activity_at ?? project.updated_at;

  const saveName = async () => {
    setRenaming(false);
    if (name.trim() === project.name || !name.trim()) {
      setName(project.name);
      return;
    }
    try {
      await renameProject(project.id, name);
      refresh();
    } catch (err) {
      setName(project.name);
      toast.error(err instanceof Error ? err.message : "The project could not be renamed.");
    }
  };

  const remove = async () => {
    try {
      await deleteProject(project.id);
      toast.success(`Deleted ${project.name}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The project could not be deleted.");
    }
  };

  return (
    <li className="group relative flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        {renaming ? (
          <Input
            aria-label="Project name"
            autoFocus
            className="h-8 max-w-sm"
            maxLength={80}
            onBlur={saveName}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                setName(project.name);
                setRenaming(false);
              }
            }}
            value={name}
          />
        ) : (
          <Link
            className="block truncate font-medium text-[15px] outline-none after:absolute after:inset-0 focus-visible:underline"
            href={`/app/projects/${project.id}`}
          >
            {name}
          </Link>
        )}
        <p className="mt-0.5 text-muted-foreground text-xs">
          <span>
            {project.place_name ? project.place_name : "No place connected"} ·{" "}
            {formatDistanceToNowStrict(new Date(when), { addSuffix: true })}
          </span>
          {outcome ? (
            <span className={cn("whitespace-nowrap", outcome === "failed" && "text-destructive")}>
              {" "}
              · {OUTCOME_TEXT[outcome]}
            </span>
          ) : null}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Actions for ${project.name}`}
            className="relative z-10 text-muted-foreground"
            size="icon-sm"
            variant="ghost"
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <PencilIcon /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirmDelete(true)} variant="destructive">
            <Trash2Icon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The project is removed from your StudPilot projects. Your place in Roblox Studio is not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} variant="destructive">
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
