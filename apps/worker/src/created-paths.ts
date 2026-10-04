// What this run itself put in the place, as paths, so a safety fence can tell it from what was already there.
//
// A create name conflict fences deletes for the rest of the run (AgentState.blockDeletesAfterCreateConflict): it exists to
// protect instances that were in the place before the run, which the model might "fix" a duplicate-name error by deleting.
// It also fenced the run's OWN half-built pieces, so after one name clash the model could not remove a part it had created a
// minute earlier, and the owner benchmark's builds could neither finish nor be tidied. The fence now lets a delete through
// when every path in it is something this run created.
//
// Pure. The list is bounded because it is persisted with the run (one Durable Object value, 128 KiB).

/** Result keys that list paths this call brought into the place: create_instances/clone_instances, inserts and imports, copies. */
const CREATED_KEYS = ['created', 'inserted', 'placed'] as const;
const MAX_CREATED = 150;

/** Ops whose success means the place gained instances. */
const ADDING_OPS = new Set(['create_instances', 'clone_instances', 'insert_asset', 'import_owner_component', 'import_owner_local', 'place_copies', 'group_instances']);

/** Add paths a tool reports directly (an insert settles its model under a final name after the plugin's own reply). */
export function addCreated(prior: readonly string[] | undefined, paths: readonly string[]): string[] | undefined {
  const fresh = paths.filter((p) => typeof p === 'string' && p.startsWith('game'));
  if (!fresh.length) return prior ? [...prior] : undefined;
  return [...new Set([...(prior ?? []), ...fresh])].slice(-MAX_CREATED);
}

export function rememberCreated(prior: readonly string[] | undefined, op: string, data: unknown): string[] | undefined {
  if (!ADDING_OPS.has(op) || typeof data !== 'object' || data === null) return prior ? [...prior] : undefined;
  const d = data as Record<string, unknown>;
  const fresh: string[] = [];
  for (const key of CREATED_KEYS) {
    const list = d[key];
    if (Array.isArray(list)) for (const p of list) if (typeof p === 'string' && p.startsWith('game')) fresh.push(p);
  }
  if (typeof d.path === 'string' && op === 'group_instances') fresh.push(d.path);
  if (!fresh.length) return prior ? [...prior] : undefined;
  return [...new Set([...(prior ?? []), ...fresh])].slice(-MAX_CREATED);
}

const inside = (path: string, root: string): boolean => path === root || path.startsWith(`${root}.`) || path.startsWith(`${root}[`);

/** True when every path is one this run created, or lies inside one. An empty list covers nothing. */
export function coveredByCreated(created: readonly string[] | undefined, paths: readonly string[] | undefined): boolean {
  if (!created?.length || !paths?.length) return false;
  return paths.every((p) => typeof p === 'string' && created.some((c) => inside(p, c)));
}
