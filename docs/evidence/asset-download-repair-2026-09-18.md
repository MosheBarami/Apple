# Live library metadata repair — 2026-09-18

## Observed, not inferred

- Production D1 `golem-corpus`, UUID `32c9471e-a7d7-49ee-a8fe-0a7def2c68bd`, contained
  **511,208** catalogue rows: 81,648 Creator Store rows with Roblox IDs, and 429,560 pending
  entries. No `download_url` column existed before this repair. These are inventory counts,
  not proof of availability or good-looking Studio results.
- All 81,648 recorded Roblox IDs had NULL `last_health_check`. The default `health_ok = 1`
  must not be presented as a completed health check.
- The expanded OpenGameArt file contains 7,058 rows but only 6,960 distinct IDs. 58 IDs collide
  across 156 rows, including different download files sharing the same ID. They were excluded
  entirely; choosing the first file would silently misidentify the asset.
- Another 67 unique rows failed the existing canonical provenance validator: 49 malformed IDs,
  18 invalid tag slugs. Their URLs were not repaired or silently normalized.

## Live changes and safety boundary

The existing authenticated ingestion route was invoked with an empty `assets` array. It returned
`received: 0, written: 0, rejected: [], truncated: false`; the existing compatibility migration
added `download_url`. A fresh schema query then verified the column.

`scripts/backfill-asset-downloads.mjs --apply` completed 69 bounded sequential API batches.
Exactly **6,835** existing, unambiguous pending rows received their missing direct URL.
Updates used bound parameters and required matching ID, source, source URL, name, kind, author,
licence, licence URL, and licence flags at write time. Existing URLs, imported IDs, imported
timestamps, hashes and non-pending rows were fenced out. No row was inserted or deleted.

Read-back compared **every column of all 12,027 OpenGameArt rows** against the pre-write snapshot:
6,835 URLs changed as planned; 5,192 rows were unchanged; no other column changed. Independent
Cloudflare connector queries confirmed 6,835 non-null URLs, zero Roblox IDs among those rows,
all still pending, and the ambiguous `opengameart/16x16-africa/africa` still has a NULL URL.

No Roblox upload/import route, model generation, training, worker deployment or static deployment
was performed. This is a metadata repair, not an end-to-end insertion claim.

## Boundary checks

- Actual importer `pendingAssetsRaw` mapping and `resolveDownload` executed locally against the
  actual before/after database snapshots for two sample IDs. Before: explicit pack refusal.
  After: exact per-file PNG URL. The D1 transport was doubled for this local execution;
  the production import endpoint was deliberately not called because it uploads assets.
- HEAD, no redirects: both URLs returned HTTP 200 and `image/png`, sizes 9,501 and 838 bytes.
  No image bytes were downloaded or uploaded.
- Source pages identify their authors, CC0 and linked files:
  [100 Smiley Faces](https://opengameart.org/content/100-smiley-faces),
  [10 Spaceships](https://opengameart.org/content/10-spaceships).
  This two-page spot-check is not a new rights audit of all 6,835 files.
- `/api/health` returned HTTP 200, `ok: true`, build `6d7a5be-dirty` during the repair.
- Focused ingest/import/backfill suite: **21/21 passed**. New executed SQLite tests cover
  idempotence, provenance/lifecycle drift, SQL injection strings, duplicate rejection,
  non-download mutation detection, and a semantic mutant removing the imported-ID fence.
- `git diff --check` passed. No credentials were printed or stored in evidence.

Runtime snapshots, report, compiled importer and resolver proof:
`/var/folders/hw/0ybpmzsn323dbcc3cgjwrb700000gn/T/apple-asset-download-repair-8is79B/`.
Focused log: `/tmp/apple-asset-repair-tests.log`.

The broader root suite found the previously added local pilot scorer was not declared as a CLI
entry in the training package. Root added the real `score-local-pilot` package script, rather
than hiding the scanner finding. The scorer/dead-end suites then passed **18/18** and the
disposition gate passed. The original broad run was still running its slow local pixel checks
at this checkpoint and includes the pre-fix failure; it is not reported as fully green.
Logs: `/tmp/apple-asset-adjacent-checks.log`, `/tmp/apple-assets-root-suite.log`.

## Still open

The 58 colliding IDs need an explicit identity migration, not guessed file selection. The 67
invalid records remain rejected. Existing Creator Store IDs need real health/permission checks.
Neither actual licensed Studio insertion nor asset visual quality was verified. `w21` remains
open. Broader product readiness, plugin distribution, model quality and real UI proof remain open.

No new training/serving expense; ledger allocation stays $0.06 of the $20 total cap, $19.94
unallocated (allocation is not an invoice-reconciled charge). Codex snapshot: 88% weekly used.
Fresh checklist recomputation: 59.3% weighted repository coverage, not a product-readiness score.
