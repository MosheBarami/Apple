# Real-Studio missions, 2026-09-22 22:23 → 2026-09-23 00:08 IDT

Production project `81b7c2f8-cb7d-45e6-875a-b4cfa883182d` ("Acceptance 22 Sep (disposable)"), owner account,
signed in through the owner's Chrome. Disposable place `~/Documents/Apple-Acceptance-2026-09-22.rbxl` in real
Roblox Studio 0.739 with the local Apple Studio build. Every figure below was read back from the production
API (`/api/projects/:id/messages`, `/api/admin/logs`, `/api/admin/session-info`), the Studio log, or the saved
place parsed with lune (`roblox.deserializePlace`) — not from the product's own claims.

| Run | Request | Outcome | Steps | Credits | What was measured |
|---|---|---|---|---|---|
| 76b59615 | coin game from baseplate | done | 52 | 195 | 8 coins + CoinService; playtest never ran; 55 groups dropped → run record (F-023) |
| fad0ab1b | playtest it, fix what's broken | done | 37 | 123 | playtest started, never stopped (F-020); "[CoinService] managing 0 coins" |
| 604bfd32 | playtest only (plugin 56ec… 1st try) | done | 21 | — | stop refused again → IsEdit true under Run() found |
| 5316f52b | playtest only, "do not change anything" | done | 12 | 35 | two playtests started AND stopped; wrote a RemoteEvent anyway (F-022) |
| 3bcf3f57 | why don't the coins work, don't change | incomplete | 32 | 0 (refunded 99) | no writes (F-022 fix held); no diagnosis (F-028) |
| a95f86fa | fix the coins, then playtest | done | 54 | 167 | still cannot score: `model.Transparency`, leaderstats in a dead script (F-029) |
| d1a97c0d | hill + pond + warm sunset | done | 152 | 450 | 149 single-op terrain calls; plugin session ended at 256 ops (F-032, F-034) |
| 1fe40a80 | same, after batching + replay fix | done | 30 | 105 | one batched terrain call; set_mood collided with Atmosphere (F-035) |
| c6251600 | too foggy → clear golden hour | done | 101 | ~262 | look right (Atmosphere Density 0, lamp/coins/hill visible); cost wrong (F-036) |

Deploys in this window, each verified by `infra/deploy-worker.mjs` reading `/api/health` back:
30d97330, 79704b0f, 863a30f9, 200134b0, 3f353ba2, 5a617e92, and the set_mood fix (buildSha a249574-dirty).
Site: `infra/deploy-static.mjs --only site`, 79 files, "every page serves the bytes just uploaded"; production
measured in Chrome: 0 canvas, --accent #5b7cfa, 0 elements in the old green, no horizontal scroll.

Studio readback of the final place (lune, saved 00:06:36): Workspace = Camera, Baseplate, Terrain (10,068 bytes
of voxels), SpawnLocation, StreetLamp, Coin1–Coin8; Lighting = the user's Sky/SunRays/Atmosphere(Density 0)/
Bloom/DepthOfField plus the golden mood's Bloom/ColorCorrection/SunRays, one Atmosphere.

Sentry (moshe-s6), last 6 h at 23:23 IDT: one new issue, APPLE-WEB-3, on the local mock route `p-lobby` from the
web lane's in-progress composer work — not production.
