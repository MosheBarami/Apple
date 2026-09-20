# The landing page's first evidence — 2026-09-21

The owner's standing instruction for the marketing site is **"do not make claims when we can
demonstrate them"**. Measured against the live origin at the start of this pass:

```
$ curl -sS https://apple.moshe-barami111.workers.dev/ | grep -o '<img' | wc -l
0
$ curl -sS https://apple.moshe-barami111.workers.dev/ | grep -o '<video' | wc -l
0
```

Every sentence on the front page was therefore a claim, including the load-bearing one — that Apple
changes nothing in your place until you allow it. That is the product's central safety promise and
it was set in the same typeface as everything else with nothing behind it.

## What shipped

A band directly under the hero, `apps/site/src/components/ConsentProof.astro`, titled **"The same
request, sent twice"**. It carries:

- **One screenshot**, cropped from `docs/evidence/lumen-isles-2026-09-19/independent-paired-edit-consent.png`
  to the plugin's own panel: the pairing line, the access line, and the control that turns edits
  off, docked inside a real Roblox Studio.
- **The control pair** from `docs/evidence/plugin-consent-verified-in-studio-2026-09-19.md`: one
  request sent twice over the same pairing, refused with consent off (`⊠ create_instances`,
  *"writes require explicit edit consent"*, *"Nothing was created."*), created with consent on, and
  the result read back out of **Studio's own Explorer** rather than out of the model's claim.
- **The record's own limitation**, on the page rather than only in the file: *"One refused op and
  one granted op is a control pair, not a capability sweep."*

Not one sentence in the band is written by the page. Every string lives in
`apps/site/src/data/consent-proof.ts` with the file it was quoted from — the two access lines and
the standing disclosure from the **shipped plugin's own source** (`apps/apple-plugin/src/init.server.luau`),
the transcript and the tree from the record.

## The finding that changed the plan

`docs/FINISH-REPORT.md:105` and the outstanding ledger both said to publish **all three** captures in
`docs/evidence/lumen-isles-2026-09-19/` as a before/after strip. Two of them — `r1-menu.png` and
`r1-journal.png` — show the Lumen Isles game running in Studio, and they are handsome.

**They were deliberately not published, and they must not be.** Lumen Isles is first-party
hand-authored source, not product output:

| source | what it says |
|---|---|
| `apps/experiences/lumen-isles/World.luau:2` | "an authored low-poly adventure, built from first-party geometry only" |
| `apps/experiences/lumen-isles/package.json` | "the first-party experience built for local visual review" |
| `scripts/build-lumen-isles.mjs:1` | "Builds the exact first-party experience for local visual review" |

Four hand-written Luau files compiled into a place. Apple did not produce it from a prompt. A game
screenshot on a marketing page is read as the thing the product makes, and no caption a visitor will
actually read can undo that. `docs/evidence/customer-review-2026-09-19-round3.md:311` already caught
the Studio lane upgrading its own evidence class once; this would have been the same move on the
front page, where it is worth more.

The third capture is about the **product** rather than about a game, so that is the one that ships.

## Guards, and every one of them watched failing

`apps/site/tests/proof-is-evidence.test.mjs` — 8 tests. Aimed mutations, each run against a frozen
baseline captured once up front, each file re-hashed after every case:

| mutation | result |
|---|---|
| drop three rows from the flattened quote list | RED — vacuity tripwire |
| change one word of the plugin's disclosure | RED — quote not in the file it names |
| re-point a panel quote from the plugin to the prose record | RED — two-source split |
| inline a quote as a literal in the markup | RED — no quoted sentence is typed |
| delete one rendered quote from the band | RED — a quote no reader sees |
| flip one hex character of the capture's `sha256` | RED — pin no longer matches |
| add an undeclared `<img src="/assets/stock-hero.png">` | RED — undeclared image |
| move `captured` to a different day | RED — caption/record drift |

`apps/site/tests/asset-wall.test.mjs` — the blanket `<img>` ban was **re-aimed, not deleted**. It
was the right shape for a page with nothing honest to show; the property was never "no images" but
"no image a reader would take for a result nothing can answer for". It also now reads the
components the landing renders, because the old assertion looked only at `index.astro` and the
picture would have passed it untouched simply by living one file over.

