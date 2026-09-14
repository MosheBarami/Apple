// / — the project shelf: create, open, delete.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STUDIO_PLUGIN_INSTALL_HREF, STUDIO_PLUGIN_STORE_LIVE } from '@golem/shared';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { downloadExport, purgeProject, ApiError } from '../lib/api';
import { PROJECT_NAME_MAX, isRenameWorthwhile, useRenameProject } from '../lib/rename-project';
import { relativeTime, truncate } from '../lib/format';
import { Modal } from '../components/modal';
import { SummonIllustration } from '../components/glyphs';
import { useToast } from '../components/toast';
import { EmptyState } from '../components/empty-state';
import { useCommands } from '../lib/commands';
import { useProvideNewProject } from '../lib/shell';
import { SHORTCUTS, shortcutLabel } from '../lib/shortcuts';

async function fetchProjects(): Promise<ProjectRow[]> {
  if (MOCK_MODE) return mockProjects;
  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name, description, place_name, place_id, memory_summary, created_at, updated_at, last_activity_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectRow[];
}

function ProjectMenu({ onDelete, onExport, onRename }: { onDelete: () => void; onExport: (format: 'md' | 'json') => void; onRename: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="card-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onRename();
            }}
          >
            Rename…
          </button>
          {/* Markdown first: it is what someone actually reads. JSON is for feeding somewhere. */}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onExport('md');
            }}
          >
            Export conversation (Markdown)
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onExport('json');
            }}
          >
            Export conversation (JSON)
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item menu-danger"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
          >
            Delete project…
          </button>
        </div>
      )}
    </div>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const ownerId = session?.user.id;
      if (!ownerId) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('projects')
        .insert({ owner_id: ownerId, name: name.trim(), description: description.trim() || null })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data as { id: string };
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['projects-nav'] });
      toast('Project summoned', 'success');
      navigate(`/projects/${row.id}`);
    },
    onError: (e: Error) => toast(`Could not create project: ${e.message}`, 'error'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || create.isPending) return;
    create.mutate();
  };

  return (
    <Modal title="Summon a new project" onClose={onClose} locked={create.isPending}>
      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            name="projectName"
            id="project-name"
            placeholder="Obby of the Ancients"
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">
            What are you building? <span className="field-hint">(optional)</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            name="projectDescription"
            id="project-description"
            placeholder="A lava-parkour obby with checkpoints, coins and a shop."
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={create.isPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Summoning…' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Rename a project.
 *
 * The write goes straight to Supabase under RLS, exactly like create and delete do — there is no
 * worker route because there is nothing for one to do. `withOwnedProject` posts the CURRENT name
 * from Supabase to the Durable Object's `/init` on every single request, so the session picks the
 * new name up on its next call without being told. A rename endpoint would exist only to repeat
 * that, and would then be a second place where the name could be wrong.
 */
function RenameProjectModal({ project, onClose }: { project: ProjectRow; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(project.name);

  const rename = useRenameProject(project.id, project.name, {
    onDone: (next) => {
      toast(`Renamed to "${next}"`, 'success');
      onClose();
    },
    onFail: (msg) => toast(`Rename failed: ${msg}`, 'error'),
  });

  const canSave = isRenameWorthwhile(name, project.name) && !rename.isPending;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    rename.mutate(name);
  };

  return (
    <Modal title="Rename project" onClose={onClose} locked={rename.isPending}>
      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PROJECT_NAME_MAX}
            required
            name="renameProjectName"
            id="rename-project-name"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        <p className="field-hint">
          Only the name changes. The Studio pairing, chat history and everything Apple has built stay
          where they are.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={rename.isPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {rename.isPending ? 'Renaming…' : 'Rename'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteProjectModal({ project, onClose }: { project: ProjectRow; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [typed, setTyped] = useState('');

  const del = useMutation({
    mutationFn: async () => {
      // 1) purge the session DO (chat history, checkpoints, plugin binding)…
      await purgeProject(project.id);
      // 2) …then remove the registry row (RLS-scoped).
      const { error } = await supabase.from('projects').delete().eq('id', project.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['projects-nav'] });
      toast(`"${project.name}" deleted`, 'success');
      onClose();
    },
    onError: (e: Error) => toast(`Delete failed: ${e.message}`, 'error'),
  });

  const match = typed === project.name;

  return (
    <Modal title="Delete project" onClose={onClose} locked={del.isPending}>
      <p className="danger-copy">
        This permanently deletes <strong>{project.name}</strong> — chat history, checkpoints and the Studio pairing.
        Your Roblox place itself is not touched. This cannot be undone.
      </p>
      <label className="field">
        <span className="field-label">
          Type <strong className="mono">{project.name}</strong> to confirm
        </span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} name="confirmProjectName" id="confirm-project-name" placeholder={project.name} autoFocus />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={del.isPending}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" disabled={!match || del.isPending} onClick={() => del.mutate()}>
          {del.isPending ? 'Deleting…' : 'Delete forever'}
        </button>
      </div>
    </Modal>
  );
}

export function DashboardPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);
  const [renaming, setRenaming] = useState<ProjectRow | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const projects = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const { toast } = useToast();

  // Stable identity: the shell stores this and re-registering on every render
  // would reset the handoff each time the project list refetched.
  const openCreate = useCallback(() => setShowCreate(true), []);
  useProvideNewProject(openCreate);

  // Two commands, not five. Rename, Delete and Export act on ONE project, and
  // the palette has no notion of which card is selected — a "Rename project"
  // entry here would have to guess, and guessing wrong renames the wrong thing.
  // Those stay on the card menu until there is a selection model to target.
  useCommands([
    {
      id: 'dash-new',
      title: 'New project',
      section: 'Projects',
      keywords: ['create', 'summon', 'start'],
      hint: shortcutLabel(SHORTCUTS.newProject),
      run: openCreate,
    },
    {
      id: 'dash-refresh',
      title: 'Refresh projects',
      section: 'Projects',
      keywords: ['reload', 'sync', 'update'],
      enabled: !projects.isFetching,
      why: 'Already refreshing',
      run: () => void projects.refetch(),
    },
  ]);

  // An export of a long conversation is not instant, and a menu that closes with nothing visibly
  // happening reads as a broken button. Say it started, and say if it failed.
  const runExport = async (project: ProjectRow, format: 'md' | 'json') => {
    if (exporting) return;
    setExporting(project.id);
    toast(`Preparing ${project.name} as ${format === 'md' ? 'Markdown' : 'JSON'}…`, 'info');
    try {
      await downloadExport(project.id, format);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Export failed';
      toast(msg, 'error');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-sub">Each project is one Roblox experience Apple builds with you.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <span aria-hidden="true">+</span> New project
        </button>
      </div>

      {projects.isPending && (
        <div className="card-grid" aria-busy="true" aria-label="Loading projects">
          {[0, 1, 2].map((i) => (
            <div key={i} className="project-card skeleton-card">
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          ))}
        </div>
      )}

      {projects.isError && (
        <EmptyState
          state="connectionFailed"
          detail={<p className="es__body">{(projects.error as Error).message}</p>}
          action={
            <button type="button" className="btn" onClick={() => void projects.refetch()}>
              Try again
            </button>
          }
        />
      )}

      {projects.isSuccess && projects.data.length === 0 && (
        <EmptyState
          state="noProjects"
          illustration={<SummonIllustration />}
          detail={<p className="es__body">Describe the game you want — an obby, a tycoon, a story world — and Apple starts carving.</p>}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              Summon a project
            </button>
          }
        />
      )}

      {projects.isSuccess && projects.data.length > 0 && (
        <div className="card-grid">
          {projects.data.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
              <div className="project-card-top">
                <h2 className="project-card-name">{p.name}</h2>
                <ProjectMenu onDelete={() => setDeleting(p)} onExport={(f) => void runExport(p, f)} onRename={() => setRenaming(p)} />
              </div>
              <p className="project-card-desc">
                {p.memory_summary
                  ? truncate(p.memory_summary, 150)
                  : p.description
                    ? truncate(p.description, 150)
                    : 'Nothing built yet — open it and start describing.'}
              </p>
              <div className="project-card-meta">
                {p.place_name ? (
                  <span className="pill pill-quiet">{p.place_name}</span>
                ) : (
                  <span className="pill pill-quiet">Not linked</span>
                )}
                <span style={{ marginLeft: 'auto' }}>updated {relativeTime(p.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {projects.isSuccess && projects.data.length > 0 && (
        <footer className="page-foot">
          <span className="eyebrow">Getting Apple into Studio</span>
          <p>
            Apple builds through a Studio plugin. Install it once, open a project, and use{' '}
            <strong>Connect</strong> to pair the two.
          </p>
          <div className="page-foot-links">
            {/* Destination comes from @golem/shared and is the store page only
                once the asset is actually distributable; until then it is
                /docs/plugin, which says so. Same-origin while not live, so the
                new tab and its rel are conditional too. */}
            <a
              href={STUDIO_PLUGIN_INSTALL_HREF}
              target={STUDIO_PLUGIN_STORE_LIVE ? '_blank' : undefined}
              rel={STUDIO_PLUGIN_STORE_LIVE ? 'noopener noreferrer' : undefined}
            >
              Install Apple for Studio{' '}
              {STUDIO_PLUGIN_STORE_LIVE && <span aria-hidden="true">↗</span>}
            </a>
            <a href="/docs" target="_blank" rel="noopener noreferrer">
              Read the docs <span aria-hidden="true">↗</span>
            </a>
          </div>
        </footer>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
      {renaming && <RenameProjectModal project={renaming} onClose={() => setRenaming(null)} />}
      {deleting && <DeleteProjectModal project={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
