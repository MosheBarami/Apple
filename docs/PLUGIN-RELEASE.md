# Releasing the Studio plugin

**The plugin that ships is `apps/apple-plugin`.** It is published on the Creator Store as
**"Apple Studio", asset `107230158271368`**, under the user account Shahar474. Its artifact is
`apps/apple-plugin/release/apple-studio.rbxm`, built by `node apps/apple-plugin/scripts/build.mjs`.

`apps/plugin` is the legacy build. It is **test fixtures only**: nothing builds it into an artifact,
nothing submits it, and its tracked `release/apple-plugin.rbxm` is a stale historical file — see
`apps/plugin/README.md` for why the directory stays. The asset built from it, **`132128477945417`
("Apple"), is retired and removed. Never publish to it.**

Everything below the line marked **HUMAN** is done by a person, in a browser and in Roblox Studio,
signed into the owner's account. No agent performs any of it. Nothing in this repository uploads to
Roblox, and nothing should be made to.

First written 2026-09-19; release path retargeted and re-measured 2026-09-22. Every figure here was
produced by the command beside it.

---

## 0. The state today, measured

Run 2026-09-22 18:22:25Z, each id beside controls:

```
$ for id in 107230158271368 132128477945417 6415005344 4725618216 99999999999999999; do
    curl -s -o /dev/null -w "$id %{http_code}\n" \
      "https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=$id"; done
107230158271368 200    # Apple Studio — ours
132128477945417 404    # Golem — the retired legacy asset
6415005344 200         # Rojo 7 — listed control
4725618216 200         # Moon Animator 2 — listed control
99999999999999999 404  # an id that cannot exist
```

The 200 for ours carries `name "Apple Studio"`, `typeId 38`, `scriptCount 5`,
`isAssetHashApproved true`, `visibilityStatus 1`, `createdUtc = updatedUtc = 2026-09-19T18:13Z`,
creator Shahar474 (5541122967), and `fiatProduct` published, purchasable and free. It has no
`categoryPath`, which both listed controls have; what that means is not known.

So **the listing is distributed**, and `STUDIO_PLUGIN_STORE_LIVE` in `packages/shared/src/index.ts`
is `true` (flipped 2026-09-22 ~21:03 IDT on this probe, the signed-out store page showing
"Get Plugin", Creator Store search returning this id, and the owner reporting the plugin approved —
the reasoning is in the comment above the constant). `STUDIO_PLUGIN_STORE_REFUSAL` is `null`. If
the probe ever answers 404 again, flip the flag back: every install affordance follows it.

History, not state: the 2026-09-19 upload of this asset was removed the same day for *"Misusing
Roblox Systems"* and an appeal was sent; the earlier `apps/plugin` asset was removed for the same
reason. Neither trigger was ever identified. What is certain is that `apps/plugin/src/Ops.luau:521`
compiles text received over HTTP into a `ModuleScript` and `require`s it, the Creator Store asset
requirements prohibit that, and `apps/apple-plugin` refuses it by name. Avoiding the prohibited
pattern is not the same as approval, and this document never treats it as such.

### What the store serves is not what the source is

| | Creator Store build | This source (`apps/apple-plugin/src`) |
| --- | --- | --- |
| version | **1.0.0**, inferred: both commits of `Bridge.luau` (`eac3f01`, `dc5a41b`) declare it and the 09-19 tree had these 5 scripts; the published bytes were never read | **1.1.0** (`PLUGIN_VERSION`, `src/Bridge.luau`) |
| uploaded | 2026-09-19T18:13Z, never updated since | unpublished |
| scripts | 5 (toolbox-service `scriptCount`) | 6 — adds `StudioCapture` |
| capabilities | predates native capture; very likely still refuses `run_mode` and `inspect_model` (the 09-19 evidence lists them refused) — **inferred, the published bytes were never inspected** | refuses only `run_code`; adds native viewport capture, Run-mode control and model inspection |

The source is 1.1.0 precisely so the two can be told apart: a working-tree build that reported
1.0.0 would look like the store build and behave differently. The worker adapts to whichever build
connects — each plugin sends a capability report on pairing and the worker withholds the tools it
does not support — so a store user on 1.0.0 is offered 1.0.0's tools. **Copy is not adaptive**:
anything the site or app promises about Run mode or capture is a promise the store build may not
keep until 1.1.0 is published.

