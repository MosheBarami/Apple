# M2 test ledger

Each lane of M2 appends one section. Rule for every section: a test is restated to the property and never weakened, derived
lists are asserted non-empty, comments are stripped before source is scanned, and every new or restated guard has red-first proof
(a planted break, watched red, restored, rerun green).

## App

Step 2.3, the web app (`apps/web`), branch `studpilot/m2-app` from `eb4b2b12`, 2026-10-05. Decisions are in `DECISIONS.md`
section 12; screenshots are in `app-local/` (see its README).

### Counts, measured in the clone

| Suite | Before | After |
|---|---|---|
| `apps/web` `node --test` | 2537 pass, 0 fail | 2714 pass, 0 fail (+177, all in the ten new files below); **2736 after fix cycle 1** (below) |
| `apps/site` `node --test` (built without network) | 381 pass | 381 pass (the two privacy-claims tests were restated in place) |
| `apps/web` `pnpm typecheck`, `pnpm build` | clean | clean; entry 144.3 kB gzipped against the 150 kB budget |
| `node scripts/check-app-bundle.mjs` | | passes, and now also fails if the pieces stub, the Pieces button's name or the panel's specimen note reaches `dist` (fix cycle 1) |
| `packages/design` `node --test` | 165 pass | 165 pass (its one test file edit is in "Restated tests") |
| `node scripts/check-old-names.mjs` | | CLEAN |

No worker file changed, so the worker suite was not run. The root suite is in the lane report.

### New test files

