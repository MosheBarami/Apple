# Roblox

| Piece | Where |
|---|---|
| The plugin that ships | `apps/apple-plugin` (Luau, built with Rojo): `node apps/apple-plugin/scripts/build.mjs` builds, it does not publish |
| Release runbook | `docs/operations/PLUGIN-RELEASE.md` |
| Creator Store asset | "Apple Studio", id `107230158271368`. The old asset `132128477945417` ("Golem") was removed by Roblox: never publish to it |
| Release workflow | `.github/workflows/plugin-release.yml` (manual dispatch; it builds and verifies, then stops at the human publish step) |
| Legacy plugin | `apps/plugin`: not the product, never shipped, kept only as test fixtures |
| Open Cloud | worker secret `ROBLOX_API_KEY`; optional `ROBLOX_CREATOR_USER_ID`, `ROBLOX_CREATOR_GROUP_ID` (`apps/worker/src/env.ts`) |
| Studio-side proofs | `apps/apple-plugin/proof/` (artifact hashes in `ARTIFACTS.md`) |

The `.ROBLOSECURITY` cookie must never reach CI or the repository; `scripts/secret-scan.py` has a rule for it.
