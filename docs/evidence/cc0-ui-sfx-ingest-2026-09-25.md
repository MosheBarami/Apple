# Two non-Kenney UI sound packs ingested — 2026-09-25

The owner asked for actual downloads and backend association across UI, maps, SFX, VFX,
animations and models. This is one verified SFX intake, not a claim that the whole request is done.

| Source | Licence stated on source page | Archive | SHA-256 | Individual sounds |
|---|---|---:|---|---:|
| [Joth, 7 Assorted Sound Effects](https://opengameart.org/content/7-assorted-sound-effects-menu-level-up) | CC0 | `UISoundEffects.zip`, 627,912 bytes | `a04c6ea7d7b378949733365410b5141ca7fcfc4ee270be322773d8d69911012d` | 7 (preview medley excluded) |
| [m1chiboi, UI Soundpack](https://opengameart.org/content/ui-soundpack-by-m1chiboi-bleeps-and-clicks) | CC0 | `ui-soundpack.zip`, 1,625,000 bytes | `db253e6a37779d21f96ba42b78a5b0335c43ee1f0d36c67f46b3afb2aec2344e` | 28 |

`sfx/ingest-cc0-ui-sfx.py` verifies archive size and SHA, extracts audio only with a
per-file size cap, checks WAV/MP3 headers and duration, and writes one provenance row per sound.
The 35 extracted files total 2,302,929 bytes, remain in gitignored `sfx-store/`, and have exact
SHA-256 hashes in `sfx/sources/opengameart-cc0-ui.jsonl`. The generated SFX manifest grew from
139,919 to 139,954 rows; its `opengameart` source count grew from 760 to 795.

`sfx/upload-cc0-ui.mjs` sent those 35 verified audio files to the private D1 static store at
`/private-library/sfx/opengameart/...`. The authenticated live listing confirmed all 35 paths.
No file was uploaded to a Roblox account, and these rows are `store-only` in the manifest.

**Integration still open:** the worker's playable SFX index only contains Roblox audio asset IDs;
these 35 downloaded files are in the backend but cannot yet be played in a Roblox experience.
An owner-approved, quota-aware audio publishing path or a matching Roblox-licensed asset ID is
needed before Apple can choose and insert them into a customer's game.
