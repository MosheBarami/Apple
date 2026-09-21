# FINISH REPORT 100

**`node scripts/gate-suite.mjs` → exit 1. SUITE RED — check-proof-figures, pnpm -r test. 3946 tests passed, 2 failed.**

**The deployed buildSha does NOT equal HEAD. `curl https://apple.moshe-barami111.workers.dev/api/health` → `{"ok":true,"version":"0.1.0","buildSha":"8f69139-dirty",...}`. HEAD is `118d577`. `8f69139-dirty` names no commit: the `-dirty` suffix means the live worker bundle was built from a working tree that was being edited, so it cannot be rebuilt from any sha. `git diff --stat 8f69139..HEAD -- apps/worker/src packages/shared/src` = 1 file, `apps/worker/src/tools.ts`, +9 lines, of which 8 are a comment and 1 is `reasoningEffort: 'low'` that was already the default — so the code gap is inert, and the defect is the unreproducible build, not missing behaviour.**

Two further facts that belong before anything else:

- **6 commits are on no remote.** `git rev-list --count origin/main..HEAD` = 6; `git rev-list --count HEAD..origin/main` = 0. origin/main = `23d1b75`. The six are `4481fc6 33e1c09 8259339 c2d0182 c44d0db 118d577`.
- **The suite went red inside those six.** See §7.1.

Written 2026-09-21. Every number below was produced by a command in this session against this tree or against `https://apple.moshe-barami111.workers.dev`. Where a claim comes from a track report I did not reproduce, it says so.

---

## 1. What a person can do today that they could not before this run

All five verified against the live origin, not against a build.

### 1.1 Operate the landing's four capability panels instead of reading four sentences

```js
// real Chromium, https://apple.moshe-barami111.workers.dev/
document.querySelectorAll('.demo-stage').length            → 4
[...document.querySelectorAll('.rd-node')].slice(0,3).forEach(n=>n.click())
document.querySelector('[data-read]').getAttribute('data-read')  → "3"
document.querySelector('.rd-gate').textContent             → "checkpoint taken · a write may now be proposed"
```

Third ask on the refusal panel:

```js
document.querySelector('.lu-out').className    → "lu-out refused"
document.querySelector('.lu-out').textContent  → "refused  edit_script\n\n  A script that calls out to the netwo…"
```

Defect panel, after selecting the second defect:

```js
[...document.querySelectorAll('[class*=mark]')].map(e=>e.className)
  → [..., "cw-mark", "cw-mark is-on", "cw-mark", ...]     // markers [false,true,false]
```

Mesh panel: `canvas.gm-canvas` present at 423×190.

### 1.2 Type a sentence into the hero and press Build

```js
document.querySelector('form.composer').getAttribute('action')  → "/app/signup"
document.querySelector('form.composer').getAttribute('method')  → "get"
document.getElementById('hero-start').name                      → "start"
```

It was three `<span>`s inside an `aria-hidden` block, reachable by no keyboard. **Half-done:** nothing reads the parameter at the other end. `grep -rn "start" apps/web/src/routes/signup.tsx` → no matches. So the sentence travels and is then dropped.

### 1.3 Reach /showcase, and read the Luau the model actually wrote

```
GET /showcase                                              → 200, 54,634 bytes
16 <h3 class="card__title"> interface screens + 28 genre cards
GET /showcase/ui-showcase/screen-codes--tycoon.luau        → 200, 5,488 B, text/plain
GET /showcase/ui-showcase/screen-codes--tycoon--opened.png → 200, 58,876 B
```

Primary nav on every inner page carries it (`/pricing` nav: Product, Models, **Showcase**, Pricing, Docs). The landing header does not — see §3.4.

### 1.4 See one atmosphere colour on all nineteen routes

```
/_astro/billing.DRCRDWm2.css served live contains 3 × `--horizon-key`: #00694a, #00d492, #00d492
```

The landing's horizon was green and the other eighteen routes drew the same horizon in white.

### 1.5 Have a pointer that is not a cursor — **on the page, not on the controls**

