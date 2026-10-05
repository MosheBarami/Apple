// Sharing StudPilot: an invite link to the sign-up page, and an optional "Made with StudPilot" line for a game's description.
//
// WHAT THE LINK IS, AND WHAT IT IS NOT. `https://studpilot.app/app/signup?ref=<code>` opens the sign-up page. The code is made from the
// sharer's account id with a one-way hash, so it names no one and the id cannot be read back from it, and it is the same every time for
// the same account. NOTHING READS IT YET: the sign-up page ignores `ref`, no worker route accepts it, and no user metadata carries it, so a
// sign-up through the link is recorded exactly like any other. Attribution is a later step (M6), and so is anything that could be earned
// by it: NO REFERRAL CREDIT IS PROMISED ANYWHERE. A copy of this feature that said otherwise would be the "3,017 templates" claim again.
//
// No imports: loaded directly by `node --test`.

/** The sign-up page the link opens. A fixed address, so a link copied on a preview or a dev server still points at the product. */
export const INVITE_BASE = 'https://studpilot.app/app/signup';

/** Where the badge line points. */
export const SITE_URL = 'https://studpilot.app';

/** The optional line for a game's description: plain text and a link, because a Roblox description shows no markup. */
export const BADGE_TEXT = `Made with StudPilot - ${SITE_URL}`;

/** A code is lower-case hex: short enough to read out, long enough to tell accounts apart (40 bits). */
export const REF_CODE_LENGTH = 10;
const REF_CODE = /^[0-9a-f]{10}$/;

export const isRefCode = (value: unknown): value is string => typeof value === 'string' && REF_CODE.test(value);

type Digest = (algorithm: 'SHA-256', data: Uint8Array) => Promise<ArrayBuffer>;

/**
 * The code for an account: the first ten hex digits of SHA-256 over a fixed label and the account id. Null when there is no id, or when
 * the browser has no Web Crypto (an old webview): a link is then not offered, never one with an invented code.
 */
export async function referralCode(
  userId: string | null | undefined,
  digest: Digest | null = typeof crypto !== 'undefined' && crypto.subtle ? (a, d) => crypto.subtle.digest(a, d as BufferSource) : null,
): Promise<string | null> {
  if (typeof userId !== 'string' || userId.length === 0 || !digest) return null;
  try {
    const bytes = await digest('SHA-256', new TextEncoder().encode(`studpilot-invite:${userId}`));
    const hex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, REF_CODE_LENGTH);
  } catch {
    return null;
  }
}

/** The link to share, or null when there is no valid code to put in it. */
export function inviteLink(code: string | null | undefined): string | null {
  return isRefCode(code) ? `${INVITE_BASE}?ref=${code}` : null;
}

/** What the invite link's row says about it, and only what is true of it today. */
export const INVITE_NOTE =
  'Anyone who opens it lands on StudPilot’s sign-up page. The code in it is made from your account with a one-way hash, so it does not name you. Nothing records it yet, and nothing is earned by sharing it.';

/** What the badge row says: optional, plain text, and where it goes. */
export const BADGE_NOTE = 'Optional. Paste it into your game’s description if you like. It is plain text with a link, because a Roblox description shows no formatting.';

/** The words after a copy. */
export const COPIED = 'Copied';
export const COPY_FAILED = 'Could not copy. Select the text and copy it yourself.';
