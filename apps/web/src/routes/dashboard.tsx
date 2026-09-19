// / — the project shelf: create, open, delete.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Failure } from '../components/failure';
import { STUDIO_PLUGIN_INSTALL_HREF, STUDIO_PLUGIN_STORE_LIVE } from '@golem/shared';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { downloadExport, purgeProject, ApiError } from '../lib/api';
import { PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX, projectEditPatch, useEditProject } from '../lib/rename-project';
import { PROJECT_COLUMNS, PROJECT_LIST_KEYS, PROJECT_SCOPES, scopeToShow, type ProjectScope } from '../lib/archive';
import { BLANK_TEMPLATE_ID, PROJECT_TEMPLATES, templateSeed } from '../lib/project-templates';
import { readViewChoice, writeViewChoice } from '../lib/view-state';
import { TAG_MAX_LEN, TAGS_MAX, addTag, normaliseTag, removeTag, tagUniverse } from '../lib/tags';
import { relativeTime, truncate } from '../lib/format';
import { Modal } from '../components/modal';
import { SummonIllustration } from '../components/glyphs';
import { useToast } from '../components/toast';
import { createUndoable } from '../lib/undo';
import { confirmationFor } from '../lib/confirm-model';
import { ConfirmDialog } from '../components/confirm-dialog';
import { EmptyState } from '../components/empty-state';
import { useCommands } from '../lib/commands';
import { useProvideNewProject } from '../lib/shell';
import { SHORTCUTS, shortcutLabel } from '../lib/shortcuts';
import { filterProjects } from '../lib/project-search';
import './dashboard.css';

/**
 * The project list for one scope.
 *
 * Archived rows are filtered in the QUERY, not after it arrives: a client-side filter would still
 * download every archived project on every dashboard load, and the whole point of archiving is
 * that the pile grows without bound.
 */
