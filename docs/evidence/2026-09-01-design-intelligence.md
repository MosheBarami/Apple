# Design intelligence: retrieval instead of a blank canvas

**Date:** 2026-09-01
**Answers:** §G ("Golem must STOP defaulting to inventing every Roblox GUI from a
blank canvas"), §K (extract the grammar, build original primitives), §AN (does the
corpus measurably improve anything).
**Package:** `packages/design` — `@golem/design`.

---

## Why extraction, not ingestion

The corpus classification made this decision for us rather than leaving it to taste.
Of the seed manifest's **24 free cartoon UI kits and low-poly world packs — the
exact material this library most wants — zero can prove a licence about themselves.**
Every one is a DevForum thread, and §H is explicit that a thread is a claim, not a
licence. They are all quarantined and none may be redistributed.

So for these categories §K's route is not a stylistic preference, it is the only
lawful one: learn the grammar, write original components. The categories that *are*
reusable (28 UI frameworks, 16 engineering libraries) are code libraries, which
teach architecture rather than art direction.

## What a rule is

Not a number. A number without its reason cannot be transferred to another genre or
screen size, and will be cargo-culted the first time it does not fit. Every rule
carries the imperative, the reasoning that makes it portable, **the named failure it
prevents**, and provenance.

The first 26 rules are extracted from Crystal Canyon's own client — 224 rationale
comment blocks across five modules — because that is the highest-quality material
available: Golem-owned, licence-clean, and reviewed in pixels. Examples:

> **A yaw is not a rotation.** To present a corner rather than a face, rotate on all
> three axes. *Why:* a cube yawed 45° still shows a flat square lid to any camera near
> its own height. *Prevents:* six gold boxes floating in the hero shot.

> **The caption plate is wider than the icon tile.** *Why:* the longest label decides
> the plate width; type size is a legibility floor, not an adjustable dimension.
> *Prevents:* "labels under icons are tiny."

> **Open overshoots, close does not.** Back/Out ~0.24s in, Quad/In ~0.14s out.
> *Why:* an overshoot on the way out reads as the panel failing to leave.

## The second source, and why one game was not enough

Almost every one of the first 26 rules came from a single game. §L names that as a
risk in its own right: a library that only knows one simulator will make every genre
look like that simulator. The fix is not to invent the missing genres — §AK — it is to
find another source that **can prove a licence** and read it.

The corpus classification had already found the only one that suits art direction:
**`Roblox/creator-docs`, CC-BY-4.0**, one of just two CC-BY repositories in the whole
seed manifest, already vetted and already checked out. It cannot teach taste. What it
documents is **engine facts that decide whether an art direction is achievable at
all** — which surface flags still do anything, what a colour becomes when it is
converted, which axis a page layout quietly takes from the player.

Because it is licence-clear, a rule read from it is `learned-pattern`, not
`reference-only`: it may state grammar **and** carry the facts the document records.
The attribution CC-BY requires is the file path, so every such rule names the exact
file — `content/en-us/reference/engine/enums/SurfaceType.yaml`, not "the docs" — and
a test enforces that, the licence tag, and the classification.

**A mixed source takes the stricter classification.** The pre-existing studs rule
reads creator-docs *and* an unlicensed DevForum thread. Being half licence-clear does
not make it licence-clear, so it stays `reference-only` and carries no values. That is
the same demotion `capKind()` performs in the corpus intake, and it is now held by a
test rather than by whoever writes the next mixed-source rule remembering to. The test
was written to check attribution and **caught this case while being written** — the
rule was already correct; nothing was enforcing that it stay correct.

## §M: studs/classic as an art language, not a texture checkbox

§M asks for STUDS / CLASSIC ROBLOX as a **first-class art language**. That turns out
to cost more than a style note, because almost none of the classic look is a free
choice — it is a set of engine behaviours, several of them deprecated or **inert**,
and a generator that does not know which is which produces builds that are wrong in
ways no screenshot shows. Ten rules now cover it, of which these three are the ones
that would otherwise be guessed wrong:

