/**
 * What the site says about Sign in with Roblox, derived from ROBLOX_OAUTH_REVIEWED (packages/shared).
 *
 * The Roblox OAuth app is in Roblox's private mode: up to 10 unique users until Roblox reviews the app (planning/roblox-oauth-setup.md; the review
 * is owner action X9, open). The app draws the Roblox button for every visitor, so a page that offers it without the limit sends the 11th person
 * to a failed consent. While the flag is false every page that offers Sign in with Roblox says, in the same paragraph, that it is in a limited
 * test until Roblox approves the app, and that email sign-in works for everyone. The day the flag is true, the pages offer it plainly.
 *
 * Frontmatter only (Astro evaluates it at build time). The blog post is Markdown and cannot read the flag: tests/blog-post.test.mjs ties it to the
 * flag instead, and tests/roblox-signin-limit.test.mjs reads every built page.
 */
import { ROBLOX_OAUTH_REVIEWED } from '@studpilot/shared';

export { ROBLOX_OAUTH_REVIEWED };

/** The limit, in one sentence a paragraph can carry beside the offer. */
export const ROBLOX_LIMIT = 'Sign in with Roblox is in a limited test until Roblox approves the app.';

/** The other half of the same promise: the way in that is not limited. */
export const EMAIL_FOR_EVERYONE = 'Email sign-in works for everyone.';