`LATEST_PLUGIN_VERSION` in `apps/worker/src/plugin-version.ts` is `'1.0.0'`: it drives the
"Apple X is available — Manage Plugins → Update" notice, so it must name what the store serves.
`packages/evals/src/plugin-version.test.mjs` requires it never to be ahead of `PLUGIN_VERSION`.

### What a reviewer can check, and what it costs a user

Every operation in the shared `StudioOp` union has a handler or a named refusal in
`apps/apple-plugin/src/Commands.luau`; `tests/protocol-coverage.test.mjs` fails if one falls through
as unknown. In this source exactly one operation is refused: **`run_code`** — received text is
never compiled or required inside Studio.

The plugin declares its refusals in the capability report, the worker parses them
(`apps/worker/src/plugin-capabilities.ts`), withholds every dependent tool, and tells the model not
to claim a withheld operation ran. For this source the withheld set is exactly **`run_luau`** and
**`run_spec`**, asserted as a tripwire (`WITHHELD_BY_DESIGN` in
`apps/apple-plugin/tests/worker-capability-contract.test.mjs`) that a human reviews rather than
bumps.

The visual gate — `render_view`, `compose_thumbnail`, `inspect_visually` and the automatic critique
in `SessionDO` — stands on `render_view`, which `apps/apple-plugin/src/Render.luau` provides: the
rasteriser ported from `apps/plugin/src/Render.luau` and held to it by the original specs
(`apps/apple-plugin/tests/render-parity.test.mjs`). If that module is ever dropped from the bundle,
the capability report says so, the tools are withheld, and the run ends with *"Rendered appearance
was not verified: the connected Studio does not provide the required visual inspection
operation."* A withheld check must always read as a check that did not run — never as a pass.

---

## 1. Build and verify the artifact

```sh
cd /Users/moshe/Desktop/RbxAI
export PATH="$HOME/.rokit/bin:$PATH"                 # rojo, luau, luau-analyze
node --test apps/apple-plugin/tests/*.test.mjs       # 41 on 2026-09-22
node apps/apple-plugin/scripts/syntax-check.mjs      # parse gate (also `pnpm -r typecheck`)
node --test packages/evals/src/plugin-version.test.mjs
node apps/apple-plugin/scripts/build.mjs
```

`build.mjs` parses every source with `luau-analyze`, refuses a `require` of a module that is not
bundled, runs `rojo build apps/apple-plugin/default.project.json`, hands the artifact to
`scripts/inspect-plugin-build.py` (which decompresses every chunk before scanning), and ends with
`apps/apple-plugin/scripts/verify-artifact.py` over the built bytes. It must print:

```
RESULT: clean — no credentials, private hosts or developer paths in the build
...
RESULT: the shipped bytes carry the capabilities this source claims
```

A refusal to certify is a failure, not a pass. If it cannot read a chunk, stop.

**CI runs the same command.** Since 2026-09-22 the `plugin` job in `.github/workflows/ci.yml`
installs Luau and Rojo, runs `node apps/apple-plugin/scripts/build.mjs` on every push and PR, and
uploads the result as `apple-studio-pr-unverified` — a build check, never a release.
`.github/workflows/plugin-release.yml` (workflow_dispatch only) reads the version from
`src/Bridge.luau`, checks its asset id against `STUDIO_PLUGIN_ASSET_ID`, runs the plugin's tests and
the worker contract, builds with `build.mjs`, re-inspects with `--expect-version`, and uploads
`apple-studio-<version>` with a manifest. The "known gap" this section used to carry — the release
workflow building `apps/plugin` — is closed.

### The check that has been skipped before, and must not be again

The source having a capability and **the shipped binary** having it are two different claims. The
legacy artifact sat at `VERSION = "0.1.0"` with **zero** occurrences of `GenerateModelAsync` while
its source was `0.2.0` and had generation — and every test was green, because every test read the
source. `build.mjs` now ends by reading the binary. Measured 2026-09-22 21:19 IDT:

```
$ node apps/apple-plugin/scripts/build.mjs
...
RESULT: clean — no credentials, private hosts or developer paths in the build
version:   1.1.0 (protocol 1) confirmed inside the artifact
  present  rasterTri  x3
  present  Render.capture  x1
  present  StudioCaptureService  x7
  present  StudioCaptureScreenshotFormat  x2
  present  run_mode.action must be start  x1
  present  inspect_model target must be a Model or BasePart  x1
  present  project census exceeds the  x1
  present  GenerateModelAsync  x7
  present  apple.studio-ops.v1  x1
  present  /api/studio/poll  x1
  present  LuaSourceContainer  x4
  present  Apple inserts geometry, not code  x1
  present  edit_consent  x3

RESULT: the shipped bytes carry the capabilities this source claims
```

That build: `apple-studio.rbxm`, 120,575 bytes, sha256
`fcf5684216ab90a50194dbf2fa2b896a8a32a455adf233eeba83f581051c600a`, six scripts each byte-identical
to the working tree at that minute. The tree was uncommitted, so no commit reproduces it; it is
recorded in `apps/apple-plugin/proof/ARTIFACTS.md` and it is **not** the store build.

`.rbxm` payloads are LZ4-block compressed — on that build 5,616 of 5,671 strings (99%) are **not**
byte-present in the raw file — so this decompresses every chunk rather than grepping, and a chunk it
cannot decode is a failure rather than a pass.

`PLUGIN_VERSION` and `PLUGIN_PROTOCOL` come from `apps/apple-plugin/src/Bridge.luau` — `"1.1.0"` and
`"1"` today. The protocol must equal `CURRENT_PLUGIN_PROTOCOL` in `apps/worker/src/plugin-version.ts`
(`1`), and `init.server.luau` repeats the version in its state event and its dock label;
`packages/evals/src/plugin-version.test.mjs` fails if any copy disagrees.

**Run this against the artifact you actually publish**, not against a rebuild afterwards.

---

## 2. HUMAN — publish an update to the asset

Nothing here can be automated. Open Cloud cannot update a Plugin asset: asset type 38 is not in the
supported list, and content updates exist only for Models. `PATCH develop.roblox.com/v1/plugins/{id}`
accepts name, description and comments only, and authenticates with a `.ROBLOSECURITY` cookie —
shipping a session cookie to CI to edit a description trades the account for nothing. Do not.
The reasoning is written out at length in `.github/workflows/plugin-release.yml`.

1. Build and verify (§1), or take the `apple-studio-<version>` artifact from `plugin-release.yml`,
   and record its sha256.
2. Smoke-test it locally: put `apple-studio.rbxm` in the local Plugins folder, restart Studio, pair,
   allow edits, run one build. Remove the local file afterwards so Studio does not load it beside
   the store copy.
3. Open Roblox Studio signed in as **Shahar474**, the account that owns the asset. Keep it under a
   **user** account, never a group: group-owned plugin overwrite is a known-broken path
   (DevForum 587851).
4. Drag `apps/apple-plugin/release/apple-studio.rbxm` into `Explorer`, right-click it →
   **Publish as Plugin** → **Overwrite an existing asset** → **Apple Studio (107230158271368)**.
   Not a new asset: every install link, the probe and `STUDIO_PLUGIN_ASSET_ID` name this id. Never
   `132128477945417`.
5. The listing description must not claim Roblox endorsement or affiliation.

---

## 3. HUMAN — confirm it is still distributed

Creator Dashboard → **Development Items** → Apple Studio → **Configure** → **Distribution**. After
the 09-19 removal the "Distribute on Creator Store" checkbox read checked **and disabled**; a
publish can change the listing's state, so look rather than assume.

---

## 4. Prove it, before changing a single line of copy or the worker

```sh
curl -s -w '\n%{http_code}\n' \
  "https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=107230158271368"
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=6415005344"   # Rojo, control
```

**200 means listed. 404 means not.** Run the control in the same minute, so a 404 from a Roblox
outage cannot be read as "not listed" and a 200 from a cached edge cannot be read as success.
Then read **`updatedUtc`** and **`scriptCount`** in the first response: an update that has not
landed still answers 200 with the old values (1.0.0 is `2026-09-19T18:13Z` and 5 scripts; a 1.1.0
build has 6).

Do not substitute another endpoint. `economy.roblox.com` and `develop.roblox.com/v1/plugins` both
return 200 for an **unlisted** asset, `assetdelivery` returns 401 unauthenticated even for a listed
plugin, and the store page returns the same 200 shell for every id — three plausible probes, all
wrong. See the comments on `STUDIO_PLUGIN_LIVENESS_PROBE_URL` in `packages/shared/src/index.ts`.