```js
document.documentElement.classList.contains('has-cursor')  → true   (after a real pointermove)
getComputedStyle(document.body).cursor                     → "none"
const c=[...document.querySelectorAll('a,button,input,textarea')]
c.length                                                   → 44
c.filter(e=>getComputedStyle(e).cursor!=='none').length     → 44
```

**All 44 controls still draw the OS pointer on top of the custom ring.** Cause, read out of the live bytes:

```
$ curl -s https://apple.moshe-barami111.workers.dev/ | grep -o '[^{}]*has-cursor[^{}]*{[^}]*cursor:none[^}]*}'
:root.has-cursor,:root.has-cursor [data-astro-cid-msvfyisy]{cursor:none!important}
```

Astro rewrote the component's `*` to its own scope attribute, which only the overlay's own divs carry. `body` reads `none` only because `cursor` inherits from `:root`. This row is **half-done**: the layer ships and works over the page background; over every control the native pointer wins.

---

## 2. Every instruction now CLOSED, with the evidence

Four rows. Each was verified by me against the live origin in §1; the guard counts come from the design track's report and I did not re-run them.

| Row | Evidence |
|---|---|
| `features-as-interactive-demos` | §1.1 — four operable panels driven live. Commits `88148dd`, `d82abf0`. |
| `typography-system` | Live `/_astro/index.B_ZE0UbA.css` carries 8 × `var(--font-mono)`; the landing spelled the stacks out nine times. Track reports 303 elements measured before/after, 0 rendered differently — **not reproduced by me**. Commit `26bba69`. |
| `webgl-marketing-experience` | Closed as a written decision, `docs/DESIGN-TYPE.md` §2, with a table of what ships against each item. No WebGL context, no 3D library, on the owner's own cancellation of the 3D mascot. Commit `f2f7ec1`. |
| `landing-horizon-is-one-colour` | §1.4 — 3 × `--horizon-key` live, measured green `rgb(0,215,142)` on a page whose `--accent` is `#f4f3f2`. Commits `f94b96d`, `d6b5f0c`, `b0dd03a`. |

Two checkers that were red at session start and are now exit 0 under their own run (exit code captured on its own line, not through a pipe):

```
node scripts/check-landing-budget.mjs → exit 0   JavaScript (raw, 7 inline block(s)) 32073 B / 36000
node scripts/check-site-links.mjs     → exit 0   795 internal link(s) across 20 page(s), all resolve
node scripts/check-copy.mjs           → exit 0
node scripts/check-site-semantics.mjs → exit 0
```

`check-landing-budget` going green is **not** the same as the defect being fixed by measurement: the budget line was raised from 12,000 to 19,000 B and JavaScript was given its own 36,000 B line in `a135b68`. The blindness the design track found (the scanner matched `src="…js"` and Astro inlines its module script, so it printed `0 B` over ~32 KB) is genuinely fixed — the checker now names 7 inline blocks and 32,073 B. The number it enforces was moved at the same time.

---

## 3. Every instruction still OPEN, with the single next action

