// /projects/:id/roadmap — the plan for one experience.
//
// The conversation says what is happening now. This says what is happening
// next, and why. It is a reading surface first: a spine you can follow from
// what has landed to what has not, with the two actions that turn a milestone
// back into a conversation attached to each card.
//
// Nothing here is generated client-side. The worker reads the roadmap out of
// the open place, so with no Studio attached there is no plan — and this page
// says that plainly rather than drawing a generic template that would look
// exactly like a real one.
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ProductMode } from '@golem/shared';
import { EmptyState } from '../components/empty-state';
import { ApiError, fetchMilestoneBrief, fetchNextMilestones, fetchRoadmap } from '../lib/api';
import { MOCK_MODE, mockProjects } from '../lib/mock';
import { formatNumber, relativeTime } from '../lib/format';
import { supabase, type ProjectRow } from '../lib/supabase';
import { useToast } from '../components/toast';
import { Icon, PATH } from '../components/ws/primitives';
import { BriefDialog } from '../components/roadmap/brief-dialog';
import { EmptyRoadmapMark } from '../components/roadmap/marks';
import type { BriefIntent } from '../components/roadmap/milestone-card';
import {
  buildRoadmapLayout,
  genreConfidenceLabel,
  placeInventory,
  progressLabel,
  type Milestone,
  type MilestoneBrief,
  type PlaceInventory,
} from '../components/roadmap/model';
import { RoadmapSpine } from '../components/roadmap/spine';
import { SuggestionPanel } from '../components/roadmap/suggestions';
import '../components/roadmap/roadmap.css';

async function fetchProject(id: string): Promise<ProjectRow | null> {
  if (MOCK_MODE) return mockProjects.find((p) => p.id === id) ?? mockProjects[0] ?? null;
  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name, description, place_name, place_id, memory_summary, created_at, updated_at, last_activity_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProjectRow | null) ?? null;
}