> **Surface type is decoration now, not structure.** Surface *joining* is deprecated
> and leaves only the visual change. *Prevents:* a studded build that renders
> correctly in Studio and comes apart the moment physics runs, because the stud faces
> were expected to weld it.

> **Outlines are gone and no surface flag brings them back.** `SmoothNoOutlines` is
> documented as no longer relevant *because outlines were removed from the engine*.
> *Prevents:* a retro build that sets it across a thousand parts and renders
> pixel-identical to plain `Smooth`. It fails silently, which is worse than failing.

> **The classic palette is a named set, not a ramp.** Converting a colour returns the
> **closest** named brick by smallest total per-channel distance. *Prevents:* a
> six-step gradient authored in Color3 quantising to three repeated bricks — the
> palette that renders is not the palette that was designed, and nothing reports the
> substitution.

A test asserts the **spread**, not the count: one rule saying "use studs" would
satisfy a coverage number and not §M's sentence, so the classic language must say
something about surface, palette, material, module *and* ergonomics — the last being
`retro.quote-the-era-look-not-the-era-ergonomics`, which keeps the studs and the flat
colour while keeping modern touch targets, gamepad focus and safe-area insets. The
era's tiny targets were platform limits, not style, and no player reads them as a
reference to anything.

## Provenance is a licence boundary, not a citation style

| kind | may state grammar | may carry concrete values |
|---|---|---|
| `golem-authored` | yes | yes |
| `learned-pattern` | yes | yes |
| `reference-only` | yes | **no** |

`assertLicenceSafety()` enforces the last row, and a test **drives the violation** —
a fabricated rule sourced from an unlicensed thread that carries `cornerRadiusPx`
and `strokePx` is refused by id and by field name. `composeBrief()` independently
strips values from `reference-only` rules, so a generator prompt cannot leak them
even if a rule is authored wrongly. That is the line between learning a pattern and
copying an asset, made executable rather than remembered.

## Retrieval

`retrieve({ component, styleFamily, platform, need })` ranks by exact component (10),
cross-cutting layout/motion (3), style family (6), platform (3), and **+2 for having
been seen to work** — the same standard §A applies to capabilities. Scoring is
deliberately boring: §AK's warning about unauditable metrics applies to relevance
scores too, so every point is attributable to one clause of the brief.

`composeBrief()` emits constraints *with their reasons*, headed "Do not start from a
blank ScreenGui." A generator handed "make it cartoony" invents; a generator handed
"a press is an instant depth change, because easing into a press feels soft" has
something it can follow or knowingly depart from.

### A retrieval defect that only a second genre could expose

The `+2` for having been seen to work was awarded **unconditionally**. While the
library knew one aesthetic that was invisible. The moment it knew two, it became a
bug: every validated rule cleared `minPoints` on its own, so a `horror` brief returned
its two horror rules followed by **ten cartoon-simulator rules**, and `composeBrief`
handed the generator all twelve.

That is precisely §L's overfitting failure — arriving through the retrieval layer
rather than through the rule set, which is why adding genre rules alone would not have
fixed it. The bonus is now a **tie-break among rules that already matched**, never an
entry ticket. A `horror` brief returns two rules, a `tower-defence` brief returns one,
and a thin genre now *looks* thin instead of looking like the simulator.

## Coverage, stated as a pinned number

**51 rules. Every one of the 15 components now has a rule** — `nav`, `card`, `counter`
and `tab` were the four gaps, filled from Crystal Canyon's reviewed source (the nav
rail's radius, the grid cell that must be fixed to wrap, the counter's inverted
medallion) and from creator-docs (gamepad reachability, the axis a page layout claims).

**6 of 23 style families still have none:** `fantasy`, `sci-fi`, `modern`,
`battleground-fps`, `social`, `dialogue-story`.