> **Status as of 2026-09-21, later the same day.** Nine of these thirteen rows are now closed.
> Recorded here rather than by deleting the rows, because §6.2 of this same report is about four
> instructions aimed at work that was already done and the hour the next reader spent re-walking
> them.
>
> | Row | Now | Evidence |
> |---|---|---|
> | 3.1 custom cursor | CLOSED | three `:root.has-cursor *` → `:global(*)` in `Cursor.astro`; guard added over the BUILT css (`apps/site/tests/cursor-reaches-every-control.test.mjs`), and the blindness itself written up as F-69 |
> | 3.2 hero `?start=` | CLOSED | `apps/web/src/lib/pending-start.ts` — `capturePendingStart` / `takePendingStart` (a move, not a read) / `clearPendingStart`, wired through `auth-pages.tsx` and `dashboard.tsx`, tested in `apps/web/tests/pending-start.test.mjs` |
> | 3.3 the 16-screens figure | CLOSED | `showcase-proof.ts` reads 21 and `21 September 2026`, from the manifest's own `counts.built` |
> | 3.4 landing header | CLOSED | primary pill is `/app/signup`; Showcase added to the landing header |
> | 3.5 no way to reach a human | CLOSED | Contact column with `mailto:apple.labs.app@gmail.com` in the landing footer |
> | 3.7 failures-become-evals | CLOSED | F-69/F-70/F-71 written, `packages/evals/tasks/observation-failure.json` cites each, linkage checked in two halves (`tasks.mjs` shape + `failures-linked.test.mjs` existence), falsified three ways |
> | 3.10 Playwright MCP | CLOSED | `.mcp.json` at project scope, verified by a real initialize handshake returning Playwright 1.64.0-alpha, not by the file existing |
> | 3.11 six commits on no remote | CLOSED | pushed; `git rev-list --count origin/main..HEAD` = 0 |
> | 3.12 the live worker matches no commit | CLOSED | `curl /api/health` → `buildSha` equal to HEAD, from a tree where the worker's own sources are clean |
>
> **Still open, and why each one is:**
>
> - **3.6 rosebud HAR** — needs a browser session on a site with a real account. Owner step.
> - **3.8 visual benchmark** — drives `/api/admin/studio-op/…` against live Studio, and
>   `session-info` reports `pluginConnected: false`, `link.paired: false`. Owner step: open Studio,
>   open the Apple plugin, pair the project. Verified 2026-09-21, see
>   `docs/evidence/live-run-2026-09-21.md`.
> - **3.9 seen/unseen split** — a paid eval run with the held-out set reported separately.
> - **3.13 `check-rebrand`** — still exit 1, and still not mine to fix: the fix rewrites
>   `docs/evidence/probes/pass3/app-bundle.txt`, which another lane holds dirty. Tonight's web
>   deploy moved the live asset hashes again, so its four stale-bundle findings now name
>   `index-DDydhy-E.js` and `index-DRspnFZc.css`.


### 3.1 `custom-cursor` — half-done (§1.5)

**Next:** move the `*` rule out of `Cursor.astro`'s scoped `<style>` into `apps/site/src/styles/global.css` (or add `is(*)` so Astro cannot scope it), then re-measure the 44-control count live. The guard cannot catch this on its own: `apps/site/tests/cursor-never-blinds.test.mjs:42` reads `src/components/Cursor.astro`, never `dist`, and the defect exists only in compiled output.

### 3.2 `hero-must-demonstrate-product` — half-done (§1.2)

**Next:** make `apps/web/src/routes/signup.tsx` read `?start=` and carry it through the first run. `docs/backlog/HANDOFF-HERO-START.md` names the three-step hop. The middle of the chain is not owner-blocked: `mailer_autoconfirm` is `true` (§4.3), so signup returns a session immediately.

### 3.3 The landing prints a figure its own cited manifest contradicts

Live, in the proof band on `/`:

```
"The same run built 16 screens and …  Record: docs/evidence/ui-showcase/manifest.json"
```

That manifest, at HEAD:

```
$ node -e "const m=require('./docs/evidence/ui-showcase/manifest.json');console.log(m.generatedAt, JSON.stringify(m.counts))"
2026-09-21T09:31:56.797Z {"targets":22,"built":21,"byOutcome":{"built":21,"does_not_compile":1}}
```

The caption also reads `20 September 2026`. This is the RED in §7.1 and it is visible to a reader right now.

**Next:** update the two figures in `apps/site/src/data/showcase-proof.ts` (`galleryScreens.value` 16 → 21, and the day) from the manifest, rebuild, `node infra/deploy-static.mjs --only site`.

### 3.4 The landing's own header has no Showcase link, and its biggest button sends a new visitor to a sign-in form

```js
[...document.querySelectorAll('header a')].map(a=>a.textContent.trim()+' -> '+a.getAttribute('href'))
→ ["Apple -> /", "Docs -> /docs", "Pricing -> /pricing", "Changelog -> /changelog",
   "Status -> /status", "Sign in -> /app/login", "Open Apple -> /app"]

// then, in the same logged-out browser:
navigate("https://apple.moshe-barami111.workers.dev/app");  location.href → ".../app/login"
```

`Open Apple` is the green primary button in the first 40px of the page, and it lands a first-time visitor on a sign-in form. Every inner page instead offers `Create an account` → `/app/signup`. The landing carries exactly one `/showcase` link, in body copy, and no Showcase or Models entry in its header.

