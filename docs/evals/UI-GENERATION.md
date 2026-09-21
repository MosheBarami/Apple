# Measuring Roblox UI generation by building it

**Measured 2026-09-20, against the live Apple MAX lane.**
Runner `packages/training/src/eval-ui-generation.mjs` · scorer `packages/training/src/score-ui.mjs` ·
tasks `packages/training/src/ui-tasks.mjs` · shim `packages/training/src/ui-harness.luau` ·
output `packages/training/runs/eval-ui-apple-max-agent-*.json`.

---

## 1. Why a new suite, when one already existed

`packages/evals/tasks/ui-implementation.json` scores UI with `contains` and `regex`. Those checks
read the **vocabulary** of an answer. Every interesting way to get Roblox UI wrong uses the right
vocabulary, so all four of these score full marks there:

| what the model wrote | what the player sees |
| --- | --- |
| `AnchorPoint = Vector2.new(0,0)` beside `Position = UDim2.fromScale(0.5,0.5)` | the panel's top-left corner at the centre — not centred |
| `Instance.new("UIAspectRatioConstraint")`, configured, never given a `Parent` | the panel stretches; the constraint is not in the tree |
| `Size = UDim2.fromOffset(960,540)` | a wall on a monitor, a postage stamp on a phone |
| `ScreenGui.IgnoreGuiInset = true` on a HUD | the button sits under the Roblox topbar on mobile |

The difference in every row is arithmetic, not words, and a regex cannot see arithmetic.

## 2. What this suite does instead

It **runs** the model's Luau. `ui-harness.luau` is a stand-in for the Roblox instance API —
`Instance.new`, `UDim2`, `Enum`, `game:GetService`, signals — that records the instance tree the
script actually builds. `score-ui.mjs` then resolves that tree to absolute rectangles at three
viewport sizes using Roblox's own layout arithmetic (AnchorPoint, UIListLayout, UIGridLayout,
UIPadding, UIAspectRatioConstraint, UISizeConstraint) and asks geometric questions:

- is the panel's centre the container's centre, on a 1920x1080 monitor **and** a 390x844 phone
- is the bar's bottom edge on screen, or 130px below it
- is the tile's width:height ratio the same at every viewport
- does the element's width stay the same **fraction** of the screen as the screen changes

A model that writes unfamiliar but correct UI passes. One that writes the familiar words around
wrong arithmetic does not.

### The six tasks

| id | what it isolates |
| --- | --- |
| `centered-aspect-panel` | AnchorPoint arithmetic, and whether the aspect lock is **parented** |
| `bottom-action-bar` | the anchor-at-an-edge failure — a wrong anchor renders it off-screen |
| `menu-list-stack` | auto-layout containment: do the buttons actually fit inside the panel |
| `shop-grid` | tiles that must stay **square** when the screen shape changes |
| `hud-currency-pill` | safe area for something the player **taps** |
| `fullscreen-backdrop` | the inverse safe-area case, where `None` is the correct answer |

Every prompt states the **requirement** ("must remain tappable on a phone with a notch"), never the
**answer** ("set ScreenInsets to CoreUISafeInsets"). A prompt that names the property is a lookup
test; a prompt that names the requirement is a knowledge test.

## 3. Settings, stated in full

| | |
| --- | --- |
| lane | `apple-max`, Agent mode — what a paying customer reaches |
| gateway config | `stone` → `@cf/zai-org/glm-5.3-flash` |
| effort | `high` (entitlement floor for MAX; a real UI request would also trip `uiDesignTask`) |
| budget | base 4400 × 1.25 = **5500 requested**, gateway ceiling 5600, **not clamped** |
| route | `POST /api/admin/model-test`, no tools, no RAG |
| samples | 5 per task, 30 prompts per arm |

`packages/training/src/production-settings.mjs` derives these the way the worker does, and
`production-settings.test.mjs` reads `apps/worker/src` and goes red if either drifts.

**This measures the model UNAIDED.** `/api/admin/model-test` sends no tools, so the model never
reaches `get_ui_construction` or `search_docs`. That is the point: it measures what the model knows
before the product helps it, which is what tells you what the product must supply.

## 4. Results

### Baseline — the plain system prompt

`runs/eval-ui-apple-max-agent-baseline.json`

