# The door, not the house: why 2,353 sourced claims and 80 executed modules are not reached

**Status:** diagnosis only. Nothing in `apps/worker/src` was changed to produce this document.
**Aimed at:** four competing implementations. Every number below is reproducible from the Worker's
own bundled code, so a proposal can be scored against the same harness rather than argued about.

---

## 0. What was measured, and with what settings

A number without its settings is not a measurement. These are the settings.

| | |
|---|---|
| Subject | `apps/worker/src/verified-modules.ts` and `apps/worker/src/ui-construction-guide.ts`, bundled with `apps/worker/node_modules/.bin/esbuild` — the Worker's OWN code, not a retyped copy |
| Repo state | `5d6e607`, working tree as of 2026-09-20 |
| Data | `packages/corpus/data/verified-modules.json` (80 modules) and `packages/corpus/data/ui-construction.json` (13 genres, 8 screens) **as committed** |
| Queries | all 80 entries of `packages/training/src/customer-queries.mjs`, and the 53 UI ids from `packages/training/runs/knowledge-reach.json` |
| Entry points | `askVerifiedModule({ need })` → `searchVerifiedModules(need, 5)`; `getUIConstruction({ id })` |
| `limit` | 5 |
| Model involved | **none.** No gateway call, no tokens, no lane, no `maxTokens`. This is pure library code over a fixed table; re-running it costs nothing and gives the same answer every time. |

**Fidelity check, so this harness can be disputed rather than trusted.** Re-running the two
recorded sets through the freshly bundled Worker code reproduces
`packages/training/runs/knowledge-reach.json` exactly: contract-phrased **80/80 top-1**,
customer-phrased **49/80 top-1 (61%)**, **67/80 in-top-5 (84%)**, 31 wrong at one. If a proposal
changes those baselines, the proposal changed the code, not the harness.

---

## 1. The headline

The knowledge is present. The door is keyed on spelling.

- **Verified modules (80).** Ask in the contract's own words: 100% top-1. Ask the way a customer
  writes: 61% top-1. **31 of 80 return the wrong module first.** Of those 31, **18 still have the
  right module somewhere in the five** — an ordering failure the model could recover from by reading
  the contracts it was handed — and **13 do not appear in the shortlist at all**, which is
  unrecoverable: the model is handed five wrong answers and no signal that a sixth existed.
- **UI construction (53 lookups, 18 found).** Of the 35 misses, **29 have no row in the library**
  (a genuine coverage gap) and **6 are rows that exist and cannot be reached by any spelling of
  their own name.** The four genres `tower_defense`, `fps_arena`, `anime_battle` and `pet_simulator`
  are unreachable by the exact id the tool description advertises to the model.

Widening either library while this holds adds rooms to a house whose door sticks.

---

## 2. The verified-module search, as it actually works today

`searchVerifiedModules(query, limit)` in `apps/worker/src/verified-modules.ts`:

1. **Tokenise.** `query.toLowerCase().split(/[^a-z0-9]+/)`, keep tokens with `length > 2` that are
   not in a 27-word `STOP` set.
2. **Expand.** For each token, add every entry of `SYNONYMS[token]` (12 keys).
3. **Score, per query term, against each of the 80 modules** — an `else if` chain, so **a term scores
   in exactly one bucket**:
   - `m.id.toLowerCase().includes(w)` → **+3**
   - else `m.family.toLowerCase().includes(w)` → **+2**
   - else `` `${id} ${family} ${contract}` ``.includes(w) → **+1**
   - else the same haystack contains `stem(w)` → **+1**, where `stem(w) = w.slice(0, max(4, len-3))`
     for `len > 4`, else `w`
4. **Filter** `score > 0`, **sort** by `score` descending, **tie-break `a.id.localeCompare(b.id)`**,
   take the first `limit`.

Three structural facts follow, and every failure mode below is one of them wearing a different hat.