**Next:** in `apps/site/src/pages/index.astro`, change the header pill to `/app/signup` and add Showcase to the landing header, matching `Nav.astro`.

### 3.5 The landing is the only page on the site with no way to reach a human

```
$ for p in / /showcase /pricing /docs /privacy; do printf "%s " $p; \
    curl -s "https://apple.moshe-barami111.workers.dev$p" | grep -o mailto | wc -l; done
/          0
/showcase  0
/pricing   1
/docs      2
/privacy   3
```

**Next:** give the landing footer the inner-page footer's Contact column.

### 3.6 `rosebud-in-green` — open, and nothing has ever been captured

```
git ls-files | grep -ci '\.har$'                                → 0
find . -iname '*rosebud*' -not -path './node_modules/*'          → 0 results
```

The geometry the page is built on comes from sixteen `getComputedStyle` claims in `packages/corpus/data/ui-references/web-landing.json`. **Next:** the HAR needs a person with a browser — §4.5.

### 3.7 `failures-become-evals` — zero linkage on the night that produced the most failures

```
grep -cE '^#+ *F-[0-9]+' docs/FAILURES.md                            → 57
grep -rlE '"F-[0-9]+"' packages/evals/tasks* packages/evals/data     → 0 files
```

**Next:** pick the three broken instruments this run found (§6.1, §6.2, §7.2) and write one eval case each, keyed by F-number.

### 3.8 The visual benchmark has not run since 2026-08-31

```
git log -1 --date=short -- packages/evals/tasks-visual/regression/RESULTS.md → 71dc2bc 2026-08-31
```

Three tracks shipped pictures tonight and none was scored. **Next:** `node packages/evals/src/visual-bench.mjs` against the deployed lane, and commit RESULTS.md.

### 3.9 No model number carries the seen/unseen split

```
grep -rn -iE 'unseen' docs/evals/*.md docs/frontier-for-roblox.md → 0 matches
```

95.0% vs 91.3%, 15/15 datastore-safety, 83.3%→87.5% house-rules-plus were all produced tonight (track report; **I did not re-run them**). None can carry the owner's "world's most trained Roblox AI model" sentence without the split. **Next:** re-run the production eval with the held-out set reported separately.

### 3.10 The Playwright MCP the owner asked for is not installed

```
ls .mcp.json → No such file or directory
```

**Next:** `claude mcp add --scope project playwright npx @playwright/mcp@latest` — `--scope project` writes `.mcp.json` inside the repo, so it does not touch `~/.claude`, which lane rules put off-limits. The owner's own command used the default scope; that is the only change.

### 3.11 Six commits are on no remote

**Next:** `git push origin main`. The six are `4481fc6 33e1c09 8259339 c2d0182 c44d0db 118d577`. They are **deployed** — after normalising the upload-time `/showcase/` prefix that `infra/deploy-showcase.mjs` adds, the live page is byte-identical to HEAD's `docs/evidence/showcase.html` (`diff` exit 0) — so the live site currently cannot be rebuilt from anything on GitHub.

### 3.12 The live worker corresponds to no commit

**Next:** `cd apps/worker && npx wrangler deploy --config wrangler.apple.jsonc --var BUILD_SHA:$(git rev-parse --short HEAD)` from a clean tree. I did not do this: `apps/worker/src/do/session.ts` is dirty (`git status --porcelain` → ` M apps/worker/src/do/session.ts`), another lane holds it, and deploying a worker bundle that includes another lane's in-flight edit would reproduce the exact `-dirty` defect this row is about.

### 3.13 `check-rebrand` is red on a file another lane holds

```
node scripts/check-rebrand.mjs → exit 1
BROKEN: THE CAPTURED BUNDLE IS STALE — 2 asset(s) it holds are no longer served and 2 live asset(s)
are not in it.  captured, no longer live: /app/assets/index-B53qzMTz.js
                live, not captured:       /app/assets/index-B7TSilFq.js
REBRAND INCOMPLETE — 5 finding(s)
```

The fix is `--deployed`, which rewrites `docs/evidence/probes/pass3/app-bundle.txt`. That file is dirty in another lane (` M docs/evidence/probes/pass3/app-bundle.txt`), so it is not mine to write.