**15 of 27 measurable builds passed every check (56%).** 1 prompt was rate-limited by the provider
and 2 built layouts that could not be resolved (§6); none of those three is counted as a model
failure.

Where it fails, per check:

| check | passed |
| --- | --- |
| `safe_area_interactive` | **0 / 5** |
| `full_bleed` | **1 / 5** |
| `tiles_are_square` | 2 / 5 (2 unmeasurable) |
| `aspect_stable` | 4 / 5 |
| `on_screen` | 21 / 24 |
| everything else (17 checks: parenting, stacking, containment, centring, scale-sizing, deprecation, class presence) | **100%** |

### The single dominant defect

**Ten out of ten builds across the two safe-area tasks reached for `IgnoreGuiInset = true`. Not one
used `ScreenInsets`.** The two tasks wanted opposite behaviour, and the same reflex was wrong in
both directions:

- **Interactive HUD.** The engine default is already correct — `ScreenInsets` defaults to
  `CoreUISafeInsets`, which clears the topbar buttons *and* the camera notch. Setting
  `IgnoreGuiInset = true` **demotes** a default ScreenGui to `DeviceSafeInsets`
  (`classes/ScreenGui.yaml`), so the coin button can land under the topbar. The model opted out of
  the thing that was already protecting it.
- **Full-bleed backdrop.** Here the model *should* opt out, all the way to
  `ScreenInsets = None` — the only setting that reaches the physical edge.
  `IgnoreGuiInset = true` only gets `DeviceSafeInsets`, so the backdrop still stops short of the
  notch. It did not go far enough.

It then hand-compensated with hardcoded device constants — *"Roblox topbar is ~58px tall"*,
*"90px down clears topbar + notch"* — which is exactly what `ScreenInsets` exists to remove.

**This is not a reasoning failure. It is a missing fact**, and the fact is one sentence long.

### Intervention — the same model, told the rule

The knowledge already exists in this repository: `packages/corpus/data/ui-construction.json` carries
it under `screen-hud` and `studio`, and `apps/worker/src/ui-kit.ts:196` hardcodes the right value.
But `get_ui_construction` is an **opt-in tool** the model must decide to call with the right id, and
in these runs it had no tools at all.

`packages/training/prompts/ui-safe-area.txt` states the `ScreenInsets` model in ~200 words, sourced
from `reference/engine/classes/ScreenGui.yaml` and `enums/ScreenInsets.yaml`. Nothing else changed —
same lane, same budget, same tasks, same scorer.

| check | baseline | + safe-area prompt |
| --- | --- | --- |
| `safe_area_interactive` | **0 / 5** | **5 / 5** |
| `full_bleed` | **1 / 5** | **5 / 5** |
| measured overall | 15 / 27 (56%) | 25 / 27 (93%) |

No other check regressed.

> The intervention arm's headline figure above is from the run recorded at 5 samples per task. A
> later re-run of the same arm lost 13 of 30 prompts to provider rate limiting and is not quoted;
> the two safe-area checks are property checks that the scorer revision between those runs did not
> touch, so their 5/5 stands.

## 5. What this says about training

A locally-trained LoRA cannot reach production — every model the product routes to answers
`5005 LoRA unsupported`, verified against the live account. That finding is not a consolation prize
here, it is confirmed by this measurement: **the thing standing between Apple MAX and correct
Roblox UI was one paragraph of engine documentation, not a fine-tune.** The model's layout
arithmetic, auto-layout, constraint parenting, containment and API currency were already at 100%.

## 6. What this suite does NOT measure — stated, not buried

- **It does not render anything.** It measures structure and geometry. A build can pass every check
  and still be ugly. `packages/evals` visual critique is the other half and this does not replace it.
- **The ScreenGui rect is taken as the whole viewport.** Real insets shrink it by a device-dependent
  amount, and inventing those pixels would make every centring check depend on a guess. Descendants
  lay out inside the ScreenGui rect in Roblox too, so centring and containment are unaffected;
  safe-area is scored as a **property**, where the engine's rule is written down.
- **AutomaticSize and text metrics are not modelled.** A node that sizes itself from its text has
  its size checks recorded as **skipped**, never as passed.
- **A build that measures itself cannot be measured.** If the script reads `AbsoluteSize`,
  `GetGuiInset()` or `ViewportSize`, those are values only the renderer has. The reads are counted
  and named, every geometric check is skipped with the reason attached, and the row is reported
  under `unmeasurable` rather than folded into a pass rate. 2 of 30 baseline rows were in this state.
