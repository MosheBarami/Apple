"use client";
import { UiverseDots } from "@/components/uiverse/elements";
import { BuildConstellation } from "@/components/creative/atmosphere";

import type { FlueConversationMessage } from "@flue/sdk";
import {
  CheckCircle2Icon,
  FileIcon,
  PlugIcon,
  XCircleIcon,
  PanelRightIcon,
  RefreshCwIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  getProject,
  studioLink,
  type Project,
  type StudioLink,
} from "@/lib/api";

export function ProjectWorkbench({
  projectId,
  title,
  messages = [],
  busy = false,
}: {
  projectId: string | null;
  title?: string;
  messages?: FlueConversationMessage[];
  busy?: boolean;
}) {
  const [tab, setTab] = useState<"project" | "activity" | "source">("project");
  const [project, setProject] = useState<Project | null>(null);
  const [link, setLink] = useState<StudioLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    setProject(null);
    setLink(null);
    setLoaded(false);
    if (!projectId) {
      setLoaded(true);
      return;
    }
    let live = true;
    const load = async () => {
      const [p, l] = await Promise.allSettled([
        getProject(projectId),
        studioLink(projectId),
      ]);
      if (!live) return;
      setProject(p.status === "fulfilled" ? p.value : null);
      setLink(l.status === "fulfilled" ? l.value : null);
      setLoaded(true);
    };
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [projectId, revision]);
  const tools = messages.flatMap((m) =>
    m.parts.filter((p) => p.type === "dynamic-tool")
  );
  const scripts = tools.flatMap((p) => {
    if (p.type !== "dynamic-tool") return [];
    const input = p.input as Record<string, unknown> | undefined;
    const output = p.output as Record<string, unknown> | undefined;
    const source = [
      input?.source,
      input?.code,
      input?.script,
      input?.luau,
      output?.source,
      output?.code,
    ].find((x) => typeof x === "string");
    return source
      ? [{ id: p.toolCallId, name: p.toolName, source: source as string }]
      : [];
  });
  const content = (
    <>
      <div className="workbench-tabs" role="group" aria-label="Project panels">
        {(["project", "activity", "source"] as const).map((t) => (
          <button
            type="button"
            key={t}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t === "project"
              ? "Project"
              : t === "activity"
                ? "Activity"
                : "Source"}
          </button>
        ))}
      </div>
      <div className="workbench-content">
        {tab === "project" ? (
          <>
            <div className="workbench-title">
              <PlugIcon />
              <span>{title ?? project?.name ?? "Studio connection"}</span>
            </div>
            {projectId ? (
              <>
                <dl className="workbench-details">
                  <div>
                    <dt>Project</dt>
                    <dd>
                      {project?.name ??
                        title ??
                        (!loaded ? "Loading…" : "Unavailable")}
                    </dd>
                  </div>
                  <div>
                    <dt>Studio</dt>
                    <dd>
                      {!loaded
                        ? "Checking…"
                        : link?.connected
                          ? "Connected"
                          : link?.paired
                            ? "Disconnected"
                            : link
                              ? "Not paired"
                              : "Status unavailable"}
                    </dd>
                  </div>
                  {project ? (
                    <div>
                      <dt>Updated</dt>
                      <dd>
                        {new Date(project.updated_at).toLocaleDateString()}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <p>
                  Connection and edit access are controlled by the plugin in
                  your Studio window.
                </p>
                <button
                  type="button"
                  className="workbench-refresh"
                  onClick={() => setRevision((v) => v + 1)}
                  disabled={!loaded}
                >
                  <RefreshCwIcon />
                  Refresh status
                </button>
              </>
            ) : (
              <>
                <BuildConstellation />
                <span className="workbench-eyebrow">IDEA → STUDIO</span>
                <h3>Your next creation<br />starts with a connection.</h3>
                <p>
                  Create a conversation, then use Connect Studio to pair the
                  project with your place.
                </p>
                <ol>
                  <li>Open your place in Roblox Studio.</li>
                  <li>Open the StudPilot plugin.</li>
                  <li>Enter the code from your project.</li>
                  <li>Enable edits when you are ready.</li>
                </ol>
              </>
            )}
            <Link href="/docs#pair">Open the connection guide →</Link>
          </>
        ) : tab === "activity" ? (
          <>
            <div className="workbench-title">
              {busy ? (
                <UiverseDots  />
              ) : (
                <CheckCircle2Icon />
              )}
              <span>{busy ? "Agent is working" : "Conversation activity"}</span>
            </div>
            {tools.length ? (
              tools.map((p) =>
                p.type === "dynamic-tool" ? (
                  <details key={p.toolCallId} className="activity-record">
                    <summary>
                      {p.state === "output-error" ? (
                        <XCircleIcon />
                      ) : p.state === "output-available" ? (
                        <CheckCircle2Icon />
                      ) : (
                        <UiverseDots
                          className={busy ? "" : "uiverse-dots-idle"}
                        />
                      )}
                      <span>{p.toolName.replaceAll("_", " ")}</span>
                      <small>
                        {p.state === "output-available"
                          ? "Returned"
                          : p.state === "output-error"
                            ? "Failed"
                            : "Pending"}
                      </small>
                    </summary>
                    <pre>
                      {JSON.stringify(p.output ?? p.input ?? {}, null, 2)}
                    </pre>
                  </details>
                ) : null
              )
            ) : (
              <p>
                Tool activity from this conversation will appear here. No work
                has been reported yet.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="workbench-title">
              <FileIcon />
              <span>Script context</span>
            </div>
            {scripts.length ? (
              scripts.map((s) => (
                <div className="source-record" key={s.id}>
                  <p>{s.name.replaceAll("_", " ")}</p>
                  <pre>{s.source}</pre>
                </div>
              ))
            ) : (
              <p>
                When the agent shares script changes, you can inspect their
                source here. Your place remains in Roblox Studio.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
  return (
    <>
      <aside className="project-workbench" aria-label="Project workspace">
        {content}
      </aside>
      <button
        type="button"
        className="workbench-mobile-trigger"
        aria-label="Open project panel"
        onClick={() => setMobileOpen(true)}
      >
        <PanelRightIcon />
        Project panel
      </button>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          className="workbench-mobile-dialog"
          aria-describedby={undefined}
        >
          <DialogTitle>Project workspace</DialogTitle>
          {content}
        </DialogContent>
      </Dialog>
    </>
  );
}
