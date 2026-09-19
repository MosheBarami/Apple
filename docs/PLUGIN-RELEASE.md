# Releasing the Studio plugin

**The plugin that ships is `apps/apple-plugin`.** `apps/plugin` is the legacy build and is not
submitted to anything — see `apps/plugin/README.md` for why it stays in the tree.

Everything below the line marked **HUMAN** is done by a person, in a browser and in Roblox Studio,
signed into the owner's account. No agent performs any of it. Nothing in this repository uploads to
Roblox, and nothing should be made to.

Decided and measured 2026-09-19. Every figure here was produced by the command beside it.

---

## 0. The state today, measured

```
$ curl -s -o /dev/null -w '%{http_code}\n' \
    "https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=132128477945417"
404
$ curl -s -o /dev/null -w '%{http_code}\n' \
    "https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=6415005344"   # Rojo, a listed control
200
```

404 against 200 on a known-listed control. The asset is not distributable, `STUDIO_PLUGIN_STORE_LIVE`
is `false`, and every install affordance correctly degrades to `/docs/plugin`. The landing page says
*"Early preview. Public Studio installation is not available yet."* **That sentence is true today and
must not be removed until the probe returns 200.**

The previous asset built from `apps/plugin` was removed for *"Misusing Roblox Systems"*. Its exact
trigger was never identified. What is certain is that `apps/plugin/src/Ops.luau:521` compiles text
received over HTTP into a `ModuleScript` and `require`s it, and the Creator Store asset requirements
prohibit that. `apps/apple-plugin` refuses it by name. Avoiding the prohibited pattern is not the
same as approval, and this document never treats it as such.

### What a reviewer can check, and what it costs a user

The shared `StudioOp` union has thirty-four operations. `apps/apple-plugin` implements thirty and
refuses four by name — `run_code`, `run_mode`, `insert_asset`, `inspect_model`. (It refused six
until the bounded software renderer was ported in, which restored `render_view` and `screenshot`.)
Nothing falls through as an unknown command: every operation has a handler or a named refusal, and
`tests/protocol-coverage.test.mjs` fails if one ever does not.

The plugin declares those refusals in its pairing poll, the worker parses them
(`apps/worker/src/plugin-capabilities.ts`), withholds every dependent tool, and tells the model in
its system prompt not to claim a withheld operation ran. The cost is exactly twelve tools, asserted
as a tripwire in `apps/apple-plugin/tests/worker-capability-contract.test.mjs`:

| Refused operation | Worker tools it withholds |
| --- | --- |
| `run_code` | `run_luau`, `run_and_check`, `run_spec`, `audit_build`, `check_composition`, `set_mood`, `add_effect`, `remove_effect`, `design_sound`, `assign_sounds` |
| `run_mode` | `run_and_check` (also blocked above) |
| `insert_asset` | `insert_asset` |
| `inspect_model` | `inspect_model` |

The visual gate — `render_view`, `compose_thumbnail`, `inspect_visually` and the automatic critique
in `SessionDO` — is **not** in that list. It stands on `render_view`, which
`apps/apple-plugin/src/Render.luau` now provides: the rasteriser ported from
`apps/plugin/src/Render.luau` and held to it by the original specs
(`apps/apple-plugin/tests/render-parity.test.mjs`). If that module is ever dropped from the bundle,
the capability report says so, the three tools are withheld, and the run ends with *"Rendered
appearance was not verified: the connected Studio does not provide the required visual inspection
operation."* A withheld check must always read as a check that did not run — never as a pass.

---

## 1. Build and verify the artifact

```sh
cd /Users/moshe/Desktop/RbxAI
node --test apps/apple-plugin/tests/*.test.mjs      # 37 tests
npx tsc --noEmit -p apps/worker/tsconfig.json
cd apps/worker && node --test                       # 3,460 tests
cd .. && node apps/apple-plugin/scripts/build.mjs
```

`build.mjs` parses every source with `luau-analyze`, refuses a `require` of a module that is not
bundled, runs `rojo build`, and then hands the artifact to
`scripts/inspect-plugin-build.py`, which decompresses every chunk before scanning. It must print:

```
RESULT: clean — no credentials, private hosts or developer paths in the build
```

A refusal to certify is a failure, not a pass. If it cannot read a chunk, stop.

### The check that has been skipped before, and must not be again

The source having a capability and **the shipped binary** having it are two different claims. The
legacy artifact sat at `VERSION = "0.1.0"` with **zero** occurrences of `GenerateModelAsync` while
its source was `0.2.0` and had generation — and every test was green, because every test read the
source. `build.mjs` now ends by reading the binary:

```
$ node apps/apple-plugin/scripts/build.mjs
...
RESULT: clean — no credentials, private hosts or developer paths in the build
version:   1.0.0 (protocol 1) confirmed inside the artifact
  present  rasterTri  x3   the software rasteriser — the worker's whole visual gate stands on it
  present  Render.capture  x1   the render entry point the command engine calls
  present  GenerateModelAsync  x7   Roblox-native text-to-3D; the legacy artifact shipped with zero of these
  present  golem.studio-ops.v1  x1   the capability report schema the worker parses
  present  /api/studio/poll  x1   the long-poll the plugin is

RESULT: the shipped bytes carry the capabilities this source claims
```

`.rbxm` payloads are LZ4-block compressed — measured on a real build, 4,415 of 4,458 strings (99%)
are **not** byte-present in the raw file — so this decompresses every chunk rather than grepping,
and a chunk it cannot decode is a failure rather than a pass. It was falsified by building the same
source with `Render.luau` removed: `rasterTri` and `Render.capture` both went MISSING and it exited
1, while `GenerateModelAsync` and the poll URL stayed present.

`PLUGIN_VERSION` and `PLUGIN_PROTOCOL` come from `apps/apple-plugin/src/Bridge.luau` — `"1.0.0"` and
`"1"` today — and the protocol must equal `CURRENT_PLUGIN_PROTOCOL` in
`apps/worker/src/plugin-version.ts`, which is `1`.

**Run this against the artifact you actually publish**, not against a rebuild afterwards.

**Known gap, not yet closed:** `.github/workflows/plugin-release.yml` still builds
`apps/plugin`. It reads `apps/plugin/src/Version.luau` for the version and protocol, which
`apps/apple-plugin` does not have, so retargeting it is a real change and not a path substitution.
Until it is retargeted, **do not take its artifact**; build locally with the command above.

---

## 2. HUMAN — publish the asset

Nothing here can be automated. Open Cloud cannot update a Plugin asset: asset type 38 is not in the
supported list, and content updates exist only for Models. `PATCH develop.roblox.com/v1/plugins/{id}`
accepts name, description and comments only, and authenticates with a `.ROBLOSECURITY` cookie —
shipping a session cookie to CI to edit a description trades the account for nothing. Do not.
The reasoning is written out at length in `.github/workflows/plugin-release.yml`.

1. Open Roblox Studio, signed in as the owner. Keep the asset under a **user** account, never a
   group: group-owned plugin overwrite is a known-broken path (DevForum 587851).
2. Drag `apps/apple-plugin/release/apple-studio.rbxm` into `Explorer` so it appears under
   `ServerStorage` or `Workspace`.
3. Right-click it → **Publish as Plugin**.
4. Decide, deliberately, between:
   - **Overwrite `132128477945417`** — keeps the existing asset id, so `STUDIO_PLUGIN_ASSET_ID` and
     the probe URL do not change. It also inherits whatever moderation history that id carries.
   - **A new asset** — a clean record, and then `STUDIO_PLUGIN_ASSET_ID` in
     `packages/shared/src/index.ts` must be updated, which changes
     `STUDIO_PLUGIN_URL` and `STUDIO_PLUGIN_LIVENESS_PROBE_URL` with it.
   The removed asset was taken down for a reason nobody has identified. A new id is the safer
   choice; it is the owner's call, and it is a decision, not a detail.
5. Fill in the listing. The description must not claim Roblox endorsement or affiliation.

**Uploading does not publish it.** At this point the plugin is in the owner's own Inventory and
Creations tabs and nobody else can get it. The probe in §0 still returns 404.

---

## 3. HUMAN — make it distributable

Creator Dashboard → **Development Items** → the plugin → **Configure** → **Distribution** →
**Distribute on Creator Store** → Save Changes.

This is the step that was never done. It is the whole of blocker A1 in `docs/backlog/BLOCKERS.md`.

---