- **`runtime_error` always carries its message.** A throw can mean the shim lacks an API the model
  legitimately used. Three such gaps were found and fixed while building this (`_G` frozen by the
  standalone interpreter, `GuiService:GetGuiInset` missing, and a shared method table that shadowed
  a button named `Play`). Each would have been recorded as the model failing.

## 7. Two findings about the platform, not the model

### 7.1 The AI Gateway is serving cached responses, and the worker believes it is not

Measured against the live worker on 2026-09-20 via `/api/admin/model-test`:

| request | worker-reported ms | answer |
| --- | --- | --- |
| first ask | 3346 | A |
| identical body, again | 97 | byte-identical A |
| identical body, again | 87 | byte-identical A |
| **one trailing space added** | 3227 | different answer |
| two trailing spaces | 6149 | different answer |

A byte-identical request body is served from a response cache. This happens although
`apps/worker/src/providers/workers-ai.ts` passes `cacheTtl: 0` on every call and its own comment
states *"Response caching … stays off (cacheTtl 0) on every agent call"*. The account's AI Gateway
is caching regardless of the per-request value.

Three consequences:

1. **Every repeat-based eval in this repository is suspect.** The first run of this suite reported
   18 rows that were 6 generations replayed; the variance a repeat exists to measure was invisible.
   This runner now decrements `maxTokens` by one per attempt — a change in the request body that the
   model never reads — and records it. `--no-cache-bust` restores the old behaviour.
2. **Two customers asking the same thing get byte-identical builds.**
3. **A cache hit is still billed.** Our ledger charged the same 57 neurons on each of the three
   replays above, because the worker computes neurons from the `usage` block the cache replays.

### 7.2 Provider rate limiting silently eats samples

A tight loop over GLM-5.3-flash returns HTTP 500 *"Apple is handling a burst of requests right now.
Nothing was charged"*. The first run of this suite lost 2 of 6 prompts that way and reported 2/6 —
a provider hiccup wearing a score's clothes. The runner now retries 5xx with exponential backoff,
paces requests (`--gap-ms`), and records a prompt that never came back at stage `request` so it
stays **out** of the scored denominator.

## 8. Recommended changes outside this package

These belong in `apps/worker/src`, which a peer session owns. They are written up rather than
applied.

### 8.1 Put the ScreenInsets rule where the model always sees it

The measurement says this is worth 0/5 → 5/5 on two checks for ~200 words. `get_ui_construction`
being opt-in is the gap: the model has to already suspect it needs the rule.

