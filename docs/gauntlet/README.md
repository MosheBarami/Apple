# The gauntlet

Until now, the sentence "this matches the references" was written by the agent that built the
thing. That is a claim, not a comparison, and it is the specific habit this replaces.

## How a round works

1. A builder produces or changes one piece.
2. A **separate critic, with fresh context**, fetches the real bar — not a description of it — and
   puts the two side by side **with the labels stripped**.
3. The critic picks one and names the single biggest remaining gap.
4. The verdict goes in the ledger through `scripts/gauntlet-verdict.mjs --record`.

The critic must not know how hard the builder tried. That is the whole reason it is a different
agent.

## Why a win can fail the gate

`--gate` refuses to pass a piece whose critic has **never once picked the reference**.

A critic that agrees every time is not judging, and its approval is worth exactly what the old
self-assessment was worth. So the ledger treats an unbroken winning streak as *unproven* rather
than as a pass, and says so in those words. It also refuses a verdict recorded without `--blind`,
a round naming no fetchable bar, and a win that names no remaining gap — because "nothing" is not
an answer a harsh critic gives.

## The bar

**Pet Simulator 99 (BIG Games)** for cartoony simulator UI — chosen as the hardest bar a critic can
genuinely fetch, and the lineage the owner's own reference screenshots come from. It was picked by
the agent rather than the owner, who was offered three and the run continued before he answered;
if he prefers Adopt Me or Blox Fruits the ledger is per-piece and re-runs cleanly.

A bar must be **named, fetchable and comparable**. "Award-winning Roblox UI" is none of those and
produces a critic that invents its comparison.

## The reference rule

Every UI the product can produce needs **five** references behind it, enforced by
`tests/ui-references.test.mjs`. Every asset the library offers needs **at least one**. Both are the
owner's rule, and the point of both is the same: a design answerable to something real beats a
design answerable to an agent's taste.
