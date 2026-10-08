"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createProject,
  type PairingCode,
  pairingCode,
  type StudioLink,
  studioLink,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useProjects } from "./projects-provider";

/** Whether Studio is connected to this chat, read every 10 s (null until the first answer). */
function useStudioLink(projectId: string | null) {
  const [link, setLink] = useState<StudioLink | null>(null);
  useEffect(() => {
    if (!projectId) {
      setLink(null);
      return;
    }
    setLink(null);
    let live = true;
    const read = () =>
      studioLink(projectId).then(
        (l) => live && setLink(l),
        () => live && setLink(null)
      );
    read();
    const timer = setInterval(read, 10_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [projectId]);
  return link;
}

export function StudioLight({
  projectId,
  openOnMount = false,
}: {
  projectId: string | null;
  openOnMount?: boolean;
}) {
  const router = useRouter();
  const { refresh } = useProjects();
  const link = useStudioLink(projectId);
  const connected = link?.connected === true;
  const [open, setOpen] = useState(openOnMount);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const makeCode = useCallback(async (id: string) => {
    setError(null);
    try {
      setCode(await pairingCode(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (open && projectId && !connected && !code && !error) {
      makeCode(projectId);
    }
  }, [open, projectId, connected, code, error, makeCode]);

  const onClick = async () => {
    if (projectId) {
      setOpen(true);
      return;
    }
    // No chat yet: make one so the code has something to pair with, then open the dialog there.
    try {
      const id = await createProject("New chat");
      refresh();
      router.push(`/app/chat/${id}?pair=1`);
    } catch (e) {
      setError((e as Error).message);
      setOpen(true);
    }
  };

  return (
    <>
      <Button
        className="gap-2 bg-background transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-px hover:shadow-card"
        data-testid="studio-light"
        onClick={onClick}
        size="sm"
        variant="outline"
      >
        <span
          aria-hidden
          className={cn(
            "size-2.5 rounded-full border transition-colors duration-300",
            connected
              ? "border-emerald-500 bg-emerald-500"
              : "border-muted-foreground/50 bg-transparent"
          )}
        />
        {connected ? "Studio connected" : "Connect Studio"}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg">
              {connected ? "Studio is connected" : "Connect Studio"}
            </DialogTitle>
            <DialogDescription>
              {connected
                ? "The plugin is connected to this project. Check the plugin’s edit permission before asking for changes."
                : "In Roblox Studio, open the StudPilot plugin and enter this code."}
            </DialogDescription>
          </DialogHeader>
          {connected ? null : (
            <div className="space-y-3 text-center">
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : (
                <p
                  className="flex justify-center gap-1.5 font-mono text-2xl"
                  data-testid="pairing-code"
                >
                  {(code?.code ?? "······").split("").map((ch, i) => (
                    <span
                      className="grid h-12 w-10 place-items-center rounded-md border border-input bg-muted font-semibold tabular-nums"
                      // biome-ignore lint/suspicious/noArrayIndexKey: six fixed slots
                      key={i}
                    >
                      {ch}
                    </span>
                  ))}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                The code works once and expires in 10 minutes. This turns green
                when Studio connects.
              </p>
              {error || code ? (
                <Button
                  onClick={() => {
                    setCode(null);
                    setError(null);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Get a new code
                </Button>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