Add the paragraph in `packages/training/prompts/ui-safe-area.txt` to the UI-building system prompt
(or to `ui-construction-guide.ts`'s always-rendered preamble) so it is present whether or not the
model calls the tool.

### 8.2 Add the inverse case to the construction corpus

`packages/corpus/data/ui-construction.json` → `screen-hud.rules.screenInsets` says *"Never use None
for anything the player touches"*, which is right but only covers one direction. Nothing in the
bundle says what `None` **is** for. Add a rule to the effect of:

> `ScreenInsets = Enum.ScreenInsets.None` is for a ScreenGui whose contents are decorative and
> non-interactive — a full-bleed background, a loading backdrop, a vignette. It is the only setting
> that reaches the physical edge of the screen. `IgnoreGuiInset = true` is not a substitute: on a
> default ScreenGui it only demotes `CoreUISafeInsets` to `DeviceSafeInsets`.

### 8.3 Decide about the response cache, deliberately

Either turn the AI Gateway's cache off so the code's stated invariant is true, or change the comment
in `workers-ai.ts` and stop billing neurons for a replay. Today the code says one thing and the
account does another, and the accounting follows the code.

---

## 9. §8.3 DECIDED, AND THE WORKAROUND IN §7.1 HAD STOPPED WORKING

**2026-09-21. Six live one-item calls, 124 neurons in total, all of them listed.**

### 9.1 The half of §8.3 that was in this repository, decided

§8.3 asked for the response cache to be settled rather than left ambiguous, and it named two
remedies: turn the account's AI Gateway cache off, or change the code's claim.

- **The code's claim** was corrected in commit `ae3dce1`: `workers-ai.ts` now says that `cacheTtl: 0`
  is sent on every call **and** that something replays anyway, with the decay measurement (16/16 at
  two minutes, 0/16 at nine) that establishes a TTL near five minutes.
- **Turning the account cache off is not decided here and is not a code change.** It is an
  infrastructure setting on the owner's Cloudflare account with product consequences — a repeat
  prompt answers in ~200 ms from the cache and in ~6,500 ms without it. It is recorded as an
  owner-side option, not as pending work.
- **What IS decided, and is this repository's to decide: every measurement path must produce a
  distinct request, and that must be a checked property rather than a convention.** That is the
  change below.

### 9.2 The workaround in §7.1 had been a no-op for a whole revision

§7.1 says *"This runner now decrements `maxTokens` by one per attempt — a change in the request body
that the model never reads"*, and the report prints `cacheBusting: maxTokens is decremented…` on
every run. Both were true when written: the lane then resolved to **requested 5,500 against a 5,600
ceiling**, unclamped, so 5,500 → 5,499 reached the provider.

Commit `8b61c91` moved `high` from ×1.25 to ×2 and the ceiling from 5,600 to 6,500. The lane now
resolves to **requested 8,800, clamped to 6,500** — and 8,800 and 8,799 arrive at the provider as
the same 6,500. The shave has been erased by the clamp ever since, while the report kept announcing
it.

**Measured rather than reasoned about.** One item, `anim-emote`, apple/agent, house-rules-plus:

| sent `maxTokens` | reaches the provider as | latency | answer sha256 | reading |
|---|---|---|---|---|
| 8,800 | 6,500 (clamped) | 6,527 ms | `025cbe29` | fresh generation |
| 8,800 | 6,500 (clamped) | 255 ms | `025cbe29` | **replay** |
| **8,799** | **6,500 (clamped)** | **187 ms** | **`025cbe29`** | **replay — the shave changed nothing** |
| 6,000 | 6,000 | 4,342 ms | `b56bd8f3` | different answer |
| 5,999 | 5,999 | 15,117 ms | `ae23b7de` | different answer |
| **6,499** | **6,499** | **6,372 ms** | **`88fe0d30`** | **different answer — the corrected shave** |

The cache is keyed on **what the provider is asked for**, which is the value after `llmChat`'s clamp.
Shaving the *requested* budget busts nothing while it is clamped; shaving the *effective* budget
busts it.

Each of those six was billed: 21, 21, 21, 20, 20, 20 neurons. **A replay costs the same as a
generation**, which is §7.1 point 3 confirmed on a second occasion rather than restated.

### 9.3 What changed, and the guard that will notice next time

`cacheBustTokens(settings, n)` in `production-settings.mjs` is now the single rule, with the table
above in its header. Sample 1 sends production's exact requested budget; sample *n* sends
`effectiveTokens − (n − 1)`, which is strictly below the ceiling and therefore reaches the provider.
Both runners use it — `eval-ui-generation.mjs` per repeat, `roblox-frontier-bench.mjs` behind a new
`--replicate N` — and both refuse to run when no bustable value exists rather than buying a replay.

`production-settings.test.mjs` asserts the property, not the arithmetic: **for every lane and mode,
sample n > 1 must send a value the provider sees as different from every earlier sample's.** Watched
red on three mutations, each restored byte-identical: reinstating the shipped rule (3 red), removing
the too-small refusal (1 red), and making sample 1 send the effective budget instead of the requested
one (1 red).

One branch of the first draft was **deleted rather than kept**: it returned `null` when the shaved
value would clamp back up to `effectiveTokens`. Removing it turned nothing red, because it cannot
fire — `effectiveTokens` is already `min(requested, ceiling)`, so subtracting from it never clamps
back up. A guard that cannot fire is the thing this suite exists to find, including in itself.

### 9.4 What this does not fix

- **Three of the nine runs `docs/frontier-for-roblox.md` §8 reads from are replays**, and were
  recorded before `--replicate` existed. They are already discarded by that document's §8.3; they
  are not re-run here, because re-running them would produce different answers and a number
  corrected by resampling is a new measurement wearing the old one's name.
- **`eval-production.mjs` was not touched.** It is owned by another session and has its own copy of
  the settings tables. Whether its repeats are independent is unmeasured.
- **The account cache itself is still on**, and two customers asking the same thing still get
  byte-identical builds. That is §8.3's other half and it stays with the owner.
