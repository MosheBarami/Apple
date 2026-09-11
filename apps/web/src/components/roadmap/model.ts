/**
 * The roadmap's data model and layout, with no React and no imports.
 *
 * Kept free of dependencies for two reasons. It is loaded directly by
 * `node --test` (native type stripping, the same arrangement as
 * `components/ws/thinking-model.ts`), and it is the module `lib/api.ts`
 * type-imports for the wire shapes — a type-only import, so the fetch layer
 * never gains a runtime dependency on a component directory.
 *
 * The honesty rule from the Thinking card applies here too: a field is rendered
 * only when the worker actually sent it. Nothing below invents a milestone, a
 * date, an estimate or a percentage. `deriveReadiness` is the one derived
 * quantity, and it is derived from declared dependencies alone.
 */

/* ------------------------------------------------------------------ wire -- */

// These mirror `apps/worker/src/roadmap.ts` exactly. Two omissions are
// deliberate rather than accidental:
//
//   `mode`  — the worker tags every milestone with its internal specialist
//             (clay / stone / rune). Manifest §1 keeps those identities out of
//             normal product UI, and the surest way to keep them out is for the
//             client type not to have the field at all. The product mode a
//             brief runs in is derived at the edge, from the brief.
//   `shape` — the scan's full feature map. This view has no use for it and
//             copying it here would invite someone to render it.

/** As reported. `blocked` is the worker's word for "a prerequisite is missing". */
export type MilestoneStatus = 'done' | 'current' | 'future' | 'blocked';

export type MilestoneComplexity = 'small' | 'medium' | 'large';

/** What the project scan could actually establish about this milestone. */
export type Detected = 'present' | 'absent' | 'unknown';

export interface Milestone {
  id: string;
  title: string;
  /** Why a player cares. The worker writes this player-first, not developer-first. */
  why: string;
  /** What changes for the player once it lands. */
  impact: string;
  status: MilestoneStatus;
  dependsOn: string[];
  /** Prerequisites that have not landed. The reason a blocked milestone is blocked. */
  blockedBy: string[];
  complexity: MilestoneComplexity;
  /** Effort in the units the product bills in, in the worker's own words. */
  effort: string;
  detected: Detected;
  /** What the scan saw that produced `detected`. */
  evidence: string[];
  /** Set only when detection was inconclusive — never shown as a confident claim. */
  verify: string | null;
}

export interface RoadmapResponse {
  genre: string;
  genreLabel: string;
  /** 0-1. Rendered as words, never as a percentage. */
  genreConfidence: number;
  genreEvidence: string[];
  milestones: Milestone[];
  /** §32: the small contextual set. Already part of `milestones`. */
  next: Milestone[];
  /** Scan limits and low-confidence warnings, written by the worker. */
  notes: string[];
  /** True only when the optional ranking pass actually ran. */
  polished: boolean;
  generatedAt: string;
}

/** §32 on its own: the next steps without the whole timeline. */
export interface NextResponse {
  genre: string;
  genreLabel: string;
  genreConfidence: number;
  next: Milestone[];
  notes: string[];
}

/**
 * §33: a milestone turned into something a run can actually execute.
 *
 * `request` is the exact text that would be sent to the conversation. Showing
 * it before sending it is the point — the user sees what Golem was asked, not
 * just what it did.
 */
export interface MilestoneBrief {
  milestoneId: string;
  title: string;
  request: string;
  /** The worker's internal specialist for this work. Mapped at the edge, never shown. */
  mode: 'clay' | 'stone' | 'rune';
  context: string[];
  steps: string[];
  acceptance: string[];
  /** The parts of the place this would touch. */
  touches: string[];
  ready: boolean;
  blockedBy: string[];
}

/* ----------------------------------------------------------------- view -- */

/**
 * What the card can say about a milestone's position in the plan.
 *
 * `waiting` is not a failure and not a lock — it is the honest reading of
 * "something this needs has not landed". The user may still ask for a brief;
 * the card just says what is outstanding first.
 */
export type Readiness = 'landed' | 'in-progress' | 'ready' | 'waiting';

export interface MilestoneRef {
  id: string;
  title: string;
  status: MilestoneStatus;
}

export interface PlacedMilestone {
  milestone: Milestone;
  /** Longest dependency path to a root. The stage the milestone sits in. */
  depth: number;
  readiness: Readiness;
  /** Every declared prerequisite that resolves to a known milestone. */
  dependencies: MilestoneRef[];
  /** The subset of those that have not landed. Empty for `ready`. */
  waitingOn: MilestoneRef[];
  /** Milestones that name this one as a prerequisite. */
  unlocks: MilestoneRef[];
}