**Next:** whoever holds that file commits it, then runs `node scripts/check-rebrand.mjs --deployed`.

---

## 4. Blocked on the owner — plain numbered steps

### 4.1 GitHub has stopped running this project's tests — **this is new tonight and is not on the old blocked list**

Measured:

```
$ gh api repos/MosheBarami/apple/actions/runs/35565311092/jobs --jq '.jobs[] | "\(.name) conclusion=\(.conclusion) steps=\(.steps|length)"'
Static checks          conclusion=failure steps=0
Playwright smoke       conclusion=failure steps=0
Build site and web     conclusion=failure steps=0
Typecheck and tests    conclusion=failure steps=0
Build Studio plugin    conclusion=failure steps=0
Secrets and dependencies conclusion=failure steps=0

$ gh api repos/MosheBarami/apple/check-runs/106225838852/annotations --jq '.[].message'
The job was not started because recent account payments have failed or your spending limit needs to be
increased. Please check the 'Billing & plans' section in your settings
```

Six jobs, zero steps each. Every red tick since 03:00 is this, not a failing test.

**What to do:**
1. Open https://github.com/settings/billing in a browser, signed in as MosheBarami.
2. Look for a red line saying a payment failed, or a spending limit of $0.
3. This needs an adult's card, the same way Stripe does. Show this page to whoever handles that.
4. When it is fixed, tell a lane and it will re-run the workflow.

Until this is done, "CI is green" cannot be true or false — nothing runs.

### 4.2 Stripe — unchanged, needs an adult account holder

No steps for you. Nothing on this side is waiting on code.

### 4.3 One real signup — **the reason has changed and the old remedy was aimed at the wrong flow**

Measured live through the Supabase Management API with the token already in `.env`:

```
GET https://api.supabase.com/v1/projects/npqvyijsvzkuwddyhtpm/config/auth → 200
smtp_host             null
mailer_autoconfirm    true
rate_limit_email_sent 2
site_url              https://apple.moshe-barami111.workers.dev/app
```

`mailer_autoconfirm: true` means **Supabase sends no signup confirmation email at all** — the account is confirmed at creation and `signUp` returns a session. So the earlier recorded remedy ("configure a custom SMTP sender, the 2/hour ceiling is losing the mail") is aimed at a flow that sends nothing. A lane found and committed this: `docs/backlog/SIGNUP-EMAIL-MISDIAGNOSED-2026-09-21.md`.

**What to do:**
1. Open https://apple.moshe-barami111.workers.dev/app/signup in your own browser.
2. Type any email and a password of at least 6 characters.
3. Press the button.
4. Tell a lane **exactly** what happened — the words on the screen, or a photo of it. Do not wait for an email; there will not be one.

Why this matters: five other rows are waiting on one authenticated screenshot, and nobody has established what actually stops you, because no lane may create an account.

### 4.4 The Roblox plugin appeal — 2026-10-19. Nothing to do before that date.

### 4.5 The rosebud HAR (§3.6)

**What to do:**
1. Open rosebud.ai in Chrome.
2. Press F12, click the **Network** tab.
3. Reload the page and let it finish.
4. Right-click anywhere in the list → **Save all as HAR with content**.
5. Save it into `~/Desktop/RbxAI/docs/evidence/` and tell a lane.

### 4.6 The `PIXELS-APPROVED:` line

`docs/CHECKPOINT.md:41` records it as absent and not writable by any lane. Look at https://apple.moshe-barami111.workers.dev/ and, if it is good enough, write one line into `docs/DECISIONS.md` beginning `PIXELS-APPROVED:`. If it is not good enough, say what is wrong in Hebrew — that is more useful than the line.

---

## 5. Every claim a refuter refuted, and what was true

### 5.1 "`custom-cursor` — closed" — **FALSE, and I reproduced it**

The truth is §1.5: 44 of 44 controls compute a native cursor on the live origin. The report measured `body`, which is the one element that inherits from `:root` and therefore the one element that cannot tell "the page is hidden" from "only `:root` is hidden". The row should have read PARTIAL. This is the repository's own named anti-pattern — a failure to observe rendered as an observation — applied to the track's own headline deliverable.

