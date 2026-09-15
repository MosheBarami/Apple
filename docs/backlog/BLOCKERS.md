# Blockers — what is stuck, why, and exactly how to clear it

Every entry names **who** can clear it. Nothing here is waiting on engineering time alone.

Sources: `docs/audit/APPLE-LEDGER.md` (24 P0 findings), `docs/backlog/FEATURES.json`
(8 blocked, 11 conflicting), and verification done in-session on 2026-09-14.

---

## A. Owner action — 15 minutes each, unblocks the most

### A1. Enable plugin distribution on the Creator Store
**Blocks:** the entire Studio half of the product. `STUDIO_PLUGIN_STORE_LIVE = false`
(`packages/shared/src/index.ts:869`), so both install buttons point at a docs page instead of an
installable asset. **No user can install the plugin today.**

**Fix:** Creator Dashboard → Development Items → the Golem plugin → Configure → Distribution →
*Distribute on Creator Store*. Then set `STUDIO_PLUGIN_STORE_LIVE = true` and redeploy.

**Approve by:** opening the store URL in a logged-out browser and installing it.

---

### A2. Republish the plugin from Studio
**Blocks:** every capability added since version 0.1.0 — including all 3D generation.

The checked-in artifact `apps/plugin/release/golem-plugin.rbxm` reports `VERSION = "0.1.0"` while
source is `0.2.0`, and contains **zero** occurrences of `GenerateModelAsync`. It predates the
generation feature entirely and has no asset-policy gate. Independently corroborated in-repo:
`apps/worker/src/tools.ts:1015` records "the plugin installed in the owner's Studio returns
render_view WITHOUT a `layout` field" — a field the current source has emitted for some time.

**Fix:** open the plugin in Studio and publish/update the asset. This cannot be automated:
Open Cloud cannot update a Plugin asset (asset type 38 is not a supported type, documented at
length in `.github/workflows/plugin-release.yml`).

**Approve by:** `strings` on the installed `.rbxm` showing `0.2.0` and a non-zero
`GenerateModelAsync` count.

---

### A3. Confirm the AI Gateway billing mode
**Blocks:** knowing whether the spend ceiling is platform-enforced or only enforced by our code.

`AI_GATEWAY_ID = "golem"` is set, but whether that gateway is **Standard** (uncapped overage) or
**Unified with prepaid credits** (a hard ceiling) exists only in the dashboard.

**Fix:** Cloudflare dashboard → AI → AI Gateway → `golem` → Billing. The repo's own research
prescribes Unified + prepaid credits + spend-limit rules + auto-top-up **OFF**.

**Approve by:** recording the answer in `docs/audit/APPLE-LEDGER.md` §3.4.

---

### A4. Add `Workers AI: Edit` to the Cloudflare API token
**Blocks:** uploading a trained LoRA adapter into hosted production.

The token is scoped to Workers Scripts / D1 / KV / Vectorize. `GET /accounts/{id}/ai/finetunes`
returns **403**; the Workers-Scripts / D1 / KV / Vectorize endpoints return 200. Verified in-session.

**Lower priority than it looks:** the provider survey found that **no free hosted provider will
serve a custom LoRA**, and Cloudflare accepts adapters only on `mistral`/`gemma`/`llama` bases
while ours is Qwen. Training, evaluation and local serving all proceed without this.

**Approve by:** the finetunes endpoint returning 200.

---

## B. Owner decision — these contradict a decision already made

Recorded rather than silently dropped. Each was requested in the feature list **and** conflicts
with the zero-recurring-cost decision of 2026-09-14.

| Requested | Conflict |
|---|---|
| Stripe, Pro / Team / Enterprise plans, usage-based billing, seat billing, GPU billing | All require recurring payment infrastructure. The repo has **no** payment integration, and the public site currently promises "$0 forever" and "No card required, ever." |
| Dedicated inference, inference autoscaling, multi-region deployment | Recurring spend by definition. |
| SOC2 readiness | An external audit costing five figures and months of process — not an engineering task. |

**To unblock:** say which of these you actually want. If billing returns, the site copy must change
before anyone is charged, and `PLAN_LIMITS.free` (60 Sparks/day per signup, no cap on signups) needs
a paywall behind it.

