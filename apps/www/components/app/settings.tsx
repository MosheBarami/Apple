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
import { deleteRobloxKey, getRobloxKey, putRobloxKey, type RobloxKey, studioLink } from "@/lib/api";
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
 * The person's own Roblox Open Cloud key. StudPilot draws game art with its image model and uploads it to the person's
 * Roblox account; when Studio cannot upload from the plugin, it uses this key (asset:read + asset:write) instead.
 */
function RobloxUploadsSection() {
  const [key, setKey] = useState<RobloxKey | null | undefined>(undefined);
  const [apiKey, setApiKey] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    getRobloxKey().then(setKey).catch(() => setKey(null));
  }, []);

  return (
    <Section
      description="StudPilot draws your game's art (buttons, panels, icons, textures) and uploads each picture to your own Roblox account. If Studio can't upload it, StudPilot uses this key instead."
      title="Roblox uploads"
    >
      {key === undefined ? (
        <Skeleton className="h-12 w-full" />
      ) : key ? (
        <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">Key ending {key.hint}</p>
            <p className="truncate text-muted-foreground text-xs">
              Roblox {key.creatorType} {key.robloxCreatorId} · {key.scopes.join(", ")}
            </p>
          </div>
          <Button
            onClick={async () => {
              try {
                await deleteRobloxKey();
                setKey(null);
                toast.success("Key disconnected");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
            size="sm"
            variant="outline"
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              setKey(await putRobloxKey(apiKey.trim(), creatorId.trim(), "user"));
              setApiKey("");
              toast.success("Key connected");
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <p className="text-muted-foreground text-sm">
            Create a key at{" "}
            <a className="underline" href="https://create.roblox.com/dashboard/credentials" rel="noreferrer" target="_blank">
              create.roblox.com/dashboard/credentials
            </a>{" "}
            with the Assets API (read and write) for your account, then paste it here with your Roblox user id.
          </p>
          <Input aria-label="Open Cloud API key" autoComplete="off" onChange={(e) => setApiKey(e.target.value)} placeholder="Open Cloud API key" type="password" value={apiKey} />
          <Input aria-label="Roblox user id" inputMode="numeric" onChange={(e) => setCreatorId(e.target.value)} placeholder="Your Roblox user id (numbers)" value={creatorId} />
          <div>
            <Button disabled={saving || apiKey.trim().length < 24 || !/^\d+$/.test(creatorId.trim())} size="sm" type="submit">
              {saving ? "Connecting…" : "Connect key"}
            </Button>
          </div>
        </form>
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