| File | Tests | What it holds |
|---|---|---|
| `auth-providers.test.mjs` | 21 (24 after fix cycle 1) | Google and Discord render only when `GET /auth/v1/settings` says `external.<provider> === true`: the decision function, the request, the once-per-page cache, fail-closed on every error, the buttons and the click (run), and `signInWithOAuth` called from one component only |
| `age-gate.test.mjs` | 18 (24) | The 13+ screen: boundary on the birthday, leap days, impossible dates, the soft block (a remembered refusal, also with blocked storage), a neutral screen, nothing sent on a refusal, only `{ age_gate: 'passed' }` on a pass |
| `create-project.test.mjs` | 20 | One-click create: the name rule, the hook run (reads names, inserts `{ owner_id, name }`, opens the project, hands over the landing sentence once, one project per double press), the shelf's button and empty state run, no dialog left, and the getting-started docs page says what the click does |
| `studio-shots.test.mjs` | 18 (24) | The screenshots strip: which frames (this run's own, last eight, by capture time), honest names (Studio screenshot vs Preview render), the empty state, where it shows, click to enlarge and Earlier/Later run, memory only |
| `checkpoint-history.test.mjs` | 16 (18) | History grouped by request from the fields the API returns; hand-saved checkpoints apart; "Earlier work"; the rows rendered (author, description, Restore, the restore's own sentence and counts) |
| `pieces-panel.test.mjs` | 24 (27) | The settings panel: what each control may hold, SPECIMEN, the empty state, every control named, the controls run, keyboard and focus ring, reachable from the workspace |
| `pieces-production.test.mjs` | 6 | The stub is not in a production bundle: `lib/pieces.ts` and the panel bundled both ways, the import graph, no flag can load it, and `check-app-bundle.mjs` looks for it |
| `account-connections.test.mjs` | 25 (26) | The identity cards exist only for a provider that is on (card, row, search, rail), connect and disconnect run, never the last identity, the avatar is never "?" |
| `usage-beta.test.mjs` | 7 | The in-app ladder is labelled beta in the pricing page's own words, three listed plans from the shared config, every credit figure to two decimals |
| `growth.test.mjs` | 22 | The invite link and the badge: the code, the link, plain text, the rows, the hooks run, the share press, and that nothing reads `ref` and no referral credit is promised anywhere (app and site) |

### Restated tests (the property each one keeps)

| Test | Why it had to change | Property kept |
|---|---|---|
| `apps/site/tests/privacy-claims.test.mjs`, "13 AND OLDER ..." | It said the sign-up form must not ask for a birth date. It does now. | The pages and the form agree: the form asks, the date is judged in the browser and never sent or stored, both pages say exactly that, and no page says it is kept |
| the same file, "Google and Discord sign-in are described conditionally ..." | It said no file in `apps/web/src` calls `signInWithOAuth`. One component does now, behind the project's own answer. **Restated again in fix cycle 1 (below): the pages no longer say "not offered yet".** | The only call site is the gated component; every file calling a provider API reads the project's list; the pages describe both without stating whether either is on |
| `roblox-signin.test.mjs`, "the button the pages use is NOT in the first render" | The pages mount `AlternativeSignIn` (Roblox, Google, Discord under one "or"), not `RobloxSignIn` | The first markup a visitor receives has no Roblox button and no "or" with nothing under it |
| the same, "the sign-in page and the sign-up page both offer Roblox" | Same | Both pages mount the component, which holds `RobloxSignInView` and waits for the worker |
| the same, "only Roblox is added: no Supabase OAuth button exists" | Google and Discord buttons exist | Roblox is never passed to Supabase as a provider, and no provider button is typed into the markup (the gate is in `auth-providers.test.mjs`) |
| the same, the Settings-run block (7 tests) | Settings reads the provider answer | Run with the providers off, as today: a test fake, nothing weakened |
| `command-palette.test.mjs`, "New project creates a project ...", "the dashboard both contributes commands and provides the dialog", "a request made before the dashboard exists is honoured when it mounts" | The dialog is gone | The command does what its title says (creates, from any screen, rail and shortcut included); the shelf contributes commands and its buttons create; no pending request is armed, the shell holds no new-project state |
| `project-templates.test.mjs`, the four dialog tests | The create dialog and `templateSeed` are gone | The set is offered where a request is written; no picker at creation; the landing sentence still reaches a route that reads it; a blank project carries no state |
| `checkpoint-author.test.mjs`, `checkpoint-description.test.mjs`, `restore-status.test.mjs` | The row moved from `workspace.tsx` into `components/ws/checkpoint-history.tsx` | Author, description, the restore's sentence and counts are on the row; restoring does not close the drawer (asked of the page that handles the press) |
| `picks-integration.test.mjs`, "the account menu opens on the picked user-button header" | The header is handed `initial` too | Same header, same name and address |
| `usage-page-wiring.test.mjs`, "THE PLAN LADDER IS ACTUALLY RENDERED" | The import list holds two names | The route imports the ladder and renders it |

### Harness changes (test files, additive)

`page-harness.mjs`: the Supabase stub gained `signUp`, `signInWithOAuth`, `linkIdentity`, `unlinkIdentity`, `getUserIdentities` and a
two-query `from()` for creating a project; the query stub records `mutate(...)` calls. `hook-harness.mjs`: bundles with
`import.meta.env` in its production shape, so a module that reads `MOCK_MODE` loads under node.

### Red-first proof: planted breaks, each watched red, restored, rerun green

127 breaks were planted across the ten new files and the restated tests; every one went red. The harness for it is a script that
backs the file up, replaces one exact string, runs the named test files and restores the file even on failure (kept out of the repo).

| Item | Breaks planted (each red; names are the break, not the test) |
|---|---|
| C1 (8) | truthy accepted for a provider; fail-open on a non-200; cache removed; the component hard-codes the list instead of the hook; Roblox wait skipped; request without the `apikey`; buttons not held while starting; no early return on a second press |
| C2 (14) | `>=` to `>`; birthday a day late; real-date check removed; future date accepted; refusal not written; remembered refusal ignored; in-page memory dropped; captcha asked before the gate; birth year added to the metadata; form shown despite a refusal; placeholder year on the field; refusal text names the age; refused submit falls through to sign-up |
| C1/C2 site (5) | the page says the date is stored; the form loses its field; the metadata carries more than the flag; the old "only personal information" sentence back; an ungated `signInWithOAuth` in Settings |
| C3 (14) | count instead of highest; loose name pattern; description in the insert; no in-flight guard; guard never released; seed handed on a blank start; seed copied not moved; no failure toast; header button, empty-state action, rail, palette each stop creating; a template picker reference returns; the docs page tells a reader to name a project first |
| C4 (13) | all frames; unattributed frames; first eight; arrival order; a preview captioned a screenshot; empty sentence changed; placeholder image; thumbnail not a button; chat reply gets an empty strip; strip touches storage; socket cap 80; Later not held; Turn stops taking frames |
| C5 history (15) | manual under a request; old under the first request; the next request; empty requests listed; oldest first; assistant messages as requests; row loses author, description, restore sentence, counts; status under every row; the page closes the drawer; flat list; a field the API does not return; names not handed to the row |
| C5 pieces (21) | clamp not refuse; no step snapping; hex accepts words; text not capped; SPECIMEN stamp and note dropped; empty sentence changed; switch loses its role; control without a name; invalid number reported; blur does not restore; edits leak across pieces; focus ring removed; a shadow added; the panel fetches; the stub statically imported, loaded in every build, loaded by a mock flag, forgotten by `check-app-bundle.mjs`; the drawer mounted always; a drawer missing from the remembered list |
| C6 (15) | card drawn while off; identities asked while off; row ungated; search ignores the answer; rows never held back; unlink with one identity; wrong return; unlink a copy; no refusal before the request; Discord note loses the separation; avatar `?`; placeholder as source; Roblox name ignored; menu header `?`; the header not handed the letter |
| C7 (5) | label removed; label below the ladder; wording differs from the pricing page; one decimal; an Enterprise card |
| C8 (17) | salt; a slice of the id; length; any code accepted; wrong page; markup in the badge; a credit promise; the sign-up page reads `ref`; the worker reads `ref`; no failure toast; success claimed with no link; menu item, workspace button, held Copy, failed copy reported as copied, section dropped; the ladder import dropped (restated wiring test) |

**Gaps this found in my own guards, each closed before the count above.** Five guards first came back green and were strengthened:
1. the privacy-claims sentence "never sent" passed a page that said "we store it" (now asks for "never sent or stored");
2. the restore status test checked only a class, so a row that dropped the restore sentence stayed green (now reads the sentence and the counts);
3. the two-pieces-one-parameter-name case was not covered, so edits keyed by the parameter id alone leaked between pieces (a test added);
4. the old author guard stayed green when the row lost the author (it matched the import line), which is why the rendered row test exists;
5. removing only the day comparison of the date check stays green by design: the month comparison already catches every rolled-over date, so that comparison is redundant, not unguarded; removing the whole check is red.

### Fix cycle 1 (2026-10-05): the second review's findings

A review with two skeptics per finding left 15 verified findings and 9 minor ones (`app-c1-findings.json`); `DECISIONS.md` 12.9 lists each and what was decided.

**Counts, measured in the clone after the last code change**

| Suite | Result |
|---|---|
| `cd apps/web && pnpm typecheck && node --test && pnpm build` | typecheck clean; **2736 pass, 0 fail** (+22 over the 2714 above); build clean, entry 144.6 kB gzipped |
| `node scripts/check-app-bundle.mjs` | passes on the new build; the panel, its button's name and its specimen note are absent entirely |
| `cd apps/site && npx astro build && node --test tests/*.test.mjs` (every network fetch refused: `NODE_USE_ENV_PROXY=1` with a dead proxy, checked to give `ECONNREFUSED`) | build clean (21 pages); **381 pass, 0 fail** (the two privacy-claims tests were restated in place) |
| `cd packages/design && node --test` | 165 pass, 0 fail |
| `node --test tests/*.test.mjs` at the root | 661 tests: 643 pass, **2 fail** (the two known `check-pixels` scratchpad-location failures: "THE CONTROL: against a SAME-ORIGIN baseline ..." and "against a baseline with NO provenance ..."), 16 skipped |
| `node scripts/check-old-names.mjs` | CLEAN (0 violations) |

No worker file changed, so the worker suite was not run.

**Restated tests (the property each one keeps)**

| Test | Why it had to change | Property kept |
|---|---|---|
| `privacy-claims.test.mjs`, "Google and Discord sign-in are described ..." (second restatement) | It required "not offered yet", which the app makes false by itself the day a provider is switched on; its comment promised the pages are "re-aimed in the same change", which a dashboard toggle cannot make true | The only provider call sites are the gated component and the Connections cards, the gate is `external.<provider> === true`, and both pages describe the sign-in without stating the provider's state; "not offered yet", "we will update this policy before" and "when offered, Supabase receives" are banned |
| `privacy-claims.test.mjs`, "13 AND OLDER ..." (one assertion) | It required "Roblox, Google and Discord already require", an unsourced external claim about Google and Discord | The pages say sign-up through another provider does not ask the date again and that Google and Discord apply their own age rules; any "Google ... requires 13" claim is banned |
| `pieces-panel.test.mjs`, "reachable three ways" and "the drawer mounts the panel only while it is open" | The button, the command and the drawer are not drawn in production (owner decision) | Reachable in a build that has pieces; plus: every way in sits behind `PIECES_OFFERED` (a syntax-tree walk over every `setDrawer('pieces')` and `<PiecesDrawer />`), and `PIECES_OFFERED` is the build's DEV flag |
| `studio-shots.test.mjs`, "the socket hook keeps at most the strip's limit ..." and "the strip is mounted by the turn ..." | The cap and the repeat check moved into `appendFrame`; the strip is also handed the run and Studio state | The hook keeps at most the strip's limit through `appendFrame`, whose cap and repeat check are run; the turn mounts the strip with this run's frames and nothing else draws them |
| `studio-shots.test.mjs`, "NO FRAME YET", "A LIVE RUN ...", "A FINISHED BUILD ..." | The empty sentence follows the run and Studio | The empty strip says what is true of this turn and draws no picture; a finished turn keeps no "while it builds" sentence |
| `checkpoint-history.test.mjs`, "pressing Restore hands the page THAT checkpoint" | It called the `onRestore` prop itself and asserted there were no buttons | The same property asked of the button: each row is expanded (`expose`, for the test only), the button named Restore is found and ITS `onClick` is pressed |
| `growth.test.mjs`, "NO REFERRAL CREDIT IS PROMISED ANYWHERE" | The scan needed "receive credits" with nothing between, and the invite word before the credit word | No copy offers credit for inviting or sharing, asked of an invite word and a credit word in one sentence, either order |
| `growth.test.mjs`, "a project's menu on the shelf has ..." and "the workspace has a share button ..." | The item is "Invite a friend to StudPilot" and the workspace's icon is gone | The shelf's menu has the share press under a label that names the product and not the project; the workspace has no second, unlabelled invitation beside "Who can build here" |
| `account-connections.test.mjs`, "the avatar letter ..." (one assertion) | It asserted `!== null` for an astral letter | The first code point is taken: it asserts the letter itself |
| `auth-providers.test.mjs`, the page-run fakes | The Roblox status hook fake was a constant `false` | The fake reads the test's answer, so what the page hands the view is asserted both ways |
| `packages/design/src/web/rendered.test.mjs`, `fillForm` (**missing from the first ledger**, commit `ad637aa4`) | The sign-up form asks for a date of birth, so its primary button stayed disabled and its hover was never measured | The sign-up primary's hover is measured on an enabled button: it fills the day and year and picks a month. Same measurements. Not run red-first (it is a harness helper); it would go red as a failure to find an enabled button, and the 165 tests pass |
| `auth-providers.test.mjs` and `create-project.test.mjs` (**missing from the first ledger**, commit `ad637aa4`) | `check-old-names` caught a provider name and a stored key by their former spelling | The "no hand-written provider button" scan and the pending-sentence tests hold the same properties; the provider's former name is dropped from the sample lists and the stored key is no longer restated (a one-slot session store holds whatever key the module uses) |

**New guards, each run red-first: 47 breaks** (each planted by exact string replacement with the occurrence count asserted, the named assertion watched red, the file restored by position; the full suites above were run green afterwards)

| Item | Breaks planted (each red) |
|---|---|
| Pieces (7) | button ungated; drawer ungated; palette command ungated; `loaded` true from the start; the unmount guard dropped; the skeleton dropped; the DEV flag forced to `true` and the REAL production build rerun (`check-app-bundle.mjs` red, naming "Pieces and their settings" and "sample pieces with sample values" in the workspace chunk) |
| Strip (7) | `frames={frames}` to every turn; repeat check removed from `shotsForTurn`; from `appendFrame`; the hook bypasses `appendFrame`; Earlier and Later back to `.btn`; the disabled rule removed; the live sentence shown under a finished turn |
| Restore and history (5) | `onClick={() => {}}`; no `onClick`; a wrong checkpoint; the heading back to the time alone; `clockOrDate` always the clock |
| Sign-up and sign-in (14) | the day field strips non-ASCII again; the year field; the verdict does not normalise; `normaliseDigits` off by one; no focus effect; the effect loses `refused` from its deps; `role="status"` back; the month floor lowered; `robloxConfigured={false}`; `from="/"`; the cache restore never releases; releases on every `pageshow`; no cleanup; the anchor's hairline removed |
| Privacy and growth (10) | the old promise returns (privacy); "not offered yet" returns (data page); an unsourced Google 13+ sentence returns; the app gate loosened to truthy; a planted "Invite a friend and you receive 5 Credits" in `growth.ts`, "Every friend who joins adds 5 Credits" in `plans.tsx`, "Give 5 Credits to every friend you invite" in a site page; the old menu label; the workspace invite button back; the label naming the project |
| Minors (4) | the page counts the registry's settings; the avatar splits by UTF-16 unit; the mock flag read outside the mock branch; the mock flag ignores the query |

**Two gaps in my own first drafts, found by this run and closed.** (1) The unmount-guard test for `usePieces` first came back green with the guard removed: the stand-in `settle()` had
not committed the effect before `unmount()`, so the guard was never reached; the test now calls `settle()` and `unmount()` in that order. (2) My mutation helper restored by
replacing the first occurrence of the new text, which for a deletion is the start of the file and corrupted one source file for a minute; it restores by position now, and `git diff`
was read after each break.

**What this cycle cannot show.** The `pageshow` release is proved with a stand-in `window`, not a restored page (Playwright's Chromium has no back/forward cache). The refusal's
focus move is run once (the refusal appearing on mount) and its re-run on the transition is a source assertion on the effect's dependencies, because the stand-in React cannot place a
DOM node before the effect runs. Screen-reader output after the refusal is not heard by anyone here. The screenshots are from a local dev server and a headless Chromium.

### Fix cycle 2 (2026-10-05): the third check's findings

The cycle 2 check (`app-c2-findings.json`: one item partly fixed, four things the cycle 1 fixes made false, loose or unguarded, and its own suite record) is answered in
`DECISIONS.md` 12.10. The branch was rebased onto main `30fbebd7` first (`git rebase --onto origin/main eb4b2b12`; the 24 design-system commits are main's #32 now).

**Counts.** "Before" was measured in a copy of the tree at the rebased head `37c6a691`, with the same commands as "after" (so the rebase is confirmed to have changed nothing),
"after" on this branch's last commit. Every network fetch of the site build and its tests was refused (`NODE_USE_ENV_PROXY=1` with a dead proxy).

| Suite | Before (`37c6a691`) | After |
|---|---|---|
| `cd apps/web && pnpm typecheck` | clean | clean |
| `cd apps/web && node --test` | 2736 pass, 0 fail | **2742 pass, 0 fail** (+6: three new tests in `studio-shots.test.mjs`, three in the new `legal-claims-cites.test.mjs`; the Roblox-anchor test was restated in place) |
| `cd apps/web && pnpm build` | clean | clean; entry 144.6 kB gzipped against the 150 kB budget |
| `node scripts/check-app-bundle.mjs` | passes | passes (eager graph 270.2 kB across 4 files; the pieces stub, its button's name and its specimen note absent) |
| `node --test tests/*.test.mjs` at the root | 661 tests: 643 pass, 2 fail, 16 skipped | the same: 661 tests, 643 pass, **2 fail**, 16 skipped; the two are the known `check-pixels` scratchpad-location failures ("THE CONTROL: against a SAME-ORIGIN baseline ..." and "against a baseline with NO provenance ..."), identical on the rebased head |
| `pnpm --filter @studpilot/site build` then `cd apps/site && node --test tests/*.test.mjs` | 381 pass | build clean (21 pages); 381 pass, 0 fail |
| `cd packages/design && node --test` | 165 pass | 165 pass, 0 fail |
| `node scripts/check-old-names.mjs` | CLEAN | CLEAN (0 violations) |

No worker file changed, so the worker suite was not run.

**Restated tests (the property each one keeps)**

| Test | Why it had to change | Property kept |
|---|---|---|
| `auth-providers.test.mjs`, "\"Continue with Roblox\" is an anchor and carries the hairline ..." | It pinned the text of `.auth-page a.btn { ... }`, the rule that also restyled the six primary anchor buttons | The Roblox anchor, and only it, carries the hairline and the 20px line a `<button>` gets from the element rule: no rule of `auth.css` gives a border or a line height to every anchor button (a matcher over the sheet's selectors, run on the real sheet), the rule is on `.auth-roblox-link`, exactly one element wears that class (a syntax-tree walk), and the six primary anchors it protects are still found |
| `studio-shots.test.mjs`, "WHAT THE EMPTY STRIP SAYS ..." (one assertion) | The finished-turn line now begins "No screenshots to show" and says "connect Studio" in its second sentence; its constant is `SHOTS_NONE_HERE` | The line still says what to do (`/connect Studio/i`) and still keeps no promise about "while StudPilot builds" |

**New guards, each run red first, then green.** Written before the fix and run against the cycle 1 code: the playtest test failed (the two new frames were dropped), the
finished-turn test failed on the old sentence, the Roblox-anchor test failed naming exactly `.auth-page a.btn`, and the cite test failed on 24 cites (every cite of an app file in the document was
bare or borrowed a file, so none could be checked; the six that were one line off are the ones the planted drift below shows going red once the symbols are there). Then 22 breaks planted by exact string replacement in a copy of the tree (the count of the string asserted, the file restored from the clone and checked
byte-identical afterwards), **each watched red**:

| Item | Breaks planted (each red; names are the break, not the test) |
|---|---|
| Frame key (4) | playtest key without `capturedAt` (the cycle 1 behaviour); playtest frames never equal (a replay is not dropped); the key without the counter; the time compared within a 60 second window |
| Finished-turn line (4) | the cycle 1 sentence back; "were taken" said again beside the new reason; the sentence stops saying how long they are kept; a third place that sets the frames (a reload path) |
| Roblox link (6) | the old `a.btn` selector with the class still on the markup; the class dropped from the anchor; a primary anchor wearing the class; a new `.auth-page .btn` rule with a border; a new `.auth-page .auth-card a` rule with a line height; the Roblox rule without its hairline |
| Cites (8) | one comment line added at the top of `auth-pages.tsx` (the drift itself); one line added at the top of `settings.tsx`; a cite without its symbol; a bare `:NNN` after a cite; one line number off by one; the checker accepting any line; the file lookup finding no app file; a range read as its first line |

**The checker's six drifts replayed.** With the symbols in place and the six cites put back at their old lines (795, 853, 963, 439, 836, 416) in a copy of the document, the
test went red naming each with where the symbol is: 795 to 796, 853 to 854, 963 to 964 (twice, in two rows), 439 to 440, 836 to 837, 416 to 417 (a function whose name is also a prefix of
`AlternativeSignInView` at 387, so it lists both).

**Gaps in my own first drafts, found by this run and closed.** (1) The first matcher for "a rule that reaches every anchor button" flagged the busy mark
(`.btn[data-busy='true']::before`) and the theme toggle's `.btn`, neither of which is an anchor button; it now skips pseudo-elements and requires the selector's containers to be
the ones every anchor button sits in (`.auth-page`, `.auth-card`, `.auth-form-col`). (2) The first synthetic case of the cite checker named a real line of `auth-pages.tsx`, so it
would have failed the day that file changed above it; it runs on lines of its own now. (3) I expected the "replay is not dropped" break to be caught by "A REPLAYED RING"; that
test uses frames with no playtest run, so the break is caught by the new playtest test and by "two different pictures" instead (the expectation was wrong, the break was red).

**Measured in a browser, not asserted by a test.** `/app/reset` in a headless Chromium on the local dev server (every non-local request aborted): the primary anchor button
measures `1px solid rgb(166, 124, 255)` and 47.7px; with the cycle 1 rule put back as a style, `1px solid rgba(255, 255, 255, 0.12)` and 46px (the checker's figures). The three
provider buttons on the sign-in and sign-up screens still measure `1px solid rgb(55, 59, 68)`, 20px line, 46px. Screenshots: `app-local/` (`03b` retaken, `10` added).

**What this cycle cannot show.** **(Corrected in fix cycle 3, below: the state this sentence says was reproduced, the same run id arriving with seq 1 and 2 after seq 1..3, is one the worker cannot be in. It was built by hand, and the key is a defence, not the answer to an eviction.)** No worker was touched, so the Durable Object eviction is reproduced as the checker described it (the same run id arriving with seq 1 and 2 after
seq 1..3), not by evicting one. The finished-turn sentence is a statement of what the page keeps; nobody has been shown it. The cite guard says where the code is, not that the
sentence beside a cite is still true, and a symbol that is on the cited line for another reason passes.

### Fix cycle 3 (2026-10-05): the fourth check's findings

The cycle 3 check (a checker, and a regression hunter whose two serious findings two skeptics each confirmed) is answered in `DECISIONS.md` 12.11. No worker, legal-page or
`apps/site` file changed. The branch head the findings were made on is `10c2f409`.

**Counts.** "Before" is the checker's record of `10c2f409`; "after" was measured in this clone with the same commands (every network fetch of the site build and its tests was
refused: `NODE_USE_ENV_PROXY=1` with a dead proxy).

| Suite | Before (`10c2f409`) | After |
|---|---|---|
| `cd apps/web && pnpm typecheck` | clean | clean |
| `cd apps/web && node --test` | 2742 pass, 0 fail | **2747 pass, 0 fail** (+5: three new tests in `studio-shots.test.mjs`, one in `auth-providers.test.mjs`, one in `legal-claims-cites.test.mjs`; three more were restated or replaced in place) |
| `cd apps/web && pnpm build` | clean | clean |
| `node scripts/check-app-bundle.mjs` | passes | passes (entry 144.6 kB gzipped, eager graph 270.2 kB across 4 files) |
| `node --test tests/*.test.mjs` at the root | 661 tests: 643 pass, 2 fail, 16 skipped | the same: 661 tests, 643 pass, **2 fail**, 16 skipped. The two are the known `check-pixels.test.mjs` scratchpad-location failures ("THE CONTROL: against a SAME-ORIGIN baseline ..." and "against a baseline with NO provenance ..."): they fail because this clone sits in a scratchpad, identically on main, and were not touched |
| `pnpm --filter @studpilot/site build` then `cd apps/site && node --test tests/*.test.mjs` | 381 pass | build clean (21 pages); 381 pass, 0 fail |
| `cd packages/design && node --test` | 165 pass | 165 pass, 0 fail |
| `node scripts/check-old-names.mjs` | CLEAN | CLEAN (0 violations) |

No worker file changed, so the worker suite was not run. Per-file test counts after: `studio-shots.test.mjs` 30 (was 27), `auth-providers.test.mjs` 25 (24), `legal-claims-cites.test.mjs` 4 (3).

**Restated tests (the property each one keeps)**

| Test | Why it had to change | Property kept |
|---|---|---|
| `studio-shots.test.mjs`, "THE LINE RESTS ON THIS" | Counted `setFrames(` and used a regex that cannot cross a `)`: a lazy initializer plus an effect kept frames across a reload and nothing went red | Read from the syntax tree: the one frames state starts from `[]`; its setter is only called, twice (the fixture under `if (MOCK_MODE)`, and the `studio_frame` message through `appendFrame`); its value is read once, as a plain returned member; the workspace takes it by its own name with no default. A tripwire, on purpose |
| the same file, "the strip is mounted by the turn, and is the only thing that draws frames there" | Pinned the whole opening tag as text and the tag gained `studioKnown` | The strip is handed this run's frames, whether the run is going, and Studio's state, and nothing else (the exact set of four props), and the turn draws frames no other way |
| the same file, the playtest-key test (renamed) | Its comment, header and title said the worker restarts its counter under a surviving run id, which it does not | The key still tells a new capture from a replay at the same run and counter, and an exact replay is still dropped; it now also asserts that captures 1 ms, 1 s and 4.999 s apart are distinct (a window of any size is wrong), and says plainly that it builds the case by hand |
| `auth-providers.test.mjs`, the Roblox-anchor test | Its matcher split a selector on whitespace and needed three exact container names (a child combinator escaped), forbade a line height on every anchor button (which blocked making them match a `<button>`), and carried the 20px and the hairline as numbers | Only the Roblox anchor carries the hairline, and it is the button element rule's own; no rule gives a primary anchor a border that the primary `<button>` does not also get; every full-width anchor has the line a `<button>` has, read from `system.css`. The matcher is a small selector engine with its own self-test |

**New guards, each run red first, then green.** The new tests were run against the cycle 2 source (HEAD's copy of the six source files this round changed, in a copy of the tree):
five went red (the three `studio.known` tests, the restated mount test, the restated sheet test), as they should. "THE LINE RESTS ON THIS" stays green there, because the
property is true of that code; the checker's own break is what it is proved against. Then 47 breaks planted by exact string replacement in a copy of the tree (the count of the
string asserted, each file restored from the clone and checked byte-identical afterwards): **46 went red, and 1 stayed green on purpose.** The runner reports which test went red and
its first assertion message was read for a sample (2b, 2g, c1, c3, c10, k7, 1b, g2) to see they fail for the reason named.

| Item | Breaks planted (each red unless marked) |
|---|---|
| Frame key (6) | no capture time in the key; the time compared in a 5 s window (**the one the check found alive**); in a 1 s window; in a 1 ms window; playtest frames never equal; no counter in the key |
| The line rests on this (10) | a third place sets the frames (storage); **the checker's break: a lazy `useState` initializer reading `sessionStorage` plus an effect writing it, no new `setFrames` call**; a lazy initializer alone; an eager call as the initial value; the setter handed to a helper; `useReducer` in place of `useState`; the hook returning the frames merged with a stored copy; the workspace giving them a default from storage; an effect that writes them to storage (the tripwire); the socket message setting them some way other than `appendFrame` |
| Studio heard (10) | `hello` does not mark it; `studio_status` does not; a closed socket leaves it marked; the page starts out knowing; the mock never hears; the workspace does not hand the turn `studioKnown`; `shotsEmptyLine` ignores it; the turn does not pass it on; the strip does not pass it to the decision; a turn whose caller does not say is taken not to know |
| The sheet (12) | the anchors lose the button line; a 21px line; **the checker's break, `.auth-page .auth-card > a` with a border**; the cycle 1 rule `.auth-page a.btn` back; `a[href]` with a border colour; `a:not(.auth-roblox-link)` with a border colour; the Roblox hairline not the button's; the Roblox rule on `a.btn`; a tight child combinator (`.auth-card>a.btn-primary`); a sibling rule on anchors alone; a longhand border on the anchors; and **`.auth-page .btn-primary { border-color }` (the check's `3j`), which stays green by design** because it styles the primary button and anchor alike and so cannot make them differ |
| The matcher (5, in the test itself) | it stops reading `>`; ignores `:not(...)`; reads a pseudo-element as an element; ignores attribute selectors; forgets the containers. Each turns its own self-test red. (The pseudo-element one first stayed green: the break was dead code, because `::before` is already "unknown, not a match"; a `:before` and an `::after` sample were added and it went red.) |
| Cites outside a code span (4) | a plain-prose cite; a cite deep inside a span; a bold cite (**the check's `4e`**); the scanner no longer blanking spans |

**The check's four dead guards.** `1g`: red now (the 1 ms and 1 s cases); `2e`: red now (the break is `2b`); `3j`: not a defect, green by design (above); `4e`: red now (`g1` to `g3`).

**Measured in a browser, not asserted by a test.** `/app/reset` in a headless Chromium on the local dev server (every non-local request aborted: 0 reached the network). The primary
anchor measures `1px solid rgb(166, 124, 255)`, a 20px line and **46px** (it was 21.7px and 47.7px). The check-email card's pair, rebuilt on the page's own stylesheet (a `<button class="btn btn-block">`
over the primary anchor, since that card needs a sign-up round trip): button `1px solid rgb(55, 59, 68)`, 20px, 46px; anchor 20px, 46px; with the line rule neutralised, the anchor measures 21.7px and 47.7px
(the checker's figures). The Roblox, Google and Discord buttons on the sign-up and sign-in screens still measure `1px solid rgb(55, 59, 68)`, 20px, 46px each. Screenshots: `app-local/` (`10` retaken; the rest compared and kept, see its README).

**What this cycle cannot show.** The socket hook is not run under `node --test` (it needs more of React than the harness stands in for), so `studio.known`'s four settings (initial, `hello`,
`studio_status`, close) are read from the syntax tree, and what is run is the decision, the strip and the turn. Nobody watched a real reload with a real worker: the claim is that a page
that has not heard says nothing, and it is held by those pieces, not by a reload. The guard on frames kept across a reload is a tripwire on the places a frame can enter or leave the hook;
it cannot know that a new reader is harmless. The selector matcher over-approximates and models only a primary anchor in the page's one chain; a rule it cannot parse is "not a match", so an
exotic selector could hide from it. The worker's restart of a counter was not reproduced because it does not happen; making it happen (persisting the gate and the counter) is not done.

### What these tests cannot show

- **Not rendered in a DOM.** The app has no DOM test environment. Behaviour is reached by running the shipped code against stand-ins
  (hooks, page components, the click handlers) and by rendering to markup; where only source could be read it is read as a syntax
  tree, and the places are named in the file headers. The screenshots in `app-local/` are the visual check, from a dev server.
- **Nothing here touched Supabase, Cloudflare or any provider.** The provider settings request, `linkIdentity`, `unlinkIdentity`, the
  sign-up metadata and the project insert are all asserted against stand-ins. What the live project answers is listed as unverified in
  `DECISIONS.md` (12.1, 12.6).
