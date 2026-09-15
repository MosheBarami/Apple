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
import { explainFailure, type Explained } from './error-taxonomy.ts';

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
  /**
   * Whether anything in the product uses a key granted this.
   *
   * FIVE OF THE SIX WERE FALSE when this field was added, and that is what it is for. The panel
   * offered "Publish to your places" and "Send messages to a running game" as things Apple may do,
   * and no code anywhere asked for either scope — `useRobloxCredential` had exactly one caller.
   * So a person could hand over publishing authority over their real Roblox account in exchange
   * for a feature that does not exist, which is a permission taken for nothing: the feature is
   * absent either way, and now the key can do it.
   *
   * It is a field rather than a comment because it is rendered. A tickbox that says "not used yet"
   * is an honest offer; the same tickbox without it is a quiet over-ask.
   */
  implemented: boolean;
}

export const SCOPE_EXPLANATIONS: readonly ScopeExplanation[] = [
  {
    scope: 'asset:read',
    title: 'Read your assets',
    does: 'Apple can look up things you already own — names, ids and whether an upload finished.',
    undoable: true,
    implemented: false,
  },
  {
    scope: 'asset:write',
    title: 'Create assets in your account',
    does: 'Apple can upload images, decals and audio into your Roblox account while it builds.',
    undoable: false,
    caution:
      'Roblox does not let anyone delete an uploaded image or decal — not you, not us, not through '
      + 'the API. Anything created this way stays in your account for good.',
    implemented: true,
  },
  {
    scope: 'universe.place:write',
    title: 'Publish to your places',
    does: 'Apple can save and publish a place you own.',
    undoable: true,
    implemented: false,
  },
  {
    scope: 'universe-messaging-service:publish',
    title: 'Send messages to a running game',
    does: 'Apple can push a message into a live server, which is how a running game is told to reload something.',
    undoable: true,
    implemented: false,
  },
  {
    scope: 'creator-store-product:read',
    title: 'Read the Creator Store',
    does: 'Apple can search free Creator Store assets. It needs no key for this — the store is public — so this one is optional.',
    undoable: true,
    implemented: false,
  },
  {
    scope: 'user.social:read',
    title: 'Read your public profile',
    does: 'Apple can read your display name and public profile fields.',
    undoable: true,
    // The one read the connection check makes. Without it "is this key still alive?" cannot be
    // answered at all, which is why the check says so rather than guessing — see roblox-check.ts.
    implemented: true,
  },
];

export function explain(scope: RobloxScope): ScopeExplanation | null {
  return SCOPE_EXPLANATIONS.find((e) => e.scope === scope) ?? null;
}

/**
 * The scopes something in the product actually asks for.
 *
 * Two today: `asset:write` (asset-import.ts, when a build uploads into the customer's account) and
 * `user.social:read` (roblox-check.ts, the connection check). The list is derived rather than
 * written out twice so that adding a consumer and telling the truth about it are the same edit.
 */