export interface RoadmapStage {
  depth: number;
  /** "Stage 1", "Stage 2"… Position in the plan, never a date. */
  label: string;
  milestones: PlacedMilestone[];
  /**
   * Every milestone here has landed. The view folds these away by default:
   * a finished stage is a receipt, and receipts do not need to be open.
   */
  landed: boolean;
  /**
   * More than one milestone at the same depth is a genuine branch — nothing
   * orders them against each other, so they can be built in any order.
   */
  parallel: boolean;
}

export interface RoadmapProgress {
  done: number;
  active: number;
  total: number;
  /** 0–1, for the width of the meter. The label always states the counts. */
  fraction: number;
}

export interface RoadmapLayout {
  stages: RoadmapStage[];
  progress: RoadmapProgress;
  /** Whatever the plan says is happening now, or is ready to start next. */
  current: PlacedMilestone | null;
  /**
   * True when `dependsOn` described a loop. The layout still renders — a plan
   * the user cannot see is worse than one drawn with a broken edge — but the
   * view says so rather than pretending the order is meaningful.
   */
  hasCycle: boolean;
  /** Prerequisite ids that matched no milestone. Reported, not hidden. */
  unknownDependencies: string[];
}

/* ------------------------------------------------------------- internals -- */

/**
 * Tolerate a missing array. A half-populated milestone should render as a card
 * with fewer rows, not as a blank page from a `TypeError` deep in a map().
 */
function list<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function refOf(m: Milestone): MilestoneRef {
  return { id: m.id, title: m.title, status: m.status };
}

/**
 * The worker's four statuses collapse to four readiness states, but not one
 * for one: `future` splits on whether anything is actually outstanding, which
 * is the difference between "you could start this now" and "not yet".
 *
 * A reported `blocked` is believed even when the dependency list looks clear.
 * The worker knows things about the project that this list does not.
 */
export function deriveReadiness(m: Milestone, waitingOn: MilestoneRef[]): Readiness {
  if (m.status === 'done') return 'landed';
  if (m.status === 'current') return 'in-progress';
  if (m.status === 'blocked') return 'waiting';
  return waitingOn.length === 0 ? 'ready' : 'waiting';
}

/* ---------------------------------------------------------------- layout -- */

/**
 * Turn a flat milestone list into the dependency spine the view draws.
 *
 * Depth is the longest path to a milestone with no prerequisites, so a
 * milestone always renders below everything it needs. A cycle would make that
 * undefined, so the back-edge is dropped and `hasCycle` is raised instead of
 * throwing: a generated plan is exactly the kind of data that can contain one,
 * and losing the whole page to it would be the wrong trade.
 */