---

## C. Platform limits — cannot be fixed, only designed around

### C1. Native Studio viewport capture is impossible in-engine
Roblox gives plugins no viewport readback. There is no screenshot of what the user sees and no video
to stream. This was measured, not inferred.

The current `render_view` is a **depth-buffered triangle rasteriser written in Luau** that returns
pixels it computed itself — flat Lambert shading, one fixed sun, no shadows, no PointLights, no
post-effects, no characters, no particles.

**Your decision (2026-09-14): rasteriser only, drop the live-view claim.** Already satisfied — the
UI labels read *"Diagnostic render from Studio — geometry only, not a viewport"*. The only route to
real capture is a signed desktop companion with an OS screen-recording permission per machine.

### C2. Open Cloud cannot upload the assets we generate
`AssetService:CreateAssetAsync` appears nowhere in `apps/plugin/src` — only in a comment. Generated
geometry exists **only in the live edit DataModel** and is lost on save/publish. Worse, it cannot be
checkpointed: `Serializer.luau:23` saves only `MeshId`/`TextureID` for a MeshPart, and generated
output has an opaque Content with an empty `MeshId`, so a restore recreates an **empty** MeshPart.

**Two routes, and this is a design choice, not a credential:**
1. **Open Cloud upload** — needs a new credential you create, and uploads under *your* account.
2. **Studio-side `CreateAssetAsync`** — no new credential, uploads under the *user's* account.

Route 2 is likely right for a product, but it is a different design. **Blocks:** Text-to-3D
persistence, Asset import, Export Roblox asset, image→texture application.

---

## D. Engineering-only — no owner action needed

Listed so it is clear what is *not* waiting on you. These are mine to do.

| Item | Where |
|---|---|
| Asset library has no populated table | `search_asset_library` is advertised to the model **first** and always errors. Correctly refuses to fake an empty table. Needs real CC0 assets — which needs C2. |
| Checkpoint restore is not a faithful undo | `Serializer.luau` whitelists properties; Terrain is not snapshotted at all, and a restore reports `restored: true` even when property writes failed. |
| Visual evidence never reaches the browser | `render_view` returns an image-free summary; `inspect_visually` returns only `{text, score, passed}`. Pixels stay in server-side `ctx.lastRender`. The crash is fixed (`863a072`); the wiring is not. |
| Asset provenance lost between steps | `ctx.discoveredAssetIds` is rebuilt per step, so a search in step N and an insert in step N+1 degrades to `user_supplied`. |
| `ADMIN_KEY` can raise spend ~22× | `budget.ts:136-137` clamps at 2M neurons/day. Single static secret, exempt from user auth. |
| Rebrand to Apple | 322 files. Infrastructure identifiers (worker name, D1 name, KV ids, DO classes) must **not** be renamed. |
| Workspace RTL unverified | Logical properties landed (`2f63cd0`) and the auth screen verifies. The workspace is behind a login. |
| No probe compares the DEPLOYED database against the migrations | `G-SEC-1` runs `infra/supabase/tests/rls-isolation.mjs`, which applies `infra/supabase/migrations/*.sql` to a fresh Postgres and proves THOSE policies. Anything configured in the Supabase dashboard rather than in a migration is invisible to it, and a production database that has drifted from these files still lets the gate go green. `G-S1` probes the deployed ORIGIN for the site; there is no equivalent probe of the deployed DATABASE. The hole is dangerous precisely because G-SEC-1 looks like it covers it, and "tenant isolation is proven" is the sentence someone will quote from it. Raised by rbxai-04 on the day the gate was wired. |

---

## E. Ranked — what clearing each is actually worth

1. **A1 + A2 together.** Without them the Studio half is unreachable and the installed plugin
   predates its own features. Everything Roblox-shaped in the feature list sits behind these two.
2. **C2 route choice.** Unblocks 3D persistence, asset import, and image→texture — a large,
   currently-dead section of the list.
3. **B decision.** Decides whether ~36 billing items are scope or noise.
4. **A3.** Cheap, and converts an unknown into a known.
5. **A4.** Real but currently low-value, since no free host will serve our adapter anyway.
