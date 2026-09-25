# First source-linked model ingestion — 2026-09-25

The owner requested actual downloads and backend association from the asset sources in the goal.

- Source: [Poly Haven, Painted Wooden Bench](https://polyhaven.com/a/painted_wooden_bench). The source page and API report CC0, 630 triangles, and author Kirill Sannikov. The screenshot was reviewed: this is a worn wooden bench suitable for a City/Roleplay setting, not a bright simulator centerpiece.
- Download: `painted_wooden_bench_1k.gltf` plus its binary and three 1K JPG textures, all from `dl.polyhaven.org`. The API reported 1,989,639 source bytes. Every file's size and MD5 were checked before conversion. No executable was downloaded.
- Result: `packages/asset-library/models-store/polyhaven/polyhaven-painted_wooden_bench/Painted Wooden Bench.glb` (gitignored), 1,988,600 bytes, SHA-256 `01366dba8fbdea38c2945ba6eaf91486f268785d6e849913d1df579651df05ef`.
- `models/build.mjs` now indexes `polyhaven-painted_wooden_bench/Painted-Wooden-Bench` as a CC0 prop in City/Roleplay. The compact worker index grew from 9,092 to 9,093 rows. An exact lookup and a `painted wooden bench` search returned the row with 630 triangles and bounding dimensions 1.16 × 0.89 × 0.50.
- `models/upload.mjs --only-id ...` uploaded just this GLB to the private D1 static store. The live admin listing reported one row, three chunks and `model/gltf-binary`. A direct unauthenticated GET returned 403, so this upload did not make a public asset URL.

**Boundary still open:** the running agent currently filters to Creator Store model IDs, and its insert tool refuses downloaded files because inserting one requires a permanent Model upload into the customer's Roblox account. The file is stored and indexed, but has not been offered by Apple or inserted into a Roblox place. Next: a source-labelled preview and explicit choice that authorizes one selected file upload, then an end-to-end Studio check. Do not report this as a visual pass.
