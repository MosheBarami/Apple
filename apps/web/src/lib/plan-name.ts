import { PLAN_COPY, isPlanId } from '@studpilot/shared';

/**
 * A stored plan id as a person reads it: `builder` is Pro and `studio` is Max (the ids stay as stored because the
 * profiles constraint and the Stripe price mapping depend on them). An id this build does not know is shown as it
 * is stored, never as another plan, and a missing one as nothing.
 */
export function planDisplayName(plan: unknown): string {
  return isPlanId(plan) ? PLAN_COPY[plan].name : typeof plan === 'string' ? plan : '';
}