**(a) `includes` is substring containment, not token matching.** The +3 bonus — the single largest
weight in the scheme — fires when a query word appears *anywhere inside* a module id, including
across a hyphen or in the middle of a word. `"one"` is inside `h`**`one`**`st-percent`. `"out"` is
inside `grid-r`**`out`**`e-cost`. `"but"` is inside `distri`**`but`**`e-column-widths`.

**(b) The scores are integers on a 1–10 scale over 80 documents.** Every distinct non-zero score
observed across all 80 × 80 pairs is in `{1,2,3,4,5,6,7,8,9,10}`. There is no term frequency, no
document-length normalisation, and no inverse document frequency: a word that appears in 70 of 80
contracts is worth exactly as much as a word that appears in one. Ties are therefore not an edge
case, they are the normal condition — **11 of 80 queries have a tie at the top score, and in 9 of
those 11 the correct module is inside the tie.** Roughly one query in nine is decided by
`localeCompare`.

**(c) The recall filter admits half the library.** `score > 0` leaves a mean of **38.6 of 80
modules** standing per query. The job of separating them falls entirely on a ten-point integer.

---

## 3. Failure modes, with counts

Each of the 31 failures is assigned **one primary cause** — the mechanism that, removed, changes the
answer. The six sum to 31. Overlaps are noted, because several failures are compound and a fix that
addresses only the primary cause will not move them.

| | Mode | Count |
|---|---|---|
| **M1** | **Id-substring collision.** The +3 id bonus fires on a word that is not a token of that id, and removing those points alone puts the correct module above the winner. | **13 / 31** |
| **M2** | **Alphabetical tie-break.** The correct module tied the winner on score and lost to `localeCompare`. | **2 / 31** |
| **M3** | **Synonym expansion scored for a different module than the one it was written for.** | **2 / 31** |
| **M4** | **Vocabulary absent.** The customer's noun appears nowhere in the module's id, family or contract; the correct module scores 0 or 1. | **6 / 31** |
| **M5** | **The distinguishing token is a numeral** and is filtered out before scoring. | **1 / 31** |
| **M6** | **Flat scoring.** The correct module scores, and nothing in the scheme separates it from the noise. | **7 / 31** |

> **The M1 count is a floor, not a ceiling.** It uses the strict test "remove the spurious id points
> and the order flips". By the looser test "the winner benefited from a non-token id substring at
> all", the count is **15 / 31**. Two further rows (`purchase-transaction`, `unlock-prerequisites`)
> are scored as M6 only because the correct module sits at rank 23 and rank 38 — removing the
> winner's spurious points would promote a *different* wrong module. They are M1 **and** M4 at once.

---

### M1 — Id-substring collision (13, floor; 15 by the looser test)

An English word lands inside a compound module id and collects the scheme's top weight for meaning
nothing.

**Worked example — `notification-queue`.**

```
query   : "show notifications one after another and only keep the last few"
terms   : show notifications one after another only keep last few
winner  : honest-percent            5  [show:contract+1  one:ID+3  only:contract+1]
correct : notification-queue        3  [notifications→notificati:stem+1  one:contract+1  last:contract+1]
```

The word `one` — an English numeral the customer used to mean "one at a time" — is spelled inside
`h`**`one`**`st-percent`. That accident is worth +3. The literal stem of the word `notifications`
matching the id `notification-queue` is worth +1. **The noise outscores the signal three to one.**

**Worked example — `grid-cell-position`, where the right answer is obvious and still loses.**

```
query   : "work out the row and column for item number 14 in a grid"
winner  : grid-route-cost   8  [out:ID+3  row:contract+1  column:contract+1  grid:ID+3]
correct : grid-cell-position 7 [out:contract+1 row:contract+1 column:contract+1 item:contract+1 grid:ID+3]
```

`grid-cell-position` matches on **five** of the query's terms. `grid-route-cost` matches on four and
wins, because the phrasal verb `work out` put the word `out` in the query and `out` is spelled inside
`grid-r`**`out`**`e-cost`. The same `"out"` decides three separate failures: `dependency-order`,
`tool-durability` and `grid-cell-position`.

