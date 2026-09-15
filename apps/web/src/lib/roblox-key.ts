// Connecting your OWN Roblox account, and the sentences that make it survivable.
//
// This panel asks a person to paste a credential that can write to their real Roblox account. That
// is the most consequential thing the settings page does, and the reason it exists is a mistake:
// Apple uploaded 299 assets into one person's account because the only write credential in the
// product was a single shared one. Roblox refused to take them back — an Image is "not an
// archivable asset type" — so that account keeps them permanently.
//
// So the decisions live here, in a file with no JSX, and the panel is the wiring:
//
//   * WHAT THE SCOPES MEAN, in the words of what will happen, not Roblox's identifiers. Somebody
//     ticking a box called `asset:write` has not been told that it means Apple can create things
//     in their account that they may never be able to delete.
//   * WHAT A BAD PASTE LOOKS LIKE, checked before a request rather than after, because a key that
//     lost half of itself to a truncated copy fails later with an error about Roblox.
//   * WHAT THE PANEL MAY SHOW AFTERWARDS. Never the key. The server will not return it, and this
//     file does not ask.
import { type RobloxScope, ROBLOX_SCOPES } from '@golem/shared';

export interface StoredCredentialView {
  robloxCreatorId: string;
  creatorType: 'user' | 'group';
  scopes: RobloxScope[];
  fingerprint: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * What each scope lets Apple do, said as a consequence.
 *
 * `undoable: false` is the field that matters. Roblox lets a creator archive a Model or an Audio
 * and refuses to archive an Image or a Decal, so "Apple can create assets" and "Apple can create
 * assets you will not be able to remove" are the same permission — and only the second sentence is
 * the truth a person needs before they tick it.
 */
export interface ScopeExplanation {
  scope: RobloxScope;
  title: string;
  does: string;
  undoable: boolean;
  caution?: string;
}

export const SCOPE_EXPLANATIONS: readonly ScopeExplanation[] = [
  {
    scope: 'asset:read',
    title: 'Read your assets',
    does: 'Apple can look up things you already own — names, ids and whether an upload finished.',
    undoable: true,
  },
  {
    scope: 'asset:write',
    title: 'Create assets in your account',
    does: 'Apple can upload images, decals and audio into your Roblox account while it builds.',
    undoable: false,
    caution:
      'Roblox does not let anyone delete an uploaded image or decal — not you, not us, not through '
      + 'the API. Anything created this way stays in your account for good.',
  },
  {
    scope: 'universe.place:write',
    title: 'Publish to your places',
    does: 'Apple can save and publish a place you own.',
    undoable: true,
  },
  {
    scope: 'universe-messaging-service:publish',
    title: 'Send messages to a running game',
    does: 'Apple can push a message into a live server, which is how a running game is told to reload something.',
    undoable: true,
  },
  {
    scope: 'creator-store-product:read',
    title: 'Read the Creator Store',
    does: 'Apple can search free Creator Store assets. It needs no key for this — the store is public — so this one is optional.',
    undoable: true,
  },
  {
    scope: 'user.social:read',
    title: 'Read your public profile',
    does: 'Apple can read your display name and public profile fields.',
    undoable: true,
  },
];

export function explain(scope: RobloxScope): ScopeExplanation | null {
  return SCOPE_EXPLANATIONS.find((e) => e.scope === scope) ?? null;
}

/** The scopes whose effects cannot be reversed. Used to decide what needs a second confirmation. */
export function irreversibleScopes(scopes: readonly RobloxScope[]): RobloxScope[] {
  return scopes.filter((s) => explain(s)?.undoable === false);
}

export interface KeyProblem {
  field: 'apiKey' | 'robloxCreatorId' | 'scopes';
  message: string;
}

/**
 * Check a paste before sending it anywhere.
 *
 * Every message names what to do next. "Invalid key" tells somebody they failed; "this looks
 * truncated — Open Cloud keys are much longer" tells them to copy it again, which is the thing
 * that will actually work.
 */
export function problemsWith(input: { apiKey: string; robloxCreatorId: string; scopes: readonly RobloxScope[] }): KeyProblem[] {
  const out: KeyProblem[] = [];
  const key = input.apiKey.trim();
  if (!key) {
    out.push({ field: 'apiKey', message: 'Paste the key from create.roblox.com → Open Cloud → API Keys.' });
  } else if (key.length < 24) {
    out.push({ field: 'apiKey', message: 'That looks truncated — an Open Cloud key is much longer. Copy it again from Roblox.' });
  } else if (/\s/.test(key)) {
    // A pasted key with a newline in it is the single most common way this fails, and the error
    // Roblox returns for it says nothing about whitespace.
    out.push({ field: 'apiKey', message: 'There is a space or a line break in the key — copy just the key itself.' });
  }

  const id = input.robloxCreatorId.trim();
  if (!id) {
    out.push({ field: 'robloxCreatorId', message: 'Apple needs to know which Roblox account to act on.' });
  } else if (!/^\d+$/.test(id)) {
    out.push({
      field: 'robloxCreatorId',
      // Naming the shape of the right answer beats naming the shape of the wrong one.
      message: 'This is the numeric id, not the username — it is in your profile URL, after /users/.',
    });
  }

  if (input.scopes.length === 0) {
    out.push({ field: 'scopes', message: 'Choose at least one thing Apple may do, or there is nothing to connect.' });
  }
  for (const s of input.scopes) {
    if (!(ROBLOX_SCOPES as readonly string[]).includes(s)) {
      out.push({ field: 'scopes', message: `"${s}" is not a Roblox Open Cloud scope.` });
    }
  }
  return out;
}

/**
 * How the stored key is described back to the person who stored it.
 *
 * FOUR STATES, NOT TWO, and the fourth is the one this function was written without. A failed
 * lookup used to fall through to "No Roblox account is connected", which is a claim about their
 * account made from a network error — and somebody reading it would paste their key again, on top
 * of the key that is already there. The repository's own ui-states guard caught it.
 *
 * The fingerprint is a SHA-256 and useless to read; the last four characters are what a person
 * recognises, the same trick a card form uses and for the same reason. The full key is never
 * returned by the server, so there is nothing here to accidentally render.
 */
export type KeyState = 'loading' | 'failed' | 'none' | 'connected';

export function stateOf(input: { isPending: boolean; isError: boolean; credential: StoredCredentialView | null }): KeyState {
  if (input.isPending) return 'loading';
  if (input.isError) return 'failed';
  return input.credential ? 'connected' : 'none';
}

export function describeStored(c: StoredCredentialView | null, state: KeyState = c ? 'connected' : 'none'): string {
  if (state === 'loading') return 'Checking…';
  if (state === 'failed') {
    return 'Apple could not check whether a Roblox account is connected. This is a connection '
      + 'problem, not an answer about your account — do not paste your key again until it loads.';
  }
  if (!c) return 'No Roblox account is connected.';
  const who = c.creatorType === 'group' ? 'group' : 'account';
  const used = c.lastUsedAt ? `last used ${c.lastUsedAt.slice(0, 10)}` : 'not used yet';
  return `Connected to Roblox ${who} ${c.robloxCreatorId}, key ending ${c.hint} — ${used}.`;
}
