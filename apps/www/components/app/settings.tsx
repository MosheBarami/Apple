"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { robloxUploads, robloxUploadsUrl, studioLink } from "@/lib/api";
import {
  DELETE_ACCOUNT_PHRASE,
  deleteAccount,
  disconnectStudio,
  exportAccount,
  formatCredits,
} from "@/lib/app-api";
import { supabase, useSession } from "@/lib/supabase";
import { CreditDetails, useAccount } from "./credits";
import { useProjects } from "./projects-provider";

export function SettingsPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background" id="workspace-main">
      <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4 md:hidden">
        <SidebarTrigger className="text-muted-foreground" />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-16 sm:px-6 md:pt-16">
        <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
        <div className="mt-8 divide-y divide-border border-border border-t">
          <AccountSection />
          <AppearanceSection />
          <StudioSection />
          <RobloxUploadsSection />
          <CreditsSection />
          <DataSection />
        </div>
      </main>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 py-8 md:grid-cols-[200px_1fr] md:gap-10">
      <div>
        <h2 className="font-medium text-[15px]">{title}</h2>
        {description ? <p className="mt-1 text-muted-foreground text-sm leading-relaxed">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function AccountSection() {
  const session = useSession();
  const email = session?.user.email;
  return (
    <Section title="Account">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">Signed in as</p>
          {session === undefined ? (
            <Skeleton className="mt-1 h-5 w-48" />
          ) : (
            <p className="truncate font-medium">{email ?? "Unknown account"}</p>
          )}
        </div>
        <Button
          onClick={async () => {
            await supabase().auth.signOut();
            location.assign("/login");
          }}
          variant="outline"
        >
          Sign out
        </Button>
      </div>
    </Section>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const value = (mounted ? theme : "system") as "light" | "dark" | "system";
  return (
    <Section description="System follows your device." title="Appearance">
      <Segmented
        aria-label="Theme"
        onValueChange={setTheme}
        options={[
          { label: (<><SunIcon /> Light</>), value: "light" },
          { label: (<><MoonIcon /> Dark</>), value: "dark" },
          { label: (<><MonitorIcon /> System</>), value: "system" },
        ]}
        value={value ?? "system"}
      />
    </Section>
  );
}

type Link_ = { id: string; name: string; place: string | null; connected: boolean };

function StudioSection() {
  const { projects } = useProjects();
  const [links, setLinks] = useState<Link_[] | null>(null);
  useEffect(() => {
    if (!projects) {
      return;
    }
    let live = true;
    const some = projects.slice(0, 30);
    Promise.all(
      some.map(async (p) => {
        const link = await studioLink(p.id).catch(() => null);
        return link?.paired ? { connected: link.connected, id: p.id, name: p.name, place: p.place_name } : null;
      })
    ).then((all) => live && setLinks(all.filter((x): x is Link_ => x !== null)));
    return () => {
      live = false;
    };
  }, [projects]);

  return (
    <Section description="Studio windows linked to your projects." title="Studio">
      {links === null ? (
        <Skeleton className="h-12 w-full" />
      ) : links.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No Studio is linked yet. Open a project and use Connect Studio in its header.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {links.map((l) => (
            <li className="flex items-center gap-3 px-4 py-3" key={l.id}>
              <span
                aria-hidden
                className={l.connected ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full border border-muted-foreground/50"}
              />
              <div className="min-w-0 flex-1">
                <Link className="block truncate font-medium text-sm hover:underline" href={`/app/projects/${l.id}`}>
                  {l.place ?? l.name}
                </Link>
                <p className="truncate text-muted-foreground text-xs">
                  {l.place ? `${l.name} · ` : ""}
                  {l.connected ? "Connected" : "Linked, Studio not open"}
                </p>
              </div>
              <Button
                onClick={async () => {
                  try {
                    await disconnectStudio(l.id);
                    setLinks((all) => all?.filter((x) => x.id !== l.id) ?? null);
                    toast.success("Studio disconnected");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
                size="sm"
                variant="outline"
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * Roblox uploads: StudPilot draws game art and uploads each picture into the person's own Roblox account. They allow it
 * once by signing in with Roblox (asset:read + asset:write); no key to create or paste.
 */
function RobloxUploadsSection() {
  const [state, setState] = useState<{ connected: boolean; username: string | null } | null | undefined>(undefined);
  const [going, setGoing] = useState(false);
  useEffect(() => {
    robloxUploads().then(setState).catch(() => setState(null));
    const back = new URLSearchParams(window.location.search).get("roblox");
    if (back === "uploads") {
      toast.success("Roblox uploads connected");
    }
    if (back === "uploads-no-account") {
      toast.error("No account was selected on Roblox's page. Press Connect again, press Select next to your account under \"Your Accounts\", then Confirm.", { duration: 15_000 });
    }
    if (back === "uploads-refused") {
      const granted = new URLSearchParams(window.location.search).get("granted");
      toast.error(`Roblox didn't allow uploads${granted ? ` (it granted only: ${granted})` : ""}. Tick the asset permission on Roblox's screen and try again.`);
    }
  }, []);
  const connect = async () => {
    setGoing(true);
    try {
      window.location.assign(await robloxUploadsUrl("/app/settings"));
    } catch (e) {
      toast.error((e as Error).message);
      setGoing(false);
    }
  };

  return (
    <Section
      description="StudPilot draws your game's art (buttons, panels, icons, textures) and uploads each picture to your own Roblox account. Allow it once with your Roblox account."
      title="Roblox uploads"
    >
      {state === undefined ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">{state?.connected ? `Connected${state.username ? ` as ${state.username}` : ""}` : "Not connected"}</p>
            <p className="truncate text-muted-foreground text-xs">
              {state?.connected ? "Pictures StudPilot draws go into your Roblox inventory." : "Without it, StudPilot can't put drawn art into your game."}
            </p>
          </div>
          <Button disabled={going} onClick={connect} size="sm" variant={state?.connected ? "outline" : "default"}>
            {going ? "Opening Roblox…" : state?.connected ? "Reconnect" : "Connect Roblox for uploads"}
          </Button>
        </div>
      )}
    </Section>
  );
}

function CreditsSection() {
  const { account } = useAccount();
  return (
    <Section title="Credits and plan">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <CreditDetails account={account} remaining={account ? account.allowance + account.purchased : null} />
      </div>
      {account && !account.unmetered && account.allowance + account.purchased < 5 ? (
        <p className="mt-3 text-sm">
          {formatCredits(account.allowance + account.purchased)} credits left.{" "}
          <Link className="font-medium underline underline-offset-4" href="/pricing">
            Get more
          </Link>
        </p>
      ) : null}
    </Section>
  );
}

function DataSection() {
  const [exporting, setExporting] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  return (
    <Section description="Take a copy of your data, or remove your account." title="Data">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Export your data</p>
            <p className="text-muted-foreground text-xs">A JSON file of your account, projects and usage.</p>
          </div>
          <Button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const blob = await exportAccount();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "studpilot-export.json";
                a.click();
                URL.revokeObjectURL(url);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setExporting(false);
              }
            }}
            variant="outline"
          >
            {exporting ? "Preparing…" : "Export"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Delete account</p>
            <p className="text-muted-foreground text-xs">Removes your account and every project. This cannot be undone.</p>
          </div>
          <AlertDialog onOpenChange={() => setPhrase("")}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every project, conversation and credit is removed. Type <strong>{DELETE_ACCOUNT_PHRASE}</strong> to
                  confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input aria-label="Confirmation" onChange={(e) => setPhrase(e.target.value)} value={phrase} />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={phrase !== DELETE_ACCOUNT_PHRASE || deleting}
                  onClick={async (e) => {
                    e.preventDefault();
                    setDeleting(true);
                    try {
                      await deleteAccount();
                      await supabase().auth.signOut();
                      location.assign("/");
                    } catch (err) {
                      toast.error((err as Error).message);
                      setDeleting(false);
                    }
                  }}
                  variant="destructive"
                >
                  {deleting ? "Deleting…" : "Delete account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Section>
  );
}