### 5.2 "peer commits `b8a32f3` / `0ddc152` added the nav link" — **FALSE**

`git show b8a32f3 --name-status` lists one file, `docs/backlog/HANDOFF-LINK-THE-SHOWCASE.md`, and its own body says it deliberately did not make the change. The landing's door to /showcase came from `a8b45d3` at 07:14 and the nav link from `e85fe18` at 07:12 — both **after** the design lane's last commit. The conclusion ("not mine") was right; the two shas offered as evidence were not. Naming a sha reads as "I ran `git show` on this".

### 5.3 "RE-AIMED … stricter rather than looser" — **FALSE as stated**, by both the commits lens and the falsify lens independently

`apps/site/tests/counted-copy.test.mjs`. Old rule: any `<input|textarea>` in the landing source fails. New rule: one passes when it sits inside a `<form action="/app…">` and carries a `name`. There is no source the new guard rejects that the old one accepted, and the current landing fails the old rule and passes the new one. That is a relaxation. **The re-aim itself is legitimate and properly recorded** — the property really is the right target, `contenteditable` and `role=textbox` stay banned outright, and the old fabricated composer still fails — and the working rule requires exactly the 20-line history comment that is there. Only the word "stricter" was untrue.

### 5.4 "Twenty-three aimed mutations" — **miscounted**; its own enumeration sums to 26, and a refuter reproduced 26

An undercount. It did more than it claimed. The number is still wrong.

### 5.5 "`asset-wall.test.mjs +72`" — **off by one**

`git numstat` for `3236f91` is 71 insertions / 1 deletion. `git show --stat` renders that as the column `72`. The report read the changed-line column and wrote it beside five neighbours that genuinely are pure insertions. Immaterial to every conclusion drawn from it.

### 5.6 "`check-landing-budget` → exit 1, 26,956 B, not raised" — **stale**

Now exit 0 (§2). Fixed in `a135b68` at 03:19 by a later lane, which both implemented the handoff and raised the number. The finding was correct and was independently corroborated at 32,079 B.

### 5.7 "`flow-field-runs.test.mjs` — 8 tests RED at HEAD, not mine and not fixed" — **stale**

Now 8/8 green, fixed by `7d075cb` in the design lane's own second round (the test ran the script text in a `vm` without stripping the TypeScript annotations `9c7f20b` had added). The attribution to `9c7f20b` was correct; the state was not.

### 5.8 Two verification literals have drifted

The landing now hashes `35760cda…`, not the reported `7350bb8a…`, and references `/_astro/index.8vADMvid.css`. This is drift from a later lane's 07:51 rebuild, not fabrication — `index.B_ZE0UbA.css` is still served and still contains exactly 8 `var(--font-mono)`. I re-measured the current pair myself:

```
$ curl -s https://apple.moshe-barami111.workers.dev/ | shasum -a 256
35760cdae290f8ea8ce1fe27ffa8e84006dab236233c296562fae785613b7754
$ shasum -a 256 apps/site/dist/index.html
35760cdae290f8ea8ce1fe27ffa8e84006dab236233c296562fae785613b7754
```

Live is byte-identical to the local build.

### 5.9 "Access: inspect only" — **rendered differently from the byte**

`.proof-state` carries `text-transform: uppercase`, so a reader sees `ACCESS: INSPECT ONLY`. The claim held at the byte level; the rendered casing differs. Precision, not falsehood.

### 5.10 A guard with a residual hole, found by falsifying it rather than by trusting it

