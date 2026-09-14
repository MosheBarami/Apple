// Stubbed Supabase boundary. Ownership is the property under test, so it is modelled explicitly:
// PROJECTS maps projectId -> ownerId, and a user gets a row back only for a project they own.
// That is what the real RLS policy enforces; here it is enforced in twelve lines so the route can
// actually be executed against both the owning and the non-owning case.
export const PROJECTS = new Map();
export async function getOwnedProject(_env, jwt, projectId) {
  const owner = PROJECTS.get(projectId);
  if (!owner || owner !== jwt) return null;
  return { id: projectId, name: 'fixture' };
}
export async function getProfile() { return { is_admin: false }; }
