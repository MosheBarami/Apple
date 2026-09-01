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

The initial 26 rules are extracted from Crystal Canyon's own client — 224 rationale
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

Coverage is reported honestly and a test asserts the gaps stay visible: **4 of 15
components and 9 of 23 style families have no rule yet.**

## The part that answers §AN

Four rules are mechanised into deterministic checks, each naming the rule it enforces
and validated against **real inputs from this repository's history** — not invented
ones:

| check | fixture | result |
|---|---|---|
| cluster overlap | the measured 97×73px HUD collision, and the geometry that replaced it | fires / passes |
| wait contracts | `Hud` bounded + `Panels` unbounded on `Icons` | fires |
| price agreement | the real `1/4/10` vs `1/2/3` spark disagreement | fires on 2 of 3 keys |
| motion gate | a module tweening outside `Theme.motion` | fires |

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
- **One game's grammar.** 25 of 26 rules come from Crystal Canyon. §L asks for many
  genres; 9 style families still have no rule at all, and the coverage test exists to
  keep that visible.