export function implementedScopes(): RobloxScope[] {
  return SCOPE_EXPLANATIONS.filter((e) => e.implemented).map((e) => e.scope);
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
export type KeyState = 'loading' | 'failed' | 'none' | 'connected' | 'rejected';

/**
 * What the worker's connection check answered. The same four shapes `roblox-check.ts` returns.
 *
 * `unknown` IS NOT A SOFT `ok`. Roblox being unreachable, a 403, or a key that never declared the
 * scope the probe needs all land there, and every one of them means the check did not happen. The
 * rule this file obeys: a verdict of unknown may change what is SAID, never what is CLAIMED about
 * the key — the stored state stays exactly as it was.
 */
export type KeyHealth =
  | { status: 'none' }
  | { status: 'ok'; accountName: string | null; checkedAt?: string }
  | { status: 'rejected'; reason: string; checkedAt?: string }
  | { status: 'unknown'; reason: string; checkedAt?: string };

export function stateOf(input: {
  isPending: boolean;
  isError: boolean;
  credential: StoredCredentialView | null;
  health?: KeyHealth | null;
}): KeyState {
  if (input.isPending) return 'loading';
  if (input.isError) return 'failed';
  if (!input.credential) return 'none';
  // A 'rejected' verdict with no stored credential is a stale answer about a key that has since
  // been disconnected, not a fifth state — hence the credential test above it.
  return input.health?.status === 'rejected' ? 'rejected' : 'connected';
}

export function describeStored(c: StoredCredentialView | null, state: KeyState = c ? 'connected' : 'none'): string {
  if (state === 'loading') return 'Checking…';
  if (state === 'failed') {
    return 'Apple could not check whether a Roblox account is connected. This is a connection '
      + 'problem, not an answer about your account — do not paste your key again until it loads.';
  }
  if (!c) return 'No Roblox account is connected.';
  const who = c.creatorType === 'group' ? 'group' : 'account';
  if (state === 'rejected') {
    // THE STATE THIS FILE WAS WRITTEN WITHOUT. Roblox expires keys and a person can revoke one
    // without Apple being told, and until this branch existed that key rendered as "Connected …
    // last used 2026-09-14" — confident, dated, and wrong. The three things this has to say are
    // what happened, what it costs (nothing), and the exact path to a new key.
    return `Roblox is refusing the key for ${who} ${c.robloxCreatorId} — it was revoked or it expired. `
      + 'Create a new one at create.roblox.com → Open Cloud → API Keys and paste it below. '
      + 'Nothing already built is affected, and nothing in your Roblox account changes.';
  }
  const used = c.lastUsedAt ? `last used ${c.lastUsedAt.slice(0, 10)}` : 'not used yet';
  return `Connected to Roblox ${who} ${c.robloxCreatorId}, key ending ${c.hint} — ${used}.`;
}

/**
 * The one line under the connection sentence after a check — or null when there is nothing to say.
 *
 * `null` for a check that never ran and for `none`: silence is the honest rendering of an
 * unasked question, and a grey "unknown" sitting under every unconnected account would train
 * people to ignore the line on the day it matters.
 */
export function describeHealth(health: KeyHealth | null | undefined): string | null {
  if (!health || health.status === 'none') return null;
  if (health.status === 'ok') {
    // THE NAME IS THE ACCOUNT THE KEY IS POINTED AT, NOT PROOF OF WHO OWNS THE KEY. Open Cloud
    // API keys have no whoami, so the check reads the profile of the id that was typed in — which
    // would answer identically for a key belonging to somebody else. "Accepted this key as
    // Builderman" would be the sentence that quietly claims otherwise, so it is not that sentence.
    return health.accountName
      ? `Roblox accepted this key just now. The account it is pointed at is ${health.accountName}.`
      : 'Roblox accepted this key just now.';
  }
  // Both remaining verdicts carry the worker's own sentence, which already names the cause. It is
  // not re-worded here: two places writing the same explanation is how they come to disagree.
  return health.reason;
}

// ---------------------------------------------------------------------------------------------
// what went wrong, said as something to do
// ---------------------------------------------------------------------------------------------

/**
 * The failures this panel can produce, mapped to an answer instead of a toast.
 *
 * WHAT WAS THERE BEFORE: `onError: (e) => toast(e.message)`. The worker distinguishes three
 * credential refusals from each other on purpose — no key, a scope that was never declared, a row
 * that will not decrypt — and Roblox distinguishes a revoked key from a rejected file. All of it
 * arrived as one grey line with no next action, and the worst of them ("the stored key could not
 * be decrypted — CREDENTIAL_KEY may have been rotated or lost") is an OPERATOR's sentence shown to
 * a customer, who would answer it by pasting their key again into a store that cannot read it.
 *
 * WHY IT DOES NOT JUST CALL `explainFailure`: that classifies a 401 as "your session has expired —
 * sign in again", which for a dead Roblox key sends somebody to re-authenticate the wrong account
 * entirely. `lib/error-taxonomy.ts` carries an `integration` kind for exactly this, and this
 * function is what fills it in for Roblox; anything unrecognised still falls through to the shared
 * taxonomy rather than being invented twice.
 */
const HOW_TO_MAKE_A_KEY = 'Create a new key at create.roblox.com → Open Cloud → API Keys, then paste it below.';

export function explainKeyFailure(err: unknown, opts: { integration?: boolean } = {}): Explained {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : null;
  const lower = raw.toLowerCase();
  const base = { kind: 'integration' as const, detail: raw || null, retryable: false };

  if (lower.includes('no roblox key is connected')) {
    return {
      ...base,
      title: 'No Roblox account is connected',
      safety: 'Nothing was created and nothing was changed in any Roblox account.',
      next: 'Connect a key below first — Apple cannot act on an account it has no key for.',
    };
  }

  if (lower.includes('was not declared with')) {
    // The one failure that is a CONSENT boundary rather than a fault: the key works, and it was
    // connected for something narrower than what was just attempted. Saying "permission" rather
    // than "scope" keeps it in the words that are on the tickbox.
    const scope = /with the (\S+) scope/.exec(raw)?.[1] ?? '';
    const named = scope ? explain(scope as RobloxScope)?.title : null;
    return {
      ...base,
      title: 'This key was not connected for that',
      safety: 'Apple refused before doing anything, so nothing was created.',
      next: named
        ? `Re-connect the key with "${named}" ticked, or leave it — Apple will keep refusing rather than using a permission you did not give.`
        : 'Re-connect the key with that permission ticked, or leave it as it is.',
    };
  }

  if (lower.includes('could not be decrypted') || lower.includes('credential_key')) {
    return {
      ...base,
      title: 'Apple cannot read the key it stored for you',
      // Pasting it again is the obvious move and it is the wrong one: the fault is on this side,
      // and a second paste fails identically while looking like the customer's problem.
      safety: 'Nothing was sent to Roblox. Your key still works on Roblox — this is a fault on our side.',
      next: 'Contact support with this message rather than pasting the key again; a re-paste will fail the same way.',
    };
  }

  if (opts.integration || lower.includes('roblox') || lower.includes('open cloud') || lower.includes('api key')) {
    if (status === 401 || lower.includes('invalid api key') || lower.includes('unauthorized')) {
      return {
        ...base,
        title: 'Roblox refused this key',
        safety: 'It was revoked or it expired. Nothing already built is affected.',
        next: HOW_TO_MAKE_A_KEY,
      };
    }
    if (status === 403 || lower.includes('forbidden')) {
      return {
        ...base,
        title: 'Roblox would not allow that with this key',
        safety: 'The key is alive; Roblox refused this particular action.',
        next: 'Check the key’s permissions and any IP restriction on it at create.roblox.com.',
      };
    }
  }

  // Anything else is a failure like any other, explained by the shared taxonomy — with one
  // addition: this panel has no Try-again button of its own, so `next` is never left null here.
  const fallback = explainFailure(err);
  return { ...fallback, next: fallback.next ?? 'Try connecting again; if it keeps happening, the detail below is worth reporting.' };
}
