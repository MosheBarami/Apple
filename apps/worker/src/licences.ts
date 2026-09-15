// The licence table, and nothing else.
//
// It lives in its own module because it is the ONE decision that has to be reachable from
// everywhere — the ingest, the worker's validation, and the genre kits — while asset-library.ts
// pulls in D1, Vectorize and the AI gateway with it. A caller that only needs to ask "may this
// licence enter the library" should not have to bundle a database client to ask, because the
// alternative every time that happens is a second copy of the table, which is how one legal
// question ends up with two answers.
//
// asset-library.ts re-exports all three names, so every existing import keeps working unchanged.

// ---------------------------------------------------------------------------------------------

export interface LicenceRule {
  commercialUse: boolean;
  attributionRequired: boolean;
  shareAlike: boolean;
  /** Whether an asset under this licence may enter the library at all. */
  allowedInLibrary: boolean;
  why: string;
}

/**
 * Canonical licence rules, keyed by SPDX-ish id. `licence` on a record stays verbatim; this table
 * is reached through normaliseLicence() so a record can be validated without losing the original
 * wording.
 *
 * v1 policy is **CC0 only**. CC-BY is legally usable but attribution has to survive into whatever
 * Golem builds, which is a product feature nobody has built yet; it is allowed in the table but
 * flagged. CC-BY-SA and GPL are excluded outright — share-alike and source-distribution
 * obligations cannot be discharged coherently inside a Roblox place.
 */
export const LICENCES: Readonly<Record<string, LicenceRule>> = {
  'CC0-1.0': { commercialUse: true, attributionRequired: false, shareAlike: false, allowedInLibrary: true, why: 'public domain dedication' },
  'CC-BY-4.0': {
    commercialUse: true,
    attributionRequired: true,
    shareAlike: false,
    allowedInLibrary: true,
    why: 'usable commercially, but the credit line must be emitted into every generated place',
  },
  'CC-BY-3.0': { commercialUse: true, attributionRequired: true, shareAlike: false, allowedInLibrary: true, why: 'as CC-BY-4.0' },
  'CC-BY-SA-4.0': {
    commercialUse: true,
    attributionRequired: true,
    shareAlike: true,
    allowedInLibrary: false,
    why: 'share-alike cannot be discharged inside a Roblox place — a customer would inherit an obligation they never agreed to',
  },
  // The non-commercial family exists in the registry precisely so it can be *recognised and
  // refused* rather than falling through normaliseLicence() as an unknown string. Sketchfab
  // publishes per-asset licences (manifest §15) and NC is common there, so a record carrying one
  // is an expected input, not a malformed one.
  'CC-BY-NC-4.0': {
    commercialUse: false,
    attributionRequired: true,
    shareAlike: false,
    allowedInLibrary: false,
    why: 'non-commercial: a Roblox experience with any monetisation, or eligible for the engagement payout, is a commercial use',
  },
  'CC-BY-NC-SA-4.0': {
    commercialUse: false,
    attributionRequired: true,
    shareAlike: true,
    allowedInLibrary: false,
    why: 'non-commercial and share-alike — both obligations are undischargeable in a customer place',
  },
  // NoDerivs is here for the same reason the NC family is, and it is the trap of the set: its
  // Sketchfab label is "CC Attribution-NoDerivs", so anything matching on the word *attribution*
  // reads it as plain CC-BY and admits it. It cannot be admitted. Every route an external mesh
  // takes into a Roblox place is a derivative work — decimating to a triangle budget, rescaling to
  // studs, re-baking a 4K texture down to 1024 — so ND forbids the only thing we would ever do
  // with it. Recognised and refused beats unrecognised: an unknown string is a shrug, and this is
  // a decision.
  'CC-BY-ND-4.0': {
    commercialUse: true,
    attributionRequired: true,
    shareAlike: false,
    allowedInLibrary: false,
    why: 'no-derivatives: importing to Roblox means decimating, rescaling and re-baking, which is exactly the derivative work this licence forbids',
  },
  'CC-BY-NC-ND-4.0': {
    commercialUse: false,
    attributionRequired: true,
    shareAlike: false,
    allowedInLibrary: false,
    why: 'non-commercial and no-derivatives — neither obligation survives an import into a customer place',
  },
  // Permissive code-style licences, which is what the icon sets ship under. They require the
  // notice to travel, not the source — dischargeable by a credits list, unlike share-alike.
  'MIT': { commercialUse: true, attributionRequired: true, shareAlike: false, allowedInLibrary: true, why: 'permissive; the notice must travel with the work' },
  'ISC': { commercialUse: true, attributionRequired: true, shareAlike: false, allowedInLibrary: true, why: 'as MIT' },
  'Apache-2.0': { commercialUse: true, attributionRequired: true, shareAlike: false, allowedInLibrary: true, why: 'permissive; notice and NOTICE file must travel' },
  'BSD-3-Clause': { commercialUse: true, attributionRequired: true, shareAlike: false, allowedInLibrary: true, why: 'as MIT, plus a no-endorsement clause' },
  'Unlicense': { commercialUse: true, attributionRequired: false, shareAlike: false, allowedInLibrary: true, why: 'public domain dedication' },
  'OFL-1.1': { commercialUse: true, attributionRequired: true, shareAlike: true, allowedInLibrary: false, why: 'the reserved-font-name and bundling rules cannot be discharged inside a Roblox place' },
  'PD': { commercialUse: true, attributionRequired: false, shareAlike: false, allowedInLibrary: true, why: 'public domain — no rights reserved to discharge' },
  'GPL-2.0': { commercialUse: true, attributionRequired: true, shareAlike: true, allowedInLibrary: false, why: 'as GPL-3.0' },
  'GPL-3.0': { commercialUse: true, attributionRequired: true, shareAlike: true, allowedInLibrary: false, why: 'source-distribution obligation is undischargeable here' },
  'ROBLOX-TOU': {
    commercialUse: true,
    attributionRequired: false,
    shareAlike: false,
    allowedInLibrary: true,
    why: 'Roblox-authored asset used under the Roblox Terms of Use',
  },
  'ROBLOX-GENERATED': {
    commercialUse: true,
    attributionRequired: false,
    shareAlike: false,
    allowedInLibrary: true,
    why: 'produced by GenerationService in the user’s own Studio session and persisted to their own account',
  },
  'NONE-PROCEDURAL': { commercialUse: true, attributionRequired: false, shareAlike: false, allowedInLibrary: true, why: 'no third-party material involved' },
};

