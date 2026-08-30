// / — project dashboard: cards, create modal, delete flow with type-to-confirm.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { purgeProject } from '../lib/api';
import { relativeTime, truncate } from '../lib/format';
import { Modal } from '../components/modal';
import { SummonIllustration } from '../components/glyphs';
import { useToast } from '../components/toast';

async function fetchProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name, description, place_name, place_id, memory_summary, created_at, updated_at, last_activity_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectRow[];
}

function ProjectMenu({ onDelete }: { onDelete: () => void }) {
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
        ⋯
      </button>
      {open && (
        <div className="menu-pop" role="menu">
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
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={project.name} autoFocus />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={del.isPending}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={!match || del.isPending}
          onClick={() => del.mutate()}
        >
          {del.isPending ? 'Deleting…' : 'Delete forever'}
        </button>
      </div>
    </Modal>
  );
}

export function DashboardPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);
  const projects = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-sub">Each project is one Roblox experience Golem builds with you.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New project
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
        <div className="empty-state" role="alert">
          <h2>Couldn't load your projects</h2>
          <p className="muted">{(projects.error as Error).message}</p>
          <button type="button" className="btn" onClick={() => void projects.refetch()}>
            Try again
          </button>
        </div>
      )}

      {projects.isSuccess && projects.data.length === 0 && (
        <div className="empty-state">
          <SummonIllustration />
          <h2>Summon your first project</h2>
          <p className="muted">
            Describe the game you want — an obby, a tycoon, a story world — and Golem starts carving.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Summon a project
          </button>
        </div>
      )}

      {projects.isSuccess && projects.data.length > 0 && (
        <div className="card-grid">
          {projects.data.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
              <div className="project-card-top">
                <h2 className="project-card-name">{p.name}</h2>
                <ProjectMenu onDelete={() => setDeleting(p)} />
              </div>
              <p className="project-card-desc">
                {p.memory_summary
                  ? truncate(p.memory_summary, 140)
                  : p.description
                    ? truncate(p.description, 140)
                    : 'Nothing built yet — open it and start describing.'}
              </p>
              <div className="project-card-meta">
                {p.place_name && <span className="pill pill-quiet">{p.place_name}</span>}
                <span className="muted">updated {relativeTime(p.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
      {deleting && <DeleteProjectModal project={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
