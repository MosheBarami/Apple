/**
 * Which plan figures the owner has decided, for the pages that print them.
 *
 * The decided pricing doc fixes each plan's PRICE and MONTHLY pool (planning/pricing-2026-10-04.md) and Free's 5 a day. The paid plans' per-day
 * figures in PLAN_TABLE (Pro 20, Max 30) are an assumption QuotaDO needs a number for: the owner has not confirmed them
 * (planning/proof/M2/DECISIONS.md section 5; packages/shared PAID_DAILY_CAPS_DECIDED). A page prints a plan's per-day figure, and any "full days"
 * arithmetic built on it, only when this says it is decided. Otherwise it says NOT_DECIDED where the figure would be.
 *
 * Frontmatter only (Astro evaluates it at build time).
 */
import { PAID_DAILY_CAPS_DECIDED, type PlanId } from '@studpilot/shared';

export { PAID_DAILY_CAPS_DECIDED };

/** Is this plan's per-day figure the owner's? Free's is; the paid plans' are not until PAID_DAILY_CAPS_DECIDED says so. */
export const dailyCapDecided = (id: PlanId): boolean => id === 'free' || PAID_DAILY_CAPS_DECIDED;

/** What a page says in place of a per-day figure nobody decided. */
export const NOT_DECIDED = 'Not decided yet';