The coverage test used to assert only that the gap was non-empty. That stopped the
gap being closed by deleting the check, and **not** the way §L actually warns about —
by adding a family to a rule that was never written for it, which costs nothing and
reads as progress. So the remaining six are now **named in the assertion**. Covering
one is welcome; it just has to come with an edit to that list and to this document.

Each of the six is absent for the same reason: no licence-clear source and no built
fixture. §AK is explicit that a rule invented because it sounded plausible is worse
than an absence, so they stay absent.

## The part that answers §AN

**Eight** rules are mechanised into deterministic checks, each naming the rule it
enforces and validated against **real inputs** — not invented ones:

| check | fixture | result |
|---|---|---|
| cluster overlap | the measured 97×73px HUD collision, and the geometry that replaced it | fires / passes |
| wait contracts | `Hud` bounded + `Panels` unbounded on `Icons` | fires |
| price agreement | the real `1/4/10` vs `1/2/3` credit disagreement | fires on 2 of 3 keys |
| motion gate | a module tweening outside `Theme.motion` | fires |
| **safe area** | the two ScreenGuis in the shipping client, parsed from source | **fires — see below** |
| **gamepad reachability** | a rail with an entry point and no links; a link into a non-`Selectable` element | fires |
| **palette collision** | a three-step ramp converted by the documented nearest-match metric | fires |
| **inert surface flags** | `SmoothNoOutlines`, against the real `world/Build.luau` | fires / passes |

The four new ones keep the same scope discipline. **Palette collision reports
collisions and never distance**: "two colours I designed as different became one" is a
fact and it is the failure that flattens a ramp, whereas "this colour moved too far" is
a judgement, and §AK is explicit that a metric which merely sounds reasonable is the
dangerous kind. **Gamepad reachability checks the graph and not its shape**: whether an
element is reachable is a fact; whether a rail *should* wrap is a design decision and
stays with the human. **Inert surface flags fire on exactly one token**, so the check
that flags everything and gets muted cannot be this one.

The palette check also does **not** vendor the engine's colour table. The caller
supplies both the intended colours and the palette; the library supplies the metric.
A check that shipped a copy of someone else's data table would be doing the exact
thing this package exists to avoid.

### The safe-area check found a real, still-present defect

The shipping client creates **two** ScreenGuis, and they disagree:

- `CrystalCanyonHud` (`Hud.luau:1192`) sets `IgnoreGuiInset = false`, with a comment
  saying why: *"keep the top row clear of the Roblox topbar"*.
- `CrystalCanyonUI` (`init.client.luau:99`) sets `IgnoreGuiInset = true` — and it is
  the one `Panels` parents its modal layer to (`ctx.gui = screen`, line 218). That
  layer carries **10 `Theme.button` / `Theme.close` control sites**.

Opting out of the core-UI safe area is documented as a decision for *noninteractive*
content: "you should only use `None` for a `ScreenGui` that contains noninteractive
content like background images." So the surface carrying every close button in the game
is the one that opted out, while a second surface in the same client opted in on
purpose. That disagreement is the finding — the same evidence the wait-contract check
relies on: one consumer has already demonstrated the inset is load-bearing here.

**This is not fixed.** `apps/**` belongs to another workstream this pass, so the defect
is recorded and asserted rather than patched. The test derives the fixture by parsing
the real `init.client.luau` and `Hud.luau` rather than transcribing them, so it cannot
quietly stop describing the code it claims to describe — and it will start failing the
moment someone fixes it, which is the correct way for this note to expire.

**The first version of the wait check was too broad, and that is recorded rather than
quietly fixed.** It flagged every unbounded `WaitForChild` and returned **26 findings
against a healthy client** — almost all correct code, because a client genuinely
cannot run without `Config` or `Palette` and a timeout there converts a guaranteed
wait into a crash. A check that fires on everything gets muted, and then it catches
nothing.

