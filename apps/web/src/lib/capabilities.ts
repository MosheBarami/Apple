// What this person may do in this project, on the client side of the same decision.
//
// The server has always known. `apps/worker/src/collab.ts` resolves a role from `projects.owner_id`
// and the `project_members` rows, and every route names the action it performs — so a viewer who
// posts a message is refused. What the web app never did was ASK, which meant a viewer saw an
// owner's interface: a composer that takes their message and loses it, a Restore button that fails,
// a Remove member control for a project they cannot administer. Every one of those is a promise the
// product cannot keep, and finding out by pressing it is the worst way to learn.
//
// THE STATE THAT MATTERS IS THE THIRD ONE. Loading and failure are not permission — and the
// dangerous move is to let either render as one. "We have not checked yet" shown as an enabled
// button is the failure-to-observe pattern exactly: the interface makes a claim about authority it
// has not established. So a control is enabled only while an answer is actually in hand, and the
// explanation says which of the three states we are in rather than blaming the user's role for a
// request that has not come back.
//
// This module is a MIRROR of the worker's allowlists, and apps/web/tests/capabilities.test.mjs
// imports both and holds them against each other. A mirror nobody checks is a second source of
// truth that drifts.

/** Mirrors COLLAB_ROLES in apps/worker/src/collab.ts. */
export const COLLAB_ROLES = ['viewer', 'commenter', 'editor', 'admin', 'owner'] as const;
export type CollabRole = (typeof COLLAB_ROLES)[number];

/** Mirrors COLLAB_ACTIONS. */
export const COLLAB_ACTIONS = [
  'read',
  'comment',
  'react',
  'request_review',
  'approve',
  'chat',
  'build',
  'restore_version',
  'manage_members',
  'share',
  'delete_project',
] as const;
export type CollabAction = (typeof COLLAB_ACTIONS)[number];

export const ROLE_LABELS: Record<CollabRole, string> = {
  viewer: 'Viewer',
  commenter: 'Commenter',
  editor: 'Editor',
  admin: 'Admin',
  owner: 'Owner',
};

/** What each role is for, in the words an admin needs when choosing one. */
export const ROLE_BLURBS: Record<CollabRole, string> = {
  viewer: 'Can read the conversation, the checkpoints and the credits.',
  commenter: 'Can also comment and react.',
  editor: 'Can also talk to Apple and build — which spends the owner’s Credits.',
  admin: 'Can also restore checkpoints, manage members and share the project.',
  owner: 'Owns the project. Only the owner can delete it.',
};

/** The roles a membership row may carry. `owner` is the projects row, never a grant. */
export const GRANTABLE_ROLES = ['viewer', 'commenter', 'editor', 'admin'] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

/**
 * The roles a SHARE LINK may carry — a shorter list than GRANTABLE_ROLES, and deliberately so.
 *
 * Mirrors SHARE_LINK_MAX_RANK in apps/worker/src/collab.ts, which caps at `editor`. The mint route
 * runs the link it is about to hand out through the very function that redeems it, so a link
 * asking for admin is refused with `role_too_strong` before it is ever stored — an unredeemable
 * link is a support ticket and an over-powered one is a breach. A picker that offered Admin here
 * would therefore be a control whose top option always fails, which is a promise the product
 * cannot keep. Ordered weakest-first: tests/share-link.test.mjs reads the last entry as the cap.
 */
export const LINKABLE_ROLES = ['viewer', 'commenter', 'editor'] as const;
export type LinkableRole = (typeof LINKABLE_ROLES)[number];

export type AccessState =
  | { status: 'loading' }
  | { status: 'ready'; role: CollabRole; capabilities: readonly CollabAction[] }
  /** The check itself failed. Not a refusal — we do not know, and we say so. */
  | { status: 'unavailable'; detail: string };

export const ACCESS_LOADING: AccessState = { status: 'loading' };

export const isRole = (value: unknown): value is CollabRole =>
  typeof value === 'string' && (COLLAB_ROLES as readonly string[]).includes(value);

export const isAction = (value: unknown): value is CollabAction =>
  typeof value === 'string' && (COLLAB_ACTIONS as readonly string[]).includes(value);

/**
 * Read `/api/shared/:id`'s answer into a state this build can act on.
 *
 * A role or capability this build does not know is DROPPED rather than kept: a capability string
 * from a newer server would otherwise reach `allows` as a value nothing matches, and the failure
 * would be silent in one direction and permissive in the other depending on how it was compared.
 * A payload with no readable role is `unavailable`, never an empty set of permissions — "we could
 * not read the answer" and "you may do nothing" are different sentences and only one is true.
 */
export function normaliseAccess(raw: unknown): AccessState {
  if (!raw || typeof raw !== 'object') return { status: 'unavailable', detail: 'unreadable' };
  const r = raw as { role?: unknown; capabilities?: unknown };
  if (!isRole(r.role)) return { status: 'unavailable', detail: 'unreadable' };
  const capabilities = Array.isArray(r.capabilities) ? r.capabilities.filter(isAction) : [];
  return { status: 'ready', role: r.role, capabilities };
}

/** May this person do this, as far as we actually know? Unknown is never yes. */
export function allows(access: AccessState, action: CollabAction): boolean {
  return access.status === 'ready' && access.capabilities.includes(action);
}

/** What a role is called on screen, or an honest hedge while we do not know it. */
export function roleLabel(access: AccessState): string {
  if (access.status === 'ready') return ROLE_LABELS[access.role];
  return access.status === 'loading' ? 'Checking…' : 'Unknown';
}

const ACTION_NEEDS: Record<CollabAction, string> = {
  read: 'read this project',
  comment: 'comment here',
  react: 'react here',
  request_review: 'ask for a review',
  approve: 'approve work',
  chat: 'talk to Apple here',
  build: 'build in this project',
  restore_version: 'restore a checkpoint',
  manage_members: 'manage members',
  share: 'share this project',
  delete_project: 'delete this project',
};

/**
 * Why a control is off, in a sentence that distinguishes the three reasons.
 *
 * A single "You do not have permission" for all three is the lie: two of them are not about
 * permission at all, and a user who reloads on the first is doing the right thing while a user who
 * asks an admin on it is not.
 */
export function whyNot(access: AccessState, action: CollabAction): string | null {
  if (allows(access, action)) return null;
  if (access.status === 'loading') return 'Checking what you can do here…';
  if (access.status === 'unavailable') return 'We could not check your access — reload to try again.';
  return `Your role here is ${ROLE_LABELS[access.role]}, which cannot ${ACTION_NEEDS[action]}.`;
}