`counted-copy.test.mjs` asserts a field carries a name with `/\bname=["'][^"']+["']/`. `\b` matches at the hyphen, so `data-name="start"` satisfies it. The refuter's first mutation rewrote `name=` to `data-name=` and the suite stayed **green**; re-aimed at deleting the attribute, it went red on the assertion the report actually claimed, so the claim stands. **Fix:** anchor as `/[\s"']name=/`.

### 5.11 Disclosure gap, not a false claim

`apps/site/src/pages/index.astro` carried **zero** `<script>` tags at `c74b4a7` and two after `ce3b325`. Roughly 19.9 KB — about 62% of the route's 31,946 raw script bytes — was added by the lane that then filed the redness against the budget checker's blind regex. Both gzip figures are given in that report and it does say it did not raise the budget, so nothing is concealed numerically. The sentence "and the majority of what it cannot see is mine" is the one that is not there.

---

## 6. What the critics found that no track had touched

### 6.1 The CI billing block (§4.1)

A lane found it and wrote it up honestly — `docs/backlog/CI-IS-BLOCKED-ON-GITHUB-BILLING-2026-09-21.md`, commit `f6b1944`. **No track report names it**, and it is not on the owner-blocked list in the brief. It is the fifth owner-only blocker and the one that makes "CI is green" unreachable.

### 6.2 Four ledger instructions aimed at work that was already done

- Rows 22 / 31: "correct the two stale production-model paragraphs at the top of `docs/evals/FINDINGS.md`" — already corrected.
- Row 32: `.github/workflows/ci.yml:142` → the line is now **171**, and already `run: node scripts/check-credit-figures.mjs` (verified: `grep -n 'check-credit-figures' .github/workflows/ci.yml` → `171:`).
- Row 20: `apps/worker/src/embedding-retrieval.ts` committed at `4204ea0`.

The next reader will re-walk the same hour.

### 6.3 §3.7 (evals), §3.8 (visual bench), §3.9 (seen/unseen), §3.10 (Playwright MCP), §3.6 (HAR) — five owner instructions with zero artifacts

Each is listed above with its next action rather than repeated here.

### 6.4 The critic's inference about the signup email was contradicted by a lane's own measurement

The critic wrote "five rows are queued behind one unconfigured mail sender". The measurement behind it is exactly right (`smtp_host` null, `rate_limit_email_sent` 2) and I reproduced it. The inference is not: `mailer_autoconfirm: true` means signup generates no mail to be lost. The real blocker is one person pressing one button (§4.3). Recording this because the wrong version of it has now been written down twice.

### 6.5 What the critic was right to refuse to conclude

Four rows a critic nearly filed as gaps are closed by lanes whose reports were not in the set: `two-live-workers` (I reproduced it — `curl -o /dev/null -w '%{http_code} %{redirect_url}' https://golem.moshe-barami111.workers.dev/` → `308 → https://apple.moshe-barami111.workers.dev/`; the 0-byte body is the redirect, not an empty landing), load-concurrency (`bd3a606`), `cloudflare-product-review` (`cc0a1ea`), gates re-run (`docs/backlog/GATES-RERUN-2026-09-21.md`). At least two lanes worked tonight beyond the ones that reported, so any completeness judgement built only on the reports over-reports gaps.

---

## 7. What the checkers still cannot prove when green

### 7.1 The one that is red right now, and why it matters more than the redness

```
$ node scripts/gate-suite.mjs → exit 1
tests passed: 3946   failed: 2
FAILED: check-proof-figures  · 10
FAILED: pnpm -r test         apps/site

$ cd apps/site && node --test tests/*.test.mjs → exit 1, tests 274, pass 272, fail 2
✖ every figure on the band is the number its manifest field holds
  galleryScreens is printed as 16 but `counts.built` is 21.
✖ the manifest names the day the caption claims, so the two cannot drift apart
  the band is captioned 20 September 2026 but the manifest was generated 2026-09-21T09:31:56.797Z
```

Bisected by reading each commit's manifest:

```
c2d0182 12:45 built=21  generatedAt 2026-09-21T09:31:56
8259339 12:34 built=21
33e1c09 12:28 built=21  generatedAt 2026-09-21T09:23:31
4481fc6 12:25 built=21  ← first red
872c44c 02:29 built=16  ← last green
```

`4481fc6` regenerated the run and left `apps/site/src/data/showcase-proof.ts` at 16. `23d1b75` at 08:38 committed "`pnpm -r test` is green in a clean clone: 8,471 passing across all twelve packages, 0 failing" — and that is origin/main. **So the suite is red only in the six commits nobody has pushed**, on a tree that no CI can reach because of §4.1. Three of the night's own lessons meet at this one point: the work is committed, the work is deployed, and the only machine that would have said so has not started a job since 03:00.

The guard did its job. It is exactly the check that exists so a page cannot print a number its own cited record contradicts, and it caught it. What no checker caught is that the page went on serving the wrong number to readers for four hours while the red sat in a local test run.

