/**
 * VERSION HISTORY FOR A SHARED PROJECT — append-only, and that is the whole design.
 *
 * The product already had checkpoints: a list of snapshots, restorable, owned by one person. What
 * it did not have is a HISTORY — an ordered chain that says who made each version, what it came
 * from, and what happened when someone rolled back. In a single-tenant product that distinction
 * is cosmetic. In a shared one it is the difference between "Tal restored yesterday's build" and
 * "the last four hours of Noa's work are gone and nothing records that it ever existed".
 *
 * So restoring does NOT rewind the list. It APPENDS a new version whose `restoredFrom` names the
 * one that was restored and whose parent is the head at the time. The sequence number only ever
 * goes up, for every member, forever:
 *
 *     v1 ── v2 ── v3 ── v4(restore of v2)
 *                        ^ head, seq 4, parent v3, restoredFrom v2
 *
 * A rewind would be the destructive operation wearing the word "restore", and the member whose
 * work it discarded would have no row to point at.
 *
 * The guards here are the same family as everywhere else in this cluster: a corrupt `seq` must
 * not poison the next one (`max(NaN, 3) + 1` is NaN, and a NaN seq sorts nowhere and compares
 * false against everything), and a parent chain that loops must terminate rather than hang the
 * Durable Object that is walking it.
 */
import { can } from './collab.ts';
import type { Actor, Refusal } from './collab-threads.ts';

export const VERSION_KINDS = ['manual', 'auto', 'pre_agent', 'restore'] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];
const KIND_SET: ReadonlySet<string> = new Set(VERSION_KINDS);

export const MAX_VERSION_LABEL_CHARS = 80;

export interface Version {
  id: string;
  seq: number;
  label: string;
  authorId: string;
  kind: VersionKind;
  parentId: string | null;
  /** Set only on a `restore` version: the version whose content was brought back. */
  restoredFrom: string | null;
  createdAt: number;
}

const refuse = (status: Refusal['status'], reason: string): Refusal => ({ ok: false, status, reason });

/** Only rows we can actually read take part in ordering. A corrupt seq is not a big number. */
function readable(history: readonly unknown[] | undefined): Version[] {
  const out: Version[] = [];
  for (const raw of history ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const v = raw as Partial<Version>;
    if (typeof v.id !== 'string' || v.id.length === 0) continue;
    if (typeof v.seq !== 'number' || !Number.isFinite(v.seq)) continue;
    if (typeof v.kind !== 'string' || !KIND_SET.has(v.kind)) continue;
    out.push({
      id: v.id,
      seq: v.seq,
      label: typeof v.label === 'string' ? v.label : '',
      authorId: typeof v.authorId === 'string' ? v.authorId : '',
      kind: v.kind as VersionKind,
      parentId: typeof v.parentId === 'string' && v.parentId.length > 0 ? v.parentId : null,
      restoredFrom: typeof v.restoredFrom === 'string' && v.restoredFrom.length > 0 ? v.restoredFrom : null,
      createdAt: typeof v.createdAt === 'number' && Number.isFinite(v.createdAt) ? v.createdAt : 0,
    });
  }
  return out.sort((a, b) => a.seq - b.seq);
}

/** The newest readable version, or null for an empty history. */
export function head(history: readonly unknown[] | undefined): Version | null {
  const rows = readable(history);
  return rows.length === 0 ? null : (rows[rows.length - 1] ?? null);
}

/** The next sequence number. Never NaN, never a repeat, never lower than something already there. */
export function nextSeq(history: readonly unknown[] | undefined): number {
  const h = head(history);
  return h === null ? 1 : h.seq + 1;
}

export interface VersionPlan {
  ok: true;
  version: Omit<Version, 'id'>;
}

export function planVersion(
  actor: Actor | null,
  input: { label: unknown; kind?: unknown; nowMs: number },
  history: readonly unknown[] | undefined,
): VersionPlan | Refusal {
  if (actor === null) return refuse(403, 'not_a_member');
  // Recording a version is recording that the project changed, so it takes the same capability
  // that changing it does. A viewer cannot mint history.
  if (!can(actor.role, 'build')) return refuse(403, 'insufficient_role');
  if (!Number.isFinite(input.nowMs)) return refuse(400, 'bad_clock');

  const kind = input.kind === undefined || input.kind === null ? 'manual' : input.kind;
  if (typeof kind !== 'string' || !KIND_SET.has(kind)) return refuse(400, 'unknown_kind');
  // `restore` is minted by planRestore alone: a caller that could ask for one directly could
  // write a row claiming to restore a version it never read.
  if (kind === 'restore') return refuse(400, 'restore_is_not_directly_creatable');

  if (typeof input.label !== 'string') return refuse(400, 'missing_label');
  const label = input.label.trim();
  if (label.length === 0) return refuse(400, 'empty_label');
  if (label.length > MAX_VERSION_LABEL_CHARS) return refuse(400, 'label_too_long');

  const h = head(history);
  return {
    ok: true,
    version: {
      seq: nextSeq(history),
      label,
      authorId: actor.userId,
      kind: kind as VersionKind,
      parentId: h === null ? null : h.id,
      restoredFrom: null,
      createdAt: input.nowMs,
    },
  };
}

/**
 * Roll the project back to `versionId` — by moving FORWARD.
 *
 * `restore_version` is an admin capability (see collab.ts): an editor may build, but discarding
 * work other members did is not building.
 */
export function planRestore(
  actor: Actor | null,
  versionId: unknown,
  history: readonly unknown[] | undefined,
  nowMs: number,
): (VersionPlan & { restoring: Version }) | Refusal {
  if (actor === null) return refuse(403, 'not_a_member');
  if (!can(actor.role, 'restore_version')) return refuse(403, 'insufficient_role');
  if (!Number.isFinite(nowMs)) return refuse(400, 'bad_clock');
  if (typeof versionId !== 'string' || versionId.trim().length === 0) return refuse(400, 'missing_version');

  const rows = readable(history);
  const target = rows.find((v) => v.id === versionId);
  if (!target) return refuse(404, 'version_not_found');

  const h = head(history);
  return {
    ok: true,
    restoring: target,
    version: {
      seq: nextSeq(history),
      label: `Restored “${target.label}”`.slice(0, MAX_VERSION_LABEL_CHARS),
      authorId: actor.userId,
      kind: 'restore',
      parentId: h === null ? null : h.id,
      restoredFrom: target.id,
      createdAt: nowMs,
    },
  };
}

/**
 * The chain from the root down to `versionId`, oldest first.
 *
 * Cycle-safe: a parent chain that loops (two rows pointing at each other after a bad write)
 * terminates at the repeat instead of spinning inside a Durable Object until the request budget
 * is gone.
 */
export function lineage(history: readonly unknown[] | undefined, versionId: unknown): Version[] {
  if (typeof versionId !== 'string') return [];
  const byId = new Map(readable(history).map((v) => [v.id, v]));
  const chain: Version[] = [];
  const seen = new Set<string>();
  let cursor: string | null = versionId;
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    const v = byId.get(cursor);
    if (!v) break;
    chain.push(v);
    cursor = v.parentId;
  }
  return chain.reverse();
}
