// The project shelf, rebuilt with Kumo (rebuild R4). One click makes a project and opens its chat, as on /app.
import { Button, Empty, Surface, Text } from '@cloudflare/kumo';
import { FolderSimpleIcon, PlusIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { createProject, listProjects, type Project } from './api.ts';

const open = (id: string) => (location.href = `/studio/projects/${id}`);

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listProjects().then(setProjects, (e: Error) => setError(e.message));
  }, []);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      open(await createProject());
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className="min-h-full bg-kumo-elevated">
      <header className="border-b border-kumo-line bg-kumo-base px-5 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Text variant="heading3" as="span">StudPilot</Text>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => (location.href = '/app/settings')}>Settings</Button>
            <Button variant="primary" size="sm" icon={<PlusIcon size={14} />} disabled={creating} onClick={create}>
              New project
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-8">
        <Text variant="heading2" as="h1">Your projects</Text>
        {error && <Surface className="mt-4 rounded-xl p-3 text-sm text-kumo-danger">{error}</Surface>}
        {projects && projects.length === 0 && (
          <div className="mt-10">
            <Empty
              icon={<FolderSimpleIcon size={32} />}
              title="No projects yet"
              contents={<Button variant="primary" onClick={create} disabled={creating}>Start your first project</Button>}
            />
          </div>
        )}
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {projects?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => open(p.id)}
                className="w-full rounded-xl border border-kumo-line bg-kumo-base p-4 text-left transition-colors hover:border-kumo-ring focus-visible:outline-2 focus-visible:outline-kumo-ring"
              >
                <span className="block font-medium text-kumo-default">{p.name}</span>
                <span className="mt-1 block text-sm text-kumo-subtle">Updated {ago(p.last_activity_at ?? p.updated_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