Then do the thing the probe cannot do: **open the store URL in a logged-out browser on a different
machine, get the plugin, and install it.** A 200 is the necessary condition; a stranger getting the
plugin into their Studio is the product. As of 2026-09-22 this had not been done by anyone other
than the owner.

---

## 5. After the store serves the new build

1. Set `LATEST_PLUGIN_VERSION` in `apps/worker/src/plugin-version.ts` to the version now served —
   **only now**, not when the source changed. Clients on the older build are then told
   *"Apple <version> is available. Update it in Studio → Plugins → Manage Plugins → Update."*
   Announcing a version nobody can install is worse than saying nothing.
2. `node --test packages/evals/src/plugin-version.test.mjs` — it reads `PLUGIN_VERSION` from
   `apps/apple-plugin/src/Bridge.luau` (not the legacy `Version.luau`, as it did until 2026-09-22)
   and fails if the worker announces a version the source does not have.
3. Update the table in §0 and the store row in `apps/apple-plugin/proof/ARTIFACTS.md` with the
   published sha256.
4. Deploy, and check the bytes rather than the build:

```sh
node infra/deploy-static.mjs     # site + app into the D1 static store
cd apps/worker && pnpm exec wrangler deploy --var BUILD_SHA:$(git rev-parse --short HEAD)
```

Both deploy scripts end by fetching what they deployed and comparing it to what they sent — do not
bypass them with bare `wrangler`. A static deploy once printed `done — 75 file(s)` while `/pricing`
served the previous design for a day.

### What follows `STUDIO_PLUGIN_STORE_LIVE`, and what does not

With the flag `true`, `STUDIO_PLUGIN_INSTALL_HREF` is the store URL
(`https://create.roblox.com/store/asset/107230158271368`), opened with `target=_blank` and
`rel="noopener noreferrer"`. The in-app surfaces that branch on it — `pairing-dialog.tsx` (opened
from the workspace's Connect Studio pill), `routes/dashboard.tsx`, `routes/auth-pages.tsx`, and
`ws/connect-studio.tsx` — give the same path: get Apple Studio from the Creator Store, install it
from Studio's Toolbox, **Plugins** tab → **Apple**, enter the six-character code, then allow edits
for that connection. (`ws/connect-studio.tsx` is not mounted in the working tree as of 2026-09-22:
its only importer, `ws/project-stage.tsx`, was deleted in the workspace redesign.) The plan
comparison row, the plan highlight and the worker's system prompt follow the flag too.

Hard-coded site copy does **not** follow it, and tests pin some of it; those are tracked by the
owners of `apps/site` and `tests/` (for example `tests/known-issues.test.mjs` requires `resolvedAt`
on `plugin-not-in-creator-store` once the flag is true).

---

## The checklist for every publish

Every line is a thing to observe, not a thing to believe.

- [ ] `node --test apps/apple-plugin/tests/*.test.mjs` green (41 on 2026-09-22), including the
      withheld-tools tripwire.
- [ ] `node apps/apple-plugin/scripts/build.mjs` ends with both RESULT lines, and the sha256 of the
      artifact you upload is recorded.
- [ ] `cd apps/worker && node --test` green and `npx tsc --noEmit -p apps/worker/tsconfig.json` clean.
- [ ] The upload overwrote **107230158271368**, from the Shahar474 user account.
- [ ] The probe returns **200** for 107230158271368 and **200** for the Rojo control in the same
      minute, with `updatedUtc` after the upload and the new `scriptCount`.
- [ ] A logged-out browser, on a machine that is not the owner's, got the plugin from the store page
      and the Apple button appears in Studio's Plugins tab.
- [ ] That installed plugin paired with a project and executed one real op end to end.
- [ ] Only then: `LATEST_PLUGIN_VERSION` bumped, and copy describing new capabilities deployed.

**None of this establishes Roblox approval or settles any moderation decision.** The plugin avoiding
the prohibited patterns is evidence about the plugin, not a verdict from Roblox. If the listing is
removed again, record the date and the exact wording of the notice, flip `STUDIO_PLUGIN_STORE_LIVE`
back to `false`, and re-probe — the 09-19 removal's reason was captured only from the appeals page,
and that is the page to read.
