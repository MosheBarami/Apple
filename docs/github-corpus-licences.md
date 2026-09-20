# The 4,269 repositories, opened

Measured 2026-09-20 by `packages/training/src/probe-github-leads.mjs`. Artifact:
`packages/training/discovery/v2/github-probed.jsonl`.

## What was blocked

`discovery/v2/github.jsonl` holds 4,851 rows. 577 had been opened. The other **4,269 carried
`license_class: "unverified_no_file_read"`** — seen in a GitHub search result and never looked at.
A lead with an unknown licence cannot enter a training corpus, so four fifths of the discovery was
unusable, and had been for 21 days: `gh auth status` failed on this machine, and unauthenticated
GitHub allows 60 requests an hour against a job needing thousands.

The owner supplied a token. The licence comes back on the repository object, so this is one request
per repo: 4,269 against a 5,000/hour ceiling. **4,229 probed this run, 0 errors, 0 not-found.**

## Licence, all 4,269

| class | count |
| --- | ---: |
| permissive (OSI) | 2,046 |
| no licence declared | 2,060 |
| copyleft (strong) | 153 |
| custom, needs a read | 10 |

`none_declared` is the single largest group. A repository with no LICENSE file grants nothing, so
those are rejected rather than treated as public-domain.

## The number that matters, and the one that would have been quoted

By licence alone there are **1,986 admit candidates**. That number is misleading and should not be
used, because the original search sweep pulled in repositories that have nothing to do with Roblox.
The largest by stars are `sindresorhus/awesome` (508k), `public-apis/public-apis` (481k),
`fffaraz/awesome-cpp` and `rust-unofficial/awesome-rust`. Training on that is training on
awesome-lists.

Filtering to repositories whose primary language is Lua or Luau, **or** whose path names
roblox/rbx/luau:

| | count |
| --- | ---: |
| admit candidates by licence | 1,986 |
| …of which Lua or Luau | 1,017 |
| …of which named roblox/rbx/luau | 280 |
| **relevant (union)** | **1,063** |
| irrelevant, licence-clean but off-topic | 923 |

**1,063 licence-verified, Roblox-relevant repositories. 5.45 GB.** The largest are `luau-lang/lute`,
`Roblox/Sentinel`, `daily3014/rbx-cryptography`, `boatbomber/Highlighter`.

## What this is not

- **Not a legal opinion.** `license_class` records GitHub's own detection from the LICENSE file.
  `NOASSERTION` and a missing licence are written as exactly that rather than rounded up.
- **Not a file count.** The leads were never tree-read, so `luau_lua_file_count` is 0 across all of
  them and the 5.45 GB is repository size, not Luau. Counting the Luau needs a second pass — one
  tree request per repo, another 1,063 requests — and has not been done.
- **Not admission.** Whether a repository enters a corpus is a separate decision made against these
  values. Nothing here flips `training_approved`.
