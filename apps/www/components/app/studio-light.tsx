"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { UiverseBuildLoader } from "@/components/uiverse/elements";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelPairingCode, createProject, type PairingCode, pairingCode, type StudioLink, studioLink } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useProjects } from "./projects-provider";

function useStudioLink(projectId: string | null) {
  const [link, setLink] = useState<StudioLink | null>(null);
  useEffect(() => {
    setLink(null);
    if (!projectId) return;
    let live = true;
    const read = () => studioLink(projectId).then(l => live && setLink(l), () => live && setLink(null));
    void read();
    const timer = setInterval(read, 10_000);
    return () => { live = false; clearInterval(timer); };
  }, [projectId]);
  return link;
}

export function StudioLight({ projectId, openOnMount = false }: { projectId: string | null; openOnMount?: boolean }) {
  const router = useRouter();
  const { refresh } = useProjects();
  const link = useStudioLink(projectId);
  const connected = link?.connected === true;
  const [open, setOpen] = useState(openOnMount);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const openRef = useRef(openOnMount);
  const codeRef = useRef<PairingCode | null>(null);
  const createdProject = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const lastProject = useRef(projectId);
  const trigger = useRef<HTMLButtonElement>(null);

  // Reset before the auto-open effect below starts a request for a new project.
  useEffect(() => {
    if (lastProject.current === projectId) return;
    lastProject.current = projectId;
    requestVersion.current += 1;
    codeRef.current = null;
    setCode(null);
    setError(null);
  }, [projectId]);

  const changeOpen = (value: boolean) => {
    openRef.current = value;
    setOpen(value);
    if (!value && projectId && codeRef.current && !connected) {
      const old = codeRef.current;
      codeRef.current = null;
      setCode(null);
      void cancelPairingCode(projectId, old.code).catch(() => {
        // A failed cancellation is not presented as a successful revocation;
        // the credential still expires on the server.
      });
    }
  };

  const makeCode = useCallback(async (id: string) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setCopied(false);
    const version = ++requestVersion.current;
    try {
      const old = codeRef.current;
      if (old) await cancelPairingCode(id, old.code);
      codeRef.current = null;
      setCode(null);
      const next = await pairingCode(id);
      if (version !== requestVersion.current || !openRef.current) {
        await cancelPairingCode(id, next.code);
        return;
      }
      codeRef.current = next;
      setCode(next);
      setNow(Date.now());
    } catch (e) {
      if (version === requestVersion.current && openRef.current) {
        setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "The connection request timed out. Please try again.");
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (open && projectId && !connected && !code && !error && !busy) void makeCode(projectId);
  }, [open, projectId, connected, code, error, busy, makeCode]);

  useEffect(() => {
    if (!open || !code) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, code]);

  const start = async () => {
    if (pending.current) return;
    changeOpen(true);
    setError(null);
    if (projectId) return;
    pending.current = true;
    setBusy(true);
    try {
      const id = createdProject.current ?? await createProject("Studio connection");
      createdProject.current = id;
      refresh();
      if (openRef.current) router.push(`/app/chat/${id}?pair=1`);
    } catch (e) {
      setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "Could not open the project. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const expiresAt = code ? Date.parse(code.expiresAtIso) : NaN;
  const seconds = Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;
  const expired = seconds === 0;
  const copy = async () => {
    if (!code || expired) return;
    try { await navigator.clipboard.writeText(code.code); setCopied(true); }
    catch { setError("Copy is unavailable. You can select the code and copy it manually."); }
  };

  return (
    <>
      <Button ref={trigger} className="gap-2" data-testid="studio-light" onClick={start} size="sm" variant="outline" disabled={busy}>
        <span aria-hidden className={cn("size-2.5 rounded-full border transition-colors duration-300", connected ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/50 bg-transparent")} />
        {connected ? "Studio connected" : "Connect Studio"}
      </Button>
      <Dialog onOpenChange={changeOpen} open={open}>
        <DialogContent className="uiverse-pairing-dialog" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle className="text-lg">{connected ? "Studio is connected" : "Connect Studio"}</DialogTitle>
            <DialogDescription>{connected ? "The plugin is connected to this project. Check the plugin’s edit permission before asking for changes." : "Open the StudPilot plugin in your Roblox Studio window, then enter the connection code."}</DialogDescription>
          </DialogHeader>
          {connected ? null : (
            <div className="space-y-4 text-center">
              {busy ? <div className="flex items-center justify-center gap-3 py-5" role="status"><UiverseBuildLoader /><span>{projectId ? "Creating your connection code…" : "Opening your Studio project…"}</span></div> : null}
              {error ? <p className="text-destructive text-sm" role="alert">{error}</p> : null}
              {code && !expired ? <><p className="uiverse-pair-code font-mono" data-testid="pairing-code" aria-label="Connection code">{code.code}</p><Button onClick={copy} variant="outline" size="sm">{copied ? "Copied" : "Copy code"}</Button></> : null}
              {expired ? <p role="status">This code has expired. Get a new code to connect.</p> : null}
              <p className="text-muted-foreground text-xs">{code && seconds !== null && !expired ? `Expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}. ` : "The code works once and expires in 10 minutes. "}The connection indicator turns green when the plugin connects.</p>
              {!busy && (error || code) ? <Button onClick={() => projectId ? void makeCode(projectId) : void start()} size="sm" variant="secondary">{code ? "Get a new code" : "Try again"}</Button> : null}
              <a href="/docs#pair" className="inline-block text-sm underline underline-offset-4">Plugin setup guide</a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