### 7.2 A green checker cannot see a defect that only exists after compilation

`cursor-never-blinds.test.mjs` reads `src/components/Cursor.astro` and the source stylesheets. Its `guardClass()` asserts every `cursor: none` selector is scoped to a `:root` class — which the **source** selector is. The bug is Astro's rewrite of `*` into a scope attribute, which happens at build. All six mutations aimed at that file can go red without the guard ever being able to see the shipped defect. The file's own header says "a check that only reads `Cursor.astro` would never see it", and that is the check it is.

### 7.3 `check-site-links` exit 0 walks `dist`, and `/showcase` is not in `dist`

It reports `795 internal link(s) across 20 page(s), all resolve` and prints `served elsewhere: /app/*, /showcase`. The route is uploaded by `infra/deploy-showcase.mjs` outside the static build. The exception is now taught to the checker, which is correct — and it means a genuinely broken `/showcase` would still print all resolve. The only thing that can falsify that route is a request to the origin.

### 7.4 `check-pixels --deployed` exit 0 does not mean the pixels are right

It compares against a baseline that some lane wrote. A baseline rewritten mid-flight in a shared checkout bakes in whatever six lanes had half-finished at that moment. 75 of 80 frames were rewritten tonight. The rule that fires on a bare system font had been failing 74 of 74 frames for two days because `packages/design/src/tokens.mjs` still listed `['Archivo','Figtree']`, retired on 2026-09-19 — so the checker spent two days shouting the same wrong thing at every route, which is indistinguishable from a checker nobody reads.

In the same file, `RETIRED_FONT_FAMILIES` is exported and read by nothing in the repository, and it names `Inter`, which is inside the approved stack. The day anything starts reading it, every route on the site becomes "a design that has been lost".

### 7.5 `check-rebrand` exit 1 and `check-pixels` exit 0 are both about captures, and a capture is a claim about a moment

`check-rebrand`'s five findings are entirely that its capture is stale (§3.13). A capture-based checker is green when the capture matches and red when it does not; neither state says the deployment is correct. It says the two agree.

### 7.6 `pnpm -r test` recursing over workspace members is not the whole suite

`scripts/gate-suite.mjs` says so in its own header: root-level `tests/*.test.mjs` are in no member, so `tests/gate-check.test.mjs` — the test of the program that decides whether every gate in `GATES.md` is met — ran nowhere near the gate claiming the suite passed. Both are summed here now. The shape generalises: a green from a runner that discovers work by structure is a claim about what it discovered, not about what exists.

### 7.7 A green checker run through a pipe reports the pipe's exit code

I hit this in this session and caught it before writing anything from it:

```
$ node scripts/check-proof-figures.mjs 2>&1 | tail -12   → EXIT=0     (that is tail's)
$ out=$(node scripts/check-proof-figures.mjs 2>&1); code=$?  → REAL_EXIT=1
```

Same output, opposite verdict. Every exit code in this report was captured on its own, never through a pipe.

### 7.8 What no checker in this repository can prove at all

That the site is good. §4.6 is the only instrument for that and it is a person.

---

## What I did not measure

- The 26 aimed mutations, their byte-identical `sha256` restores, and the four recorded mis-aims. A mutation planted and restored byte-identically leaves nothing behind by construction. Unverifiable through any lens after the fact, not merely unverified.
- The 303-element pixel-neutrality measurement of the type refactor.
- Every eval number quoted in §3.9. I did not run the production eval.
- The deploy narratives themselves — how many `deploy-static.mjs` runs happened and which one put the current bytes there. I can prove the content is live and byte-identical to the local build; I cannot prove which run did it.
- A clean first-load browser console. The console buffer does not clear across navigations and my own `getImageData` probe added warnings to it, so I will not report the three `400`s I saw as the landing's.
- Whether `apps/site/src/sound/interface-sound.js` matches rosebud's click. There is no reference audio in the tree to compare against.
- The other six tracks' internal claims. I was given the design track's two rounds in full, three refuter lenses each for design and site, and two completeness critics. Everything I assert about the other tracks was re-measured against the tree or the origin, or is attributed.