The sharpened rule is about an **inconsistent contract**: if any consumer treats a
dependency as optional, every consumer must, because it demonstrably can be absent.
26 findings became **1** — and that one was a real, still-present defect:

> `Icons` is treated as OPTIONAL in Hud.luau (bounded wait, degrades) but blocked on
> FOREVER in Panels.luau.

Fixing the install manifest last pass made `Icons` present; it did not make `Panels`
survive its absence. **The library found a bug the fix had left behind, and it is now
fixed** — `Panels` waits 5s, warns, and guards its single call site. The shipping
client now passes its own audit, asserted by a test that reads the real source.

That is the §AN claim, and its honest size: the corpus improved the code once,
concretely, on a defect no human had noticed.

## What this does NOT do yet

- **Not wired into the worker's generation path.** The retrieval API exists and is
  tested; nothing calls it in production yet. `apps/worker` is being changed by
  another workstream, so the wiring waits for that to land rather than racing it.
- **No model-in-the-loop A/B.** §AN's full comparison — generate a shop UI with and
  without the brief, judge both — requires paid inference and is blocked on AI
  Gateway credit (`BLOCKERS.md` #1). The deterministic half is done and free.
- **Still concentrated, just less so.** 32 of 51 rules come from Crystal Canyon and 12
  are learned from creator-docs; the remaining 7 are this library's own syntheses and
  the style spec. Two real sources is better than one and is not many: everything the
  library knows about *building* still comes from a single cartoon collection game,
  and everything it knows about the *engine* comes from a reference manual. Neither
  has ever seen an RPG or a horror game ship.
- **Six genres have no rule**, named above and pinned by a test. The genre rules that
  do exist are deliberately few and each states what its genre **changes** about a
  rule the library already trusts, rather than describing the genre from scratch.
- **The unbuilt rules are marked unbuilt.** Every creator-docs rule carries
  `validated: 'documented engine behaviour; not yet built in a Golem fixture'`, and
  `retrieve` withholds its +2 from anything whose validation says "not yet". A
  documented behaviour has been written down by the engine's authors; it has not been
  seen to work here. 18 of 51 rules are in that state and rank below the ones that
  shipped, which is the honest order.
- **The safe-area defect above is real and unfixed**, because fixing it means editing
  `apps/**`.

---

## 2026-09-01, third pass — three of the six empty families closed from the one licence-clear source

`library.test.mjs` pins the uncovered family list exactly, so it cannot be closed by widening an
existing rule's `styleFamilies` — which §L names as the failure mode and which costs nothing.

Three are now closed properly. Each is an **engine fact** from `Roblox/creator-docs`
(CC-BY-4.0, the same source already vetted by the corpus intake), and each constrains what a
design for that family can even do:

| family | rule | the fact it rests on |
|---|---|---|
| `social` | treat the default chat window's region as occupied, or disable it deliberately | it ships `Enabled = true` and the player can summon it at any moment, so a panel there competes with a surface you neither own nor can restyle beyond a handful of documented properties |
| `battleground-fps` | UI shown while `MouseBehavior` is `LockCenter` must release the lock or be navigable without a pointer | `LockCenter` pins the cursor to the screen centre, so the pointer no longer travels and every hover and click target in a conventional GUI becomes unreachable |
| `dialogue-story` | a `ProximityPrompt` must not be the only route into dialogue | `RequiresLineOfSight` defaults to **true** and is measured from the **camera**, not the character — so the prompt vanishes exactly when a story scene moves the camera |

**`fantasy`, `sci-fi` and `modern` stay open, deliberately.** They are matters of taste, and the
one source that can prove a licence about itself documents *behaviour*. Writing three plausible
aesthetic rules to empty the list is precisely what §AK forbids and what the pinned test exists
to catch. Closing them needs a source that can teach taste and prove a licence; the corpus
classification found none — every free cartoon UI kit and low-poly pack in the seed manifest is
a DevForum thread, and a thread is a claim rather than a licence.

The library is 54 rules over 20 of 23 families.
