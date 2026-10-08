import { BookOpenIcon, ChevronRightIcon, FilePlus2Icon, FolderSearchIcon, PencilLineIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The hero's product moment: one example run, drawn in HTML, in the shape the app shows a real one
// (request, reasoning, reads, documentation searches, changes, reply with citations, undo). Steps fade
// in once on load; with reduced motion they are simply there. Everything is rendered from the start,
// so nothing shifts.

const STEPS = [
  { Icon: FolderSearchIcon, verb: "Read", target: "Workspace.Stages", note: "14 stages" },
  { Icon: BookOpenIcon, verb: "Searched docs", target: "SpawnLocation", note: "1 page" },
  { Icon: BookOpenIcon, verb: "Searched docs", target: "Data stores limits", note: "2 pages" },
  { Icon: FilePlus2Icon, verb: "Created", target: "Stage1.Checkpoint", note: "+13 more" },
  { Icon: FilePlus2Icon, verb: "Created", target: "ServerScriptService.CheckpointService", note: "" },
  { Icon: PencilLineIcon, verb: "Edited", target: "StarterGui.HUD.StageLabel", note: "" },
];

const appear = "motion-safe:animate-[fade-up_240ms_cubic-bezier(0.2,0.8,0.2,1)_both]";

function Cite({ n }: { n: number }) {
  return (
    <sup className="ml-0.5 font-medium font-mono text-[10px] text-brand">[{n}]</sup>
  );
}

export function AgentTranscript({ className }: { className?: string }) {
  let delay = 300;
  const next = (step = 260) => {
    delay += step;
    return { animationDelay: `${delay}ms` };
  };
  return (
    <figure className={cn("relative", className)}>
      <div className="overflow-hidden rounded-[14px] border bg-card shadow-[0_1px_0_0_var(--border),0_24px_48px_-24px_rgb(26_26_24/0.18)]">
        <div className="flex items-center justify-between border-b px-4 py-2.5 sm:px-5">
          <span className="font-medium text-[13px]">Tower Obby</span>
          <span className="font-mono text-[11.5px] text-muted-foreground">Studio connected</span>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-5">
          <div className="ml-auto max-w-[88%] rounded-xl bg-secondary px-3.5 py-2.5 text-[14px] leading-relaxed">
            Add checkpoints to my obby. Players should respawn at the last one they touched and keep their stage when they rejoin.
          </div>

          <div className="space-y-3">
            <div className={cn("flex items-center gap-1.5 text-[13px] text-muted-foreground", appear)} style={next(0)}>
              <ChevronRightIcon className="size-3.5" />
              <span className="shrink-0 pr-1">Thought for 4s</span>
              <span className="min-w-0 truncate text-muted-foreground/80">One checkpoint per stage, saved with a data store</span>
            </div>

            <ol className="space-y-px rounded-lg border bg-background/60 py-1">
              {STEPS.map(({ Icon, verb, target, note }) => (
                <li className={cn("flex items-center gap-2.5 px-3 py-1.5 text-[12.5px]", appear)} key={`${verb}${target}`} style={next()}>
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 text-muted-foreground">{verb}</span>
                  <span className="min-w-0 truncate font-mono text-[12px]">{target}</span>
                  {note ? <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] text-muted-foreground">{note}</span> : null}
                </li>
              ))}
            </ol>

            <div className={cn("space-y-3 text-[14px] leading-relaxed", appear)} style={next(380)}>
              <p>
                Each of the 14 stages now has a checkpoint pad. Touching one sets the player&rsquo;s respawn point
                <Cite n={1} />, and their stage is saved when they leave and every 60 seconds, well under the write limit
                <Cite n={2} />.
              </p>
              <p className="text-muted-foreground">Press Play, touch the pad on stage 3, then reset.</p>
              <ol className="space-y-1 border-t pt-3 font-mono text-[11.5px] text-muted-foreground">
                <li className="truncate">
                  <span className="text-brand">[1]</span> SpawnLocation, create.roblox.com/docs
                </li>
                <li className="truncate">
                  <span className="text-brand">[2]</span> Data stores, create.roblox.com/docs
                </li>
              </ol>
            </div>

            <div className={cn("flex items-center justify-between gap-3 pt-1 text-[12.5px] text-muted-foreground", appear)} style={next(200)}>
              <span>Checkpoint saved before this run. 1.62 credits</span>
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-foreground">
                <RotateCcwIcon className="size-3" />
                Undo
              </span>
            </div>
          </div>
        </div>

        <div className="border-t bg-background/40 px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-[13.5px]">
            <span className="text-muted-foreground">Describe what you want…</span>
            <span className="font-mono text-[11.5px] text-muted-foreground">3.38 credits left</span>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-[12.5px] text-muted-foreground">
        An example run, drawn the way the app shows one. The changes land in your place in Studio.
      </figcaption>
    </figure>
  );
}