## 4. Prove it, before changing a single line of copy

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=<ASSET_ID>"
```

**200 means listed. 404 means not.** Run the Rojo control (`6415005344`) in the same minute and
confirm it returns 200, so a 404 from a Roblox outage cannot be read as "not listed" and a 200 from
a cached edge cannot be read as success.

Do not substitute another endpoint. This is recorded in `packages/shared/src/index.ts` and was
established by measurement: `economy.roblox.com` and `develop.roblox.com/v1/plugins` both return 200
for an **unlisted** asset, and `assetdelivery` returns 401 unauthenticated even for Moon Animator,
which is fully listed. Three plausible probes, all wrong, all of which would have flipped the flag
on a plugin nobody could install.

Then do the thing the probe cannot do: **open the store URL in a logged-out browser on a different
machine and install it.** A 200 is the necessary condition; a stranger getting the plugin into their
Studio is the product.

---

## 5. Flip the flag

One constant. `packages/shared/src/index.ts`:

```ts
export const STUDIO_PLUGIN_STORE_LIVE: boolean = true;
```

Everything downstream follows from it, with no other edit:

| Where | While `false` | Once `true` |
| --- | --- | --- |
| `STUDIO_PLUGIN_INSTALL_HREF` | `/docs/plugin`, same-origin | the Creator Store URL, `target=_blank` + `rel="noopener noreferrer"` |
| `apps/site/src/pages/index.astro:28` | "Early preview. Public Studio installation is not available yet." | "Get the Studio plugin ↗" |
| `apps/site/src/pages/docs/getting-started.astro:25` | the "Public Studio installation is unavailable" callout | callout gone |
| `apps/web/.../ws/connect-studio.tsx` | "Studio plugin unavailable" / "See status" | "Install Apple for Studio" / "Install" |
| `apps/web/src/components/pairing-dialog.tsx:424` | "Public installation unavailable — see status" | "Install Apple for Studio ↗" |
| `apps/web/src/routes/dashboard.tsx:946` | "Public Studio installation is unavailable…" | the install path |
| plan comparison row `plugin` | "Public installation unavailable" on every plan | `true` on every plan |
| plan highlight | "Studio integration · public installation unavailable" | "Studio plugin" |
| `tests/e2e/landing.spec.ts:319` | asserts the link is same-origin | asserts it is the store link |

### Four things go red the moment you flip it, and each one is correct

Do not silence any of them. Each is a claim elsewhere in the repository that has just stopped being
true, and fixing it is part of the release.

1. `tests/known-issues.test.mjs:104` pins the literal
   `export const STUDIO_PLUGIN_STORE_LIVE: boolean = false;` while the issue
   `plugin-not-in-creator-store` is open. **Fix:** set `resolvedAt` on that row in
   `apps/site/src/data/known-issues.ts`.
2. `packages/evals/src/acceptance.mjs:332` asserts the flag and
   `STUDIO_PLUGIN_INSTALL_HREF` agree, and that a live flag implies a `roblox.com` link. It passes
   automatically **if** `STUDIO_PLUGIN_ASSET_ID` is right. If you minted a new asset and forgot to
   update the id, this is what catches it.
3. `LATEST_PLUGIN_VERSION` in `apps/worker/src/plugin-version.ts` is `'0.2.0'` — the legacy version.
   It must become the version actually published (`'1.0.0'`), or every user of the new plugin is
   compared against a stale "latest" and no upgrade notice will ever fire. Bump it **at the moment
   the asset is published**, not when the source changes: announcing a version nobody can install is
   worse than saying nothing.
4. `packages/evals/src/plugin-version.test.mjs:150` asserts `LATEST_PLUGIN_VERSION` equals `VERSION`
   in **`apps/plugin/src/Version.luau`** — the legacy file. Bumping (3) makes it red. **Fix:** point
   that assertion at `PLUGIN_VERSION` in `apps/apple-plugin/src/Bridge.luau`, which is the version
   the shipped plugin actually sends on every request. This is the last place in the repository
   where the legacy plugin is still treated as the product.

### Then deploy, and check the bytes rather than the build

```sh
node infra/deploy-static.mjs     # site + app into the D1 static store
cd apps/worker && pnpm exec wrangler deploy --var BUILD_SHA:$(git rev-parse --short HEAD)
```

Both deploy scripts end by fetching what they deployed and comparing it to what they sent — do not
bypass them with bare `wrangler`. A static deploy once printed `done — 75 file(s)` while `/pricing`
served the previous design for a day.

Last: load `https://apple.moshe-barami111.workers.dev/` in a logged-out browser and **read the
availability line under the hero**. The flag being true and the page saying so are two facts.

---

## What must be true before the flag flips — the checklist

Every line is a thing to observe, not a thing to believe.

- [ ] The probe returns **200** for the asset id in `packages/shared/src/index.ts`, and **200** for
      the Rojo control in the same minute.
- [ ] A logged-out browser, on a machine that is not the owner's, installed the plugin from the
      store page and the button appears in Studio.
- [ ] That installed plugin paired with a project and executed one real op end to end.
- [ ] `strings`-equivalent on the **published** artifact shows the published version and a non-zero
      count of `GenerateModelAsync` and of the renderer module — asserted against the binary, never
      the `.luau`.
- [ ] `node --test apps/apple-plugin/tests/*.test.mjs` green (37), including the withheld-tools tripwire.
- [ ] `cd apps/worker && node --test` green and `npx tsc --noEmit -p apps/worker/tsconfig.json` clean.
- [ ] The four red items in §5 are fixed, not silenced.
- [ ] `STUDIO_PLUGIN_ASSET_ID` is the id that was actually published.

**None of this establishes Roblox approval or resolves the original moderation decision.** The
plugin avoiding the prohibited patterns is evidence about the plugin, not a verdict from Roblox. If
the listing is removed again, the first thing to record is the date and the exact wording of the
notice — the last removal's reason was never captured, which is why this document has to reason from
the requirements rather than from what happened.
