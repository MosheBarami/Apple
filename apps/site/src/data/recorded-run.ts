/**
 * ONE RECORDED RUN, AND NOT ONE WORD OF IT WRITTEN FOR A MARKETING PAGE.
 *
 * The owner's standing instruction for this site is "do not make claims when we can demonstrate
 * them", and measured against the live origin on 2026-09-21 the deployed site had exactly one
 * image, no recording, and no run anywhere on it. Everything a visitor was told about what this
 * product does, it was told in a sentence.
 *
 * This file is the source for /proof. Every `text` below is a string that already exists in one of
 * three files that were committed on 2026-09-01, three weeks before this page was written, and
 * every one of them names the file it came from in `from`. tests/recorded-run-is-evidence.test.mjs
 * re-reads those files and fails if a quote is not in the one it names — so a sentence invented
 * here, or edited here to read better, turns the page red rather than turning it into a claim.
 *
 * THE THREE SOURCES ARE NOT THE SAME KIND OF THING, and the page keeps them apart:
 *
 *   TRANSCRIPT — the run's own log, written by the product as it happened. Timestamps, tool calls,
 *     the error, the closing summary. This is the machine's account of itself.
 *   RUNTIME    — a SEPARATE Studio session, in which the finished feature was put into Play and
 *     driven by hand, and the readings written down. This is what the running game reported, which
 *     is the only thing that answers "does it work" — a model reporting its own success does not.
 *   RECORD     — the write-up that holds the before/after counts and the list of defects the
 *     exercise found.
 *
 * WHY THE DEFECTS ARE ON THE PAGE AND NOT IN A DRAWER. Five things were wrong with what came out
 * of this run, including one the record calls out as the kind a user relies on. A page that showed
 * the transcript and hid the defects would be a better-dressed version of the claim it replaces.
 * The record's own sentence about them — "These are the point of the exercise." — is quoted on the
 * page for the same reason.
 *
 * WHAT IS DELIBERATELY NOT QUOTED HERE:
 *
 *   The Credit figures. The transcript's last line records what the run cost on the plan that
 *     existed on 2026-09-01. Pricing has changed since and will change again, and a stale price on
 *     a marketing page is a lie with a longer half-life than a stale screenshot. The cost of this
 *     run is not what the page is for.
 *   The place id and the Studio instance id. Both are in the record. Neither tells a visitor
 *     anything, and both are identifiers for somebody's account.
 *   The internal mode name the transcript opens with. The product's modes are named for a reader
 *     elsewhere on the site, out of the shared contract; a second, internal spelling of one of
 *     them on a public page is how the two drift.
 *
 * WHITESPACE: the guard compares runs of whitespace as equal, on both sides, because the record
 * wraps its prose at 90 columns and a quote that spans two lines there is one sentence here. It
 * compares the WORDS exactly. Transcript lines keep their own column alignment because that
 * alignment is what makes them read as a log rather than as copy.
 */

/** A string that exists in `from`, a repository-relative path, and is not written here. */
export type Evidence = { readonly text: string; readonly from: string };

/** The run's own log, written by the product while it ran. */
const TRANSCRIPT = 'docs/evidence/2026-09-01-golden-parkour-transcript.txt';
/** A separate session: the finished feature put into Play and driven by hand. */
const RUNTIME = 'docs/evidence/2026-09-01-golden-parkour-runtime.txt';
/** The write-up: what landed, and what was wrong with it. */
const RECORD = 'docs/evidence/2026-09-01-golden-creation-parkour.md';

const t = (text: string): Evidence => ({ text, from: TRANSCRIPT });
const r = (text: string): Evidence => ({ text, from: RUNTIME });
const d = (text: string): Evidence => ({ text, from: RECORD });

