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
| `apps/web` `node --test` | 2537 pass, 0 fail | 2714 pass, 0 fail (+177, all in the ten new files below) |
| `apps/site` `node --test` (built without network) | 381 pass | 381 pass (the two privacy-claims tests were restated in place) |
| `apps/web` `pnpm typecheck`, `pnpm build` | clean | clean; entry 144.3 kB gzipped against the 150 kB budget |
| `node scripts/check-app-bundle.mjs` | | passes, and now also fails if the pieces stub reaches `dist` |
| `node scripts/check-old-names.mjs` | | CLEAN |

No worker file changed, so the worker suite was not run. The root suite is in the lane report.

### New test files

| File | Tests | What it holds |
|---|---|---|
| `auth-providers.test.mjs` | 21 | Google and Discord render only when `GET /auth/v1/settings` says `external.<provider> === true`: the decision function, the request, the once-per-page cache, fail-closed on every error, the buttons and the click (run), and `signInWithOAuth` called from one component only |
| `age-gate.test.mjs` | 18 | The 13+ screen: boundary on the birthday, leap days, impossible dates, the soft block (a remembered refusal, also with blocked storage), a neutral screen, nothing sent on a refusal, only `{ age_gate: 'passed' }` on a pass |
| `create-project.test.mjs` | 20 | One-click create: the name rule, the hook run (reads names, inserts `{ owner_id, name }`, opens the project, hands over the landing sentence once, one project per double press), the shelf's button and empty state run, no dialog left, and the getting-started docs page says what the click does |
| `studio-shots.test.mjs` | 18 | The screenshots strip: which frames (this run's own, last eight, by capture time), honest names (Studio screenshot vs Preview render), the empty state, where it shows, click to enlarge and Earlier/Later run, memory only |
| `checkpoint-history.test.mjs` | 16 | History grouped by request from the fields the API returns; hand-saved checkpoints apart; "Earlier work"; the rows rendered (author, description, Restore, the restore's own sentence and counts) |
| `pieces-panel.test.mjs` | 24 | The settings panel: what each control may hold, SPECIMEN, the empty state, every control named, the controls run, keyboard and focus ring, reachable from the workspace |
| `pieces-production.test.mjs` | 6 | The stub is not in a production bundle: `lib/pieces.ts` and the panel bundled both ways, the import graph, no flag can load it, and `check-app-bundle.mjs` looks for it |
| `account-connections.test.mjs` | 25 | The identity cards exist only for a provider that is on (card, row, search, rail), connect and disconnect run, never the last identity, the avatar is never "?" |
| `usage-beta.test.mjs` | 7 | The in-app ladder is labelled beta in the pricing page's own words, three listed plans from the shared config, every credit figure to two decimals |
| `growth.test.mjs` | 22 | The invite link and the badge: the code, the link, plain text, the rows, the hooks run, the share press, and that nothing reads `ref` and no referral credit is promised anywhere (app and site) |

### Restated tests (the property each one keeps)

| Test | Why it had to change | Property kept |
|---|---|---|
| `apps/site/tests/privacy-claims.test.mjs`, "13 AND OLDER ..." | It said the sign-up form must not ask for a birth date. It does now. | The pages and the form agree: the form asks, the date is judged in the browser and never sent or stored, both pages say exactly that, and no page says it is kept |
| the same file, "Google and Discord sign-in are described conditionally ..." | It said no file in `apps/web/src` calls `signInWithOAuth`. One component does now, behind the project's own answer. | The only call site is the gated component; every file calling a provider API reads the project's list; the pages still describe both as not offered yet |
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

### What these tests cannot show

- **Not rendered in a DOM.** The app has no DOM test environment. Behaviour is reached by running the shipped code against stand-ins
  (hooks, page components, the click handlers) and by rendering to markup; where only source could be read it is read as a syntax
  tree, and the places are named in the file headers. The screenshots in `app-local/` are the visual check, from a dev server.
- **Nothing here touched Supabase, Cloudflare or any provider.** The provider settings request, `linkIdentity`, `unlinkIdentity`, the
  sign-up metadata and the project insert are all asserted against stand-ins. What the live project answers is listed as unverified in
  `DECISIONS.md` (12.1, 12.6).