**The census.** Of the **348 distinct words** (>2 chars, post-`STOP`) used across all 80 customer
queries, **39 land inside a module id without being a token of it**. Every one is worth +3:

```
 "sit"   → round-transitions, unlock-prerequisites, grid-cell-position
 "lit"   → ability-charges, tool-durability, deep-table-equality
 "off"   → radial-damage-falloff, trade-offer-check
 "not"   → zoom-notches, notification-queue
 "too"   → tool-durability, tooltip-placement
 "out"   → route-cost, grid-route-cost
 "has"   → purchase-transaction, day-night-phase
 "row"   → visible-ui-rows, sort-inventory-rows
 "but"   → distribute-column-widths      "own"   → cooldown-clock
 "win"   → session-window                "over"  → interval-overlap
 "one"   → honest-percent                "ones"  → honest-percent
 "bar"   → scrollbar-thumb               "red"   → ordered-checkpoints
 "rest"  → prestige-conversion           "down"  → cooldown-clock
 "see"   → seeded-shuffle                "tile"  → projectile-lead
 "place" → tooltip-placement             "set"   → merge-settings
 …and 15 more
```

`ordered-checkpoints` alone absorbs five (`order`, `points`, `check`, `red`, `point`).
`tool-durability` absorbs three, including `ability`, which is why *"stop the player using an
**ability** too often"* returns `tool-durability` ahead of `cooldown-clock`.

**None of the 39 is in the `STOP` list.** The `STOP` list stops `the`, `and`, `roblox`; it does not
stop `out`, `one`, `has`, `off`, `too`, `down` — the words that actually do the damage. The list is
aimed at the wrong vocabulary.

---

### M2 — Alphabetical tie-break (2 primary; 9 of 80 queries at risk)

```
inventory-capacity : "how many more items can fit in the backpack before it is full"
   fit-ui-aspect      3   [fit:ID+3]
   inventory-capacity 3   [items:contract+1  can:contract+1  fit:contract+1]
```

Both score 3. `fit-ui-aspect` wins because `f` precedes `i`. `deep-table-equality` loses the same way
to `compact-under-ceiling` (`c` before `d`).

The exposure is wider than the two primary assignments: **11 of 80 queries are decided by a tie at
the top score, and the correct module is inside that tie in 9 of them.** Today it wins 4 of those 9
and loses 5. That is a coin flip weighted by the alphabet, and it means roughly 11% of this benchmark
carries no information about retrieval quality at all.

---

### M3 — Synonym expansion scored for the wrong module (2)

The `SYNONYMS` table injects terms into the query. Those terms then score for **whichever** module
contains them, which is not necessarily the module the entry was written for.

```
crafting-batches : "how many of this recipe can they craft with what is in their bag"
   bag → inventory, capacity, slot
   winner  : inventory-capacity 7  [can:+1  inventory:ID+3  capacity:ID+3]   ← both injected words hit ONE id
   correct : crafting-batches   5  [recipe:+1  craft:ID+3  inventory:+1]
```

The entry `bag: ['inventory','capacity','slot']` injects two words that are *both* tokens of the id
`inventory-capacity`, handing it +6 in a single stroke.

```
token-bucket-spend : "rate limit how often a player can fire a remote"
   often → delay, elapsed, cooldown
   winner  : cooldown-clock     5  [delay:+1  elapsed:+1  cooldown:ID+3]
   correct : token-bucket-spend 4  [rate:+1  limit:+1  elapsed:+1  remote:+1]
```

The `often → cooldown` entry exists because of a documented failure on *"stop the player using an
ability too often"*. It fires here too, on a query about rate-limiting a RemoteEvent, and installs
the wrong module. **Dropping the `SYNONYMS` table entirely moves top-1 from 49/80 to 50/80** — the
table is currently worth about minus one query net. It is not the main problem, and it is not
carrying its weight either.

---

### M4 — Vocabulary absent (6)

Here the contract genuinely does not contain the customer's words, and no scoring change can help.

