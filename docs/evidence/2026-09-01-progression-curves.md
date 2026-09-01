# The corpus answers two of the three questions it was built for

`docs/SOURCE-INTELLIGENCE.md` §8 says the corpus is judged by one thing — *"does the
simulator/tycoon build get better?"* — and names three questions it must answer
better than this phase managed on its own. This is the second one:

> What do real simulator progression curves look like, against the ones guessed in
> `Config.luau`?

It now has an answer, and the answer is not a small correction.

---

## The two curves

`DLinacre/slime-factory-tycoon` (MIT, `c471a2ef7d`, security-clean) prices upgrades as
`cost = baseCost * growth ^ level`, and carries its own comment on the rate:

| track | baseCost | growth | maxLevel |
| --- | ---: | ---: | ---: |
| click | 10 | 1.15 | 500 |
| auto | 100 | 1.18 | 500 |
| vat | 1,500 | 1.22 | 300 |
| reactor | 50,000 | 1.25 | 300 |
| quantum | 2,000,000 | 1.28 | 250 |

`apps/benchmark/crystal-canyon/src/shared/Config.luau` uses the same formula:

| track | BaseCost | CostGrowth | MaxLevel |
| --- | ---: | ---: | ---: |
| pack | 50 | 1.6 | 12 |
| speed | 75 | 1.7 | 8 |
| magnet | 100 | 1.8 | 10 |

## What the difference is worth

Compounded over twelve levels, the last upgrade costs this multiple of the first:

| growth | last / first at L12 |
| ---: | ---: |
| 1.15 | **4.7x** |
| 1.28 | **15x** |
| 1.6 | **176x** |
| 1.8 | **643x** |

These are not variations on one shape. A shallow curve over hundreds of levels reads
as a long ladder where every rung is affordable; a steep curve over a dozen reads as
three cheap purchases and then a wall. Our steepest track tops out at **643x**, which
is roughly forty times steeper than the reference set's most aggressive tier.

The arithmetic is pinned by a test rather than left in prose, because a number quoted
in a rule's justification is exactly the kind of claim that drifts.

## What was extracted

Three rules, and a new `progression` component to hold them —
the first non-visual component in the library, and the first rules extracted from a
shipped **game** rather than from engine documentation or a UI kit.

- `progression.cost-growth-is-shallow-over-many-levels-not-steep-over-few`
- `progression.growth-rate-rises-with-tier-so-later-tracks-are-steeper`
- `progression.gate-on-lifetime-earnings-not-on-current-balance`

The second comes from the growth rate *rising* across tiers — 1.15, 1.18, 1.22, 1.25,
1.28 — which keeps time-to-max roughly level across tracks bought at very different
income rates. The third comes from `Zones.requiredLifetime`: gating on a lifetime
total rather than a spendable balance, so buying an upgrade can never retract access
to an area the player already reached.

Recording this only as evidence was not an option §7 leaves open — its chain ends
*"extraction → retrieval → playbooks → evals"*, not *"extraction → a document"*. A
progression brief now ranks these three first, and a test asserts they leak into no
panel, button, toast, modal, counter or nav brief, which is the overfitting failure
`retrieve.mjs` already guards against.

## What this does not claim

**n = 1.** One team's shipped balance decisions are not a measured genre consensus.
The source's own comment says *"growth of ~1.15 is the genre standard"*, and that is a
claim by one author, not a survey — so the rule states the shape and the range, and
`provenance.validated` reads *"observed in one shipped tycoon; not yet built in a
Golem fixture"* rather than borrowing the source's confidence. A test asserts no rule
learned from a game uses the words "genre standard" or "consensus".

**No rebalance was performed.** `Config.luau`'s prices carry careful comments tuning
them against measured crystal rates — "valued against H4's MEASURED 0.40 crystals/s",
a cosmetic priced to land inside the first session. Changing an economy that was tuned
against measurements, on the strength of one comparison, would be exactly the move
this repository keeps recording as a failure. The finding is retrievable; whether to
act on it is a design decision with an owner.


---

## §8's third question, answered by the same machinery

> Which deprecated UI patterns did this phase's own build already use?

The domain tagger points at any Luau, including ours. Across **37 files** —
`crystal-canyon`'s client, server, shared and world code, plus the plugin:

```
era: modern | modern markers: 181 | legacy markers: 0 | deprecated patterns: none
```

**None.** That is a real answer rather than an absence of checking, and it took one
correction to earn.

The first run reported exactly one finding: a bare `wait()` in `apps/plugin/src/Ops.luau`.
It is inside a string literal —

```luau
"refused: this code contains a loop with no yield in it (no task.wait, wait() or "
```

— a refusal message explaining to a user which yields are allowed. Not a call.

The stripper deliberately preserves string contents, because `Instance.new("BodyVelocity")`
is real deprecated usage whose entire evidence lives inside a string. So strings cannot
simply be discarded, and the fix is not a heuristic about how a string looks: markers
describing **call syntax** are counted with string contents blanked, markers naming a
**class** with them kept. The split is by what the marker is.

That is the fourth false-positive class this tagger has produced and the fourth found by
opening the file it pointed at rather than trusting the count — after doc comments,
TypeScript declarations, and a library's own `Signal:connect`. Every one of them inflated
a claim about someone else's code, and the last one inflated a claim about ours.

## The one question still open

> What does a shop panel look like built on `StyleSheet`/`StyleRule` rather than
> hand-set properties on every instance?

Not answered. No checked-out source uses `StyleSheet`/`StyleRule` — it is recent engine
API and the corpus skews to libraries older than it. This is a discovery gap with a known
shape rather than an unknown, which is the useful kind to be left with.
