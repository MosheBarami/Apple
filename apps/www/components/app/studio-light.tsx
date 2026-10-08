"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { connectStudio, createProject, disconnectStudio, type StudioCandidate, type StudioLink, studioLink } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useProjects } from "./projects-provider";

/** How long Connect keeps looking for a waiting Studio before it says so. */
const LOOK_FOR_MS = 30_000;
const LOOK_EVERY_MS = 2_500;

type Phase =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "choose"; candidates: StudioCandidate[] }
  | { kind: "notFound" }
  | { kind: "error"; message: string };

function useStudioLink(projectId: string | null, fast: boolean) {
  const [link, setLink] = useState<StudioLink | null>(null);
  useEffect(() => {
    setLink(null);
  }, [projectId]);
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    const read = () => studioLink(projectId).then(l => live && setLink(l), () => live && setLink(null));
    void read();
    const timer = setInterval(read, fast ? 1_500 : 10_000);
    return () => { live = false; clearInterval(timer); };
  }, [projectId, fast]);
  return [link, setLink] as const;
}

const message = (e: unknown, fallback: string) => (e instanceof Error && e.name !== "TimeoutError" ? e.message : fallback);

function Dot({ tone }: { tone: "on" | "busy" | "off" | "bad" }) {
  return (
    <span aria-hidden className="relative flex size-2.5">
      {tone === "busy" ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500/60" /> : null}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full border transition-colors duration-300",
          tone === "on" && "border-emerald-500 bg-emerald-500",
          tone === "busy" && "border-amber-500 bg-amber-500",
          tone === "off" && "border-muted-foreground/50 bg-transparent",
          tone === "bad" && "border-destructive bg-destructive",
        )}
      />
    </span>
  );
}

/**
 * The Studio Connect control. One button: press it and this project connects to the Roblox Studio that has the StudPilot
 * plugin open (matched on the server by the linked Roblox account or the network). No code, nothing to copy.
 */
export function StudioLight({ projectId, openOnMount = false }: { projectId: string | null; openOnMount?: boolean }) {
  const router = useRouter();
  const { refresh } = useProjects();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useStudioLink(projectId, phase.kind === "looking" || busy);
  const connected = link?.connected === true;
  const placeName = link?.place?.placeName;
  const attempt = useRef(0);
  const autoStarted = useRef(false);

  useEffect(() => {
    attempt.current += 1;
    setPhase({ kind: "idle" });
  }, [projectId]);

  // Connected ends any search in progress.
  useEffect(() => {
    if (connected && phase.kind !== "idle") {
      attempt.current += 1;
      setPhase({ kind: "idle" });
    }
  }, [connected, phase.kind]);

  const look = useCallback(async (id: string, pickId?: string) => {
    const mine = ++attempt.current;
    setPhase({ kind: "looking" });
    const until = Date.now() + LOOK_FOR_MS;
    try {
      for (;;) {
        const result = await connectStudio(id, pickId);
        if (mine !== attempt.current) return;
        if (result.status === "connected") return; // the link poll turns the light green once Studio collects its token
        if (result.status === "choose") {
          setPhase({ kind: "choose", candidates: result.candidates });
          return;
        }
        if (Date.now() >= until) {
          setPhase({ kind: "notFound" });
          return;
        }
        await new Promise(r => setTimeout(r, LOOK_EVERY_MS));
        if (mine !== attempt.current) return;
      }
    } catch (e) {
      if (mine === attempt.current) setPhase({ kind: "error", message: message(e, "Could not reach StudPilot. Please try again.") });
    }
  }, []);

  const start = useCallback(async () => {
    if (busy) return;
    if (projectId) {
      void look(projectId);
      return;
    }
    setBusy(true);
    try {
      const id = await createProject("Studio connection");
      refresh();
      router.push(`/app/chat/${id}?pair=1`);
    } catch (e) {
      setPhase({ kind: "error", message: message(e, "Could not open the project. Please try again.") });
    } finally {
      setBusy(false);
    }
  }, [busy, look, projectId, refresh, router]);

  useEffect(() => {
    if (openOnMount && projectId && !autoStarted.current) {
      autoStarted.current = true;
      void look(projectId);
    }
  }, [openOnMount, projectId, look]);

  const stop = () => {
    attempt.current += 1;
    setPhase({ kind: "idle" });
  };

  const disconnect = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      await disconnectStudio(projectId);
      setLink(l => (l ? { ...l, connected: false, paired: false } : l));
    } catch (e) {
      setPhase({ kind: "error", message: message(e, "Could not disconnect Studio. Please try again.") });
    } finally {
      setBusy(false);
    }
  };

  if (connected) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="max-w-56 gap-2" data-testid="studio-light" disabled={busy} size="sm" variant="outline">
            <Dot tone="on" />
            <span className="truncate">{placeName ?? "Studio connected"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">Connected to Roblox Studio</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void disconnect()} variant="destructive">Disconnect</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const tone = phase.kind === "looking" || busy ? "busy" : phase.kind === "error" ? "bad" : "off";
  const label = phase.kind === "looking" ? "Looking for Studio…" : phase.kind === "error" || phase.kind === "notFound" ? "Retry" : "Connect Studio";
  const open = phase.kind !== "idle";

  return (
    <Popover open={open} onOpenChange={value => { if (!value) stop(); }}>
      <PopoverAnchor asChild>
        <Button
          aria-live="polite"
          className="gap-2"
          data-testid="studio-light"
          disabled={busy}
          onClick={() => (phase.kind === "looking" ? stop() : void start())}
          size="sm"
          variant="outline"
        >
          <Dot tone={tone} />
          {label}
        </Button>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-64 space-y-2 text-sm" onOpenAutoFocus={e => e.preventDefault()}>
        {phase.kind === "looking" ? (
          <p className="text-muted-foreground" role="status">Open Roblox Studio with the StudPilot plugin. It connects as soon as Studio is found.</p>
        ) : null}
        {phase.kind === "notFound" ? (
          <p className="text-muted-foreground" role="status">No Studio found. Open Roblox Studio with the StudPilot plugin on this computer, then retry.</p>
        ) : null}
        {phase.kind === "error" ? <p className="text-destructive" role="alert">{phase.message}</p> : null}
        {phase.kind === "choose" ? (
          <div className="space-y-1">
            <p className="text-muted-foreground">Which Studio should this project use?</p>
            {phase.candidates.map(c => (
              <Button className="w-full justify-start truncate" key={c.pickId} onClick={() => projectId && void look(projectId, c.pickId)} size="sm" variant="ghost">
                {c.placeName}
              </Button>
            ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