/**
 * Map a verbatim licence string to a canonical id, or null when unrecognised.
 *
 * Deliberately conservative: an unrecognised string fails validation rather than being guessed at.
 * The verbatim forms below are the exact wordings observed on the source sites.
 */
export function normaliseLicence(verbatim: string): string | null {
  const t = verbatim.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  // Restrictions are checked from most restrictive to least, so a longer id can never be matched
  // by a shorter prefix of itself: 'CC BY-NC-SA' before 'CC BY-NC' before 'CC BY-SA' before 'CC BY'.
  const isCc = /\bcc\b|creative commons/.test(t);
  const nc = /\bnc\b|non[- ]?commercial/.test(t);
  const sa = /\bsa\b|share[- ]?alike/.test(t);
  const nd = /\bnd\b|no[- ]?derivs?\b|no[- ]?derivatives\b/.test(t);
  if (isCc && nc && sa) return 'CC-BY-NC-SA-4.0';
  if (isCc && nc && nd) return 'CC-BY-NC-ND-4.0';
  if (isCc && nc) return 'CC-BY-NC-4.0';
  if (isCc && sa) return 'CC-BY-SA-4.0';
  // BEFORE the plain-attribution branch below, and the ordering is the whole safety property:
  // "CC Attribution-NoDerivs" satisfies that branch's wording too, and reaching it first would
  // return an ALLOWED id for a licence that forbids every use this library puts an asset to.
  if (isCc && nd) return 'CC-BY-ND-4.0';
  if (/\bgpl\b|general public license/.test(t)) return /\b2(\.0)?\b/.test(t) ? 'GPL-2.0' : 'GPL-3.0';
  // Checked BEFORE the CC family: "MIT License" contains no CC marker, but ordering these together
  // keeps the whole permissive block in one place and makes the precedence readable.
  if (/\bmit\b/.test(t)) return 'MIT';
  if (/\bisc\b/.test(t)) return 'ISC';
  if (/apache/.test(t)) return 'Apache-2.0';
  if (/bsd[- ]?3|bsd 3-clause/.test(t)) return 'BSD-3-Clause';
  if (/\bunlicense\b/.test(t)) return 'Unlicense';
  if (/open font license|\bofl\b|sil open font/.test(t)) return 'OFL-1.1';
  if (/\bcc0\b|creative commons zero|public domain dedication/.test(t)) return 'CC0-1.0';
  // Plain "Public domain" is NOT CC0. Both permit everything, but they are different statements —
  // CC0 is a deliberate waiver by a rights-holder, PD is the absence of rights — and Wikimedia
  // prints them as different strings on different files. Recording them as one would lose that.
  if (/^pd$|public domain/.test(t)) return 'PD';
  // `cc attribution` is Sketchfab's own wording for plain CC-BY — it writes neither "CC BY" nor
  // "Creative Commons Attribution", so without this alternative every CC-BY model it publishes
  // came back null and was refused as an unrecognised string.
  if (/\bcc[- ]?by\b|creative commons attribution|\bcc attribution\b/.test(t)) return /3\.0/.test(t) ? 'CC-BY-3.0' : 'CC-BY-4.0';
  if (/roblox terms of use|roblox-tou/.test(t)) return 'ROBLOX-TOU';
  if (/roblox-generated|generationservice/.test(t)) return 'ROBLOX-GENERATED';
  if (/none-procedural|no third[- ]party/.test(t)) return 'NONE-PROCEDURAL';
  return null;
}
