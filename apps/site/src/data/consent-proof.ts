/**
 * THE ONE THING THE LANDING PAGE DEMONSTRATES INSTEAD OF ASSERTING.
 *
 * The owner's standing instruction for the marketing site is "do not make claims when we can
 * demonstrate them". On 2026-09-21 the deployed landing carried `<img>` 0 and `<video>` 0: every
 * sentence on it was a claim, including the load-bearing one — that Apple changes nothing in your
 * place until you allow it. That sentence is the product's central safety promise and it was
 * printed in the same typeface as everything else, with nothing behind it.
 *
 * There is something behind it. `docs/evidence/plugin-consent-verified-in-studio-2026-09-19.md`
 * records a CONTROL PAIR run by hand in Roblox Studio: one request, sent twice from the deployed
 * product over the same pairing, differing only in consent. Refused once, created once, and the
 * second read back out of Studio's own Explorer rather than out of the model's claim. That is a
 * measurement, and this file is what puts it on the page.
 *
 * ── WHY EVERY STRING BELOW CARRIES A `from` ────────────────────────────────────────────────────
 *
 * A screenshot and a transcript on a marketing page are worth exactly as much as their provenance.
 * So no sentence in the proof band is written by anybody: each one is a VERBATIM quote out of a
 * file in this repository, and it says which file. Two kinds of source, and the difference matters:
 *
 *   'plugin'  — apps/apple-plugin/src/init.server.luau, the shipped plugin's own string literals.
 *               The page reproduces the panel's wording, so if the panel's wording changes and
 *               nobody updates the page, the page is lying about a UI that still exists. Pointing
 *               at the source makes that a red test rather than a slow drift.
 *   'record'  — the evidence document above, i.e. the transcript of what was observed.
 *
 * `apps/site/tests/proof-is-evidence.test.mjs` re-reads both files and fails if any quote here is
 * not in the one it names. It normalises whitespace on both sides before comparing, because the
 * evidence document hard-wraps its prose at 100 columns and two of these sentences are split across
 * a newline in it — a raw substring check reported those two as fabrications when they are not.
 * Normalising whitespace preserves the words and their order, which is the property; it is the
 * column the document happens to wrap at that is not.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────────────────────────
 *
 * `docs/evidence/lumen-isles-2026-09-19/` holds three captures, and the backlog's stated next
 * action was to publish all three as a before/after strip. Two of them — `r1-menu.png` and
 * `r1-journal.png` — show the Lumen Isles game running in Studio, and they are genuinely handsome.
 * They are NOT on this page and must not be put on it as product output.
 *
 * `apps/experiences/lumen-isles/World.luau:2` calls it "an authored low-poly adventure", its
 * package description calls it "the first-party experience built for local visual review", and
 * `scripts/build-lumen-isles.mjs:1` says it "Builds the exact first-party experience for local
 * visual review". It is four hand-written Luau files compiled into a place. Apple did not produce
 * it from a prompt. A visitor cannot be expected to read a caption that carefully; a game
 * screenshot on a marketing page is read as the thing the product makes. Publishing those two
 * would have been precisely the class of claim this repository exists to prevent, and
 * `docs/evidence/customer-review-2026-09-19-round3.md:311` already caught the Studio lane
 * upgrading its own evidence once.
 *
 * The third capture is about the PRODUCT rather than about a game — the plugin's panel, docked in
 * a real Studio, paired to a real place, showing the real consent control — so that is the one
 * that ships.
 */

const record = 'docs/evidence/plugin-consent-verified-in-studio-2026-09-19.md';
const plugin = 'apps/apple-plugin/src/init.server.luau';

/**
 * A quoted string, and the file it was taken out of.
 *
 * `from` is the PATH, not a label. It was declared as `'plugin' | 'record'` while every one of the
 * eleven call sites passes the value of the consts above, so `astro check` reported eleven errors
 * and `pnpm -r typecheck` is the first step of the first CI job — the whole run was red on it.
 * tests/proof-is-evidence.test.mjs already reads it either way (it maps the two labels to paths and
 * otherwise uses the value as a path), so widening the type to the paths is what the code and the
 * guard were both already doing.
 */
export type ProofQuote = { text: string; from: typeof record | typeof plugin };