```
interval-overlap : "check if two time slots clash"
   contract: "overlap(aStart, aFinish, bStart, bFinish). All four endpoints must be finite numbers
              with each start no greater than its finish. Return the length of the intersection…"
   correct module scores ZERO. It is not in the results at all.
```

`clash`, `slots`, `time` appear nowhere in the id, family or contract. Meanwhile `check` is a token
of `trade-offer-`**`check`** and `ordered-`**`check`**`points`, so those two win a query about
interval arithmetic.

```
abbreviate-counter : "show 1500 coins as 1.5K"
   terms after tokenising and the length>2 filter: ["show", "1500", "coins"]
   exactly ONE module scores at all — honest-percent, on the word "show".
   correct module scores ZERO.
```

The contract says *"scale by the largest of 1000 (K), 1000000 (M)… TRUNCATE towards zero"*. It never
says `abbreviate` in prose, never says `coins`, never says `1.5K`. And `1.5K` is destroyed by the
tokeniser: `split(/[^a-z0-9]+/)` yields `["1","5k"]`, both of which the `length > 2` filter drops.

The other four: `dense-sample-mean` (rank 25 on "average a list of numbers safely" — the word
`average` is not in its contract), `compact-under-ceiling` (rank 42), `speed-audit` (rank 24),
`format-duration` (rank 10).

**This is the residue that a better scorer cannot reach.** It is a corpus problem: the contracts are
written in the vocabulary of a function signature, and nothing in the library records the vocabulary
of a need.

---

### M5 — The distinguishing token is a numeral (1 primary; 4 queries affected)

```
finite-normalization : "turn a health value into a 0 to 1 number for the bar"
   "0" and "1" — the entire point of the request — are dropped by length > 2.
   winner : snap-slider-value 6  [turn:+1  value:ID+3  into:+1  number:+1]
   correct: finite-normalization 3, rank 10
```

Four queries carry a numeral that identifies the module and is discarded before scoring: `0 to 1`
(finite-normalization), `1.5K` (abbreviate-counter), `1:05` (format-duration), `14`
(grid-cell-position). **Naively lowering the length filter makes things worse, not better** — see §5.

---

### M6 — Flat scoring (7)

The correct module scores, the winner scores one or two more, and nothing in the scheme encodes why
the correct one is correct.

```
purchase-transaction : "when a player buys something take the coins off them but only if they can
                        afford it and do not already own it"
   winner : trade-offer-check     6  [when:+1  off:ID+3  not:+1  own:+1]
   correct: purchase-transaction  3  [not:+1  already:+1  own:+1]   ← RANK 23. Not in the top five.
```

This is the example in the brief, and it is compound. `buys` is not `buy`, so the
`buy → purchase, price, cost` synonym never fires — the table keys on exact tokens and the customer
wrote the third person singular. `coins` is in the `money` synonym *values*, not its keys, so it
expands to nothing. The stemmer cannot help: `stem("buys") = "buys"` (length 4, returned unchanged),
and `stem("coins") = "coin"`, which is not in the contract either. So the query's three most
load-bearing words — `buys`, `coins`, `afford` — contribute nothing, while `off` inside
`trade-`**`off`**`er-check` contributes +3.

Also in M6: `unlock-prerequisites` (rank 38, beaten 9–2 by `honest-percent` on `one`+`ones`),
`route-cost` (loses to `grid-route-cost` because the more specific id contains the less specific
one), `meter-band`, `radial-damage-falloff`, `due-respawns`, `validate-action-payload`.

---

## 4. What each mechanism is worth: measured counterfactuals

Every variant below was run over the same 80 customer queries at `limit = 5`, no model involved.

