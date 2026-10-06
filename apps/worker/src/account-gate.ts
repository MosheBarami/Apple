/** The pre-launch account gate (Q37/G02): who may start a build before the product opens to everyone. */
import type { Env } from './env';

const idList = (value?: string) => (value ?? '').split(',').map((id) => id.trim()).filter(Boolean);

/**
 * Before launch only the owner and approved accounts may start builds. OWNER_USER_IDS, RELEASE_LIBRARY_OWNER_ID and
 * LIBRARY_APPROVED_USER_IDS (secrets) are the whole list. With no OWNER_USER_IDS configured (local dev, tests) nothing is
 * gated: there is no owner to approve anyone.
 */
export function buildApproved(env: Env, userId: string): boolean {
  const owners = idList(env.OWNER_USER_IDS);
  if (owners.length === 0) return true;
  return owners.includes(userId) || userId === env.RELEASE_LIBRARY_OWNER_ID?.trim() || idList(env.LIBRARY_APPROVED_USER_IDS).includes(userId);
}