| mutation | result |
|---|---|
| `<img>` directly in `index.astro` | RED |
| hard-coded `src` in a landing component | RED |
| remote `src="https://cdn.example.com/…"` | RED |
| break every `../components/` path so the scan reads nothing | RED — vacuity tripwire |
| any `http(s)://` in `index.astro` | RED |
| change one import's quote style | **stayed green, correctly** — the path scan still finds it |

`scripts/check-landing-budget.mjs` — two new branches, falsified against a scratch copy of the
build: an image the build does not contain prints `::error::… not in the build` and exits 1;
swapping the capture for `/og.png` reports 276,848 B against the 40,000 B image budget and exits 1.

**Every file was byte-identical to its frozen baseline after every case.**

### An instrument failure caught in the middle of this

The first falsification script re-read its baseline from disk at the start of each case. One restore
silently failed, the next case adopted the corrupted file as its own baseline, and the script
printed `restore=byte-identical` **eight times over a leaked mutation**. It was caught by grepping
the file rather than believing the script, and the second script freezes its baselines once and
aborts on the first failure. A restore check that re-baselines cannot detect a failed restore.

## Deployed and verified against the live origin

`node infra/deploy-static.mjs --only site`, built from a clean `git archive` of the committed tree
rather than from the shared working checkout, because other lanes had in-flight edits in
`index.astro` and `landing.css` at the time.

```
$ curl -sS https://apple.moshe-barami111.workers.dev/ | grep -o '<img' | wc -l
1
$ curl -sS -o live.webp https://apple.moshe-barami111.workers.dev/assets/proof/apple-consent-panel-947fad5391.webp
HTTP=200 BYTES=11648   content-type: image/webp   cache-control: public, max-age=31536000, immutable
$ shasum -a 256 live.webp
947fad5391de337af026191b8e81167ee51e58b5af755a51877cd5ceef562af8   ← identical to the committed file
```

Rendered in a browser against the live origin, not against `dist`: the band is `opacity: 1` with
`is-in` applied (the reveal fired), the image is `complete` at its natural 318×400, and at 375px the
document has **no horizontal scroll** (`scrollWidth 375 === clientWidth 375`), the image sits at
`left: 17` and the Explorer block does not overflow its box. Checked in both themes.

## Gates that are RED, and whose they are

- **`scripts/check-landing-budget.mjs` — RED, and was red before this lane touched anything.**
  `BUDGET_GZIP_BYTES` is 12,000 with a comment recording 4,662 when it was set. Measured: **21,042 B
  gzip at the commit before this band, 22,001 B after it** — over by 9,042 B already, of which this
  band is 959 B. Deliberately not raised: raising a failing number to meet the page is how a gate
  becomes a decoration. It rose again to 25,309 B once the capability-demos lane landed.
- **`scripts/check-proof-figures.mjs` — RED, not from this lane.** It reports a typed `10` on the
  landing, which is the `/10` in the capability-critique demo. The band contributes no typed digit;
  its date is rendered from `consent-proof.ts` for exactly this reason.
- **`apps/site/tests/flow-field-runs.test.mjs` — 8 tests RED at HEAD, not from this lane.**
  `apps/site/src/components/FlowField.astro:48` carries `const canvas: HTMLCanvasElement = el;`, and
  the test evaluates the extracted script with `vm.runInContext`, where a TypeScript annotation is a
  `SyntaxError`. Both files are byte-identical to HEAD. `docs/FINISH-REPORT.md` already lists
  FlowField as orphaned and awaiting a WIRE-or-DELETE decision; this is a second reason to take it.

## Not verified

- **That the panel in the capture is the build that ships today.** The capture is dated 2026-09-19
  and the page says so. The plugin's wording is pinned to `init.server.luau` by the guard, which is
  the part that can drift; the pixels are dated rather than claimed to be current.
- **Anything about the run beyond the one refused and one granted operation.** That is the record's
  own limitation and it is printed on the page.
- **`check-rebrand` against the committed state in isolation.** It needs `git ls-files` and cannot
  run inside a `git archive` export. Run in the repo it reports `REBRAND COMPLETE IN SOURCE` while
  warning that 1 tracked file differs from HEAD — that file is `apps/worker/src/do/session.ts`,
  another lane's, and none of this lane's files differ from HEAD.
- **Whether a visitor finds the band persuasive.** That is the owner's line to write, not this one's.