| Variant | top-1 | in-top-5 |
|---|---|---|
| **as shipped** | **49/80 (61%)** | **67/80 (84%)** |
| id match requires a whole hyphen-delimited token | 54/80 (68%) | 69/80 (86%) |
| id match requires token prefix/suffix morphology | 55/80 (69%) | 69/80 (86%) |
| IDF weight per query term, ids unchanged | 50/80 (63%) | 69/80 (86%) |
| drop `SYNONYMS` entirely | 50/80 (63%) | 66/80 (83%) |
| allow 1–2 character tokens (keep numerals) | **47/80 (59%)** | 66/80 (83%) |
| **token ids + IDF** | **59/80 (74%)** | **70/80 (88%)** |
| morphology + IDF | 59/80 (74%) | 70/80 (88%) |
| morphology + IDF, no synonyms | 59/80 (74%) | 69/80 (86%) |

Three things to take from this table.

1. **The two fixes are superadditive.** Token-boundary matching alone is +5 queries; IDF alone is +1;
   together they are +10. Neither is sufficient, because the first removes the noise and the second
   is what promotes the signal once the noise is gone.
2. **74% top-1 / 88% in-top-5 is the ceiling of a pure scoring fix.** The remaining ~21 failures are
   M4 and M6 — vocabulary that is not in the corpus. A proposal that claims more than ~74% from
   scoring alone is either measuring something else or has added vocabulary.
3. **In-top-5 barely moves: 84% → 88%.** The right module is *already* in the shortlist 84% of the
   time. If the model reliably read the five contracts it is handed and chose, most of this gap would
   already be closed. That is a second, separable question this diagnosis does not answer.

---

## 5. Traps. A naive fix makes at least one of these worse.

- **"Just match whole tokens."** It costs real signal. `"craft"` → `craft`**`ing`**`-batches`,
  `"scroll"` → `scroll`**`bar`**`-thumb`, `"column"` → `ui-grid-`**`column`**`s` and `"spawn"` →
  `chest-re`**`spawn`** are all non-token substrings that are *correct*. That is why whole-token
  matching buys +5 rather than +13. Prefix/suffix morphology inside a token recovers one more and is
  the better shape.
- **"Just keep the numerals."** Allowing 1–2 character tokens **drops top-1 from 61% to 59%.** Short
  tokens like `1`, `up`, `so` are substrings of nearly everything under `includes`. Numerals must be
  fixed *with* the id-matching fix, never before it.
- **"Just add more synonyms."** The file's own comment already argues against this, and the
  measurement agrees: the existing 12-key table is worth about **minus one query**. A bigger table
  under the current scorer will inject more words that hit more ids by accident, and the file is
  right that a confident wrong module is worse than a miss, because nothing downstream checks what
  the model installs.
- **"Just raise `limit`."** The shortlist already contains the right answer 84% of the time. Raising
  the limit spends context to move a number that is not the bottleneck, and makes the model's
  selection problem harder.
- **Do not delete the alphabetical tie-break; re-aim it.** `localeCompare` is there for determinism,
  which is worth keeping. The defect is that it is *load-bearing* for 11 of 80 queries. Fix the
  scoring so ties are rare, then the tie-break costs nothing.
- **`found: false` on a successful search.** `askVerifiedModule({ need })` returns
  `{ found: false, note: "5 verified module(s) may cover this…", candidates: [...] }`. A successful
  shortlist is rendered with the same boolean as a total miss. That is this repository's
  observation-failure pattern in the response shape itself. It is deliberate — the two-step protocol
  withholds source until an id is named — but any implementation that touches this file should be
  aware the flag does not mean what its name means.

---

## 6. The UI construction lookup: the door is locked and the key is taped to it

**The root cause, stated exactly.** `find()` in `apps/worker/src/ui-construction-guide.ts` (line 53) does:

```ts
const want = id.trim().toLowerCase().replace(/[\s_]+/g, '-');
```

It normalises **underscores in the caller's string into hyphens**. It does **not** normalise the
stored ids. Four of the thirteen stored genre ids contain an underscore:

```
anime_battle   fps_arena   pet_simulator   tower_defense
```

So for `tower_defense`: `want` becomes `"tower-defense"`; the exact match against `"tower_defense"`
fails, the `screen-tower-defense` match fails, and `"tower_defense".includes("tower-defense")` fails.
**The row's own id, passed verbatim, does not find the row.**

Measured, against the Worker's own bundle — the 13 genre ids asked back verbatim:

