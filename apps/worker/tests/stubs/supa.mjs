// Stubbed Supabase boundary. Ownership is the property under test, so it is modelled explicitly:
// PROJECTS maps projectId -> ownerId, and a user gets a row back only for a project they own.
// That is what the real RLS policy enforces; here it is enforced in a few lines so the route can
// actually be executed against both the owning and the non-owning case.
export const PROJECTS = new Map();
export async function getOwnedProject(_env, jwt, projectId) {
  const owner = PROJECTS.get(projectId);
  if (!owner || owner !== jwt) return null;
  return { id: projectId, name: 'fixture', owner_id: owner };
}
export async function getProfile() { return { is_admin: false }; }

// ---------------------------------------------------------------------------------------------
// COLLABORATION. MEMBERS is projectId -> [{ user_id, role, expires_at, revoked_at }].
//
// Modelled rather than stubbed to `null`: a fixture that answered "no access" unconditionally
// would make every shared route refuse, and a route that refuses everybody passes an
// owner-isolation test for the wrong reason. Empty by default, which is the same shape the
// pre-collaboration product had — so the tests that alias this module and never touch MEMBERS
// keep asserting exactly what they asserted before.
// ---------------------------------------------------------------------------------------------
export const MEMBERS = new Map();

const RANK = { viewer: 0, commenter: 1, editor: 2, admin: 3, owner: 4 };
const CAN = {
  viewer: ['read'],
  commenter: ['read', 'comment', 'react'],
  editor: ['read', 'comment', 'react', 'request_review', 'chat', 'build'],
  admin: ['read', 'comment', 'react', 'request_review', 'chat', 'build', 'approve', 'restore_version', 'manage_members', 'share'],
  owner: ['read', 'comment', 'react', 'request_review', 'chat', 'build', 'approve', 'restore_version', 'manage_members', 'share', 'delete_project'],
};

export async function getProjectAccess(_env, user, projectId, action, nowMs = Date.now()) {
  const owner = PROJECTS.get(projectId);
  if (!owner) return { project: null, decision: { allowed: false, status: 404, role: null, reason: 'not_a_member' } };
  const project = { id: projectId, name: 'fixture', owner_id: owner };

  let role = owner === user.jwt || owner === user.userId ? 'owner' : null;
  for (const row of MEMBERS.get(projectId) ?? []) {
    if (row.user_id !== user.userId) continue;
    if (row.revoked_at) continue;
    if (row.expires_at && Date.parse(row.expires_at) <= nowMs) continue;
    if (role === null || RANK[row.role] > RANK[role]) role = row.role;
  }
  if (role === null) return { project: null, decision: { allowed: false, status: 404, role: null, reason: 'not_a_member' } };
  if (!(CAN[role] ?? []).includes(action)) {
    return { project: null, decision: { allowed: false, status: 403, role, reason: 'insufficient_role' } };
  }
  return { project, membership: { userId: user.userId, role, via: role === 'owner' ? 'owner' : 'grant' } };
}

export async function listProjectMembers(_env, _user, project) {
  return MEMBERS.get(project.id) ?? [];
}

export function memberDirectory(project, rows, ownerHandle) {
  return [
    { userId: project.owner_id, handle: ownerHandle ?? project.owner_id, role: 'owner', displayName: ownerHandle ?? null },
    ...rows
      .filter((r) => !r.revoked_at)
      .map((r) => ({ userId: r.user_id, handle: r.display_name ?? r.user_id, role: r.role, displayName: r.display_name ?? null })),
  ];
}

export async function supaRest() {
  return { ok: true, status: 200, data: [] };
}