export function RoadmapPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();

  // The §32 set is held here rather than in the query cache: it is an answer to
  // a question the user asked once, not a resource with a canonical server
  // state, and a background refetch that silently replaced it would be worse
  // than not having it at all.
  const [next, setNext] = useState<Milestone[] | null>(null);
  const [brief, setBrief] = useState<{ brief: MilestoneBrief; intent: BriefIntent } | null>(null);

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId),
    enabled: projectId !== '',
  });

  const roadmap = useQuery({
    queryKey: ['roadmap', projectId],
    queryFn: () => fetchRoadmap(projectId),
    enabled: projectId !== '',
    retry: false,
  });

  const layout = useMemo(() => buildRoadmapLayout(roadmap.data?.milestones), [roadmap.data]);
  const current = layout.current;
  //[[ WHAT IS IN THIS PLACE.
  //
  //   The worker has been sending this on every roadmap answer and the client type dropped it,
  //   with a comment saying the view had no use for it. It had: the product could show
  //   per-checkpoint counts, the agent's file store and the third-party asset credits — three
  //   partial views of a project's contents and no whole.
  //
  //   Null when the answer carried no shape, which is a different thing from an empty place. ]]
  const inventory = useMemo(() => placeInventory(roadmap.data?.shape), [roadmap.data]);

  const titleOf = useCallback(
    (id: string): string | null => roadmap.data?.milestones.find((m) => m.id === id)?.title ?? null,
    [roadmap.data],
  );
  const inPlan = useCallback(
    (id: string): boolean => roadmap.data?.milestones.some((m) => m.id === id) ?? false,
    [roadmap.data],
  );

  /** Follow a dependency chip: bring the card into view and focus it. */
  const jumpTo = useCallback((milestoneId: string) => {
    const el = document.getElementById(`milestone-${milestoneId}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  }, []);

  const suggest = useMutation({
    mutationFn: () => fetchNextMilestones(projectId),
    onSuccess: (res) => setNext(res.next),
  });

  const askBrief = useMutation({
    mutationFn: (v: { milestoneId: string; intent: BriefIntent }) => fetchMilestoneBrief(projectId, v.milestoneId),
    onSuccess: (res, v) => setBrief({ brief: res, intent: v.intent }),
    onError: (e: Error) => toast(`Could not build that brief: ${e.message}`, 'error'),
  });

  /**
   * Hand the brief to the conversation. The request travels in router state
   * rather than the URL: it is long, it is prose, and a query string would put
   * the whole instruction in the address bar and the browser history.
   */
  const openConversation = useCallback(
    (request: string, mode: ProductMode) => {
      setBrief(null);
      navigate(`/projects/${projectId}`, { state: { seed: request, mode } });
    },
    [navigate, projectId],
  );

  const suggestState = suggest.isPending
    ? 'pending'
    : suggest.isError
      ? 'error'
      : next !== null
        ? 'ready'
        : 'idle';

  const briefVars = askBrief.isPending ? (askBrief.variables ?? null) : null;
  const busy = briefVars ? { id: briefVars.milestoneId, intent: briefVars.intent } : null;

  // 409 is not a failure, it is a precondition: the plan is read out of the
  // open place, and there is no place open. It gets its own calm state.
  const err = roadmap.error;
  const needsStudio = err instanceof ApiError && err.status === 409;

  const suggestButton = (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => suggest.mutate()}
      disabled={suggest.isPending || projectId === ''}
      title="Reads your place and picks the next few things worth doing."
    >
      <Icon d={PATH.creditle} size={15} />
      {suggest.isPending ? 'Reading your place…' : 'Suggest next milestone'}
    </button>
  );

  return (
    <div className="page rm-page">
      <div className="page-head rm-head">
        <div className="rm-head__text">
          {/* A TRAIL, NOT A BACK BUTTON.
              This was one chevron link to the conversation. One hop does not say where you are
              and cannot reach the project list, which is the level people actually want from two
              levels down. The project's own name is used once it is known; until then the crumb
              names the destination rather than inventing a title for it. */}
          <nav aria-label="Breadcrumb" className="rm-crumbs">
            <Link to="/">Projects</Link>
            <span className="rm-crumbs__sep" aria-hidden="true">
              <Icon d={PATH.chevronRight} size={12} />
            </span>
            <Link to={`/projects/${projectId}`}>{project.data?.name ?? 'Conversation'}</Link>
            <span className="rm-crumbs__sep" aria-hidden="true">
              <Icon d={PATH.chevronRight} size={12} />
            </span>
            {/* Plain text, not a link to the page you are on — a control that does nothing is the
                same defect as a dead route in different clothes. */}
            <span aria-current="page">Roadmap</span>
          </nav>
          <h1 className="page-title">Roadmap</h1>
          <p className="page-sub">
            What Apple would build next in this place, in the order it can be built. Every milestone here
            comes from a scan of your project — nothing is a template.
          </p>
        </div>
        {roadmap.isSuccess && suggestButton}
      </div>

      {/* ---------------------------------------------------------- loading */}
      {roadmap.isPending && (
        <div className="rm-loading" aria-busy="true" aria-label="Reading the project">
          <p className="rm-loading__copy">Reading your place to work out what is already built…</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="rm-card rm-card--skeleton">
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------- no place to read from */}
      {roadmap.isError && needsStudio && (
        <EmptyState
          state="studioDisconnected"
          illustration={<EmptyRoadmapMark />}
          detail={
            <>
              <p className="es__body">
                The roadmap is read out of the project itself — what is built, what is missing, what genre
                it is turning into. With Studio disconnected there is nothing to read, and a plan invented
                without it would be a generic checklist wearing your project&rsquo;s name.
              </p>
              <p className="rm-empty__detail">{(err as ApiError).message}</p>
            </>
          }
          action={
            <Link to={`/projects/${projectId}`} className="btn btn-primary">
              Connect Studio in the conversation
            </Link>
          }
        />
      )}

      {/* ------------------------------------------------------------ error */}
      {roadmap.isError && !needsStudio && (
        <EmptyState
          state="connectionFailed"
          detail={<p className="es__body">{(err as Error).message}</p>}
          action={
            <button type="button" className="btn" onClick={() => void roadmap.refetch()}>
              Try again
            </button>
          }
        />
      )}

      {/* ------------------------------------------------------------ empty */}
      {roadmap.isSuccess && layout.progress.total === 0 && (
        /* M03. The copy is kept verbatim through `detail`: it is more specific than any
           shared default could be, and the canonical state supplies the identity — title,
           tone, the M03 marker — rather than replacing what was already good. */
        <EmptyState
          state="noRoadmap"
          illustration={<EmptyRoadmapMark />}
          detail={
            <p className="es__body">
              Apple read your place and found nothing it recognises well enough to plan around yet. Build
              something in the conversation — a spawn, a first room — and the plan fills in as the project
              takes shape.
            </p>
          }
          action={
            <Link to={`/projects/${projectId}`} className="btn btn-primary">
              Back to the conversation
            </Link>
          }
        />
      )}

      {/* ------------------------------------------------------------- plan */}
      {roadmap.isSuccess && layout.progress.total > 0 && (
        <>
          <section className="rm-summary" aria-label="Progress">
            <div className="rm-summary__meter">
              <div className="rm-meter" aria-hidden="true">
                <span className="rm-meter__fill" style={{ width: `${Math.round(layout.progress.fraction * 100)}%` }} />
              </div>
              <p className="rm-summary__label">
                {progressLabel(layout.progress)}
                {layout.progress.active > 0 && (
                  <span className="rm-summary__active"> · {layout.progress.active} in progress</span>
                )}
              </p>
            </div>

            {current && (
              <p className="rm-summary__now">
                <span className="eyebrow">Now</span>
                <button type="button" className="rm-summary__now-link" onClick={() => jumpTo(current.milestone.id)}>
                  {current.milestone.title}
                </button>
              </p>
            )}

            <p className="rm-summary__stamp">
              {/* The genre read is banded, never printed as a percentage: the
                  signal behind it does not support that kind of precision. */}
              Reads as <strong>{roadmap.data.genreLabel}</strong> ({genreConfidenceLabel(roadmap.data.genreConfidence)})
              {roadmap.data.generatedAt && <> · scanned {relativeTime(roadmap.data.generatedAt)}</>}
            </p>
          </section>

          {/* The worker's own honesty notes: what the scan could not see. */}
          {roadmap.data.notes.map((note) => (
            <p key={note} className="rm-note" role="status">
              {note}
            </p>
          ))}

          {/* A malformed plan is reported, never quietly straightened out. */}
          {layout.hasCycle && (
            <p className="rm-note" role="status">
              Two milestones list each other as prerequisites, so one of those links has been dropped to
              draw this. The order below may not be the order Apple intends.
            </p>
          )}
          {layout.unknownDependencies.length > 0 && (
            <p className="rm-note" role="status">
              {layout.unknownDependencies.length === 1
                ? 'One prerequisite refers to a milestone that is not in this plan and has been left out.'
                : `${layout.unknownDependencies.length} prerequisites refer to milestones that are not in this plan and have been left out.`}
            </p>
          )}

          {inventory && <PlaceContents inventory={inventory} />}

          <RoadmapSpine
            stages={layout.stages}
            onJumpTo={jumpTo}
            onBrief={(milestoneId, intent) => askBrief.mutate({ milestoneId, intent })}
            busy={busy}
          />
        </>
      )}

      <SuggestionPanel
        state={suggestState}
        next={next ?? []}
        error={suggest.error instanceof Error ? suggest.error.message : null}
        inPlan={inPlan}
        titleOf={titleOf}
        onJumpTo={jumpTo}
        onBrief={(milestoneId, intent) => askBrief.mutate({ milestoneId, intent })}
        busy={busy}
        onRetry={() => suggest.mutate()}
        onDismiss={() => {
          setNext(null);
          suggest.reset();
        }}
      />

      {brief && (
        <BriefDialog
          brief={brief.brief}
          intent={brief.intent}
          onClose={() => setBrief(null)}
          onOpenConversation={openConversation}
        />
      )}
    </div>
  );
}


/**
 * What the scan found in the place, above the plan for changing it.
 *
 * EVERY COUNT IS HEDGED WHEN THE SCAN WAS CAPPED. apps/worker/src/roadmap.ts states the rule and
 * this is where a port loses it: "1,204 parts" is a claim the scan did not make when it stopped
 * early, and "at least 1,204 parts" is the one it did. The scan's own sentences about what it could
 * not see are NOT repeated here — they are already the notes above, because the worker builds
 * `notes` from `shape.limits`, and printing them twice teaches a reader to skip both.
 */
function PlaceContents({ inventory }: { inventory: PlaceInventory }) {
  const n = (value: number) => (inventory.capped ? `at least ${formatNumber(value)}` : formatNumber(value));
  const scripts = [
    inventory.serverScripts > 0 ? `${formatNumber(inventory.serverScripts)} server` : null,
    inventory.clientScripts > 0 ? `${formatNumber(inventory.clientScripts)} client` : null,
    inventory.moduleScripts > 0 ? `${formatNumber(inventory.moduleScripts)} module` : null,
  ].filter((part): part is string => part !== null);

  if (inventory.empty) {
    return (
      <section className="rm-contents" aria-label="What is in this place">
        <h2 className="rm-contents__title">What is in this place</h2>
        <p className="rm-contents__none">The scan ran and found nothing built yet — no parts, no scripts, no spawn.</p>
      </section>
    );
  }

  return (
    <section className="rm-contents" aria-label="What is in this place">
      <h2 className="rm-contents__title">What is in this place</h2>
      <dl className="rm-contents__counts">
        <div>
          <dt>Instances</dt>
          <dd>{n(inventory.instances)}</dd>
        </div>
        <div>
          <dt>Parts</dt>
          <dd>{n(inventory.parts)}</dd>
        </div>
        <div>
          <dt>Scripts</dt>
          <dd>
            {n(inventory.scripts)}
            {/* How many were READ, whenever that is fewer than exist. It is the difference between
                "this project has no shop script" and "28 of its scripts were never opened". */}
            {inventory.scriptsPartial && (
              <span className="rm-contents__partial"> · {formatNumber(inventory.scriptsRead)} read</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Spawns</dt>
          <dd>{n(inventory.spawns)}</dd>
        </div>
      </dl>

      {scripts.length > 0 && (
        <p className="rm-contents__line">
          <span className="eyebrow">Scripts</span> {scripts.join(' · ')}
        </p>
      )}
      {inventory.zones.length > 0 && (
        <p className="rm-contents__line">
          <span className="eyebrow">Zones</span> {inventory.zones.join(' · ')}
        </p>
      )}
      {inventory.currencies.length > 0 && (
        <p className="rm-contents__line">
          <span className="eyebrow">Currencies</span> {inventory.currencies.join(' · ')}
        </p>
      )}
      {inventory.guis.length > 0 && (
        <p className="rm-contents__line">
          <span className="eyebrow">Interface</span> {inventory.guis.map((g) => g.split('.').pop()).join(' · ')}
        </p>
      )}
      {inventory.capped && (
        <p className="rm-contents__hedge">
          The scan stopped before it reached the end of this place, so these are floors rather than
          totals — what it could not read is in the notes above.
        </p>
      )}
    </section>
  );
}
