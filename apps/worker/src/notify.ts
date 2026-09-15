// The one door every notification goes through: resolve the recipient's settings, ask the policy,
// write the row. Three files, three jobs - `notifications.ts` decides, `notification-store.ts`
// stores, and this joins them to the rest of the worker.
//
// WHY A THIRD FILE INSTEAD OF A METHOD ON THE STORE. The store must not know about the memory
// tables, and the policy must not know about D1 at all - that is what keeps `planNotification`
// something a test can feed a hostile input to without standing up a database. This file is the
// only place that holds both, and it is deliberately the thinnest of the three.
//
// EVERY CALL IS BEST-EFFORT AND NONE OF THEM THROW. A notification is a thing the product says
// ABOUT work, never part of the work. A failed run that also fails to record a notification is
// still a failed run and the user must still be told what happened over the socket; an exception
// escaping into `finishRun` would turn a storage hiccup into a lost transcript. So the outcome is
// RETURNED rather than thrown, including the boring refusals, because the caller logging "muted"
// is the difference between a person learning they switched something off and a person concluding
// the product is broken.
import type { Env } from './env';
import { deliverNotification, ensureNotificationTables } from './notification-store';
import { planNotification, type NotificationInput, type PlanRefusal, type RecipientPrefs } from './notifications';
import { ensureMemoryTables, listMemoryEntries, orgMembership, type MemoryAccess } from './memory-store';
import { mergePreferences, preferencesFromEntries } from './preferences';

export type NotifyOutcome =
  | { delivered: true; created: boolean; id: string }
  | { delivered: false; reason: PlanRefusal | 'store_error' };

/**
 * The recipient's notification settings, layered org then user then project.
 *
 * `provenProjectId` IS A PROOF OBLIGATION ON THE CALLER, and it has the same meaning it has in
 * `memoryAccessFor`: this project's rows may be read for this person because the caller has
 * already established that the two belong together. Every emitter in this tree satisfies it
 * structurally rather than by checking - a run's recipient is the project's owner as the session
 * knows it, a mention target came out of the member directory, a reviewer was refused unless they
 * could approve. Passing a project id a caller merely received from a request body would make the
 * store's central property ("a scope can only ever read and write itself") into a claim.
 */
export async function notificationPrefsFor(env: Env, recipientId: string, provenProjectId?: string | null): Promise<RecipientPrefs> {
  await ensureMemoryTables(env);
  const access: MemoryAccess = {
    userId: recipientId,
    projectIds: provenProjectId ? [provenProjectId] : [],
    orgs: await orgMembership(env, recipientId),
  };
  const org = access.orgs.length > 0 ? await listMemoryEntries(env, access, 'org', access.orgs[0]!.orgId) : [];
  const user = await listMemoryEntries(env, access, 'user', recipientId);
  const project = provenProjectId ? await listMemoryEntries(env, access, 'project', provenProjectId) : [];
  // The vocabulary is deliberately not supplied: `model` and `tool_permissions` need allowlists
  // this file has no business importing, and without them they are refused rather than accepted
  // unchecked. Those refusals are discarded here because nothing in a notification reads them -
  // this function wants two keys out of the eight.
  const merged = mergePreferences({
    org: preferencesFromEntries(org).prefs,
    user: preferencesFromEntries(user).prefs,
    project: preferencesFromEntries(project).prefs,
  });
  return { delivery: merged.prefs.notify_delivery, events: merged.prefs.notify_events };
}

/**
 * Tell one person one thing.
 *
 * The `projectId` on the input doubles as the proof above: a project-scoped notification is
 * addressed to a person the caller has already established belongs to that project, which is the
 * same fact that makes the notification appropriate in the first place.
 */
export async function notify(env: Env, input: NotificationInput, opts: { now?: number } = {}): Promise<NotifyOutcome> {
  try {
    const recipientId = typeof input.recipientId === 'string' ? input.recipientId : '';
    const projectId = typeof input.projectId === 'string' ? input.projectId : null;
    const prefs = recipientId ? await notificationPrefsFor(env, recipientId, projectId) : {};
    const plan = planNotification(input, prefs, opts);
    if (!plan.ok) return { delivered: false, reason: plan.reason };
    await ensureNotificationTables(env);
    const res = await deliverNotification(env, plan.notification, opts);
    return { delivered: true, created: res.created, id: res.id };
  } catch (err) {
    // Logged, not thrown. See the header: a notification is never part of the work.
    console.warn(`[notify] ${String((err as Error)?.message ?? err)}`);
    return { delivered: false, reason: 'store_error' };
  }
}

/** Several recipients, one event. Sequential: the volumes here are members of one project. */
export async function notifyMany(env: Env, inputs: readonly NotificationInput[], opts: { now?: number } = {}): Promise<NotifyOutcome[]> {
  const out: NotifyOutcome[] = [];
  for (const input of inputs) out.push(await notify(env, input, opts));
  return out;
}