export function buildRoadmapLayout(milestones: Milestone[] | null | undefined): RoadmapLayout {
  const all = list(milestones);

  const byId = new Map<string, Milestone>();
  for (const m of all) {
    if (m && typeof m.id === 'string' && !byId.has(m.id)) byId.set(m.id, m);
  }

  const unknown = new Set<string>();
  const depsOf = (m: Milestone): Milestone[] => {
    const out: Milestone[] = [];
    for (const id of list(m.dependsOn)) {
      const dep = byId.get(id);
      if (dep && dep.id !== m.id) out.push(dep);
      else if (!dep) unknown.add(id);
    }
    return out;
  };

  let hasCycle = false;
  const depth = new Map<string, number>();
  const onPath = new Set<string>();
  const depthOf = (m: Milestone): number => {
    const memo = depth.get(m.id);
    if (memo !== undefined) return memo;
    if (onPath.has(m.id)) {
      hasCycle = true;
      return 0; // drop the back-edge; the rest of the plan still lays out
    }
    onPath.add(m.id);
    let d = 0;
    for (const dep of depsOf(m)) d = Math.max(d, depthOf(dep) + 1);
    onPath.delete(m.id);
    depth.set(m.id, d);
    return d;
  };

  const unlocks = new Map<string, MilestoneRef[]>();
  for (const m of byId.values()) {
    for (const dep of depsOf(m)) {
      const bucket = unlocks.get(dep.id);
      if (bucket) bucket.push(refOf(m));
      else unlocks.set(dep.id, [refOf(m)]);
    }
  }

  const placed: PlacedMilestone[] = [];
  for (const m of byId.values()) {
    const dependencies = depsOf(m).map(refOf);
    // `blockedBy` is the worker's own answer to "what is outstanding", so it
    // wins where it is populated; the derivation is the fallback for a payload
    // that predates it or omits it.
    const declared = list(m.blockedBy)
      .map((id) => byId.get(id))
      .filter((dep): dep is Milestone => dep !== undefined)
      .map(refOf);
    const waitingOn = declared.length > 0 ? declared : dependencies.filter((d) => d.status !== 'done');
    placed.push({
      milestone: m,
      depth: depthOf(m),
      readiness: deriveReadiness(m, waitingOn),
      dependencies,
      waitingOn,
      unlocks: unlocks.get(m.id) ?? [],
    });
  }

  // Group into stages, preserving the order the worker sent within each one:
  // that order is the worker's own priority ranking, and re-sorting it here
  // would throw away the one judgement the scan actually made.
  const byDepth = new Map<number, PlacedMilestone[]>();
  for (const p of placed) {
    const bucket = byDepth.get(p.depth);
    if (bucket) bucket.push(p);
    else byDepth.set(p.depth, [p]);
  }

  const stages: RoadmapStage[] = [];
  for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
    const bucket = byDepth.get(d) ?? [];
    stages.push({
      depth: d,
      label: `Stage ${stages.length + 1}`,
      milestones: bucket,
      landed: bucket.length > 0 && bucket.every((p) => p.readiness === 'landed'),
      parallel: bucket.length > 1,
    });
  }

  const done = placed.filter((p) => p.readiness === 'landed').length;
  const active = placed.filter((p) => p.readiness === 'in-progress').length;
  const total = placed.length;

  return {
    stages,
    progress: { done, active, total, fraction: total > 0 ? done / total : 0 },
    current: currentMilestone(placed),
    hasCycle,
    unknownDependencies: [...unknown],
  };
}

/**
 * What the header calls "now": whatever is actually in progress, otherwise the
 * shallowest milestone whose prerequisites have all landed. Null when the plan
 * is finished or empty — the header then says nothing rather than picking one.
 */
export function currentMilestone(placed: PlacedMilestone[]): PlacedMilestone | null {
  const inProgress = placed.filter((p) => p.readiness === 'in-progress');
  if (inProgress.length > 0) return leastDeep(inProgress);
  const ready = placed.filter((p) => p.readiness === 'ready');
  if (ready.length > 0) return leastDeep(ready);
  return null;
}

function leastDeep(candidates: PlacedMilestone[]): PlacedMilestone | null {
  let best: PlacedMilestone | null = null;
  for (const c of candidates) {
    if (best === null || c.depth < best.depth) best = c;
  }
  return best;
}

/** "3 of 9 landed" / "Nothing landed yet" — the meter's text equivalent. */
export function progressLabel(p: RoadmapProgress): string {
  if (p.total === 0) return 'No milestones yet';
  if (p.done === 0) return `Nothing landed yet — ${p.total} planned`;
  if (p.done === p.total) return `All ${p.total} milestones landed`;
  return `${p.done} of ${p.total} landed`;
}

/**
 * Effort, with the internal specialist names taken back out.
 *
 * The worker composes this line as "about two Stone runs". Clay, Stone and Rune
 * are internal specialist identities — @golem/shared says plainly that nothing
 * in normal product UI should name them, and manifest §1 keeps engine identity
 * off every non-admin surface. The card renders `effort` verbatim, so the
 * substitution happens here rather than in the card: one place, tested, and it
 * quietly becomes a no-op the day the worker stops emitting them.
 *
 * The mapping is the same one @golem/shared publishes (clay -> Plan,
 * stone -> Agent, rune -> Super Agent); it is restated as plain strings only so
 * that this module keeps its no-imports property and stays loadable by
 * `node --test`.
 */
export function effortLabel(effort: string | null | undefined): string {
  if (!effort) return '';
  return effort
    .replace(/\bClay\b/g, 'Plan')
    .replace(/\bStone\b/g, 'Agent')
    .replace(/\bRune\b/g, 'Super Agent');
}

/**
 * The genre read, in words.
 *
 * The worker reports a 0-1 confidence. Printing "62% obby" would imply a
 * precision the signal-counting behind it does not have, so it is banded — and
 * a weak read says so rather than being rounded up into a claim.
 */
export function genreConfidenceLabel(confidence: number): 'clear' | 'likely' | 'a guess' {
  if (confidence >= 0.75) return 'clear';
  if (confidence >= 0.45) return 'likely';
  return 'a guess';
}