async function fetchProjects(scope: ProjectScope = 'active', tag?: string | null): Promise<ProjectRow[]> {
  if (MOCK_MODE) return scope === 'active' ? mockProjects : [];
  const base = supabase.from('projects').select(PROJECT_COLUMNS);
  // The tag narrows the QUERY, for the same reason the archived filter does: filtering after the
  // fetch still downloads every project on every chip click, and a tag is the one axis a user with
  // a lot of projects reaches for precisely because they have a lot of projects.
  //
  // Active only. The archived list is a place you go to find something you put away, and it is
  // ordered and searched by that; narrowing it by a label as well means a restored project can be
  // invisible in both lists at once.
  const q = tag && scope === 'active' ? base.contains('tags', [tag]) : base;
  const { data, error } =
    scope === 'active'
      ? // PINNED FIRST, AND WHY `nullsFirst: false` IS LOAD-BEARING.
        // Postgres sorts `desc` NULLS FIRST by default, so the obvious ordering puts every
        // unpinned project ABOVE every pinned one. The result still contains the pinned project,
        // just in the wrong half of a long list, so it reads as a feature that does not work
        // rather than one that is absent.
        //
        // The archived list is deliberately NOT reordered by pins: it is ordered by when a project
        // was put away, which is what someone hunting for the thing they just archived is scanning
        // for.
        await q
          .is('archived_at', null)
          .order('pinned_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false })
      : await q.not('archived_at', 'is', null).order('archived_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectRow[];
}

/**
 * Every tag in use on an active project — one column, no filter, no order.
 *
 * Its own query rather than a read of the list above because the list is what the filter narrows,
 * and a chip row derived from a narrowed list has exactly one chip on it: the one already chosen.
 */
async function fetchTagUniverse(): Promise<{ tags?: string[] }[]> {
  if (MOCK_MODE) return mockProjects;
  const { data, error } = await supabase.from('projects').select('tags').is('archived_at', null);
  if (error) throw new Error(error.message);
  return (data ?? []) as { tags?: string[] }[];
}

function ProjectMenu({ onDelete, onExport, onEdit, onArchive, onPin, onTags, archived, pinned }: { onDelete: () => void; onExport: (format: 'md' | 'json') => void; onEdit: () => void; onArchive: () => void; onPin: () => void; onTags: () => void; archived: boolean; pinned: boolean }) {
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
              onEdit();
            }}
          >
            Edit…
          </button>
          {/* Not offered on an archived project: pinning something to the top of a list it is not
              in is a control that reports success and changes nothing on screen. */}
          {!archived && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onPin();
              }}
            >
              {pinned ? 'Unpin' : 'Pin to top'}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onTags();
            }}
          >
            Tags…
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onArchive();
            }}
          >
            {archived ? 'Restore' : 'Archive'}
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
  const [template, setTemplate] = useState(BLANK_TEMPLATE_ID);

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
      //[[ THE TEMPLATE IS A SEEDED REQUEST, NOT SEEDED CONTENT.
      //
      //   It rides the handoff the workspace already consumes — the same one the suggestion chips
      //   and the roadmap's briefs use — so the message lands in the composer and the person reads
      //   it and presses send. Nothing is built, and no Credit is spent, until they do.
      //
      //   A blank start navigates with no state at all rather than `{ seed: null }`: the workspace
      //   consumes-and-clears any state it is handed, and handing it nothing to clear keeps the
      //   history entry as it was. ]]
      const seed = templateSeed(template);
      navigate(`/projects/${row.id}`, seed ? { state: { seed } } : undefined);
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
        <fieldset className="field tpl">
          <legend className="field-label">Starting point</legend>
          {/* Said plainly, because the last template claim this product made was false: these fill
              in the first message, they do not fill in the place. */}
          <p className="field-hint tpl__note">
            Each of these writes your first request for you. You can edit it before you send it.
          </p>
          <div className="tpl__grid">
            {PROJECT_TEMPLATES.map((t) => (
              <label key={t.id} className={`tpl__card${template === t.id ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="projectTemplate"
                  value={t.id}
                  checked={template === t.id}
                  onChange={() => setTemplate(t.id)}
                />
                <span className="tpl__label">{t.label}</span>
                <span className="tpl__blurb">{t.blurb}</span>
              </label>
            ))}
          </div>
        </fieldset>
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
 * Edit one project's tags.
 *
 * Applied on each add and remove rather than collected behind a Save: a tag is one word and the
 * list is at most six of them, so a Save button here guards nothing and is one more thing to
 * forget on the way out of the dialog. `existing` is offered as suggestions so the second project
 * tagged "client" is tagged by clicking, not by spelling it the same way again — which is the
 * failure mode the normaliser exists to survive, not one to invite.
 */
function TagsModal({
  project,
  existing,
  pending,
  onApply,
  onClose,
}: {
  project: ProjectRow;
  existing: string[];
  pending: boolean;
  onApply: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const tags = project.tags ?? [];
  const full = tags.length >= TAGS_MAX;
  const suggestions = existing.filter((t) => !tags.some((own) => normaliseTag(own) === t)).slice(0, 8);

  const commit = (raw: string) => {
    const next = addTag(tags, raw);
    setDraft('');
    if (next !== tags) onApply(next);
  };

  return (
    <Modal title={`Tags for ${project.name}`} onClose={onClose} locked={pending}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          commit(draft);
        }}
      >
        {tags.length > 0 ? (
          <div className="tag-row">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                className="tag-chip tag-chip--own"
                onClick={() => onApply(removeTag(tags, t))}
                disabled={pending}
                title={`Remove "${t}"`}
              >
                {t} <span aria-hidden="true">×</span>
                <span className="visually-hidden">Remove tag</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="page-note">No tags yet. A tag groups projects on the dashboard — "client", "obby", "experiment".</p>
        )}

        <label className="field">
          <span className="field-label">
            Add a tag {full && <span className="field-hint">({TAGS_MAX} is the limit)</span>}
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={TAG_MAX_LEN}
            name="projectTag"
            id="project-tag"
            placeholder="client"
            disabled={full || pending}
            autoFocus
          />
        </label>

        {suggestions.length > 0 && !full && (
          <div className="tag-row">
            {suggestions.map((t) => (
              <button key={t} type="button" className="tag-chip" onClick={() => commit(t)} disabled={pending}>
                + {t}
              </button>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Done
          </button>
          <button type="submit" className="btn btn-primary" disabled={!normaliseTag(draft) || full || pending}>
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Edit a project's name and description.
 *
 * The write goes straight to Supabase under RLS, exactly like create and delete do — there is no
 * worker route because there is nothing for one to do. `withOwnedProject` posts the CURRENT name
 * from Supabase to the Durable Object's `/init` on every single request, so the session picks the
 * new name up on its next call without being told. A rename endpoint would exist only to repeat
 * that, and would then be a second place where the name could be wrong.
 *
 * THE DESCRIPTION USED TO BE WRITE-ONCE. It was collected at creation, rendered on the card behind
 * `memory_summary`, and then never writable again — this dialog said so in its own words ("Only the
 * name changes"), which made a defect read like a policy. What a person is building changes more
 * often than what they called it.
 */
function EditProjectModal({ project, onClose }: { project: ProjectRow; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');

  const edit = useEditProject(project.id, { name: project.name, description: project.description }, {
    onDone: (next) => {
      toast(next.name === project.name ? 'Description saved' : `Renamed to "${next.name}"`, 'success');
      onClose();
    },
    onFail: (msg) => toast(`Could not save: ${msg}`, 'error'),
  });

  // The same rule the write uses, so the button is disabled exactly when the write would do
  // nothing — rather than enabled on a change the rule will then refuse.
  const canSave =
    projectEditPatch({ name, description }, { name: project.name, description: project.description }) !== null &&
    !edit.isPending;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    edit.mutate({ name, description });
  };

  return (
    <Modal title="Edit project" onClose={onClose} locked={edit.isPending}>
      <form onSubmit={onSubmit}>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PROJECT_NAME_MAX}
            required
            name="editProjectName"
            id="edit-project-name"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
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
            maxLength={PROJECT_DESCRIPTION_MAX}
            name="editProjectDescription"
            id="edit-project-description"
            placeholder="A lava-parkour obby with checkpoints, coins and a shop."
          />
        </label>
        <p className="field-hint">
          The Studio pairing, chat history and everything Apple has built stay where they are.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={edit.isPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {edit.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteProjectModal({ project, onClose }: { project: ProjectRow; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const del = useMutation({
    mutationFn: async () => {
      //[[ A FAILED PURGE MUST NOT BE FOLLOWED BY DELETING THE ROW THAT POINTS AT WHAT SURVIVED.
      //
      //   This awaited the purge and read nothing back. The worker has always answered honestly —
      //   `ok: res.ok && failed.length === 0`, with `failed` naming every store that refused — and
      //   the client dropped it, removed the registry row, and told the customer "deleted".
      //
      //   The registry row is the ONLY thing that can find that project's data again. Deleting it
      //   after a partial purge does not leave data behind; it leaves data behind UNREACHABLE, by
      //   the customer and by a retry, while the product says it is gone. Keeping the row is what
      //   makes "try again" a real instruction rather than a suggestion. ]]
      const purge = await purgeProject(project.id);
      if (!purge.ok) {
        const survived = purge.failed?.length ? purge.failed.join(', ') : 'some of it';
        throw new Error(
          `${survived} could not be deleted, so the project is still listed rather than half-erased. ` +
          'Nothing was lost and nothing is hidden — try again, and if it keeps failing, use Get help so we can finish it.',
        );
      }
      // Only now: the data is gone, so the row that points at it can go.
      const { error } = await supabase.from('projects').delete().eq('id', project.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['projects-nav'] });
      toast(`"${project.name}" deleted`, 'success');
      onClose();
    },
    // The message is the sentence above, which already says what happened and what to do; a
    // prefix of "Delete failed:" in front of it would be the only part a customer reads.
    onError: (e: Error) => toast(e.message, 'error'),
  });

  // Stated rather than assumed: the ladder in lib/confirm-model.ts is what decides the ceremony,
  // and this is what a 'typed' verdict looks like. The old version compared `typed === project.name`
  // inline, which had a fail-open in it — a project whose name is empty or whitespace, and several
  // are, made the Delete button live before the dialog had finished rendering.
  const ceremony = confirmationFor({ reversible: false, destroysUserContent: true });
  if (ceremony !== 'typed' && ceremony !== 'dialog') return null;

  return (
    <ConfirmDialog
      title="Delete project"
      ceremony={ceremony}
      subject={project.name}
      confirmLabel="Delete forever"
      busyLabel="Deleting…"
      busy={del.isPending}
      onConfirm={() => del.mutate()}
      onClose={onClose}
    >
      This permanently deletes <strong>{project.name}</strong> — chat history, checkpoints and the Studio
      pairing. Your Roblox place itself is not touched. This cannot be undone.
    </ConfirmDialog>
  );
}

export function DashboardPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  //[[ THE TAB YOU WERE READING.
  //
  //   Archived was a round trip: open it, follow a project, come back, and you were on Active
  //   again with no sign that the thing you had just been looking at still existed. Restored the
  //   same way the rail's collapse is, and validated on the way in so a scope this build no longer
  //   has cannot select a tab that is not rendered. ]]
  const [scope, setScopeState] = useState<ProjectScope>(() => readViewChoice<ProjectScope>('dashboard.scope', PROJECT_SCOPES, 'active'));
  const setScope = useCallback((next: ProjectScope) => {
    setScopeState(next);
    writeViewChoice('dashboard.scope', next);
  }, []);
  // Which tag is narrowing the grid, if any. Not remembered across reloads on purpose: a
  // remembered filter greets the user with a dashboard that is missing most of their projects for
  // a reason they set days ago and have no memory of.
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tagging, setTagging] = useState<ProjectRow | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const projects = useQuery({
    // The filter is PART OF THE KEY, or two different filters share one cached answer and the grid
    // shows the previous tag's projects until a refetch lands. The 'filter' segment keeps the
    // shape distinct from the tag-universe key below — otherwise a user who names a tag
    // "tag-universe" collides the two queries and the grid tries to render bare tag arrays.
    queryKey: scope === 'active' ? ['projects', 'filter', tagFilter ?? ''] : ['projects-archived'],
    queryFn: () => fetchProjects(scope, tagFilter),
  });

  // Counted separately and always, so the Archived tab can show how many are in there without
  // switching to it — a tab that might be empty is a tab nobody clicks.
  const archived = useQuery({ queryKey: ['projects-archived'], queryFn: () => fetchProjects('archived') });
  const visibleProjects = filterProjects(projects.data ?? [], search);

  //[[ THE CHIP ROW IS BUILT FROM ITS OWN, UNFILTERED QUERY.
  //
  //   Deriving the available tags from `projects.data` is the obvious thing and it collapses:
  //   choose "client" and the list contains only client projects, so "client" becomes the only
  //   chip on screen and there is no control left to get back to the others. The universe of tags
  //   has to come from a query the filter does not touch.
  //
  //   Keyed UNDER 'projects' rather than beside it, so the three places that already invalidate
  //   PROJECT_LIST_KEYS — archiving, deleting, tagging — refresh the chip row by prefix without
  //   anyone having to remember a fourth cache. That is the same argument PROJECT_LIST_KEYS itself
  //   is built on. It selects one column, so the duplicate read costs a few bytes. ]]
  const tagged = useQuery({ queryKey: ['projects', 'tag-universe'], queryFn: fetchTagUniverse });
  const allTags = tagUniverse(tagged.data ?? []);

  // A filter for a tag that no longer exists anywhere hides every project with no chip on screen
  // still pressed. Same failure as a remembered scope with nothing in it — see scopeToShow.
  useEffect(() => {
    if (tagFilter && tagged.isSuccess && !allTags.includes(tagFilter)) setTagFilter(null);
  }, [tagFilter, tagged.isSuccess, allTags]);

  const setTags = useMutation({
    mutationFn: async ({ project, tags }: { project: ProjectRow; tags: string[] }) => {
      const { error } = await supabase.from('projects').update({ tags }).eq('id', project.id);
      if (error) throw new Error(error.message);
      return { project, tags };
    },
    onSuccess: () => {
      // The chip row's query is keyed under 'projects', so this one loop refreshes the grid, the
      // sidebar and the tag universe together — no fourth cache to remember.
      for (const key of PROJECT_LIST_KEYS) void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast(`Could not save tags: ${e.message}`, 'error'),
  });

  // A remembered scope must yield to what the page can actually show — see `scopeToShow`.
  const archivedCount = archived.isSuccess ? archived.data.length : null;
  useEffect(() => {
    const shown = scopeToShow(scope, archivedCount);
    if (shown !== scope) setScope(shown);
  }, [scope, archivedCount, setScope]);

  /*
   * Pinning. Reversible from the same menu item that set it, so it gets no dialog and no undo
   * toast — the toast would be an extra way to do what the menu already does in one click.
   *
   * It invalidates all three list caches even though a pinned project cannot be archived: the row
   * moves WITHIN the active list and WITHIN the sidebar, and the sidebar is a separate query that
   * would otherwise keep showing the old order until its staleTime expired.
   */
  const setPinned = useMutation({
    mutationFn: async ({ project, pin }: { project: ProjectRow; pin: boolean }) => {
      const { error } = await supabase
        .from('projects')
        .update({ pinned_at: pin ? new Date().toISOString() : null })
        .eq('id', project.id);
      if (error) throw new Error(error.message);
      return { project, pin };
    },
    onSuccess: ({ project, pin }) => {
      for (const key of PROJECT_LIST_KEYS) void qc.invalidateQueries({ queryKey: key });
      toast(pin ? `"${project.name}" pinned to the top` : `"${project.name}" unpinned`, 'success');
    },
    onError: (e: Error) => toast(`Could not pin: ${e.message}`, 'error'),
  });

  const setArchived = useMutation({
    mutationFn: async ({ project, archive }: { project: ProjectRow; archive: boolean }) => {
      const { error } = await supabase
        .from('projects')
        .update({ archived_at: archive ? new Date().toISOString() : null })
        .eq('id', project.id);
      if (error) throw new Error(error.message);
      return { project, archive };
    },
    onSuccess: ({ project, archive }) => {
      // The row moves between two lists AND leaves the sidebar, so three caches are stale at once.
      for (const key of PROJECT_LIST_KEYS) void qc.invalidateQueries({ queryKey: key });
      // Undo in the toast rather than a confirmation before the fact: archiving is reversible, and
      // a dialog guarding a reversible action just trains people to dismiss dialogs — which is
      // exactly the habit you do not want them arriving with at the permanent one. That reasoning
      // is now a function: confirmationFor({ reversible: true, destroysUserContent: true }) is
      // 'undo', and this is the branch that honours it.
      //
      // The reversal goes back through the SAME mutation, so it invalidates the same three caches
      // and cannot drift from the forward action. lib/undo.ts is what makes the offer honest: it
      // runs at most once however many times the button is clicked, refuses after its window has
      // closed, and reports a rejected request as failed rather than as a restore that never
      // happened.
      const undo = createUndoable({
        label: 'Undo',
        reverse: () => setArchived.mutateAsync({ project, archive: !archive }),
      });
      toast(archive ? `"${project.name}" archived` : `"${project.name}" restored`, 'success', {
        action: { label: 'Undo', run: () => void undo.undo() },
      });
    },
    onError: (e: Error) => toast(`Could not archive: ${e.message}`, 'error'),
  });

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

      {/* The Archived tab appears only once something is in it. An always-present tab that is
          always empty is chrome; one that appears when it has contents is an answer to "where did
          that project go?". */}
      {(archived.data?.length ?? 0) > 0 && (
        <div className="scope-tabs" role="tablist" aria-label="Project scope">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'active'}
            className={`scope-tab${scope === 'active' ? ' is-on' : ''}`}
            onClick={() => setScope('active')}
          >
            Active
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'archived'}
            className={`scope-tab${scope === 'archived' ? ' is-on' : ''}`}
            onClick={() => setScope('archived')}
          >
            Archived <span className="scope-tab__count">{archived.data?.length}</span>
          </button>
        </div>
      )}

      {/* The chip row exists only once there is something to filter by, on the same argument as the
          Archived tab: a control that is always present and always does nothing is chrome. It is
          hidden on the Archived tab because the archived list is not narrowed by tags — see
          fetchProjects. */}
      {scope === 'active' && allTags.length > 0 && (
        <div className="tag-row tag-row--filter" role="group" aria-label="Filter by tag">
          {allTags.map((t) => {
            const on = tagFilter === t;
            return (
              <button
                key={t}
                type="button"
                className={`tag-chip${on ? ' is-on' : ''}`}
                aria-pressed={on}
                // Clicking the pressed chip clears it. Without that the only way out of a filter is
                // a second control somewhere else, which people do not find.
                onClick={() => setTagFilter(on ? null : t)}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}

      {((projects.data?.length ?? 0) > 0 || search.length > 0) && (
        <div className="project-search">
          <input type="search" aria-label="Search projects" placeholder="Search this list…"
            value={search} maxLength={120} onChange={event => setSearch(event.target.value)} />
          {search.length > 0 && <button type="button" className="btn btn-quiet" onClick={() => setSearch('')}>Clear search</button>}
          {search.trim() && projects.isSuccess && (
            <span role="status">{visibleProjects.length} of {projects.data.length} loaded projects</span>
          )}
        </div>
      )}

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
          detail={<Failure error={projects.error} compact />}
          action={
            <button type="button" className="btn" onClick={() => void projects.refetch()}>
              Try again
            </button>
          }
        />
      )}

      {/* An empty ARCHIVED list is not the same emptiness as having no projects at all: offering
          "Summon a project" here answers a question nobody asked. In practice the tab is hidden
          when it is empty, so this is the race where the last archived project was just restored. */}
      {projects.isSuccess && projects.data.length === 0 && scope === 'archived' && (
        <p className="page-note">Nothing archived. Archived projects keep everything — restore one any time.</p>
      )}

      {/* A FILTER THAT MATCHES NOTHING IS NOT AN EMPTY ACCOUNT.
          Offering "Summon a project" to someone who has fifteen projects and one wrong chip
          pressed answers a question they did not ask, and leaves the actual way out — unpress the
          chip — somewhere above the fold. The way out is the control in this message. */}
      {projects.isSuccess && projects.data.length === 0 && scope === 'active' && tagFilter && (
        <p className="page-note">
          Nothing tagged “{tagFilter}”.{' '}
          <button type="button" className="btn btn-quiet" onClick={() => setTagFilter(null)}>
            Show all projects
          </button>
        </p>
      )}

      {projects.isSuccess && projects.data.length === 0 && scope === 'active' && !tagFilter && (
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

      {projects.isSuccess && projects.data.length > 0 && visibleProjects.length === 0 && (
        <p className="page-note">No projects match “{search.trim()}” in this list. Clear the search or change scope.</p>
      )}

      {projects.isSuccess && visibleProjects.length > 0 && (
        <div className="card-grid">
          {visibleProjects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
              <div className="project-card-top">
                {/* The pin is drawn on the card, not only in the menu. Without it the top card is
                    simply somewhere the user did not put it, and the only way to find out why is
                    to open a menu they have no reason to open. */}
                {p.pinned_at && (
                  <span className="project-card-pin" aria-label="Pinned" title="Pinned to the top">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M9.6 1.2 14.8 6.4l-1.1 1.1-1.2-.3-2.6 2.6.2 2.3-1.1 1.1-3-3-3.3 3.3-.8-.8L5.2 9.4l-3-3L3.3 5.3l2.3.2 2.6-2.6-.3-1.2z" />
                    </svg>
                  </span>
                )}
                {/* A project name is the user's string, not ours. */}
                <h2 className="project-card-name" dir="auto">{p.name}</h2>
                <ProjectMenu
                  onDelete={() => setDeleting(p)}
                  onExport={(f) => void runExport(p, f)}
                  onEdit={() => setEditing(p)}
                  onArchive={() => setArchived.mutate({ project: p, archive: !p.archived_at })}
                  onPin={() => setPinned.mutate({ project: p, pin: !p.pinned_at })}
                  onTags={() => setTagging(p)}
                  archived={Boolean(p.archived_at)}
                  pinned={Boolean(p.pinned_at)}
                />
              </div>
              <p className="project-card-desc">
                {p.memory_summary
                  ? truncate(p.memory_summary, 150)
                  : p.description
                    ? truncate(p.description, 150)
                    : 'Open this conversation to continue.'}
              </p>
              <div className="project-card-meta">
                {p.place_name ? (
                  <span className="pill pill-quiet">{p.place_name}</span>
                ) : (
                  <span className="pill pill-quiet">No saved place name</span>
                )}
                {/* Drawn as text, not as buttons: the whole card is a link to the project, and a
                    control inside a link either swallows the navigation or fires alongside it.
                    Filtering by a tag is what the chip row above the grid is for. */}
                {(p.tags ?? []).map((t) => (
                  <span key={t} className="pill pill-tag">
                    {t}
                  </span>
                ))}
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
            {STUDIO_PLUGIN_STORE_LIVE
              ? <>Install the Studio plugin, then use <strong>Connect</strong> to pair your place.</>
              : 'Public Studio installation is unavailable. You can use chat now; building in Studio requires an existing plugin connection.'}
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
              {STUDIO_PLUGIN_STORE_LIVE ? 'Install Apple for Studio' : 'Studio installation status'}{' '}
              {STUDIO_PLUGIN_STORE_LIVE && <span aria-hidden="true">↗</span>}
            </a>
            <a href="/docs" target="_blank" rel="noopener noreferrer">
              Read the docs <span aria-hidden="true">↗</span>
            </a>
          </div>
        </footer>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
      {editing && <EditProjectModal project={editing} onClose={() => setEditing(null)} />}
      {/* Fed the LIVE row from the current list rather than the one captured when the menu was
          clicked, so a chip removed in the dialog disappears from the dialog. The captured row is
          the fallback for the frame in which the list is refetching. */}
      {tagging && (
        <TagsModal
          project={projects.data?.find((p) => p.id === tagging.id) ?? tagging}
          existing={allTags}
          pending={setTags.isPending}
          onApply={(tags) => setTags.mutate({ project: tagging, tags })}
          onClose={() => setTagging(null)}
        />
      )}
      {deleting && <DeleteProjectModal project={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