export const CONSENT_PROOF = {
  /** The day the control pair was run, and the day the capture below was taken. */
  captured: '2026-09-19',
  /* Rendered rather than typed into the page, because scripts/check-proof-figures.mjs forbids a
     typed multi-digit number anywhere in the landing's visible prose and a year is four digits.
     The rule is right: a number on that page has to come from somewhere. This one comes from here,
     and the guard checks it against the name of the record file. */
  capturedLabel: '19 September 2026',

  record,
  plugin,

  /**
   * THE CAPTURE. Cropped from the original screenshot to the plugin's panel, so the consent control
   * and its access line are legible at the size the page shows them; nothing is composited, painted
   * over or re-rendered. `sha256` is of the ORIGINAL, and the guard re-hashes it — swap the evidence
   * for a mock-up and the test goes red, which is the only way a picture's provenance stays true.
   */
  capture: {
    src: '/assets/proof/apple-consent-panel-947fad5391.webp',
    from: 'docs/evidence/lumen-isles-2026-09-19/independent-paired-edit-consent.png',
    sha256: '8475ae9cddd76f585fbf88108f10a38922efa5dd5883bed5deae23ffc3aa7742',
    crop: '318x400 at 1504,512 of 1877x1097',
    /* Intrinsic size of the served file, so the row does not reflow when the image arrives. */
    width: 318,
    height: 400,
    alt: "Apple's panel docked inside Roblox Studio, connected to a place named Lumen Isles, "
      + 'showing the access line and the control that turns edits off.',
  },

  /** What the section is, in the document's own words. */
  summary: {
    text: 'One request, sent twice from the deployed product, over the same pairing, differing only in consent.',
    from: record,
  } as const,

  /** The request that was sent, unchanged, on both runs. */
  request: { text: 'Create a single Part named ConsentProbe in Workspace. Nothing else.', from: record } as ProofQuote,

  /** The run with consent off. */
  refused: {
    access: { text: 'Access: inspect only', from: plugin } as ProofQuote,
    answer: { text: 'writes require explicit edit consent', from: record } as ProofQuote,
    log: { text: '⊠ create_instances', from: record } as ProofQuote,
    outcome: { text: 'Nothing was created.', from: record } as ProofQuote,
  },

  /** The same request, after two clicks on the consent control. */
  allowed: {
    access: { text: 'Access: edits allowed for this connection', from: plugin } as ProofQuote,
    answer: { text: 'The Part "ConsentProbe" has been successfully created in the Workspace.', from: record } as ProofQuote,
    /* Read back out of Studio's Explorer, which is the half that makes the line above a
       measurement rather than a transcript of the model congratulating itself. */
    tree: {
      text: 'Workspace\n ├ Camera\n ├ Terrain\n ├ SpawnLocation\n ├ Baseplate\n └ ConsentProbe        ← present',
      from: record,
    } as ProofQuote,
  },

  /** The panel's standing disclosure, reproduced from the plugin rather than paraphrased. */
  disclosure: {
    text: 'Edits stay off until you allow them. This build supports bounded place operations, Run-mode playtests and short player Test sessions. '
      + 'It cannot publish, upload assets or execute arbitrary received Luau inside the plugin.',
    from: plugin,
  } as ProofQuote,

  /**
   * THE RECORD'S OWN LIMITATION, ON THE PAGE, NOT ONLY IN THE FILE.
   * The evidence document lists what it does not establish. One of those lines belongs in front of
   * a reader, because without it the band reads as "Apple is safe" when what was measured is one
   * refused operation and one granted one.
   */
  limit: { text: 'One refused op and one granted op is a control pair, not a capability sweep.', from: record } as ProofQuote,
} as const;

/** Every quote on the band, flattened, for the guard to walk. Keep this in step with the object. */
export const CONSENT_PROOF_QUOTES: ReadonlyArray<readonly [string, ProofQuote]> = [
  ['summary', CONSENT_PROOF.summary],
  ['request', CONSENT_PROOF.request],
  ['refused.access', CONSENT_PROOF.refused.access],
  ['refused.answer', CONSENT_PROOF.refused.answer],
  ['refused.log', CONSENT_PROOF.refused.log],
  ['refused.outcome', CONSENT_PROOF.refused.outcome],
  ['allowed.access', CONSENT_PROOF.allowed.access],
  ['allowed.answer', CONSENT_PROOF.allowed.answer],
  ['allowed.tree', CONSENT_PROOF.allowed.tree],
  ['disclosure', CONSENT_PROOF.disclosure],
  ['limit', CONSENT_PROOF.limit],
];