```
MISS anime_battle     <- its own advertised id does not resolve
MISS fps_arena        <- its own advertised id does not resolve
MISS pet_simulator    <- its own advertised id does not resolve
MISS tower_defense    <- its own advertised id does not resolve
HIT  horror  obby  racing  roleplay  simulator  studio  survival  tycoon  web-landing
```

**Why the model passes exactly that string.** `apps/worker/src/tools.ts:2984` builds the tool
description by interpolating the list itself:

```ts
// apps/worker/src/tools.ts:2981-2985
'…Ask by screen type ('
  + UI_CONSTRUCTION_SCREEN_IDS.join(', ')
  + ') or by genre ('
  + UI_CONSTRUCTION_GENRE_IDS.join(', ')
  + '). Call this before building ANY interface…'
```

The model is *told*, in the tool's own description, that the genres are
`…, pet_simulator, …, tower_defense, tycoon, web-landing`. It passes back the string the tool
advertised, and the tool rejects it.

**And it is reinforced from a second direction.** `get_genre_kit` — the tool `get_ui_construction`'s
description explicitly pairs itself with ("get_genre_kit gives you the colours, this gives you the
shape") — constrains its parameter with a JSON-schema `enum` of `GENRE_KIT_IDS`, which is
`['horror','obby','tycoon','simulator','racing','roleplay','tower_defense','fps_arena','anime_battle','survival']`.
The model *cannot* spell it any other way there. So the sequence a correctly-behaving model performs
is:

```
get_genre_kit({ genre: "tower_defense" })        → HIT, returns the palette
get_ui_construction({ id: "tower_defense" })     → MISS, "Nobody has inspected shipped Roblox UI
                                                    for it, so anything you build is your own
                                                    judgement"
```

Three of the ten enum values fail this way: `tower_defense`, `fps_arena`, `anime_battle`. The Worker
carries one canonical genre vocabulary, and `getUIConstruction` is the only place that refuses it.

**The second defect in the same function: the `includes` fallback is unranked and order-dependent.**
`rows.find(r => r.genre.toLowerCase().includes(want))` returns the *first* row in
`[...genres, ...screens]` order — which is `readdirSync().sort()` order — that contains the string
anywhere. Measured:

```
"sim"  → pet_simulator     (not "simulator" — "pet_simulator" sorts first)
"er"   → tower_defense
"a"    → anime_battle
"or"   → horror
"in"   → racing
"ing"  → racing
```

So the four underscore rows *are* reachable — by `"tower"`, `"defense"`, `"fps"`, `"pet"`, and also
by `"er"` and `"a"`. They are reachable by everything except their own names. And every one of those
returns `found: true`, which means the module's stated contract — *"a miss must SAY it is a miss"* —
is violated in the opposite direction: a meaningless id gets a confident, wrong, sourced answer.

**The coverage split of the 35 misses.**

| | Count | |
|---|---|---|
| Rows that exist and cannot be reached | **6** | `tower_defense`, `fps_arena`, `anime_battle`, `pet_simulator`, `tower defense`, `pet simulator` |
| No row in the library | **29** | shooter, battle royale, clicker, idle, sandbox, story game, minigame, fighting, sports, fishing, farming, escape room, parkour, rpg, open world, card game, `tower_defence`, quest log, daily rewards, battle pass, trading, crafting, skill tree, main menu, pause menu, loading screen, death screen, chat, friends list |

Note `tower_defence` — the British spelling — in the second list. It will still miss after the
underscore fix. Spelling variance is a separate, smaller problem, and worth one line of the fix
rather than a table.

**A live caveat that must travel with these numbers.** Another workflow is writing into
`packages/corpus/data/ui-references/` right now. Eight screen files exist on disk that are **not in
the committed `ui-construction.json`**: `screen-crafting`, `screen-gacha`, `screen-lobby`,
`screen-map`, `screen-notification`, `screen-onboarding`, `screen-social`, `screen-trading`. Two of
the 29 "no row" misses above (`trading`, `crafting`) become covered once that bundle is rebuilt. The
bundle was **not** rebuilt here, because `packages/corpus/data/**` belongs to that workflow.

---

## 7. Two guards that pass while the thing they defend is broken

This is the repository's central failure mode showing up one level higher: a guard that is *present*
and does not *observe*.

**`apps/worker/tests/verified-modules.test.mjs:55`** — `'a need finds the right module by its words,
not by luck'`:

```js
const hits = searchVerifiedModules('stop the player using an ability too often', 5).map(m => m.id);
assert.ok(hits.includes('cooldown-clock'), …);
```

It asserts **membership in the top five**. The measured truth for that exact query is
`[tool-durability, cooldown-clock, ability-charges, round-transitions, tooltip-placement]` —
`cooldown-clock` is **second**, behind a module about pickaxes wearing out, because `ability` and
`too` are both spelled inside `tool-durability`. The test's own title says *"not by luck"*, and luck
is precisely what it is passing on. **Re-aim it to assert position, do not delete it** — its subject
is right, its assertion is one notch too loose.

**`apps/worker/tests/ui-construction-guide.test.mjs:44,49`** asserts
`UI_CONSTRUCTION_GENRE_IDS.includes('simulator')` and then looks up `'simulator'`. `simulator` is one
of the nine genres with no underscore. The suite never asks for an underscore id, so it has no way to
see the defect in §6. A single added case — *every advertised genre id resolves to itself* — would
have caught it, and is the obvious first test for whoever implements the fix.

**Suite result, run at the start of this diagnosis and unchanged by it:**

```
node --test apps/worker/tests/verified-modules.test.mjs apps/worker/tests/ui-construction-guide.test.mjs
  tests 15   pass 14   fail 1
```

The one failure is `'the bundle is not stale against the reference files it is built from'`, caused
by the eight uncommitted corpus files described in §6. It is a pre-existing, peer-caused failure and
was not introduced or fixed here.

---

## 8. What this diagnosis does not cover

- **Whether the model calls the tools at all.** `packages/training/runs/knowledge-reach-first-reach.json`
  (build `a5fe64e-dirty`, lane `apple-max`, mode `stone` → gateway `stone` = `@cf/zai-org/glm-5.3-flash`,
  effort `high`, `maxTokens` 5500 against a 5600 ceiling, 60 tools, 22,955-char system prompt) records
  `reachedAny 0/2` on the two probes that scored — with 2 of 4 lost to provider errors. **n = 2 is not
  a rate**, it is an anecdote, and it measures the first turn of a build that runs up to 16 steps.
  Retrieval quality only matters downstream of the call happening. Both questions are real; they are
  not the same question and must not be reported as each other.
- **Whether the model picks correctly from a shortlist that contains the right answer.** That is the
  84%-vs-61% gap, and it is a generation question, not a retrieval one.
- **Whether the module the model installs is used correctly.** Nothing downstream checks that.

---

## 9. The one-paragraph brief for an implementation

The +3 id bonus fires on substring containment, so 39 of the 348 words customers use land inside a
module id meaning nothing and outscore every real signal, which decides 13 of the 31 failures
outright and contributes to 15. There is no IDF, so a word in 70 contracts counts as much as a word
in one, which leaves 11 of 80 queries tied at the top and decided by `localeCompare`. Fixing both —
token-boundary-or-morphology id matching **and** IDF — is measured at **61% → 74% top-1, 84% → 88%
in-top-5**, and that is the ceiling of a scoring fix; the remaining ~21 failures are contracts
written in signature vocabulary with no record of how a person would ask. Separately and much more
cheaply, `find()` in `ui-construction-guide.ts` rewrites the caller's underscores to hyphens but not
the stored ids, so the four genres the tool description itself advertises as `tower_defense`,
`fps_arena`, `anime_battle` and `pet_simulator` cannot be found by their own names — while its
unranked `includes` fallback answers `"a"` with `anime_battle` and `"sim"` with `pet_simulator`, both
as confident hits.