export const RECORDED_RUN = {
  /** Shown on the page. A run is a thing that happened on a day, not an ongoing condition. */
  dateLabel: '1 September 2026',
  sources: [TRANSCRIPT, RUNTIME, RECORD],

  /** The sentence that was sent. Everything below follows from this and nothing else. */
  request: t(
    'Add a timed parkour challenge to my game. I want a short course of floating platforms players jump across, a start pad and a finish pad, and a timer on screen that starts when they step on the start pad and stops at the finish. Show them their best time so far.',
  ),

  /**
   * SIX MOMENTS, IN ORDER, EACH ONE A BLOCK OF THE LOG.
   *
   * `note` is ours and says what the block is; every line in `lines` is the transcript's. The two
   * are drawn differently on the page for that reason. No note asserts a result — the lines are
   * the result, and a note that summarised them into a tick would be the claim coming back.
   */
  moments: [
    {
      id: 'read',
      label: 'Reads first',
      at: '4.8s',
      note: 'The whole tree and two of the existing scripts, before a single write.',
      lines: [
        t('4.8s → get_project_tree {}'),
        t('5.0s   OK  ✓ get_project_tree'),
        t('8.7s → read_script {}'),
        t('9.0s   OK  ✓ read_script · game.ReplicatedStorage.CrystalCanyon.Remotes'),
        t('9.0s → read_script {}'),
        t('9.2s   OK  ✓ read_script · game.ServerScriptService.CrystalCanyonServer'),
      ],
      /**
       * THE RECORD REFUSES TO CLAIM THE OBVIOUS THING HERE, so the page does not claim it either.
       * The script written later parents its remote inside the folder read at 9.0s, and the
       * tempting sentence — "it read the project, so it fitted in with it" — is a causal claim
       * that nothing in these files establishes. `lead` is ours and states what was observed;
       * the quote is the record refusing the inference in its own words, which is the half a
       * marketing page would drop.
       */
      caveat: {
        lead: 'The script it wrote later parents its remote inside the folder it read at 9.0s. The record will not call that cause and effect:',
        quote: d(
          'what is observed is the reads in the transcript and the folder-aware code in the artifact. That the second followed from the first is the obvious reading and it is not proven by anything here.',
        ),
      },
    },
    {
      id: 'checkpoint',
      label: 'Undo point',
      at: '1.3s',
      note: 'The automatic one failed. It took its own at step three, so nothing was lost — but the one a person relies on did not work.',
      lines: [
        t(
          "1.3s ERROR checkpoint: Couldn't snapshot your project before starting (The run this change belonged to has ended). Continuing without an undo point.",
        ),
        t('54.8s → create_checkpoint {}'),
        t('55.9s checkpoint before parkour challenge scripts=34 instances=1148'),
        t('55.9s   OK  ✓ create_checkpoint · before parkour challenge'),
      ],
      caveat: null,
    },
    {
      id: 'write',
      label: 'Writes two scripts',
      at: '145.6s',
      note: 'One on the server, one on the client. Both were on disk afterwards, at these lengths.',
      lines: [
        t('145.6s → edit_script {}'),
        t('146.0s   OK  ✓ edit_script · game.ServerScriptService.ParkourTimer'),
        t('167.4s → edit_script {}'),
        t('167.8s   OK  ✓ edit_script · game.StarterPlayer.StarterPlayerScripts.ParkourTimerUI'),
        r('ServerScriptService.ParkourTimer: EXISTS <Script> 94 lines, 2787 chars'),
        r('StarterPlayer.StarterPlayerScripts.ParkourTimerUI: EXISTS <LocalScript> 96 lines, 2850 chars'),
      ],
      caveat: null,
    },
    {
      id: 'playtest',
      label: 'Playtests it',
      at: '168.7s',
      note: 'It started the game and checked its own work, taking a second checkpoint before it did.',
      lines: [
        t('168.7s → run_and_check {}'),
        t('169.7s checkpoint before playtest scripts=36 instances=1172'),
        t('176.5s   OK  ✓ run_and_check'),
      ],
      caveat: null,
    },
    {
      id: 'look',
      label: 'Looks at it',
      at: '194.6s',
      note: 'Two renders of the place it had just changed.',
      lines: [t('194.6s → render_view {}'), t('195.2s   OK  ✓ render_view')],
      caveat: null,
    },
    {
      id: 'stop',
      label: 'Runs out of steps',
      at: '212.0s',
      note: 'It hit the step ceiling mid-sequence. The feature was finished; the run did not get to say so.',
      lines: [
        t('212.0s → run_luau {}'),
        t('212.2s   OK  ✓ run_luau'),
        t('I reached the step limit for this run. Progress so far is saved — send another message to continue.'),
        t('elapsed=212.3s tools=18 toolErrors=1'),
        t(
          'toolsUsed=get_project_tree, list_scripts, read_script, create_checkpoint, run_luau, edit_script, run_and_check, render_view',
        ),
      ],
      caveat: null,
    },
  ],

  /**
   * BEFORE AND AFTER, FROM THE RECORD'S OWN TABLE.
   *
   * `quote` is the table row. The page prints `label`, `before` and `after` out of it, and the
   * guard checks that all three appear inside that one row — so a number cannot be nudged here
   * without the row it claims to come from disagreeing.
   */
  landed: [
    { label: 'Workspace parts', before: '935', after: '956', quote: d('| Workspace parts | 935 | 956 |') },
    { label: 'ServerScriptService scripts', before: '13', after: '14', quote: d('| ServerScriptService scripts | 13 | 14 |') },
    { label: 'StarterPlayer scripts', before: '9', after: '10', quote: d('| StarterPlayer scripts | 9 | 10 |') },
  ],

  /**
   * WHAT THE RUNNING GAME REPORTED. A different session, by hand, which is the whole reason it is
   * worth anything: the transcript is the model's account of itself and this is not.
   */
  ran: {
    separate: d('This section is a SEPARATE Studio session from the transcript above'),
    readings: [
      r('[ParkourTimer] ready - start/finish pads hooked'),
      r('No error from ParkourTimer or ParkourTimerUI.'),
      r('timer sampled twice 1.5s apart: "7.53" then "9.02" (delta 1.49s)'),
      r('colour = 0.313726, 0.784314, 0.470588 = RGB 80,200,120 = the GREEN constant'),
      r('timer sampled twice 2s apart: "16.73" then "16.73" STOPPED=true'),
      r('colour = 1.00, 0.77, 0.24 = RGB 255,196,60 = the GOLD constant'),
      r('best   = "Best: 16.73s"'),
    ],
  },

  /**
   * THE FIVE THINGS THAT WERE WRONG. None was repaired by hand before the record was written, and
   * none is repaired here.
   */
  defects: {
    framing: d('These are the point of the exercise.'),
    found: d('found by running it, and none were repaired by hand'),
    items: [
      {
        title: d('The client stalls 10 s before its UI works.'),
        detail: r(
          '=> the client does ReplicatedStorage:WaitForChild("ParkourSync", 10) FIRST, which therefore always times out before its recursive fallback succeeds. 10s stall.',
        ),
      },
      {
        title: d('Decorative trims collide with their platforms.'),
        detail: r('All anchored. Trim1/Trim2 sit 1 stud below; Trim3..Trim8 and FinishRim do not.'),
      },
      {
        title: d('The run did not finish.'),
        detail: t('I reached the step limit for this run. Progress so far is saved — send another message to continue.'),
      },
      {
        title: d('The automatic pre-run checkpoint failed'),
        detail: t(
          "1.3s ERROR checkpoint: Couldn't snapshot your project before starting (The run this change belonged to has ended). Continuing without an undo point.",
        ),
      },
      {
        title: d('Dead code in the generated server script'),
        detail: d('`fmt` is defined and never called'),
      },
    ],
  },
} as const;
