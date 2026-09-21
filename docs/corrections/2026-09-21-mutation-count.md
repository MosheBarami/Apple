# Correction: commit 6e37c95 says twelve mutations and lists fifteen

Written 2026-09-21. Commit messages are not amended here, so the correction is a file.

`6e37c95` closes with:

> Twelve aimed mutations, twelve RED, each restored byte-identical: three on gitBlobSha1 (plain
> sha1, no length in the header, utf8 string truncation at NUL), four on the ledger
> (integrity_failures > 0, a dropped licence tier, more fetched than the tree held, missing blob
> accounting), and five on the card and ledger (deleted currency row, "an UPPER BOUND" softened,
> "CANDIDATES" softened, a typed currency figure, a deleted re-aimed bullet, a removed repository
> row, a duplicated repository row, a currency report describing a smaller corpus).

**The third clause says five and names eight.** 3 + 4 + 8 = **15**, not 12.

The count is the only thing wrong. Every mutation named happened, every one went RED, and every
file was restored byte-identical — the harness compares a sha256 of the file before and after and
refuses to call a run good unless the restore matches and unless `pass + fail >= 1`, so a suite
that silently ran nothing cannot be reported as green.

The eight in the third clause, split by the file they mutate:

| mutation | file mutated |
| --- | --- |
| deleted `luau_currency` row | `dataset-card.json` |
| "an UPPER BOUND" → "a measurement" | `dataset-card.json` |
| "current-Luau CANDIDATES" → "current-Luau rows" | `dataset-card.json` |
| 730 → 731 typed beside the report | `dataset-card.json` |
| deleted the re-aimed "current Luau" bullet | `dataset-card.json` |
| removed a repository row | `repos.jsonl` |
| duplicated a repository row | `repos.jsonl` |
| currency report describing 27,671 rows | `luau-currency-github-v1.json` |

Two of those eight — the deleted currency row and the deleted bullet — failed their first setup
because the anchor string was rebuilt with `json.dumps` and did not match the file's own
formatting. The harness printed `SETUP FAIL`, not `RED` and not `GREEN`, which is the behaviour
that matters: an anchor that is not present means the mutation never happened, and a harness that
scored that as a pass would be certifying a guard it never tested. Both were re-run against the
exact line read out of the file and both went RED.

**Round total: 37 aimed mutations, 37 RED, 0 survived, every file restored byte-identical.**

| commit | mutations |
| --- | ---: |
| `901fb69` licence matcher | 5 |
| `acbdad4` off-topic probe | 8 |
| `5a50000` failure coverage | 4 |
| `6e37c95` blob acquisition, ledger and card | 15 |
| `655b7ab` disposition ladder | 5 |
| **total** | **37** |

This repository already carries `8e37a7a` — *"124 was added by hand and the six figures beside it
sum to 123"*. A hand-written total beside a list that does not sum to it is the same defect, and
this one was in a paragraph whose whole subject is checking that things are what they claim to be.
