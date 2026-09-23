# Apple Studio is on the Creator Store again — 2026-09-24 (measured 2026-09-23T23:19Z and 23:34Z)

The appeal on the final build (removal 3Jj4h4hPWRTA3QPDRlNRmejqPrP, appealed 2026-09-23 14:02 IDT, see
`../20260923T1100Z-final-publish-appeal/README.md`) was upheld.

Measured, with controls in the same run (`https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=<id>`):

| asset | id | 23:34:48Z |
|---|---|---|
| Apple Studio (ours) | 107230158271368 | **200** |
| Rojo 7 (control, listed) | 6415005344 | 200 |
| Moon Animator 2 (control, listed) | 4725618216 | 200 |
| an id that cannot exist | 99999999999999999 | 404 |
| the retired Golem plugin | 132128477945417 | 404 |

The controls held, so the endpoint still discriminates; the change is in our asset.

Our record: name "Apple Studio", visibilityStatus 1, isAssetHashApproved true, fiatProduct published,
purchasable, free, updatedUtc 2026-09-23T11:00:54Z, 7 scripts — the final build published at 14:00 IDT.

Also seen:
- the store page rendered signed out (headless Chrome, scratch profile) has the title
  "Apple Studio - Creator Store" and a "Get Plugin" button;
- the Creator Dashboard Configure page shows distribution ON with no violation notice (owner's Chrome, 23:19Z).

What changed in the product because of it:
- `STUDIO_PLUGIN_STORE_LIVE = true` and `STUDIO_PLUGIN_STORE_REFUSAL = null` in `packages/shared/src/index.ts`,
  so every install button goes to the store listing again;
- the /status known issue `plugin-not-in-creator-store` has `resolvedAt: '2026-09-24'`.

Not done: `LATEST_PLUGIN_VERSION` in `apps/worker/src/plugin-version.ts` stays `1.0.0` until a signed-out install
shows which build the store hands a new customer (docs/PLUGIN-RELEASE.md).
